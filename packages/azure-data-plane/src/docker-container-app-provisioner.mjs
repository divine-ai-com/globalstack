import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, statfs } from 'node:fs/promises';
import { resolve } from 'node:path';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const digest = /^sha256:[a-f0-9]{64}$/;

export function containerAppRuntimeSpec(resource, images) {
  const p = resource.properties, template = p?.template, configuration = p?.configuration;
  assert.equal(configuration?.activeRevisionsMode, 'Single', 'Only single revisions are implemented');
  assert.equal(template?.containers?.length, 1, 'Exactly one container is required');
  assert.equal(template.scale?.minReplicas, 1); assert.equal(template.scale?.maxReplicas, 1);
  assert.ok(!template.initContainers?.length && !template.volumes?.length && !template.scale?.rules?.length,
    'Init containers, volumes and autoscaling are not implemented');
  const container = template.containers[0];
  assert.ok(!container.volumeMounts?.length && !container.command?.length && !container.args?.length,
    'Container command and volume overrides are not implemented');
  const image = images.get(container.image);
  assert.ok(digest.test(image ?? ''), 'The declared image must be operator-approved');
  const port = configuration.ingress?.targetPort;
  assert.ok(Number.isInteger(port) && port > 0 && port <= 65535);
  const cpu = container.resources?.cpu;
  const memory = /^(\d+(?:\.\d+)?)Gi$/.exec(container.resources?.memory ?? '');
  assert.ok(Number.isFinite(cpu) && cpu > 0 && cpu <= 2 && memory && Number(memory[1]) > 0 && Number(memory[1]) <= 4,
    'Declared CPU and memory must fit the local pilot limits');
  assert.ok((container.probes ?? []).every(probe => ['Readiness', 'Startup'].includes(probe.type)), 'Liveness restarts are not implemented');
  const probes = container.probes?.filter(probe => probe.type === 'Readiness') ?? [];
  assert.equal(probes.length, 1, 'An HTTP readiness probe is required');
  const probe = probes[0].httpGet;
  assert.ok(probe && probe.port === port && (!probe.scheme || probe.scheme === 'HTTP')
    && !probe.httpHeaders?.length && typeof probe.path === 'string' && /^\/[A-Za-z0-9/_-]*$/.test(probe.path),
    'Unsupported readiness probe');
  const env = Object.create(null);
  for (const item of container.env ?? []) {
    assert.ok(/^[A-Za-z_][A-Za-z0-9_]*$/.test(item.name) && !Object.hasOwn(env, item.name)
      && typeof item.value === 'string' && !item.value.includes('\0') && item.value.length <= 65536
      && item.secretRef === undefined, 'Only unique literal environment settings are implemented');
    env[item.name] = item.value;
  }
  return { image, port, cpu, memory: `${Number(memory[1]) * 1024}m`, readinessPath: probe.path, env };
}

// ARM selects an approved image, never host paths, credentials or Docker flags.
// This runs one bounded replica. It does not emulate registry IAM or autoscaling.
export function createDockerContainerAppProvisioner({ images, directory, startupTimeoutMs = 120000,
  preparePlatform = null }) {
  assert.ok(images instanceof Map);
  assert.ok(preparePlatform === null || typeof preparePlatform === 'function');
  assert.ok(Number.isInteger(startupTimeoutMs) && startupTimeoutMs >= 1000 && startupTimeoutMs <= 180000);
  const root = resolve(directory);
  return async ({ resource, signal }) => {
    const spec = containerAppRuntimeSpec(resource, images);
    await mkdir(root, { recursive: true, mode: 0o700 });
    const space = await statfs(root);
    assert.ok(space.bavail * space.bsize >= 40 * 1024 ** 3, '40 GiB free required');
    const name = `gs-container-app-${randomUUID()}`, network = `${name}-network`;
    let containerOwned = false, networkOwned = false, platform;
    async function dispose() {
      if (containerOwned) {
        try { await exec('docker', ['rm', '-f', name], { timeout: 20000 }); }
        catch (error) { if (!String(error.stderr ?? '').includes(`No such container: ${name}`)) throw error; }
        containerOwned = false;
      }
      let platformError;
      try { await platform?.dispose?.(); } catch (error) { platformError = error; }
      platform = null;
      if (networkOwned) {
        try { await exec('docker', ['network', 'rm', network], { timeout: 20000 }); }
        catch (error) { if (!String(error.stderr ?? '').includes(`network ${network} not found`)) throw error; }
        networkOwned = false;
      }
      if (platformError) throw platformError;
    }
    try {
      signal.throwIfAborted();
      assert.equal((await exec('docker', ['image', 'inspect', spec.image, '--format', '{{.Id}}'], { signal, timeout: 10000 })).stdout.trim(), spec.image);
      networkOwned = true;
      await exec('docker', ['network', 'create', '--internal', '--label', 'globalstack.managed=container-app', network], { signal, timeout: 20000 });
      if (preparePlatform) {
        const inspected = JSON.parse((await exec('docker', ['network', 'inspect', network], { signal, timeout: 10000 })).stdout)[0];
        const gateway = inspected.IPAM.Config[0].Gateway;
        platform = await preparePlatform({ resource, signal, directory: root, network, gateway });
        assert.ok(platform && typeof platform.dispose === 'function', 'Prepared Container App platform requires cleanup');
      }
      const platformEnv = platform?.env ?? {};
      assert.ok(Object.entries(platformEnv).every(([key, value]) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(key)
        && typeof value === 'string' && !value.includes('\0')));
      const env = { ...spec.env, ...platformEnv };
      const hosts = platform?.extraHosts ?? [], mounts = platform?.mounts ?? [];
      assert.ok(Array.isArray(hosts) && hosts.every(value => /^[a-z0-9.-]+:(?:\d{1,3}\.){3}\d{1,3}$/.test(value)));
      assert.ok(Array.isArray(mounts) && mounts.every(value => typeof value === 'string' && value.endsWith(':ro')));
      containerOwned = true;
      await exec('docker', ['run', '-d', '--pull', 'never', '--name', name, '--network', network,
        '--label', 'globalstack.managed=container-app', '--memory', spec.memory, '--cpus', String(spec.cpu), '--pids-limit', '128',
        '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--read-only', '--tmpfs', '/tmp:rw,nosuid,nodev,size=1073741824',
        ...hosts.flatMap(value => ['--add-host', value]), ...mounts.flatMap(value => ['-v', value]),
        ...Object.keys(env).flatMap(key => ['-e', key]), spec.image], { signal, timeout: 20000, env: { ...process.env, ...env } });
      const state = JSON.parse((await exec('docker', ['inspect', name], { signal, timeout: 10000 })).stdout)[0];
      const origin = `http://${state.NetworkSettings.Networks[network].IPAddress}:${spec.port}`;
      async function checkReady() {
        try {
          const response = await fetch(`${origin}${spec.readinessPath}`, { redirect: 'error', signal: AbortSignal.timeout(2000) });
          const healthy = response.status >= 200 && response.status < 400; await response.body?.cancel(); return healthy;
        } catch { return false; }
      }
      const deadline = Date.now() + startupTimeoutMs;
      while (Date.now() < deadline) {
        signal.throwIfAborted();
        try {
          const response = await fetch(`${origin}${spec.readinessPath}`, { redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(2000)]) });
          const ready = response.status >= 200 && response.status < 400; await response.body?.cancel();
          if (ready) return { origin, dispose, ready: checkReady };
        } catch { signal.throwIfAborted(); }
        await new Promise(done => setTimeout(done, 500));
      }
      throw new Error('Container App readiness deadline exceeded');
    } catch {
      try { await dispose(); }
      catch { throw Object.assign(new Error('Container App provisioning and cleanup failed'), { cleanup: dispose }); }
      throw new Error('Container App provisioning failed');
    }
  };
}
