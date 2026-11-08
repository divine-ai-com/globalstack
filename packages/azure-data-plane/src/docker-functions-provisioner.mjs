import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile, statfs } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const digest = /^sha256:[a-f0-9]{64}$/;
const wait = ms => new Promise(done => setTimeout(done, ms));

// Images and platform transport are operator configuration. No ARM value may
// select a host mount, Docker network or executable, or trigger an image pull.
export function createDockerFunctionsProvisioner({ images, directory, preparePlatform, startupTimeoutMs = 90000 }) {
  assert.ok(images instanceof Map && images.size > 0);
  for (const [reference, image] of images) assert.ok(typeof reference === 'string' && digest.test(image));
  assert.equal(typeof preparePlatform, 'function');
  assert.ok(Number.isInteger(startupTimeoutMs) && startupTimeoutMs >= 1000 && startupTimeoutMs <= 180000);
  const root = resolve(directory);
  return async ({ resource, signal }) => {
    const reference = String(resource.properties?.siteConfig?.linuxFxVersion ?? '').replace(/^DOCKER\|/i, '');
    const image = images.get(reference);
    assert.ok(image, 'The declared image is not approved in the local image catalog');
    signal.throwIfAborted();
    await mkdir(root, { recursive: true, mode: 0o700 });
    const space = await statfs(root);
    assert.ok(space.bavail * space.bsize >= 40 * 1024 ** 3, '40 GiB free required');
    const name = `gs-native-${randomUUID()}`;
    const work = await mkdtemp(join(root, 'worker-'));
    let platform, partialCleanup, allocated = false;
    async function dispose() {
      if (allocated) {
        // A failed removal must stay visible to the lifecycle controller.
        try { await exec('docker', ['rm', '-f', name], { timeout: 20000 }); }
        catch (error) {
          if (!String(error.stderr ?? '').includes(`No such container: ${name}`)) throw error;
        }
        allocated = false;
      }
      await platform?.dispose?.();
      await partialCleanup?.();
      await rm(work, { recursive: true, force: true });
    }
    try {
      const inspected = (await exec('docker', ['image', 'inspect', image, '--format', '{{.Id}}'], { signal, timeout: 10000 })).stdout.trim();
      assert.equal(inspected, image);
      platform = await preparePlatform({ resource, signal, directory: work });
      assert.ok(typeof platform.network === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(platform.network));
      assert.equal(typeof platform.dispose, 'function');
      const settings = resource.properties?.siteConfig?.appSettings ?? [];
      assert.ok(Array.isArray(settings));
      const env = Object.create(null);
      for (const setting of settings) {
        assert.ok(/^[A-Za-z_][A-Za-z0-9_]*$/.test(setting.name) && typeof setting.value === 'string');
        assert.ok(!Object.hasOwn(env, setting.name), 'Duplicate application setting');
        env[setting.name] = setting.value;
      }
      Object.assign(env, platform.env ?? {});
      for (const [key, value] of Object.entries(env)) assert.ok(/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)
        && typeof value === 'string' && !value.includes('\0') && value.length <= 65536);
      const args = ['run', '-d', '--pull', 'never', '--name', name, '--network', platform.network,
        '--label', 'globalstack.managed=functions', '--memory', '1g', '--cpus', '2', '--pids-limit', '256',
        '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges'];
      for (const host of platform.extraHosts ?? []) { assert.ok(typeof host === 'string' && !host.startsWith('-')); args.push('--add-host', host); }
      for (const mount of platform.mounts ?? []) { assert.ok(typeof mount === 'string' && mount.endsWith(':ro')); args.push('-v', mount); }
      args.push(...Object.keys(env).flatMap(key => ['-e', key]), image);
      signal.throwIfAborted();
      // A timed-out Docker client can leave a successfully created container.
      allocated = true;
      await exec('docker', args, { env: { ...process.env, ...env }, signal, timeout: 20000 });
      const container = JSON.parse((await exec('docker', ['inspect', name], { signal, timeout: 10000 })).stdout)[0];
      const origin = `http://${container.NetworkSettings.Networks[platform.network].IPAddress}`;
      let masterKey;
      const deadline = Date.now() + startupTimeoutMs;
      while (Date.now() < deadline) {
        signal.throwIfAborted();
        try {
          let fileKeys = [];
          try {
            const data = JSON.parse((await exec('docker', ['exec', name, 'node', '-e',
              "const fs=require('fs');for(const p of ['/azure-functions-host/Secrets/host.json','/home/data/Functions/secrets/host.json']){if(fs.existsSync(p)){process.stdout.write(fs.readFileSync(p));process.exit(0)}}process.exit(1)"],
            { signal, timeout: 5000 })).stdout.replace(/^\uFEFF/, ''));
            if (data.masterKey?.value && !data.masterKey.encrypted) fileKeys = [data.masterKey.value];
          } catch { signal.throwIfAborted(); }
          const candidates = [...new Set([...fileKeys, ...(platform.readHostMasterKeys?.() ?? [])])];
          for (const candidate of candidates) {
            if (!/^[A-Za-z0-9_+/=-]{16,256}$/.test(candidate)) continue;
            const response = await fetch(`${origin}/admin/host/status`, { headers: { 'x-functions-key': candidate },
              redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(2000)]) });
            if (response.status === 200 && (await response.json()).state === 'Running') { masterKey = candidate; break; }
            await response.body?.cancel();
          }
          if (masterKey) break;
        } catch { signal.throwIfAborted(); }
        await wait(500);
      }
      assert.ok(masterKey, 'Native Functions host did not become ready');
      const masterKeyFile = join(work, 'master-key.private');
      await writeFile(masterKeyFile, masterKey, { mode: 0o600, flag: 'wx' });
      const response = await fetch(`${origin}/admin/functions`, { headers: { 'x-functions-key': masterKey },
        redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]) });
      assert.equal(response.status, 200, 'Native function discovery failed');
      let bytes = 0; const chunks = [];
      for await (const chunk of response.body) { bytes += chunk.length; assert.ok(bytes <= 512 * 1024); chunks.push(chunk); }
      const functions = JSON.parse(Buffer.concat(chunks).toString());
      assert.ok(Array.isArray(functions) && functions.length <= 1000);
      const eventGridFunctions = functions.filter(item => item.config?.bindings?.some(binding => String(binding.type).toLowerCase() === 'eventgridtrigger')).map(item => item.name);
      assert.ok(eventGridFunctions.every(value => typeof value === 'string' && /^[A-Za-z][A-Za-z0-9_-]{0,127}$/.test(value)));
      return { origin, masterKeyFile, eventGridFunctions, dispose };
    } catch (error) {
      if (typeof error.cleanup === 'function') partialCleanup = error.cleanup;
      // Never publish Docker arguments, application settings or native keys.
      try { await dispose(); }
      catch { throw Object.assign(new Error('Native worker provisioning and cleanup failed'), { cleanup: dispose }); }
      throw new Error('Native worker provisioning failed');
    }
  };
}
