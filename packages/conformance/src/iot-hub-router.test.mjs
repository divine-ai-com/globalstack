import assert from 'node:assert/strict';
import { request } from 'node:http';
import { test } from 'node:test';
import { createIotHubRouter, createIotHubRouterServer } from '../../azure-data-plane/src/iot-hub-router.mjs';

function httpJson(port, method, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const req = request({
      hostname: '127.0.0.1',
      port,
      path,
      method,
      headers: {
        host: 'iothub-local.azure-devices.net',
        authorization: 'Bearer globalstack-local-token',
        'content-type': 'application/json',
        ...(payload ? { 'content-length': Buffer.byteLength(payload) } : {}),
        ...headers,
      },
    }, (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', chunk => {
        text += chunk;
      });
      res.on('end', () => {
        let parsed = text;
        try {
          parsed = text ? JSON.parse(text) : null;
        } catch {
          // keep raw text
        }
        resolve({ status: res.statusCode, headers: res.headers, body: parsed });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function withIotHubServer(fn) {
  const router = createIotHubRouter();
  router.registerHub({
    hubName: 'iothub-local',
    hostName: 'iothub-local.azure-devices.net',
  });
  const server = createIotHubRouterServer(router);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  try {
    return await fn({ port, router });
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

test('iot hub data-plane enforces auth and api-version shape', async () => {
  await withIotHubServer(async ({ port }) => {
    const missingAuth = await httpJson(
      port,
      'GET',
      '/devices?api-version=2021-04-12',
      undefined,
      { authorization: '' },
    );
    assert.equal(missingAuth.status, 401);
    assert.equal(missingAuth.body.ExceptionType, 'Unauthorized');

    const missingVersion = await httpJson(port, 'GET', '/devices');
    assert.equal(missingVersion.status, 400);
    assert.equal(missingVersion.body.ExceptionType, 'MissingApiVersion');

    const badVersion = await httpJson(port, 'GET', '/devices?api-version=1900-01-01');
    assert.equal(badVersion.status, 400);
    assert.equal(badVersion.body.ExceptionType, 'InvalidApiVersion');
  });
});

test('iot hub runtime supports device identity, twin, query, telemetry, and delete semantics', async () => {
  await withIotHubServer(async ({ port, router }) => {
    const create = await httpJson(port, 'PUT', '/devices/pump-01?api-version=2021-04-12', {
      status: 'enabled',
      capabilities: { iotEdge: false },
    });
    assert.equal(create.status, 200);
    assert.equal(create.body.deviceId, 'pump-01');
    assert.equal(create.body.status, 'enabled');
    assert.ok(create.body.authentication.symmetricKey.primaryKey);

    const list = await httpJson(port, 'GET', '/devices?api-version=2021-04-12');
    assert.equal(list.status, 200);
    assert.equal(list.body.value.length, 1);

    const patchTwin = await httpJson(port, 'PATCH', '/twins/pump-01?api-version=2021-04-12', {
      tags: { site: 'east', line: 'alpha' },
      properties: {
        desired: { targetRpm: 900 },
        reported: { currentRpm: 880 },
      },
    });
    assert.equal(patchTwin.status, 200);
    assert.equal(patchTwin.body.tags.site, 'east');
    assert.equal(patchTwin.body.properties.desired.targetRpm, 900);
    assert.equal(patchTwin.body.properties.reported.currentRpm, 880);

    const query = await httpJson(port, 'POST', '/devices/query?api-version=2021-04-12', {
      query: 'SELECT * FROM devices',
    });
    assert.equal(query.status, 200);
    assert.equal(query.body.value.length, 1);
    assert.equal(query.body.value[0].deviceId, 'pump-01');

    const telemetry = await httpJson(
      port,
      'POST',
      '/devices/pump-01/messages/events?api-version=2021-04-12',
      { temperature: 72.5 },
      { 'iothub-app-severity': 'normal' },
    );
    assert.equal(telemetry.status, 204);
    const events = router.listTelemetry('iothub-local');
    assert.equal(events.length, 1);
    assert.equal(events[0].deviceId, 'pump-01');
    assert.deepEqual(events[0].body, { temperature: 72.5 });
    assert.equal(events[0].properties['iothub-app-severity'], 'normal');

    const updatedTwin = await httpJson(port, 'GET', '/twins/pump-01?api-version=2021-04-12');
    assert.equal(updatedTwin.status, 200);
    assert.equal(updatedTwin.body.connectionState, 'Connected');

    const deleteDevice = await httpJson(port, 'DELETE', '/devices/pump-01?api-version=2021-04-12');
    assert.equal(deleteDevice.status, 204);

    const missingTwin = await httpJson(port, 'GET', '/twins/pump-01?api-version=2021-04-12');
    assert.equal(missingTwin.status, 404);
    assert.equal(missingTwin.body.ExceptionType, 'DeviceNotFound');
  });
});
