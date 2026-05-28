import { readRequestJson, writeJson } from '../../http/body.mjs';
import { googleError, writeGoogleError } from '../../errors/google-error.mjs';

export function createCloudTasksRoutes({ store }) {
  return [
    {
      method: 'POST',
      match: url => {
        const match = url.pathname.match(/^\/v2\/projects\/([^/]+)\/locations\/([^/]+)\/queues$/);
        return match ? { projectId: decodeURIComponent(match[1]), location: decodeURIComponent(match[2]) } : null;
      },
      handle: async ({ request, response, url, match }) => {
        const queueId = url.searchParams.get('queueId');
        if (!queueId) {
          writeTasksError(response, 400, 'INVALID_ARGUMENT', 'Missing required queueId query parameter.');
          return;
        }
        const body = await readRequestJson(request);
        const queue = store.createQueue({ ...match, queueId, body });
        if (!queue) {
          writeTasksError(response, 409, 'ALREADY_EXISTS', `Queue ${queueId} already exists.`);
          return;
        }
        writeJson(response, 200, queue);
      },
    },
    {
      method: 'GET',
      match: matchQueuePath,
      handle: async ({ response, match }) => {
        const queue = store.getQueue(match);
        if (!queue) {
          writeTasksError(response, 404, 'NOT_FOUND', `Queue ${match.queueId} was not found.`);
          return;
        }
        writeJson(response, 200, queue);
      },
    },
    {
      method: 'POST',
      match: url => {
        const match = url.pathname.match(/^\/v2\/projects\/([^/]+)\/locations\/([^/]+)\/queues\/([^/]+)\/tasks$/);
        return match ? {
          projectId: decodeURIComponent(match[1]),
          location: decodeURIComponent(match[2]),
          queueId: decodeURIComponent(match[3]),
        } : null;
      },
      handle: async ({ request, response, match }) => {
        const body = await readRequestJson(request);
        const result = store.createTask({ ...match, task: body.task ?? {} });
        if (result.missingQueue) {
          writeTasksError(response, 404, 'NOT_FOUND', `Queue ${match.queueId} was not found.`);
          return;
        }
        if (result.duplicate) {
          writeTasksError(response, 409, 'ALREADY_EXISTS', 'Task already exists.');
          return;
        }
        writeJson(response, 200, result.task);
      },
    },
    {
      method: 'GET',
      match: matchTaskPath,
      handle: async ({ response, match }) => {
        const task = store.getTask(match);
        if (!task) {
          writeTasksError(response, 404, 'NOT_FOUND', `Task ${match.taskId} was not found.`);
          return;
        }
        writeJson(response, 200, task);
      },
    },
    {
      method: 'POST',
      match: matchRunTaskPath,
      handle: async ({ response, match }) => {
        const task = await store.runTask(match);
        if (!task) {
          writeTasksError(response, 404, 'NOT_FOUND', `Task ${match.taskId} was not found.`);
          return;
        }
        writeJson(response, 200, task);
      },
    },
  ];
}

function matchQueuePath(url) {
  const match = url.pathname.match(/^\/v2\/projects\/([^/]+)\/locations\/([^/]+)\/queues\/([^/]+)$/);
  return match ? {
    projectId: decodeURIComponent(match[1]),
    location: decodeURIComponent(match[2]),
    queueId: decodeURIComponent(match[3]),
  } : null;
}

function matchTaskPath(url) {
  const match = url.pathname.match(/^\/v2\/projects\/([^/]+)\/locations\/([^/]+)\/queues\/([^/]+)\/tasks\/([^/]+)$/);
  return match ? {
    projectId: decodeURIComponent(match[1]),
    location: decodeURIComponent(match[2]),
    queueId: decodeURIComponent(match[3]),
    taskId: decodeURIComponent(match[4]),
  } : null;
}

function matchRunTaskPath(url) {
  const match = url.pathname.match(/^\/v2\/projects\/([^/]+)\/locations\/([^/]+)\/queues\/([^/]+)\/tasks\/([^/]+):run$/);
  return match ? {
    projectId: decodeURIComponent(match[1]),
    location: decodeURIComponent(match[2]),
    queueId: decodeURIComponent(match[3]),
    taskId: decodeURIComponent(match[4]),
  } : null;
}

function writeTasksError(response, status, reason, message) {
  writeGoogleError(response, googleError(status, reason, message));
}
