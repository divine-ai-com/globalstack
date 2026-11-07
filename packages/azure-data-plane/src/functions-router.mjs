import { createHash, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { URL } from 'node:url';

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

async function readBody(req) {
  const raw = await readRawBody(req);
  const text = raw.toString('utf8');
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text.slice(0, 500) };
  }
}

function sendJson(res, status, body, headers = {}) {
  const payload = body === undefined ? '' : JSON.stringify(body, null, 2);
  res.writeHead(status, {
    ...(payload ? { 'content-type': 'application/json' } : {}),
    'content-length': Buffer.byteLength(payload),
    ...headers,
  });
  res.end(payload);
}

function sendError(res, status, code, message) {
  sendJson(res, status, {
    error: {
      code,
      message,
    },
  });
}

function appHostInfo(host) {
  const hostname = String(host ?? '').split(':')[0];
  if (hostname.endsWith('.scm.azurewebsites.net')) {
    return {
      appName: hostname.slice(0, -'.scm.azurewebsites.net'.length).split('.')[0] ?? null,
      scm: true,
      hostname,
    };
  }
  if (!hostname.endsWith('.azurewebsites.net')) return null;
  return {
    appName: hostname.split('.')[0] ?? null,
    scm: false,
    hostname,
  };
}

function normalizeRoute(route) {
  return String(route ?? '')
    .split('/')
    .filter(Boolean)
    .map(segment => decodeURIComponent(segment))
    .join('/')
    .replace(/^api\//i, '');
}

function functionKey(appName, functionName) {
  return createHash('sha256')
    .update(`globalstack:functions:${String(appName).toLowerCase()}:${String(functionName).toLowerCase()}`)
    .digest('base64url')
    .slice(0, 44);
}

function hostKey(appName, slot = 'default') {
  return createHash('sha256')
    .update(`globalstack:functions:host:${String(appName).toLowerCase()}:${String(slot).toLowerCase()}`)
    .digest('base64url')
    .slice(0, 44);
}

function publishingUsername(appName) {
  return `$${String(appName).toLowerCase()}`;
}

function publishingPassword(appName) {
  return createHash('sha256')
    .update(`globalstack:functions:publishing:${String(appName).toLowerCase()}`)
    .digest('base64url')
    .slice(0, 32);
}

function nowIso() {
  return new Date().toISOString();
}

function packageDigest(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function stableActivityOutput(activityName, payload = null) {
  return {
    activityName,
    input: payload ?? null,
  };
}

function stableCheckpointOutput(index, activityNames = [], reason = 'activity-batch') {
  return {
    checkpointName: `checkpoint-${index + 1}`,
    index: index + 1,
    reason,
    completedActivities: [...activityNames],
  };
}

function checkpointFingerprint(checkpoint) {
  return createHash('sha256')
    .update(JSON.stringify({
      checkpointName: checkpoint.checkpointName,
      index: checkpoint.index,
      reason: checkpoint.reason,
      completedActivities: checkpoint.completedActivities,
    }))
    .digest('hex')
    .slice(0, 16);
}

function stableTimerOutput(timerName, dueTime, fired = false) {
  return {
    timerName,
    dueTime,
    fired,
  };
}

function stableSubOrchestrationOutput(orchestratorName, payload = null) {
  return {
    orchestratorName,
    input: payload ?? null,
  };
}

function clampInteger(value, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return min;
  return Math.max(min, Math.min(max, parsed));
}

function durableStatusPayload(origin, app, instance, includeHistory = false) {
  const basePath = `/runtime/webhooks/durabletask/instances/${encodeURIComponent(instance.instanceId)}`;
  const payload = {
    name: instance.orchestratorName,
    instanceId: instance.instanceId,
    createdTime: instance.createdTime,
    lastUpdatedTime: instance.lastUpdatedTime,
    runtimeStatus: instance.runtimeStatus,
    input: instance.input ?? null,
    customStatus: instance.customStatus ?? null,
    output: instance.output ?? null,
  };
  if (instance.failureDetails) payload.failureDetails = instance.failureDetails;
  if (includeHistory) payload.history = instance.history;
  if (instance.runtimeStatus !== 'Completed') {
    payload.statusQueryGetUri = `${origin}${basePath}`;
    payload.sendEventPostUri = `${origin}${basePath}/raiseEvent/{eventName}`;
    payload.terminatePostUri = `${origin}${basePath}/terminate`;
    payload.purgeHistoryDeleteUri = `${origin}${basePath}`;
    payload.suspendPostUri = `${origin}${basePath}/suspend`;
    payload.resumePostUri = `${origin}${basePath}/resume`;
  }
  return payload;
}

function durableRoute(pathname) {
  const parts = String(pathname ?? '')
    .split('/')
    .filter(Boolean)
    .map(segment => decodeURIComponent(segment));
  if (parts[0] !== 'runtime' || parts[1] !== 'webhooks' || parts[2] !== 'durabletask') return null;
  if (parts[3] === 'orchestrators' && parts[4]) {
    return {
      kind: 'start',
      orchestratorName: parts[4],
    };
  }
  if (parts[3] !== 'instances' || !parts[4]) return null;
  if (parts.length === 5) {
    return {
      kind: 'instance',
      instanceId: parts[4],
    };
  }
  if (parts[5] === 'raiseEvent' && parts[6]) {
    return {
      kind: 'raiseEvent',
      instanceId: parts[4],
      eventName: parts[6],
    };
  }
  if (parts.length === 6 && ['terminate', 'suspend', 'resume'].includes(parts[5])) {
    return {
      kind: parts[5],
      instanceId: parts[4],
    };
  }
  return null;
}

function adminFunctionRoute(pathname) {
  const parts = String(pathname ?? '')
    .split('/')
    .filter(Boolean)
    .map(segment => decodeURIComponent(segment));
  if (parts.length !== 3 || parts[0] !== 'admin' || parts[1] !== 'functions' || !parts[2]) return null;
  return {
    functionName: parts[2],
  };
}

function requestKey(req, url) {
  return req.headers['x-functions-key'] ?? url.searchParams.get('code') ?? null;
}

function basicAuthCredentials(req) {
  const raw = String(req.headers.authorization ?? '');
  const match = raw.match(/^Basic[ \t]+(\S+)$/i);
  if (!match) return null;
  try {
    const decoded = Buffer.from(match[1], 'base64').toString('utf8');
    const split = decoded.indexOf(':');
    if (split < 0) return null;
    return {
      username: decoded.slice(0, split),
      password: decoded.slice(split + 1),
    };
  } catch {
    return null;
  }
}

function matchFunction(app, route) {
  const exact = app.functions.get(route.toLowerCase());
  if (exact) return { fn: exact, params: {} };
  const routeSegments = route.split('/').filter(Boolean);
  for (const fn of app.functions.values()) {
    const patternSegments = fn.route.split('/').filter(Boolean);
    if (patternSegments.length !== routeSegments.length) continue;
    const params = {};
    let matches = true;
    for (let index = 0; index < patternSegments.length; index += 1) {
      const pattern = patternSegments[index];
      const value = routeSegments[index];
      const paramMatch = pattern.match(/^\{([^}]+)\}$/);
      if (paramMatch) {
        params[paramMatch[1]] = value;
        continue;
      }
      if (pattern.toLowerCase() !== value.toLowerCase()) {
        matches = false;
        break;
      }
    }
    if (matches) return { fn, params };
  }
  return { fn: null, params: {} };
}

export class FunctionsRouter {
  constructor() {
    this.apps = new Map();
  }

  registerApp({ appName, defaultHostName }) {
    const name = String(appName);
    const existing = this.apps.get(name.toLowerCase());
    if (existing) {
      // ARM PUT/PATCH refreshes site metadata. Only deletion discards the
      // registered application and its in-memory execution/deployment state.
      if (defaultHostName !== undefined && defaultHostName !== null) existing.defaultHostName = defaultHostName;
      return;
    }
    this.apps.set(name.toLowerCase(), {
      appName: name,
      defaultHostName: defaultHostName ?? `${name}.azurewebsites.net`,
      scmHostName: `${name}.scm.azurewebsites.net`,
      functions: new Map(),
      functionsByName: new Map(),
      functionResources: new Map(),
      durable: {
        orchestrators: new Map(),
        activities: new Map(),
        instances: new Map(),
      },
      triggers: new Map(),
      deployments: [],
    });
  }

  unregisterApp(appName) {
    this.apps.delete(String(appName).toLowerCase());
  }

  registerHttpFunction({ appName, functionName, route, methods = ['GET', 'POST'], authLevel = 'function', key }) {
    const app = this.apps.get(String(appName).toLowerCase());
    if (!app) throw new Error(`Function App ${appName} is not registered in the local router.`);
    const normalizedRoute = normalizeRoute(route || functionName);
    const normalizedMethods = methods.map(method => String(method).toUpperCase());
    const definition = {
      functionName,
      route: normalizedRoute,
      methods: normalizedMethods,
      authLevel,
      key: key ?? functionKey(app.appName, functionName),
    };
    app.functions.set(normalizedRoute.toLowerCase(), definition);
    app.functionsByName.set(String(functionName).toLowerCase(), definition);
  }

  unregisterHttpFunction({ appName, route }) {
    const app = this.apps.get(String(appName).toLowerCase());
    if (app) app.functions.delete(normalizeRoute(route).toLowerCase());
  }

  registerFunctionResource({ appName, functionName, config = {} }) {
    const app = this.apps.get(String(appName).toLowerCase());
    if (!app) throw new Error(`Function App ${appName} is not registered in the local router.`);
    const bindings = Array.isArray(config.bindings) ? config.bindings : [];
    const normalizedFunctionName = String(functionName).toLowerCase();
    app.functionResources.set(normalizedFunctionName, {
      functionName,
      config,
      bindings,
    });
    const httpTrigger = bindings.find(binding => String(binding?.type ?? '').toLowerCase() === 'httptrigger');
    const orchestrationTrigger = bindings.find(binding => String(binding?.type ?? '').toLowerCase() === 'orchestrationtrigger');
    const activityTrigger = bindings.find(binding => String(binding?.type ?? '').toLowerCase() === 'activitytrigger');
    const timerTrigger = bindings.find(binding => String(binding?.type ?? '').toLowerCase() === 'timertrigger');
    const queueTrigger = bindings.find(binding => String(binding?.type ?? '').toLowerCase() === 'queuetrigger');
    const blobTrigger = bindings.find(binding => String(binding?.type ?? '').toLowerCase() === 'blobtrigger');
    const eventGridTrigger = bindings.find(binding => String(binding?.type ?? '').toLowerCase() === 'eventgridtrigger');
    const serviceBusTrigger = bindings.find(binding => String(binding?.type ?? '').toLowerCase() === 'servicebustrigger');
    const eventHubTrigger = bindings.find(binding => String(binding?.type ?? '').toLowerCase() === 'eventhubtrigger');
    if (orchestrationTrigger) {
      app.durable.orchestrators.set(normalizedFunctionName, {
        functionName,
        bindingName: orchestrationTrigger.name ?? 'context',
      });
    }
    if (activityTrigger) {
      app.durable.activities.set(normalizedFunctionName, {
        functionName,
        bindingName: activityTrigger.name ?? 'input',
      });
    }
    if (timerTrigger) {
      app.triggers.set(normalizedFunctionName, {
        functionName,
        type: 'timerTrigger',
        schedule: timerTrigger.schedule ?? null,
      });
    }
    if (queueTrigger) {
      app.triggers.set(normalizedFunctionName, {
        functionName,
        type: 'queueTrigger',
        queueName: queueTrigger.queueName ?? null,
      });
    }
    if (blobTrigger) {
      app.triggers.set(normalizedFunctionName, {
        functionName,
        type: 'blobTrigger',
        path: blobTrigger.path ?? null,
      });
    }
    if (eventGridTrigger) {
      app.triggers.set(normalizedFunctionName, {
        functionName,
        type: 'eventGridTrigger',
        eventType: eventGridTrigger.eventType ?? null,
      });
    }
    if (serviceBusTrigger) {
      app.triggers.set(normalizedFunctionName, {
        functionName,
        type: 'serviceBusTrigger',
        queueName: serviceBusTrigger.queueName ?? null,
        topicName: serviceBusTrigger.topicName ?? null,
        subscriptionName: serviceBusTrigger.subscriptionName ?? null,
      });
    }
    if (eventHubTrigger) {
      app.triggers.set(normalizedFunctionName, {
        functionName,
        type: 'eventHubTrigger',
        eventHubName: eventHubTrigger.eventHubName ?? null,
      });
    }
    if (!httpTrigger) return null;
    const route = httpTrigger.route ?? functionName;
    const methods = Array.isArray(httpTrigger.methods) && httpTrigger.methods.length > 0
      ? httpTrigger.methods
      : ['GET', 'POST'];
    const authLevel = String(httpTrigger.authLevel ?? 'function').toLowerCase();
    this.registerHttpFunction({
      appName,
      functionName,
      route,
      methods,
      authLevel,
    });
    return {
      route: normalizeRoute(route),
      key: functionKey(appName, functionName),
    };
  }

  unregisterFunctionResource({ appName, config = {}, functionName }) {
    const app = this.apps.get(String(appName).toLowerCase());
    if (app) {
      const normalizedFunctionName = String(functionName).toLowerCase();
      app.functionResources.delete(normalizedFunctionName);
      app.functionsByName.delete(normalizedFunctionName);
      app.durable.orchestrators.delete(normalizedFunctionName);
      app.durable.activities.delete(normalizedFunctionName);
      app.triggers.delete(normalizedFunctionName);
    }
    const bindings = Array.isArray(config.bindings) ? config.bindings : [];
    const httpTrigger = bindings.find(binding => String(binding?.type ?? '').toLowerCase() === 'httptrigger');
    this.unregisterHttpFunction({
      appName,
      route: httpTrigger?.route ?? functionName,
    });
  }

  listFunctionKeys({ appName, functionName }) {
    const app = this.apps.get(String(appName).toLowerCase());
    if (!app) return null;
    const fn = app.functionsByName.get(String(functionName).toLowerCase())
      ?? [...app.functions.values()].find(item => item.functionName.toLowerCase() === String(functionName).toLowerCase());
    if (!fn) return null;
    return {
      keys: {
        default: fn.key,
      },
    };
  }

  listHostKeys({ appName }) {
    const app = this.apps.get(String(appName).toLowerCase());
    if (!app) return null;
    return {
      masterKey: hostKey(app.appName, 'master'),
      functionKeys: {
        default: hostKey(app.appName, 'function-default'),
      },
      systemKeys: {},
    };
  }

  durableInstance(appName, instanceId) {
    const app = this.apps.get(String(appName).toLowerCase());
    if (!app) return null;
    return app.durable.instances.get(String(instanceId).toLowerCase()) ?? null;
  }

  isAuthorizedKey(app, candidate, functionName = null) {
    if (!candidate) return false;
    if (candidate === hostKey(app.appName, 'master') || candidate === hostKey(app.appName, 'function-default')) {
      return true;
    }
    if (functionName) {
      const fn = app.functionsByName.get(String(functionName).toLowerCase());
      if (fn?.key === candidate) return true;
    }
    return [...app.functions.values()].some(item => item.key === candidate);
  }

  isAuthorizedPublishingCredentials(app, req) {
    const credentials = basicAuthCredentials(req);
    if (!credentials) return false;
    return credentials.username === publishingUsername(app.appName) && credentials.password === publishingPassword(app.appName);
  }

  durableExecutionPlan(app, input = null) {
    const explicitActivityBatches = Array.isArray(input?.callActivityBatches)
      ? input.callActivityBatches
      : [];
    const fallbackActivities = Array.isArray(input?.callActivities)
      ? [input.callActivities]
      : [];
    const normalizedActivityBatches = (explicitActivityBatches.length > 0 ? explicitActivityBatches : fallbackActivities)
      .map((batch, batchIndex) => ({
        batchIndex,
        activityNames: Array.isArray(batch) ? batch.map(item => String(item)) : [String(batch)],
      }))
      .filter(batch => batch.activityNames.length > 0);
    const requestedActivities = normalizedActivityBatches.flatMap(batch => batch.activityNames);
    const missingActivity = requestedActivities.find(name => !app.durable.activities.has(String(name).toLowerCase()));
    if (missingActivity) {
      return {
        error: {
          code: 'ActivityFunctionNotFound',
          message: `No Durable activity named '${missingActivity}' is registered for Function App '${app.appName}'.`,
        },
      };
    }
    const activityPayloads = input?.activityPayloads && typeof input.activityPayloads === 'object'
      ? input.activityPayloads
      : {};
    const activityBatches = normalizedActivityBatches.map(batch => ({
      ...batch,
      activities: batch.activityNames.map(name => ({
        name,
        output: stableActivityOutput(name, activityPayloads[name] ?? null),
      })),
    }));
    const activityResults = activityBatches.flatMap(batch => batch.activities);
    const timers = Array.isArray(input?.durableTimers)
      ? input.durableTimers
      : [];
    const now = Date.now();
    const timerResults = timers.map((timer, index) => {
      const timerName = String(timer?.name ?? `timer-${index + 1}`);
      const explicitDue = timer?.fireAt ? Date.parse(String(timer.fireAt)) : null;
      const delayMs = Number.isFinite(Number(timer?.fireAfterMs)) ? Number(timer.fireAfterMs) : null;
      const dueTimestamp = Number.isFinite(explicitDue)
        ? explicitDue
        : now + Math.max(0, delayMs ?? 0);
      const dueTime = new Date(dueTimestamp).toISOString();
      return {
        name: timerName,
        dueTime,
        dueTimestamp,
        fired: dueTimestamp <= now,
      };
    });
    const replayCount = clampInteger(input?.replayCount ?? 0, 0, 10);
    return {
      requestedActivities,
      activityBatches,
      activityResults,
      timerResults,
      replayCount,
    };
  }

  durableReplayStagePlan(app, input = null) {
    const rawStages = Array.isArray(input?.replayStages) ? input.replayStages : [];
    const stages = rawStages.map((stage, index) => {
      const activityNames = Array.isArray(stage?.activities)
        ? stage.activities.map(item => String(item))
        : [];
      const subOrchestratorNames = Array.isArray(stage?.subOrchestrations)
        ? stage.subOrchestrations.map(item => String(item))
        : [];
      const waitForEvents = stage?.waitForExternalEvent === undefined
        ? []
        : Array.isArray(stage.waitForExternalEvent)
          ? stage.waitForExternalEvent.map(String)
          : [String(stage.waitForExternalEvent)];
      const durableTimer = stage?.durableTimer ?? null;
      return {
        index,
        activityNames,
        subOrchestratorNames,
        waitForEvents,
        durableTimer,
      };
    }).filter(stage => stage.activityNames.length > 0 || stage.subOrchestratorNames.length > 0 || stage.waitForEvents.length > 0 || stage.durableTimer);
    if (stages.length === 0) return null;
    const missingActivity = stages.flatMap(stage => stage.activityNames).find(name => !app.durable.activities.has(String(name).toLowerCase()));
    if (missingActivity) {
      return {
        error: {
          code: 'ActivityFunctionNotFound',
          message: `No Durable activity named '${missingActivity}' is registered for Function App '${app.appName}'.`,
        },
      };
    }
    const missingSubOrchestrator = stages.flatMap(stage => stage.subOrchestratorNames).find(name => !app.durable.orchestrators.has(String(name).toLowerCase()));
    if (missingSubOrchestrator) {
      return {
        error: {
          code: 'SubOrchestratorNotFound',
          message: `No Durable sub-orchestrator named '${missingSubOrchestrator}' is registered for Function App '${app.appName}'.`,
        },
      };
    }
    const activityPayloads = input?.activityPayloads && typeof input.activityPayloads === 'object'
      ? input.activityPayloads
      : {};
    const subOrchestrationPayloads = input?.subOrchestrationPayloads && typeof input.subOrchestrationPayloads === 'object'
      ? input.subOrchestrationPayloads
      : {};
    const now = Date.now();
    const normalizedStages = stages.map(stage => {
      let timer = null;
      if (stage.durableTimer) {
        const explicitDue = stage.durableTimer.fireAt ? Date.parse(String(stage.durableTimer.fireAt)) : null;
        const delayMs = Number.isFinite(Number(stage.durableTimer.fireAfterMs)) ? Number(stage.durableTimer.fireAfterMs) : null;
        const dueTimestamp = Number.isFinite(explicitDue)
          ? explicitDue
          : now + Math.max(0, delayMs ?? 0);
        timer = {
          name: String(stage.durableTimer.name ?? `stage-${stage.index + 1}-timer`),
          dueTime: new Date(dueTimestamp).toISOString(),
          dueTimestamp,
          fired: dueTimestamp <= now,
        };
      }
      return {
        ...stage,
        activities: stage.activityNames.map(name => ({
          name,
          output: stableActivityOutput(name, activityPayloads[name] ?? null),
        })),
        subOrchestrations: stage.subOrchestratorNames.map(name => ({
          name,
          output: stableSubOrchestrationOutput(name, subOrchestrationPayloads[name] ?? null),
        })),
        timer,
      };
    });
    return {
      stages: normalizedStages,
      replayCount: clampInteger(input?.replayCount ?? 0, 0, 10),
    };
  }

  appendDurableReplay(instance, timestamp = nowIso(), reason = 'reconciliation') {
    instance.replayCursor = (instance.replayCursor ?? 0) + 1;
    instance.history.push({
      eventType: 'OrchestratorReplayed',
      name: instance.orchestratorName,
      replayNumber: instance.replayCursor,
      reason,
      timestamp,
    });
    instance.lastUpdatedTime = timestamp;
  }

  executeReplayStage(instance, stageIndex, timestamp = nowIso()) {
    const stage = instance.replayStages?.[stageIndex];
    if (!stage) return;
    const checkpoint = {
      ...stableCheckpointOutput(stageIndex, [
        ...stage.activities.map(item => item.name),
        ...stage.subOrchestrations.map(item => item.name),
      ], 'replay-stage'),
      savedAt: timestamp,
    };
    checkpoint.fingerprint = checkpointFingerprint(checkpoint);
    instance.history.push({
      eventType: 'CheckpointLoaded',
      checkpointName: instance.completedReplayStages === 0 ? 'checkpoint-0' : `checkpoint-${instance.completedReplayStages}`,
      stageIndex: stageIndex + 1,
      fingerprint: instance.checkpoints.at(-1)?.fingerprint ?? null,
      timestamp,
    });
    for (const activity of stage.activities) {
      instance.activityResults.push(activity);
      instance.history.push({
        eventType: 'TaskScheduled',
        name: activity.name,
        batchIndex: stageIndex + 1,
        timestamp,
      });
      instance.history.push({
        eventType: 'TaskCompleted',
        name: activity.name,
        batchIndex: stageIndex + 1,
        timestamp,
        result: activity.output,
      });
    }
    for (const subOrchestration of stage.subOrchestrations) {
      instance.subOrchestrationResults.push(subOrchestration);
      instance.history.push({
        eventType: 'SubOrchestrationInstanceCreated',
        name: subOrchestration.name,
        batchIndex: stageIndex + 1,
        timestamp,
      });
      instance.history.push({
        eventType: 'SubOrchestrationInstanceCompleted',
        name: subOrchestration.name,
        batchIndex: stageIndex + 1,
        timestamp,
        result: subOrchestration.output,
      });
    }
    instance.checkpoints.push(checkpoint);
    instance.history.push({
      eventType: 'CheckpointSaved',
      checkpointName: checkpoint.checkpointName,
      batchIndex: stageIndex + 1,
      fingerprint: checkpoint.fingerprint,
      timestamp,
    });
    instance.activityBatches.push({
      batchIndex: stageIndex,
      activities: stage.activities,
      subOrchestrations: stage.subOrchestrations,
    });
    instance.completedReplayStages += 1;
    instance.activeStageIndex = stageIndex + 1;
    instance.waitingForEvents = [...stage.waitForEvents];
    instance.timerResults = stage.timer ? [stage.timer] : [];
    if (stage.timer) {
      instance.history.push({
        eventType: 'TimerCreated',
        name: stage.timer.name,
        timestamp,
        fireAt: stage.timer.dueTime,
      });
      if (stage.timer.fired) {
        instance.history.push({
          eventType: 'TimerFired',
          name: stage.timer.name,
          timestamp,
        });
      }
    }
  }

  advanceReplayStages(instance, reason = 'replay', timestamp = nowIso()) {
    if (!instance.replayStages || instance.runtimeStatus === 'Completed' || instance.runtimeStatus === 'Failed' || instance.runtimeStatus === 'Terminated') return;
    while (instance.activeStageIndex < instance.replayStages.length) {
      this.appendDurableReplay(instance, timestamp, reason);
      this.executeReplayStage(instance, instance.activeStageIndex, timestamp);
      const pendingTimers = (instance.timerResults ?? []).filter(item => !item.fired);
      if (instance.waitingForEvents.length > 0 || pendingTimers.length > 0) {
        instance.runtimeStatus = 'Running';
        instance.lastUpdatedTime = timestamp;
        return;
      }
    }
    instance.runtimeStatus = 'Completed';
    instance.output = {
      orchestrator: instance.orchestratorName,
      input: instance.input ?? null,
      activityResults: Object.fromEntries((instance.activityResults ?? []).map(item => [item.name, item.output])),
      activityBatches: (instance.activityBatches ?? []).map(batch => ({
        batchIndex: batch.batchIndex,
        activities: batch.activities.map(item => item.name),
        subOrchestrations: (batch.subOrchestrations ?? []).map(item => item.name),
      })),
      checkpoints: Object.fromEntries((instance.checkpoints ?? []).map(item => [item.checkpointName, item])),
      subOrchestrationResults: Object.fromEntries((instance.subOrchestrationResults ?? []).map(item => [item.name, item.output])),
      timerResults: Object.fromEntries((instance.timerResults ?? []).map(item => [item.name, stableTimerOutput(item.name, item.dueTime, item.fired)])),
      events: instance.receivedEvents.map(item => ({ name: item.name, data: item.data })),
    };
    instance.history.push({
      eventType: 'ExecutionCompleted',
      timestamp,
    });
    instance.lastUpdatedTime = timestamp;
  }

  reconcileDurableInstance(instance) {
    if (!instance || instance.runtimeStatus !== 'Running') return;
    const now = Date.now();
    let changed = false;
    let replayReason = null;
    for (const timer of instance.timerResults ?? []) {
      if (!timer.fired && timer.dueTimestamp <= now) {
        timer.fired = true;
        instance.history.push({
          eventType: 'TimerFired',
          name: timer.name,
          timestamp: new Date(now).toISOString(),
        });
        changed = true;
        replayReason = replayReason ?? 'timer-fired';
      }
    }
    const pendingTimers = (instance.timerResults ?? []).filter(item => !item.fired);
    if (changed) {
      const timestamp = new Date(now).toISOString();
      if (instance.replayStages) {
        instance.timerResults = [];
        this.advanceReplayStages(instance, replayReason ?? 'state-change', timestamp);
      } else {
        this.appendDurableReplay(instance, timestamp, replayReason ?? 'state-change');
        instance.lastUpdatedTime = timestamp;
      }
    }
    const stillPendingTimers = (instance.timerResults ?? []).filter(item => !item.fired);
    if (!instance.replayStages && pendingTimers.length === 0 && instance.waitingForEvents.length === 0) {
      instance.runtimeStatus = 'Completed';
      instance.output = {
        orchestrator: instance.orchestratorName,
        input: instance.input ?? null,
        activityResults: Object.fromEntries((instance.activityResults ?? []).map(item => [item.name, item.output])),
        activityBatches: (instance.activityBatches ?? []).map(batch => ({
          batchIndex: batch.batchIndex,
          activities: batch.activities.map(item => item.name),
        })),
        checkpoints: Object.fromEntries((instance.checkpoints ?? []).map(item => [item.checkpointName, item])),
        timerResults: Object.fromEntries((instance.timerResults ?? []).map(item => [item.name, stableTimerOutput(item.name, item.dueTime, item.fired)])),
        events: instance.receivedEvents.map(item => ({ name: item.name, data: item.data })),
      };
      instance.history.push({
        eventType: 'ExecutionCompleted',
        timestamp: new Date(now).toISOString(),
      });
      instance.lastUpdatedTime = new Date(now).toISOString();
    }
  }

  startDurableInstance({ app, orchestratorName, input, origin, requestedInstanceId = null }) {
    const orchestrator = app.durable.orchestrators.get(String(orchestratorName).toLowerCase());
    if (!orchestrator) {
      return {
        status: 404,
        body: {
          error: {
            code: 'OrchestratorNotFound',
            message: `No Durable orchestrator named '${orchestratorName}' is registered for Function App '${app.appName}'.`,
          },
        },
      };
    }
    const instanceId = String(requestedInstanceId ?? randomUUID());
    if (app.durable.instances.has(instanceId.toLowerCase())) {
      return {
        status: 409,
        body: {
          error: {
            code: 'InstanceAlreadyExists',
            message: `The Durable instance '${instanceId}' already exists.`,
          },
        },
      };
    }
    const createdTime = nowIso();
    const activityNames = [...app.durable.activities.values()].map(item => item.functionName);
    const replayStagePlan = this.durableReplayStagePlan(app, input);
    if (replayStagePlan?.error) {
      return {
        status: 404,
        body: {
          error: replayStagePlan.error,
        },
      };
    }
    if (replayStagePlan) {
      const instance = {
        instanceId,
        orchestratorName: orchestrator.functionName,
        createdTime,
        lastUpdatedTime: createdTime,
        runtimeStatus: 'Running',
        input: input ?? null,
        customStatus: input?.customStatus ?? null,
        output: null,
        failureDetails: null,
        waitingForEvents: [],
        receivedEvents: [],
        activityBatches: [],
        activityResults: [],
        subOrchestrationResults: [],
        checkpoints: [],
        timerResults: [],
        replayCursor: replayStagePlan.replayCount,
        replayStages: replayStagePlan.stages,
        activeStageIndex: 0,
        completedReplayStages: 0,
        history: [
          {
            eventType: 'ExecutionStarted',
            timestamp: createdTime,
          },
          {
            eventType: 'OrchestratorStarted',
            name: orchestrator.functionName,
            timestamp: createdTime,
          },
          ...Array.from({ length: replayStagePlan.replayCount }, (_, index) => ({
            eventType: 'OrchestratorReplayed',
            name: orchestrator.functionName,
            replayNumber: index + 1,
            timestamp: createdTime,
          })),
        ],
      };
      this.executeReplayStage(instance, 0, createdTime);
      const pendingTimers = (instance.timerResults ?? []).filter(item => !item.fired);
      if (instance.waitingForEvents.length === 0 && pendingTimers.length === 0) {
        this.advanceReplayStages(instance, 'stage-progress', createdTime);
      }
      app.durable.instances.set(instanceId.toLowerCase(), instance);
      return {
        status: 202,
        body: {
          id: instanceId,
          ...durableStatusPayload(origin, app, instance),
        },
        headers: {
          location: `${origin}/runtime/webhooks/durabletask/instances/${encodeURIComponent(instanceId)}`,
        },
      };
    }
    const plan = this.durableExecutionPlan(app, input);
    if (plan.error) {
      return {
        status: 404,
        body: {
          error: plan.error,
        },
      };
    }
    const waitingForEvents = input?.waitForExternalEvent === undefined
      ? []
      : Array.isArray(input.waitForExternalEvent)
        ? input.waitForExternalEvent.map(String)
        : [String(input.waitForExternalEvent)];
    const shouldFail = input?.failAtStart === true;
    const pendingTimers = plan.timerResults.filter(item => !item.fired);
    const runtimeStatus = shouldFail
      ? 'Failed'
      : (waitingForEvents.length > 0 || pendingTimers.length > 0)
        ? 'Running'
        : 'Completed';
    const checkpoints = plan.activityBatches.map((batch, index) => ({
      ...stableCheckpointOutput(index, batch.activityNames),
      savedAt: createdTime,
    }));
    const history = [
      {
        eventType: 'ExecutionStarted',
        timestamp: createdTime,
      },
      {
        eventType: 'OrchestratorStarted',
        name: orchestrator.functionName,
        timestamp: createdTime,
      },
      ...Array.from({ length: plan.replayCount }, (_, index) => ({
        eventType: 'OrchestratorReplayed',
        name: orchestrator.functionName,
        replayNumber: index + 1,
        timestamp: createdTime,
      })),
      ...plan.activityBatches.flatMap((batch, index) => ([
        ...batch.activities.flatMap(activity => ([
          {
            eventType: 'TaskScheduled',
            name: activity.name,
            batchIndex: index + 1,
            timestamp: createdTime,
          },
          {
            eventType: 'TaskCompleted',
            name: activity.name,
            batchIndex: index + 1,
            timestamp: createdTime,
            result: activity.output,
          },
        ])),
        {
          eventType: 'CheckpointSaved',
          checkpointName: checkpoints[index].checkpointName,
          batchIndex: index + 1,
          timestamp: createdTime,
        },
      ])),
      ...plan.timerResults.flatMap(timer => ([
        {
          eventType: 'TimerCreated',
          name: timer.name,
          timestamp: createdTime,
          fireAt: timer.dueTime,
        },
        ...(timer.fired
          ? [{
              eventType: 'TimerFired',
              name: timer.name,
              timestamp: createdTime,
            }]
          : []),
      ])),
    ];
    const instance = {
      instanceId,
      orchestratorName: orchestrator.functionName,
      createdTime,
      lastUpdatedTime: createdTime,
      runtimeStatus,
      input: input ?? null,
      customStatus: input?.customStatus ?? null,
      output: runtimeStatus === 'Completed'
        ? {
            orchestrator: orchestrator.functionName,
            input: input ?? null,
            activities: activityNames,
            activityResults: Object.fromEntries(plan.activityResults.map(item => [item.name, item.output])),
            activityBatches: plan.activityBatches.map(batch => ({
              batchIndex: batch.batchIndex,
              activities: batch.activities.map(item => item.name),
            })),
            checkpoints: Object.fromEntries(checkpoints.map(item => [item.checkpointName, item])),
            subOrchestrationResults: {},
            timerResults: Object.fromEntries(plan.timerResults.map(item => [item.name, stableTimerOutput(item.name, item.dueTime, item.fired)])),
          }
        : null,
      failureDetails: shouldFail
        ? {
            errorType: 'DurableFunctionFailed',
            errorMessage: `The Durable orchestrator '${orchestrator.functionName}' failed during local startup.`,
          }
        : null,
      waitingForEvents,
      receivedEvents: [],
      activityBatches: plan.activityBatches,
      activityResults: plan.activityResults,
      subOrchestrationResults: [],
      checkpoints,
      timerResults: plan.timerResults,
      replayCursor: plan.replayCount,
      history,
    };
    if (runtimeStatus === 'Completed') {
      instance.history.push({
        eventType: 'ExecutionCompleted',
        timestamp: createdTime,
      });
    } else if (runtimeStatus === 'Failed') {
      instance.history.push({
        eventType: 'ExecutionFailed',
        timestamp: createdTime,
        details: instance.failureDetails,
      });
    }
    app.durable.instances.set(instanceId.toLowerCase(), instance);
    return {
      status: 202,
      body: {
        id: instanceId,
        ...durableStatusPayload(origin, app, instance),
      },
      headers: {
        location: `${origin}/runtime/webhooks/durabletask/instances/${encodeURIComponent(instanceId)}`,
      },
    };
  }

  mutateDurableInstance({ app, instance, operation, body, eventName = null }) {
    if (operation === 'raiseEvent') {
      if (!['Running', 'Pending', 'Suspended'].includes(instance.runtimeStatus)) {
        return {
          status: 409,
          body: {
            error: {
              code: 'InstanceNotRunning',
              message: `The Durable instance '${instance.instanceId}' is not running.`,
            },
          },
        };
      }
      if (Array.isArray(instance.waitingForEvents) && instance.waitingForEvents.length > 0 && !instance.waitingForEvents.includes(eventName)) {
        return {
          status: 409,
          body: {
            error: {
              code: 'UnexpectedEvent',
              message: `The Durable instance '${instance.instanceId}' is not waiting for external event '${eventName}'.`,
            },
          },
        };
      }
      instance.receivedEvents.push({
        name: eventName,
        data: body ?? null,
        timestamp: nowIso(),
      });
      instance.history.push({
        eventType: 'ExternalEventRaised',
        name: eventName,
        timestamp: nowIso(),
      });
      const remaining = instance.waitingForEvents.filter(name => name !== eventName);
      instance.waitingForEvents = remaining;
      if (remaining.length === 0 && instance.replayStages) {
        instance.timerResults = [];
        this.advanceReplayStages(instance, 'external-event', nowIso());
      } else if (remaining.length === 0) {
        this.appendDurableReplay(instance, nowIso(), 'external-event');
        instance.runtimeStatus = 'Completed';
      instance.output = {
        orchestrator: instance.orchestratorName,
        input: instance.input ?? null,
        activityResults: Object.fromEntries(instance.activityResults.map(item => [item.name, item.output])),
        activityBatches: (instance.activityBatches ?? []).map(batch => ({
          batchIndex: batch.batchIndex,
          activities: batch.activities.map(item => item.name),
          subOrchestrations: (batch.subOrchestrations ?? []).map(item => item.name),
        })),
        checkpoints: Object.fromEntries((instance.checkpoints ?? []).map(item => [item.checkpointName, item])),
        subOrchestrationResults: Object.fromEntries((instance.subOrchestrationResults ?? []).map(item => [item.name, item.output])),
        timerResults: Object.fromEntries(instance.timerResults.map(item => [item.name, stableTimerOutput(item.name, item.dueTime, item.fired)])),
        events: instance.receivedEvents.map(item => ({ name: item.name, data: item.data })),
      };
        instance.history.push({
          eventType: 'ExecutionCompleted',
          timestamp: nowIso(),
        });
      }
      instance.lastUpdatedTime = nowIso();
      return { status: 202, body: null };
    }

    if (operation === 'terminate') {
      if (['Completed', 'Failed', 'Terminated'].includes(instance.runtimeStatus)) {
        return {
          status: 409,
          body: {
            error: {
              code: 'InstanceNotTerminable',
              message: `The Durable instance '${instance.instanceId}' cannot be terminated from state '${instance.runtimeStatus}'.`,
            },
          },
        };
      }
      instance.runtimeStatus = 'Terminated';
      instance.output = null;
      instance.lastUpdatedTime = nowIso();
      instance.history.push({
        eventType: 'ExecutionTerminated',
        timestamp: instance.lastUpdatedTime,
      });
      return { status: 202, body: null };
    }

    if (operation === 'suspend') {
      if (instance.runtimeStatus !== 'Running') {
        return {
          status: 409,
          body: {
            error: {
              code: 'InstanceNotSuspendable',
              message: `The Durable instance '${instance.instanceId}' cannot be suspended from state '${instance.runtimeStatus}'.`,
            },
          },
        };
      }
      instance.runtimeStatus = 'Suspended';
      instance.lastUpdatedTime = nowIso();
      instance.history.push({
        eventType: 'ExecutionSuspended',
        timestamp: instance.lastUpdatedTime,
      });
      return { status: 202, body: null };
    }

    if (operation === 'resume') {
      if (instance.runtimeStatus !== 'Suspended') {
        return {
          status: 409,
          body: {
            error: {
              code: 'InstanceNotResumable',
              message: `The Durable instance '${instance.instanceId}' cannot be resumed from state '${instance.runtimeStatus}'.`,
            },
          },
        };
      }
      instance.runtimeStatus = 'Running';
      instance.lastUpdatedTime = nowIso();
      instance.history.push({
        eventType: 'ExecutionResumed',
        timestamp: instance.lastUpdatedTime,
      });
      return { status: 202, body: null };
    }

    return {
      status: 501,
      body: {
        error: {
          code: 'GlobalStackRouteNotImplemented',
          message: `No Durable operation handles '${operation}'.`,
        },
      },
    };
  }

  handler() {
    return async (req, res) => {
      const url = new URL(req.url, 'http://localhost');
      const method = req.method.toUpperCase();

      if (method === 'GET' && url.pathname.startsWith('/_globalstack/functions/apps/')) {
        const [, , , , appName, collection] = url.pathname.split('/');
        const app = this.apps.get(decodeURIComponent(appName ?? '').toLowerCase());
        if (!app) return sendError(res, 404, 'ResourceNotFound', `Function App '${appName}' was not found.`);
      if (collection !== 'functions') return sendError(res, 404, 'GlobalStackRouteNotImplemented', `No Functions inspection route handles ${url.pathname}.`);
      return sendJson(res, 200, {
        value: [...app.functions.values()].map(item => ({
          functionName: item.functionName,
          route: item.route,
          methods: item.methods,
          authLevel: item.authLevel,
        })),
      });
    }

      const hostInfo = appHostInfo(req.headers.host);
      if (!hostInfo?.appName) {
        return sendError(res, 404, 'ResourceNotFound', 'The Function App host was not found.');
      }
      const app = this.apps.get(hostInfo.appName.toLowerCase());
      if (!app) {
        return sendError(res, 404, 'ResourceNotFound', `Function App '${hostInfo.appName}' was not found.`);
      }

      const origin = `http://${req.headers.host ?? app.defaultHostName}`;
      if (hostInfo.scm) {
        if (!this.isAuthorizedPublishingCredentials(app, req)) {
          res.writeHead(401, {
            'www-authenticate': `Basic realm="${app.scmHostName}"`,
            'content-length': 0,
          });
          return res.end();
        }
        if (method === 'POST' && url.pathname === '/api/zipdeploy') {
          const payload = await readRawBody(req);
          if (payload.length === 0) {
            return sendError(res, 400, 'InvalidZipDeployment', 'A zip deployment request must include a non-empty payload.');
          }
          for (const deployment of app.deployments) deployment.active = false;
          const deploymentTime = nowIso();
          const deployment = {
            id: randomUUID(),
            status: 4,
            status_text: 'Success',
            complete: true,
            active: true,
            author: 'GlobalStack',
            deployer: 'ZipDeploy',
            message: 'Zip deployment completed successfully.',
            packageHash: packageDigest(payload),
            packageSizeBytes: payload.length,
            receivedTime: deploymentTime,
            endTime: deploymentTime,
            log_url: `${origin}/api/deployments/latest/log`,
            log: [
              {
                id: '1',
                type: 'Message',
                message: 'Zip deployment completed successfully.',
                details_url: null,
                log_time: deploymentTime,
              },
            ],
          };
          app.deployments.unshift(deployment);
          return sendJson(res, 202, deployment, {
            location: `${origin}/api/deployments/latest`,
          });
        }
        if (method === 'GET' && url.pathname === '/api/deployments/latest') {
          const deployment = app.deployments[0];
          if (!deployment) return sendError(res, 404, 'DeploymentNotFound', `No deployment exists for Function App '${app.appName}'.`);
          return sendJson(res, 200, deployment);
        }
        if (method === 'GET' && url.pathname === '/api/deployments/latest/log') {
          const deployment = app.deployments[0];
          if (!deployment) return sendError(res, 404, 'DeploymentNotFound', `No deployment exists for Function App '${app.appName}'.`);
          return sendJson(res, 200, deployment.log ?? []);
        }
        if (method === 'GET' && url.pathname === '/api/deployments') {
          return sendJson(res, 200, app.deployments);
        }
        return sendError(res, 404, 'ResourceNotFound', `No SCM route handles ${url.pathname}.`);
      }
      if (method === 'GET' && url.pathname === '/admin/host/status') {
        if (!this.isAuthorizedKey(app, requestKey(req, url), null)) {
          return sendError(res, 401, 'Unauthorized', 'The function key is missing or invalid.');
        }
        return sendJson(res, 200, {
          id: `${app.appName}-host`,
          state: 'Running',
          version: '4.0.0-globalstack',
          processUptimeMs: 0,
          functionCount: app.functionResources.size,
        });
      }
      const adminFunction = adminFunctionRoute(url.pathname);
      if (adminFunction) {
        if (!this.isAuthorizedKey(app, requestKey(req, url), null)) {
          return sendError(res, 401, 'Unauthorized', 'The function key is missing or invalid.');
        }
        const trigger = app.triggers.get(String(adminFunction.functionName).toLowerCase());
        if (!trigger) {
          return sendError(res, 404, 'FunctionNotFound', `No trigger function named '${adminFunction.functionName}' is registered.`);
        }
        const body = await readBody(req);
        return sendJson(res, 202, {
          status: 'Accepted',
          appName: app.appName,
          functionName: trigger.functionName,
          triggerType: trigger.type,
          input: body ?? null,
          ...(trigger.queueName ? { queueName: trigger.queueName } : {}),
          ...(trigger.topicName ? { topicName: trigger.topicName } : {}),
          ...(trigger.subscriptionName ? { subscriptionName: trigger.subscriptionName } : {}),
          ...(trigger.schedule ? { schedule: trigger.schedule } : {}),
          ...(trigger.path ? { path: trigger.path } : {}),
          ...(trigger.eventType ? { eventType: trigger.eventType } : {}),
          ...(trigger.eventHubName ? { eventHubName: trigger.eventHubName } : {}),
        });
      }
      const durable = durableRoute(url.pathname);
      if (durable) {
        if (!this.isAuthorizedKey(app, requestKey(req, url), durable.orchestratorName ?? null)) {
          return sendError(res, 401, 'Unauthorized', 'The function key is missing or invalid.');
        }
        if (durable.kind === 'start' && method === 'POST') {
          const result = this.startDurableInstance({
            app,
            orchestratorName: durable.orchestratorName,
            input: await readBody(req),
            origin,
            requestedInstanceId: url.searchParams.get('instanceId'),
          });
          if (result.body?.error) return sendJson(res, result.status, result.body, result.headers ?? {});
          return sendJson(res, result.status, result.body, result.headers ?? {});
        }
        const instance = this.durableInstance(app.appName, durable.instanceId);
        if (!instance) {
          return sendError(res, 404, 'OrchestrationNotFound', `The Durable instance '${durable.instanceId}' was not found.`);
        }
        if (durable.kind === 'instance' && method === 'GET') {
          this.reconcileDurableInstance(instance);
          return sendJson(res, 200, durableStatusPayload(origin, app, instance, url.searchParams.get('showHistory') === 'true'));
        }
        if (durable.kind === 'instance' && method === 'DELETE') {
          app.durable.instances.delete(String(durable.instanceId).toLowerCase());
          return sendJson(res, 200, {
            instanceId: durable.instanceId,
            purged: true,
          });
        }
        if (['raiseEvent', 'terminate', 'suspend', 'resume'].includes(durable.kind) && method === 'POST') {
          const result = this.mutateDurableInstance({
            app,
            instance,
            operation: durable.kind,
            eventName: durable.eventName ?? null,
            body: await readBody(req),
          });
          if (result.body?.error) return sendJson(res, result.status, result.body);
          if (result.body === null) {
            res.writeHead(result.status, { 'content-length': 0 });
            return res.end();
          }
          return sendJson(res, result.status, result.body);
        }
        return sendError(res, 404, 'GlobalStackRouteNotImplemented', `No Durable Functions route handles ${method} ${url.pathname}.`);
      }

      const route = normalizeRoute(url.pathname);
      const { fn, params } = matchFunction(app, route);
      if (!fn) {
        return sendError(res, 404, 'FunctionNotFound', `No HTTP trigger matched route '${url.pathname}'.`);
      }
      if (!fn.methods.includes(method)) {
        return sendError(res, 405, 'MethodNotAllowed', `HTTP method ${method} is not allowed for function '${fn.functionName}'.`);
      }
      if (fn.authLevel !== 'anonymous' && requestKey(req, url) !== fn.key) {
        return sendError(res, 401, 'Unauthorized', 'The function key is missing or invalid.');
      }

      return sendJson(res, 200, {
        appName: app.appName,
        functionName: fn.functionName,
        route: fn.route,
        method,
        requestPath: url.pathname,
        params,
        query: Object.fromEntries(url.searchParams.entries()),
        body: method === 'GET' || method === 'HEAD' ? null : await readBody(req),
      }, {
        'x-globalstack-functions-route': `${app.appName}/${fn.functionName}`,
      });
    };
  }
}

export function createFunctionsRouter() {
  return new FunctionsRouter();
}

export function createFunctionsRouterServer(router = createFunctionsRouter()) {
  return createServer(router.handler());
}

export function deterministicFunctionKey(appName, functionName) {
  return functionKey(appName, functionName);
}

export function deterministicHostKey(appName, slot = 'default') {
  return hostKey(appName, slot);
}

export function deterministicPublishingUsername(appName) {
  return publishingUsername(appName);
}

export function deterministicPublishingPassword(appName) {
  return publishingPassword(appName);
}
