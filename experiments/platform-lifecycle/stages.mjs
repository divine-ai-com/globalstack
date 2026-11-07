import assert from 'node:assert/strict';
import { writeFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { deploymentBody } from './policy.mjs';

export function stages({ platform, command, context, privateDir, template, setRevision }) {
  const groupPath = `/subscriptions/${context.subscription}/resourcegroups/${context.group}`;
  const noop = async () => {};
  if (platform.family === 'hcl') {
    const run = (label, args, codes = [0], observed = true) => command(label, platform.binary, args, codes, observed);
    const plan = label => run(label, ['plan', '-input=false', '-no-color', '-detailed-exitcode'], [label === 'plan-create' || label === 'plan-update' ? 2 : 0]);
    return {
      prepare: async () => {
        await run('version', ['version', '-json'], [0], false);
        await run('format', ['fmt', '-check'], [0], false);
        await run('init', ['init', '-input=false', '-lockfile=readonly', '-no-color'], [0], false);
        await run('validate', ['validate', '-no-color']); await plan('plan-create');
      },
      deploy: label => run(label === 'repair' ? 'apply-repair' : 'apply-create', ['apply', '-auto-approve', '-input=false', '-no-color']),
      stable: label => plan(`plan-${label}`),
      refresh: label => label === 'drift' ? run('plan-drift', ['plan', '-input=false', '-no-color', '-detailed-exitcode'], [2]) : run('refresh', ['apply', '-refresh-only', '-auto-approve', '-input=false', '-no-color']),
      update: async () => { setRevision('two'); await plan('plan-update'); await run('apply-update', ['apply', '-auto-approve', '-input=false', '-no-color']); },
      forgetImport: async () => { await run('state-remove', ['state', 'rm', 'azapi_resource.group']); await run('import', ['import', '-input=false', '-no-color', 'azapi_resource.group', groupPath]); },
      destroy: () => run('destroy', ['destroy', '-auto-approve', '-input=false', '-no-color']),
    };
  }
  if (platform.family === 'pulumi') {
    const run = (label, args, observed = true) => command(label, 'pulumi', args, [0], observed);
    const config = (key, value) => run(`config-${key}`, ['config', 'set', key, value, '--non-interactive'], false);
    const preview = (label, stable = false) => run(label, ['preview', '--non-interactive', '--diff', ...(stable ? ['--expect-no-changes'] : [])]);
    return {
      prepare: async () => {
        await run('version', ['version'], false);
        if (platform.fixture === 'pulumi-ts') await command('dependencies', 'npm', ['ci', '--ignore-scripts', '--no-audit'], [0], false);
        if (platform.fixture === 'pulumi-py') await command('dependencies', 'python3', ['-m', 'pip', 'install', '--target', '/cache/python', '-r', 'requirements.txt'], [0], false);
        await run('provider-install', ['plugin', 'install', 'resource', 'azure-native', '3.30.0'], false);
        await run('stack-init', ['stack', 'init', 'pilot', '--non-interactive'], false);
        for (const [key, value] of Object.entries({ 'azure-native:subscriptionId': context.subscription, groupName: context.group, location: context.location, runId: context.runId, expires: context.expires, revision: 'one' })) await config(key, value);
        await preview('preview-create');
      },
      deploy: label => run(label === 'repair' ? 'up-repair' : 'up-create', ['up', '--yes', '--skip-preview', '--non-interactive']),
      stable: label => preview(`preview-${label}`, true),
      refresh: label => run(label === 'drift' ? 'refresh-drift' : 'refresh', ['refresh', '--yes', '--non-interactive']),
      update: async () => { setRevision('two'); await config('revision', 'two'); await preview('preview-update'); await run('up-update', ['up', '--yes', '--skip-preview', '--non-interactive']); },
      forgetImport: async () => {
        const state = JSON.parse(await run('state-export', ['stack', 'export']));
        const resource = state.deployment.resources.find(item => item.type === 'azure-native:resources:ResourceGroup');
        assert.ok(resource?.urn);
        await run('state-remove', ['state', 'delete', resource.urn, '--yes', '--non-interactive']);
        await run('import', ['import', 'azure-native:resources:ResourceGroup', 'group', groupPath, '--generate-code=false', '--protect=false', '--yes', '--non-interactive', '--provider', resource.provider]);
      },
      destroy: () => run('destroy', ['destroy', '--yes', '--skip-preview', '--non-interactive']),
    };
  }
  if (platform.family === 'ansible') {
    let revision = 'one';
    const run = async (label, state = 'present', extra = []) => {
      await writeFile(resolve(privateDir, 'vars.json'), JSON.stringify({ subscription_id: context.subscription, group_name: context.group, location: context.location, run_id: context.runId, expires: context.expires, revision, desired_state: state }));
      return command(label, 'ansible-playbook', ['-i', 'localhost,', 'playbook.yml', '-e', '@/private/vars.json', ...extra]);
    };
    return {
      prepare: async () => { await command('version', 'ansible-playbook', ['--version'], [0], false); await run('syntax-check', 'present', ['--syntax-check']); await run('check-create', 'present', ['--check', '--diff']); },
      deploy: label => run(label === 'repair' ? 'apply-repair' : 'apply-create'),
      stable: async label => { const stdout = await run(`repeat-${label}`); assert.match(stdout, /changed=0\b/, 'Repeat Ansible run changed the resource'); },
      refresh: async label => { await run(label === 'drift' ? 'check-drift' : 'check-stable', 'present', ['--check', '--diff']); },
      update: async () => { revision = 'two'; setRevision('two'); await run('check-update', 'present', ['--check', '--diff']); await run('apply-update'); },
      forgetImport: noop,
      destroy: () => run('destroy', 'absent'),
    };
  }
  if (platform.family === 'cli') {
    const run = (label, action) => command(label, 'bash', ['deploy.sh', action]);
    return {
      prepare: async () => { await command('version', '/usr/bin/az', ['version'], [0], false); await command('syntax-check', 'bash', ['-n', 'deploy.sh'], [0], false); },
      deploy: label => run(label === 'repair' ? 'apply-repair' : 'apply-create', 'present'),
      stable: label => run(`repeat-${label}`, 'present'),
      refresh: label => run(label === 'drift' ? 'read-drift' : 'read', 'read'),
      update: async () => { setRevision('two'); await run('apply-update', 'present'); },
      forgetImport: noop,
      destroy: () => run('destroy', 'absent'),
    };
  }
  if (platform.family === 'template') {
    let revision = 'one';
    const deploymentUrl = `https://management.azure.com/subscriptions/${context.subscription}/providers/Microsoft.Resources/deployments/${context.group}?api-version=2022-09-01`;
    const rest = async (label, method, url = deploymentUrl, bodyFile) => {
      // A private header file keeps the bearer value out of recorded command arguments.
      await writeFile(resolve(privateDir, 'headers.json'), JSON.stringify({ Authorization: `Bearer ${context.token}` }), { mode: 0o600 });
      return command(label, '/usr/bin/az', ['rest', '--method', method, '--url', url, '--skip-authorization-header', '--headers', '@/private/headers.json', '--output', 'json', ...(bodyFile ? ['--body', `@${bodyFile}`] : [])]);
    };
    const deploy = async label => {
      await writeFile(resolve(privateDir, 'deployment.json'), JSON.stringify(deploymentBody(template, context, revision)));
      await rest(label, 'put', deploymentUrl, '/private/deployment.json');
      for (let attempt = 0; attempt < 30; attempt++) {
        const result = JSON.parse(await rest(`${label}-read-${attempt}`, 'get'));
        if (result.properties?.provisioningState === 'Succeeded') return;
        assert.ok(['Accepted', 'Running', 'Creating'].includes(result.properties?.provisioningState), 'Unexpected deployment status');
        await new Promise(done => setTimeout(done, 1000));
      }
      throw new Error('Deployment did not complete within observation window');
    };
    return {
      prepare: () => command('cli-version', '/usr/bin/az', ['version'], [0], false),
      deploy: label => deploy(label === 'repair' ? 'deploy-repair' : 'deploy-create'),
      stable: label => rest(`read-${label}`, 'get'),
      refresh: label => rest(label === 'drift' ? 'read-drift' : 'read-group', 'get', `https://management.azure.com${groupPath}?api-version=2021-04-01`),
      update: async () => { revision = 'two'; setRevision('two'); await deploy('deploy-update'); },
      forgetImport: noop,
      destroy: async () => { await rest('destroy-group', 'delete', `https://management.azure.com${groupPath}?api-version=2021-04-01`); await rest('destroy-deployment', 'delete'); },
    };
  }
  throw new Error(`Missing native stages for ${platform.id}`);
}
