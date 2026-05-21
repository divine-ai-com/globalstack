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

  evaluateExpression(value, context) {
    if (Array.isArray(value)) {
      return value.map(item => this.evaluateExpression(item, context));
    }
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, this.evaluateExpression(item, context)]));
    }
    if (typeof value !== 'string' || !value.startsWith('@')) return value;
    if (value === '@triggerBody()') return context.triggerBody;

    let match = value.match(/^@triggerBody\(\)\?\['([^']+)'\]$/);
    if (match) return context.triggerBody?.[match[1]] ?? null;

    match = value.match(/^@variables\('([^']+)'\)$/);
    if (match) return context.variables.get(match[1]) ?? null;

    match = value.match(/^@actions\('([^']+)'\)\.outputs$/);
    if (match) return context.actionOutputs.get(match[1]) ?? null;

    match = value.match(/^@equals\((.+),\s*(.+)\)$/);
    if (match) {
      const left = this.evaluateExpression(match[1].trim(), context);
      const right = this.evaluateExpression(match[2].trim(), context);
      return left === right;
    }

    if ((value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"'))) {
      return value.slice(1, -1);
    }
    return value;
  }

  executeWorkflow(workflow, input) {
    const actions = [];
    const context = {
      triggerBody: input ?? null,
      variables: new Map(),
      actionOutputs: new Map(),
      response: null,
    };
    const declaredActions = workflow.definition?.actions ?? {};

    for (const [actionName, action] of Object.entries(declaredActions)) {
      const actionType = String(action?.type ?? '');
      const startedAt = new Date().toISOString();
      try {
        if (actionType === 'Compose') {
          const outputs = this.evaluateExpression(action.inputs ?? null, context);
          context.actionOutputs.set(actionName, outputs);
          actions.push({
            name: actionName,
            type: actionType,
            status: 'Succeeded',
            startTime: startedAt,
            endTime: new Date().toISOString(),
            outputs,
          });
          continue;
        }

        if (actionType === 'InitializeVariable') {
          for (const variable of action.inputs?.variables ?? []) {
            context.variables.set(variable.name, this.evaluateExpression(variable.value, context));
          }
          actions.push({
            name: actionName,
            type: actionType,
            status: 'Succeeded',
            startTime: startedAt,
            endTime: new Date().toISOString(),
            outputs: Object.fromEntries(context.variables.entries()),
          });
          continue;
        }

        if (actionType === 'SetVariable') {
          const variableName = action.inputs?.name;
          context.variables.set(variableName, this.evaluateExpression(action.inputs?.value, context));
          actions.push({
            name: actionName,
            type: actionType,
            status: 'Succeeded',
            startTime: startedAt,
            endTime: new Date().toISOString(),
            outputs: { [variableName]: context.variables.get(variableName) },
          });
          continue;
        }

        if (actionType === 'Response') {
          const outputs = {
            statusCode: this.evaluateExpression(action.inputs?.statusCode ?? 200, context),
            headers: this.evaluateExpression(action.inputs?.headers ?? {}, context),
            body: this.evaluateExpression(action.inputs?.body ?? null, context),
          };
          context.response = outputs;
          context.actionOutputs.set(actionName, outputs);
          actions.push({
            name: actionName,
            type: actionType,
            status: 'Succeeded',
            startTime: startedAt,
            endTime: new Date().toISOString(),
            outputs,
          });
          continue;
        }

        throw new Error(`Unsupported workflow action type '${actionType}'.`);
      } catch (error) {
        actions.push({
          name: actionName,
          type: actionType,
          status: 'Failed',
          startTime: startedAt,
          endTime: new Date().toISOString(),
          error: {
            code: 'UnsupportedWorkflowAction',
            message: error.message,
          },
        });
        return {
          status: 'Failed',
          actions,
          response: context.response,
          error: {
            code: 'UnsupportedWorkflowAction',
            message: error.message,
          },
        };
      }
    }

    return {
      status: 'Succeeded',
      actions,
      response: context.response,
      outputs: Object.fromEntries(context.actionOutputs.entries()),
    };
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
    const execution = this.executeWorkflow(workflow, body ?? null);
    const run = {
      id: runId,
      workflowName: workflow.workflowName,
      triggerName,
      status: execution.status,
      startTime: new Date().toISOString(),
      endTime: new Date().toISOString(),
      input: body ?? null,
      actions: execution.actions,
      response: execution.response ?? null,
      error: execution.error ?? null,
      outputs: execution.outputs ?? {},
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

  listRuns({ workflowName }) {
    if (!this.workflows.has(workflowKey(workflowName))) {
      return error(404, 'WorkflowNotFound', `The workflow '${workflowName}' was not found.`);
    }
    const prefix = `${workflowKey(workflowName)}:`;
    return {
      status: 200,
      body: {
        value: [...this.runs.entries()]
          .filter(([key]) => key.startsWith(prefix))
          .map(([, run]) => run),
      },
    };
  }
}

export function createWorkflowRunner() {
  return new WorkflowRunner();
}
