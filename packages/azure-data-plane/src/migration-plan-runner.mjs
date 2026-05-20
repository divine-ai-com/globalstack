import { randomUUID } from 'node:crypto';

function projectKey(serviceName, projectName) {
  return `${String(serviceName).toLowerCase()}/${String(projectName).toLowerCase()}`;
}

function error(status, code, message) {
  return { error: { status, code, message } };
}

export class MigrationPlanRunner {
  constructor() {
    this.projects = new Map();
    this.runs = new Map();
  }

  registerProject({ serviceName, projectName, properties }) {
    this.projects.set(projectKey(serviceName, projectName), {
      serviceName,
      projectName,
      properties: properties ?? {},
    });
  }

  unregisterProject({ serviceName, projectName }) {
    this.projects.delete(projectKey(serviceName, projectName));
  }

  start({ serviceName, projectName, taskType = 'Assessment', sourceDatabase, targetDatabase }) {
    const key = projectKey(serviceName, projectName);
    const project = this.projects.get(key);
    if (!project) {
      return error(404, 'ProjectNotFound', `Migration project '${serviceName}/${projectName}' was not found.`);
    }
    if (!sourceDatabase || !targetDatabase) {
      return error(400, 'InvalidMigrationTask', 'Migration task requires sourceDatabase and targetDatabase.');
    }
    const run = {
      id: randomUUID(),
      serviceName,
      projectName,
      taskType,
      sourceDatabase,
      targetDatabase,
      status: 'Running',
      startedAt: new Date().toISOString(),
      completedAt: null,
    };
    this.runs.set(run.id, run);
    return { status: 202, body: run };
  }

  complete(runId) {
    const run = this.runs.get(runId);
    if (!run) return error(404, 'MigrationRunNotFound', `Migration run '${runId}' was not found.`);
    if (run.status !== 'Running') {
      return error(409, 'InvalidMigrationRunState', `Migration run '${runId}' is ${run.status}.`);
    }
    run.status = 'Succeeded';
    run.completedAt = new Date().toISOString();
    return { status: 200, body: run };
  }

  get(runId) {
    const run = this.runs.get(runId);
    if (!run) return error(404, 'MigrationRunNotFound', `Migration run '${runId}' was not found.`);
    return { status: 200, body: run };
  }
}

export function createMigrationPlanRunner() {
  return new MigrationPlanRunner();
}
