import { randomUUID } from 'node:crypto';

function workflowKey(workflowName) {
  return String(workflowName).toLowerCase();
}

function error(status, code, message) {
  return { error: { status, code, message } };
}

export class WorkflowRunner {
  constructor() {
    this.workflows = new Map();
    this.runs = new Map();
  }

  registerWorkflow({ workflowName, properties }) {
    this.workflows.set(workflowKey(workflowName), {
      workflowName: String(workflowName),
      state: properties?.state ?? 'Enabled',
      definition: properties?.definition ?? {},
    });
  }

  unregisterWorkflow(workflowName) {
    this.workflows.delete(workflowKey(workflowName));
  }

  invoke({ workflowName, triggerName, body }) {
    const workflow = this.workflows.get(workflowKey(workflowName));
    if (!workflow) {
      return error(404, 'WorkflowNotFound', `The workflow '${workflowName}' was not found.`);
    }
    if (workflow.state === 'Disabled') {
      return error(409, 'WorkflowDisabled', `The workflow '${workflowName}' is disabled.`);
    }

    const trigger = workflow.definition?.triggers?.[triggerName];
    if (!trigger) {
      return error(404, 'TriggerNotFound', `The workflow trigger '${triggerName}' was not found.`);
    }
    if (trigger.type !== 'Request') {
      return error(400, 'TriggerNotInvokable', `The workflow trigger '${triggerName}' is not a request trigger.`);
    }

    const runId = randomUUID();
    const run = {
      id: runId,
      workflowName: workflow.workflowName,
      triggerName,
      status: 'Succeeded',
      startTime: new Date().toISOString(),
      endTime: new Date().toISOString(),
      input: body ?? null,
      actions: [],
    };
    this.runs.set(`${workflowKey(workflowName)}:${runId}`, run);
    return { status: 202, body: run };
  }

  getRun({ workflowName, runId }) {
    const run = this.runs.get(`${workflowKey(workflowName)}:${runId}`);
    if (!run) {
      return error(404, 'RunNotFound', `The workflow run '${runId}' was not found.`);
    }
    return { status: 200, body: run };
  }
}

export function createWorkflowRunner() {
  return new WorkflowRunner();
}
