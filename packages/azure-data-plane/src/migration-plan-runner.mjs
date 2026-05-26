import { createHash, randomUUID } from 'node:crypto';

function projectKey(serviceName, projectName) {
  return `${String(serviceName).toLowerCase()}/${String(projectName).toLowerCase()}`;
}

function taskKey(serviceName, projectName, taskName) {
  return `${projectKey(serviceName, projectName)}/${String(taskName).toLowerCase()}`;
}

function error(status, code, message) {
  return { error: { status, code, message } };
}

function nowIso() {
  return new Date().toISOString();
}

function redactSecrets(value) {
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (!value || typeof value !== 'object') return value;
  const clone = {};
  for (const [key, entry] of Object.entries(value)) {
    if (String(key).toLowerCase().includes('password')) continue;
    clone[key] = redactSecrets(entry);
  }
  return clone;
}

function taskEtag(identity) {
  return createHash('sha256').update(identity).digest('base64');
}

const supportedTaskTypes = new Set([
  'ConnectToSource.MySql',
  'ConnectToSource.PostgreSql.Sync',
  'ConnectToTarget.AzureDbForMySql',
  'ConnectToTarget.AzureDbForPostgreSql.Sync',
  'GetUserTables.MySql',
  'GetUserTables.PostgreSql',
]);

function azureTaskBody(task) {
  return {
    id: task.resourceId,
    name: task.taskName,
    type: 'Microsoft.DataMigration/services/projects/tasks',
    etag: taskEtag(task.resourceId),
    properties: {
      ...(redactSecrets(task.properties) ?? {}),
      taskType: task.taskType,
      state: task.state,
      input: redactSecrets(task.properties?.input ?? {}),
      output: task.output,
      errors: task.errors,
      commands: task.commands,
    },
  };
}

export class MigrationPlanRunner {
  constructor({ relationalBackends = null } = {}) {
    this.projects = new Map();
    this.tasks = new Map();
    this.relationalBackends = relationalBackends;
  }

  registerProject({ serviceName, projectName, properties }) {
    this.projects.set(projectKey(serviceName, projectName), {
      serviceName,
      projectName,
      properties: properties ?? {},
    });
  }

  unregisterProject({ serviceName, projectName }) {
    const key = projectKey(serviceName, projectName);
    this.projects.delete(key);
    for (const taskId of [...this.tasks.keys()]) {
      if (taskId.startsWith(`${key}/`)) this.tasks.delete(taskId);
    }
  }

  registerTask({
    subscriptionId,
    resourceGroupName,
    serviceName,
    projectName,
    taskName,
    properties,
  }) {
    const key = taskKey(serviceName, projectName, taskName);
    const project = this.projects.get(projectKey(serviceName, projectName));
    if (!project) {
      return error(404, 'ParentResourceNotFound', `The parent resource for services/${serviceName}/projects/${projectName}/tasks/${taskName} was not found.`);
    }
    const taskType = String(properties?.taskType ?? '');
    if (!supportedTaskTypes.has(taskType)) {
      return error(501, 'GlobalStackRouteNotImplemented', `GlobalStack does not yet execute DMS task type ${taskType}.`);
    }
    const resourceId = `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroupName}/providers/Microsoft.DataMigration/services/${serviceName}/projects/${projectName}/tasks/${taskName}`;
    const task = this.tasks.get(key) ?? {
      id: randomUUID(),
      subscriptionId,
      resourceGroupName,
      serviceName,
      projectName,
      taskName,
      taskType,
      resourceId,
      createdOn: nowIso(),
      properties: {},
      state: 'Queued',
      output: [],
      errors: [],
      commands: [],
      startedOn: null,
      endedOn: null,
      executionPromise: null,
    };
    task.properties = structuredClone(properties ?? {});
    task.taskType = taskType;
    task.state = 'Queued';
    task.output = [];
    task.errors = [];
    task.commands = [];
    task.startedOn = null;
    task.endedOn = null;
    task.executionPromise = this.executeTask(task);
    this.tasks.set(key, task);
    return { status: 201, body: azureTaskBody(task) };
  }

  unregisterTask({ serviceName, projectName, taskName }) {
    this.tasks.delete(taskKey(serviceName, projectName, taskName));
  }

  async executeTask(task) {
    await new Promise(resolve => setTimeout(resolve, 0));
    task.state = 'Running';
    task.startedOn = nowIso();
    try {
      const output = await this.computeTaskOutput(task);
      task.output = Array.isArray(output) ? output : [output];
      task.state = 'Completed';
      task.endedOn = nowIso();
    } catch (cause) {
      task.state = 'Failed';
      task.endedOn = nowIso();
      task.output = [];
      task.errors = [{
        type: 'ODataError',
        code: cause?.code ?? 'TaskExecutionFailed',
        message: cause?.message ?? String(cause),
      }];
    }
  }

  async computeTaskOutput(task) {
    if (!this.relationalBackends) {
      throw Object.assign(new Error('No relational backend manager is configured for DMS task execution.'), {
        code: 'RelationalBackendsUnavailable',
      });
    }
    const input = task.properties?.input ?? {};
    if (task.taskType === 'ConnectToSource.MySql') {
      return [await this.relationalBackends.describeConnection({
        engine: 'mysql',
        connectionInfo: input.sourceConnectionInfo ?? {},
        role: 'source',
      })];
    }
    if (task.taskType === 'ConnectToSource.PostgreSql.Sync') {
      return [await this.relationalBackends.describeConnection({
        engine: 'postgres',
        connectionInfo: input.sourceConnectionInfo ?? {},
        role: 'source',
      })];
    }
    if (task.taskType === 'ConnectToTarget.AzureDbForMySql') {
      return [await this.relationalBackends.describeConnection({
        engine: 'mysql',
        connectionInfo: input.targetConnectionInfo ?? {},
        role: 'target',
      })];
    }
    if (task.taskType === 'ConnectToTarget.AzureDbForPostgreSql.Sync') {
      return [await this.relationalBackends.describeConnection({
        engine: 'postgres',
        connectionInfo: input.targetConnectionInfo ?? {},
        role: 'target',
      })];
    }
    if (task.taskType === 'GetUserTables.MySql') {
      const databases = input.selectedDatabases ?? input.databaseNames ?? [input.databaseName].filter(Boolean);
      return this.relationalBackends.listUserTables({
        engine: 'mysql',
        connectionInfo: input.sourceConnectionInfo ?? input.connectionInfo ?? {},
        databaseNames: databases,
      });
    }
    if (task.taskType === 'GetUserTables.PostgreSql') {
      const databases = input.selectedDatabases ?? input.databaseNames ?? [input.databaseName].filter(Boolean);
      return this.relationalBackends.listUserTables({
        engine: 'postgres',
        connectionInfo: input.sourceConnectionInfo ?? input.connectionInfo ?? {},
        databaseNames: databases,
      });
    }
    throw Object.assign(new Error(`Unsupported DMS task type ${task.taskType}.`), {
      code: 'UnsupportedTaskType',
    });
  }

  getTask({ serviceName, projectName, taskName }) {
    const task = this.tasks.get(taskKey(serviceName, projectName, taskName));
    if (!task) return error(404, 'ResourceNotFound', `The Resource 'services/${serviceName}/projects/${projectName}/tasks/${taskName}' was not found.`);
    return { status: 200, body: azureTaskBody(task) };
  }

  listTasks({ serviceName, projectName }) {
    const prefix = `${projectKey(serviceName, projectName)}/`;
    return {
      status: 200,
      body: {
        value: [...this.tasks.values()]
          .filter(task => taskKey(task.serviceName, task.projectName, task.taskName).startsWith(prefix))
          .map(task => azureTaskBody(task)),
      },
    };
  }

  async commandTask({ serviceName, projectName, taskName, body }) {
    const task = this.tasks.get(taskKey(serviceName, projectName, taskName));
    if (!task) return error(404, 'ResourceNotFound', `The Resource 'services/${serviceName}/projects/${projectName}/tasks/${taskName}' was not found.`);
    const commandType = String(body?.commandType ?? '');
    if (!commandType) {
      return error(400, 'InvalidCommandProperties', 'Task command requires commandType.');
    }
    if (!['Migrate.Sync.Complete.Database', 'Migrate.Sql Server.Azure DbSql Mi.Complete'].includes(commandType)) {
      return error(501, 'GlobalStackRouteNotImplemented', `GlobalStack does not yet execute DMS task command ${commandType}.`);
    }
    task.commands.push({
      commandType,
      commandId: body?.commandId ?? randomUUID(),
      input: redactSecrets(body?.input ?? {}),
      state: 'Completed',
    });
    task.state = 'Completed';
    task.endedOn = task.endedOn ?? nowIso();
    return {
      status: 200,
      body: {
        commandType,
        commandId: task.commands.at(-1)?.commandId,
        input: redactSecrets(body?.input ?? {}),
        state: 'Completed',
        errors: [],
      },
    };
  }
}

export function createMigrationPlanRunner(options = {}) {
  return new MigrationPlanRunner(options);
}
