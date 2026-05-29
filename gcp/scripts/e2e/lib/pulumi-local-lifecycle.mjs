import { execFile } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRunId } from '../../../src/conformance/run-context.mjs';

export async function runPulumiLocalLifecycle({
  argv,
  templateDir,
  runIdPrefix,
  configure,
  afterUp,
  report,
}) {
  const args = parseArgs(argv);
  const runId = createRunId(runIdPrefix);
  const stackName = `dev-${runId}`;
  const workdir = await mkdtemp(join(tmpdir(), `globalstack-gcp-${runIdPrefix}-`));
  const backendDir = join(workdir, 'backend');
  const commands = [];
  let status = 'passed';
  let context;

  try {
    await mkdir(backendDir, { recursive: true });
    await copyTemplate({ templateDir, workdir });
    context = await configure({ runId, stackName, workdir, backendDir, commands });
    const env = pulumiEnv(backendDir, context.env);

    await runCommand('npm', ['install', '--no-audit', '--no-fund', '--loglevel=error'], { workdir, commands, env });
    await runPulumi(args.pulumi, ['login', `file://${backendDir}`], { workdir, commands, env });
    await runPulumi(args.pulumi, ['stack', 'init', stackName, '--non-interactive'], { workdir, commands, env });
    for (const [key, value] of Object.entries(context.config)) {
      await runPulumi(args.pulumi, ['config', 'set', key, String(value), '--plaintext', '--non-interactive', '--stack', stackName], {
        workdir,
        commands,
        env,
      });
    }

    await runPulumi(args.pulumi, ['up', '--yes', '--skip-preview', '--non-interactive', '--stack', stackName], {
      workdir,
      commands,
      env,
    });
    await afterUp?.({ ...context, runId, stackName, workdir, commands, env });
    await runPulumi(args.pulumi, ['preview', '--expect-no-changes', '--non-interactive', '--stack', stackName], {
      workdir,
      commands,
      env,
    });
  } catch (error) {
    status = 'failed';
    commands.push({
      name: 'error',
      exit_code: 1,
      stdout: '',
      stderr: error.message,
    });
    process.exitCode = 1;
  } finally {
    const env = pulumiEnv(backendDir, context?.env);
    const destroyResult = await runPulumi(args.pulumi, ['destroy', '--yes', '--skip-preview', '--non-interactive', '--stack', stackName], {
      workdir,
      commands,
      env,
      allowedExitCodes: [0, 1],
    }).catch(error => {
      status = 'failed';
      process.exitCode = 1;
      commands.push({
        name: 'destroy-error',
        exit_code: 1,
        stdout: '',
        stderr: error.message,
      });
      return null;
    });
    if (destroyResult && destroyResult.exitCode !== 0) {
      status = 'failed';
      process.exitCode = 1;
    }
    await context?.cleanup?.();
    if (!args.keepWorkdir) {
      await rm(workdir, { recursive: true, force: true });
    }
  }

  console.log(JSON.stringify({
    status,
    pulumi: args.pulumi,
    run_id: runId,
    stack_name: stackName,
    workdir: args.keepWorkdir ? workdir : null,
    ...(report?.({ context, runId, stackName }) ?? {}),
    commands: commands.map(command => ({
      name: command.name,
      exit_code: command.exit_code,
      stdout_tail: tail(command.stdout),
      stderr_tail: tail(command.stderr),
    })),
  }, null, 2));
}

function parseArgs(argv) {
  const args = {
    pulumi: process.env.PULUMI_BIN ?? '/home/ubuntu/.local/bin/pulumi',
    keepWorkdir: false,
  };
  for (const arg of argv) {
    if (arg === '--keep-workdir') {
      args.keepWorkdir = true;
      continue;
    }
    if (arg.startsWith('--pulumi=')) {
      args.pulumi = arg.slice('--pulumi='.length);
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

async function copyTemplate({ templateDir, workdir }) {
  const files = await readdir(templateDir);
  for (const file of files.filter(file => ['.yaml', '.js', '.json'].some(extension => file.endsWith(extension)))) {
    await copyFile(new URL(file, templateDir), join(workdir, file));
  }
}

function pulumiEnv(backendDir, extra = {}) {
  return {
    ...process.env,
    ...(extra ?? {}),
    PULUMI_BACKEND_URL: `file://${backendDir}`,
    PULUMI_CONFIG_PASSPHRASE: '',
  };
}

function runPulumi(pulumi, pulumiArgs, { workdir, commands, env, allowedExitCodes = [0] }) {
  const name = pulumiArgs.slice(0, 2).join(' ');
  return runCommand(pulumi, pulumiArgs, { workdir, commands, env, allowedExitCodes, name });
}

function runCommand(file, commandArgs, { workdir, commands, env, allowedExitCodes = [0], name = commandArgs.slice(0, 2).join(' ') }) {
  return new Promise((resolve, reject) => {
    execFile(file, commandArgs, {
      cwd: workdir,
      env,
      maxBuffer: 20 * 1024 * 1024,
    }, (error, stdout, stderr) => {
      const exitCode = error?.code ?? 0;
      commands.push({
        name,
        exit_code: exitCode,
        stdout,
        stderr,
      });
      if (!allowedExitCodes.includes(exitCode)) {
        reject(new Error(`${file} ${commandArgs.join(' ')} failed with ${exitCode}\n${stdout}${stderr}`));
        return;
      }
      resolve({ exitCode, stdout, stderr });
    });
  });
}

function tail(text, maxLength = 3000) {
  if (!text) return '';
  return text.length <= maxLength ? text : text.slice(-maxLength);
}
