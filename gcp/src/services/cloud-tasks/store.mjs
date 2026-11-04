export class CloudTasksStore {
  constructor() {
    this.queues = new Map();
    this.tasks = new Map();
  }

  createQueue({ projectId, location, queueId, body = {} }) {
    const name = queueName(projectId, location, queueId);
    if (this.queues.has(name)) return null;
    const queue = {
      name,
      state: 'RUNNING',
      rateLimits: body.rateLimits ?? {},
      retryConfig: body.retryConfig ?? {},
      stackdriverLoggingConfig: body.stackdriverLoggingConfig ?? {},
    };
    this.queues.set(name, queue);
    return queue;
  }

  getQueue({ projectId, location, queueId }) {
    return this.queues.get(queueName(projectId, location, queueId)) ?? null;
  }

  deleteQueue({ projectId, location, queueId }) {
    const name = queueName(projectId, location, queueId);
    if (!this.queues.has(name)) return false;
    this.queues.delete(name);
    for (const taskName of this.tasks.keys()) {
      if (taskName.startsWith(`${name}/tasks/`)) {
        this.tasks.delete(taskName);
      }
    }
    return true;
  }

  createTask({ projectId, location, queueId, task }) {
    const parent = queueName(projectId, location, queueId);
    if (!this.queues.has(parent)) return { missingQueue: true };
    const taskId = task.name?.split('/').at(-1) ?? `task-${this.tasks.size + 1}`;
    const name = `${parent}/tasks/${taskId}`;
    if (this.tasks.has(name)) return { duplicate: true };
    const stored = {
      ...task,
      name,
      scheduleTime: task.scheduleTime ?? new Date().toISOString(),
      dispatchCount: 0,
      responseCount: 0,
      status: 'SCHEDULED',
    };
    this.tasks.set(name, stored);
    return { task: stored };
  }

  getTask({ projectId, location, queueId, taskId }) {
    return this.tasks.get(taskName(projectId, location, queueId, taskId)) ?? null;
  }

  async runTask({ projectId, location, queueId, taskId }) {
    const task = this.getTask({ projectId, location, queueId, taskId });
    if (!task) return null;
    task.dispatchCount += 1;
    const response = await dispatchHttpTask(task);
    task.responseCount += 1;
    task.status = response.ok ? 'SUCCEEDED' : 'FAILED';
    task.lastAttempt = {
      dispatchTime: new Date().toISOString(),
      responseStatus: {
        code: response.status,
        message: response.statusText,
      },
    };
    return task;
  }
}

export function queueName(projectId, location, queueId) {
  return `projects/${projectId}/locations/${location}/queues/${queueId}`;
}

export function taskName(projectId, location, queueId, taskId) {
  return `${queueName(projectId, location, queueId)}/tasks/${taskId}`;
}

async function dispatchHttpTask(task) {
  const request = task.httpRequest;
  if (!request?.url) {
    return {
      ok: false,
      status: 400,
      statusText: 'Missing httpRequest.url',
    };
  }
  return fetch(request.url, {
    method: request.httpMethod ?? 'POST',
    headers: request.headers ?? {},
    body: request.body ? Buffer.from(request.body, 'base64') : undefined,
  });
}
