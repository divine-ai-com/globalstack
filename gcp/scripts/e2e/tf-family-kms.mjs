import { execFile } from 'node:child_process';
import { copyFile, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRunId } from '../../src/conformance/run-context.mjs';
import { GoogleRestClient } from '../../src/google/rest-client.mjs';
import { listen } from '../../src/server/server.mjs';
import { decodePlaintext, KmsApi } from '../../src/services/kms/google-api.mjs';

const templateDir = new URL('../../templates/terraform/kms/', import.meta.url);

export async function runKmsLifecycle({
  argv,
  cliName,
  binaryArg,
  binaryEnv,
  defaultBinary,
  runIdPrefix,
}) {
  const args = parseArgs(argv, { binaryArg, binaryEnv, defaultBinary });
  const runId = createRunId(runIdPrefix);
  const location = 'global';
  const keyRingId = `gst-${runId}`.slice(0, 63).replace(/-+$/g, '');
  const cryptoKeyId = 'app-config';
  const aad = Buffer.from(`aad:${runId}`).toString('base64');
  const workdir = await mkdtemp(join(tmpdir(), `globalstack-gcp-${runIdPrefix}-`));
  const runtime = await listen({ port: 0 });
  const api = new KmsApi(new GoogleRestClient({ tokenProvider: async () => null }), {
    kmsRoot: `${runtime.url}/v1`,
  });
  const commands = [];
  let status = 'passed';
  let planExitCode = null;
  let cryptoCheck = 'not-run';

  try {
    await copyTemplate(workdir);
    const vars = buildVars({ keyRingId, cryptoKeyId, runtime });

    await runCommand(args.binary, ['init', '-input=false'], { workdir, commands });
    await runCommand(args.binary, ['apply', '-input=false', '-auto-approve', ...varArgs(vars)], {
      workdir,
      commands,
    });

    const encrypt = await api.encrypt({
      projectId: 'globalstack-local',
      location,
      keyRingId,
      cryptoKeyId,
      plaintext: `secret:${runId}`,
      additionalAuthenticatedData: aad,
    });
    const decrypt = await api.decrypt({
      projectId: 'globalstack-local',
      location,
      keyRingId,
      cryptoKeyId,
      ciphertext: encrypt.response.body.ciphertext,
      additionalAuthenticatedData: aad,
    });
    if (decodePlaintext(decrypt.response.body) !== `secret:${runId}`) {
      throw new Error('KMS decrypted plaintext did not match original message');
    }
    cryptoCheck = 'passed';

    const plan = await runCommand(args.binary, ['plan', '-input=false', '-detailed-exitcode', ...varArgs(vars)], {
      workdir,
      commands,
      allowedExitCodes: [0, 2],
    });
    planExitCode = plan.exitCode;
    if (plan.exitCode !== 0) {
      throw new Error(`${cliName} plan reported drift with detailed exit code ${plan.exitCode}`);
    }
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
    const destroyVars = buildVars({ keyRingId, cryptoKeyId, runtime });
    const destroyResult = await runCommand(args.binary, ['destroy', '-input=false', '-auto-approve', ...varArgs(destroyVars)], {
      workdir,
      commands,
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
    await runtime.close();
    if (!args.keepWorkdir) {
      await rm(workdir, { recursive: true, force: true });
    }
  }

  console.log(JSON.stringify({
    status,
    [cliName]: args.binary,
    run_id: runId,
    location,
    key_ring_id: keyRingId,
    crypto_key_id: cryptoKeyId,
    endpoint: `${runtime.url}/v1/`,
    crypto_check: cryptoCheck,
    plan_exit_code: planExitCode,
    workdir: args.keepWorkdir ? workdir : null,
    commands: commands.map(command => ({
      name: command.name,
      exit_code: command.exit_code,
      stdout_tail: tail(command.stdout),
      stderr_tail: tail(command.stderr),
    })),
  }, null, 2));
}

function parseArgs(argv, { binaryArg, binaryEnv, defaultBinary }) {
  const args = {
    binary: process.env[binaryEnv] ?? defaultBinary,
    keepWorkdir: false,
  };
  for (const arg of argv) {
    if (arg === '--keep-workdir') {
      args.keepWorkdir = true;
      continue;
    }
    if (arg.startsWith(`--${binaryArg}=`)) {
      args.binary = arg.slice(`--${binaryArg}=`.length);
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

async function copyTemplate(workdir) {
  const files = await readdir(templateDir);
  for (const file of files.filter(file => file.endsWith('.tf'))) {
    await copyFile(new URL(file, templateDir), join(workdir, file));
  }
}

function buildVars({ keyRingId, cryptoKeyId, runtime }) {
  return [
    'project_id=globalstack-local',
    'location=global',
    `key_ring_id=${keyRingId}`,
    `crypto_key_id=${cryptoKeyId}`,
    'labels={purpose="globalstack-conformance",owner="globalstack"}',
    `kms_endpoint=${runtime.url}/v1/`,
  ];
}

function varArgs(vars) {
  return vars.flatMap(value => ['-var', value]);
}

function runCommand(binary, commandArgs, { workdir, commands, allowedExitCodes = [0] }) {
  const name = commandArgs[0];
  return new Promise((resolve, reject) => {
    execFile(binary, commandArgs, {
      cwd: workdir,
      env: {
        ...process.env,
        TF_IN_AUTOMATION: '1',
      },
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
        reject(new Error(`${binary} ${commandArgs.join(' ')} failed with ${exitCode}\n${stdout}${stderr}`));
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
