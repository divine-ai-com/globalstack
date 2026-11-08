import assert from 'node:assert/strict';
import { nativeWorkerOrigin, forwardNativeFunction } from './native-functions-worker.mjs';
import { createNativeWorkloadLifecycle } from './native-workload-lifecycle.mjs';
import { createContainerAppAuthorizer } from './container-app-auth.mjs';

const lower = value => String(value ?? '').toLowerCase();
const pattern = /^\/subscriptions\/([a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})\/resourceGroups\/[^/]+\/providers\/Microsoft\.App\/containerApps\/[^/]+$/i;
function send(res, status, code) {
  const body = JSON.stringify({ error: { code } });
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body), connection: 'close' });
  res.end(body);
}

export function createContainerAppRouter({ store, provision, trusts = [] }) {
  const apps = new Map(), nativeWorkers = new Map();
  const authorize = createContainerAppAuthorizer({ trusts });
  const lifecycle = provision ? createNativeWorkloadLifecycle({
    router: { nativeWorkers }, provision,
    accepts: resource => lower(resource.type) === 'microsoft.app/containerapps',
    configuration: resource => ({ identity: resource.identity, template: resource.properties?.template,
      configuration: resource.properties?.configuration, managedEnvironmentId: resource.properties?.managedEnvironmentId,
      workloadProfileName: resource.properties?.workloadProfileName }),
    bind: values => new Map(values.map(value => {
      assert.match(value.appResourceId, pattern);
      return [lower(value.appResourceId), { origin: nativeWorkerOrigin(value.origin) }];
    })),
  }) : null;
  return {
    lifecycle,
    sync(resource) {
      assert.match(resource.id, pattern);
      apps.set(lower(resource.id), structuredClone(resource));
      lifecycle?.sync(resource);
    },
    remove(resource) { apps.delete(lower(resource.id)); lifecycle?.remove(resource); },
    async dispose() { apps.clear(); await lifecycle?.dispose(); },
    handler() {
      return async (req, res) => {
        try {
          const host = lower(req.headers.host).split(':')[0];
          const matches = [...apps.values()].filter(app => lower(app.properties?.configuration?.ingress?.fqdn) === host && host);
          if (matches.length !== 1) return send(res, 404, 'ContainerAppNotFound');
          const app = matches[0], id = lower(app.id);
          const configuration = store.resources.get(`${id}/authconfigs/current`);
          const denied = await authorize({ authorization: req.headers.authorization, configuration,
            subscription: pattern.exec(app.id)[1], secure: req.socket.encrypted === true });
          if (denied) return send(res, denied.status, denied.code);
          // Multi-revision routing and private-network admission need separate
          // implementation. Do not bypass those policies by forwarding directly.
          const ingress = app.properties.configuration.ingress;
          if (ingress.external !== true || ingress.transport !== 'http'
            || app.properties.configuration.activeRevisionsMode !== 'Single'
            || ingress.ipSecurityRestrictions?.length || ingress.customDomains?.length || ingress.traffic?.length || ingress.corsPolicy
            || ingress.clientCertificateMode && ingress.clientCertificateMode !== 'Ignore') {
            return send(res, 501, 'ContainerAppIngressNotImplemented');
          }
          const binding = nativeWorkers.get(id);
          if (!binding || binding.ready && !await binding.ready()) return send(res, 503, 'NativeContainerAppWorkerUnavailable');
          if (nativeWorkers.get(id) !== binding || !apps.has(id)
            || store.resources.get(`${id}/authconfigs/current`) !== configuration) return send(res, 503, 'ContainerAppConfigurationChanged');
          // Caller-supplied platform identity headers must not reach the app.
          for (const name of Object.keys(req.headers)) if (name.startsWith('x-ms-client-') || name.startsWith('x-ms-token-')) delete req.headers[name];
          return await forwardNativeFunction(req, res, binding.origin, { kind: 'ContainerApp' });
        } catch { if (!res.headersSent) send(res, 503, 'ContainerAppRequestFailed'); else res.destroy(); }
      };
    },
  };
}
