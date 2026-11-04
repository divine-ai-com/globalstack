import { inspect } from 'node:util';
import { createRunId } from '../../../src/conformance/run-context.mjs';
import { GoogleRestClient } from '../../../src/google/rest-client.mjs';
import { listen } from '../../../src/server/server.mjs';

export async function runLocalRestGate({ gate, service, execute }) {
  const runId = createRunId(gate);
  const runtime = await listen({ port: 0 });
  const client = new GoogleRestClient({
    tokenProvider: async () => null,
  });
  const steps = [];
  const startedAt = new Date().toISOString();
  let status = 'passed';
  let result = {};

  try {
    result = await execute({
      client,
      endpoint: runtime.url,
      runId,
      step: createStepRecorder(steps),
    });
  } catch (error) {
    status = 'failed';
    steps.push({
      name: 'gate failure',
      status: 'failed',
      error: error?.stack ?? String(error),
    });
    process.exitCode = 1;
  } finally {
    await runtime.close();
  }

  console.log(JSON.stringify({
    status,
    gate,
    service,
    run_id: runId,
    endpoint: runtime.url,
    started_at: startedAt,
    ended_at: new Date().toISOString(),
    result,
    steps,
  }, null, 2));
}

export function expectStatus(expectedStatus) {
  return exchange => {
    const actualStatus = exchange?.response?.status;
    if (actualStatus !== expectedStatus) {
      throw new Error(`Expected HTTP ${expectedStatus}, received ${actualStatus}: ${inspect(exchange?.response?.body)}`);
    }
  };
}

function createStepRecorder(steps) {
  return async function step(name, action, validate) {
    const startedAt = new Date().toISOString();
    try {
      const value = await action();
      validate?.(value);
      steps.push({
        name,
        status: 'passed',
        started_at: startedAt,
        ended_at: new Date().toISOString(),
        exchange: summarizeExchange(value),
      });
      return value;
    } catch (error) {
      steps.push({
        name,
        status: 'failed',
        started_at: startedAt,
        ended_at: new Date().toISOString(),
        error: error?.stack ?? String(error),
      });
      throw error;
    }
  };
}

function summarizeExchange(value) {
  if (!value?.request || !value?.response) return null;
  return {
    request: {
      method: value.request.method,
      url: scrubEndpoint(value.request.url),
    },
    response: {
      status: value.response.status,
      status_text: value.response.status_text,
      body: summarizeBody(value.response.body),
    },
  };
}

function scrubEndpoint(url) {
  return String(url).replace(/http:\/\/127\.0\.0\.1:\d+/g, 'http://127.0.0.1:<port>');
}

function summarizeBody(body) {
  if (body === null || body === undefined) return body;
  const text = JSON.stringify(body);
  if (text.length <= 1200) return body;
  return {
    summary: text.slice(0, 1200),
    truncated: true,
  };
}
