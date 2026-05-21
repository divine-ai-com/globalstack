import { randomUUID } from 'node:crypto';

function workflowKey(workflowName) {
  return String(workflowName).toLowerCase();
}

function error(status, code, message) {
  return { error: { status, code, message } };
}

function splitExpressionArgs(text) {
  const args = [];
  let current = '';
  let quote = null;
  let depth = 0;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quote) {
      current += char;
      if (char === quote) quote = null;
      continue;
    }
    if (char === '\'' || char === '"') {
      quote = char;
      current += char;
      continue;
    }
    if (char === '(') depth += 1;
    if (char === ')') depth -= 1;
    if (char === ',' && depth === 0) {
      args.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  if (current.trim()) args.push(current.trim());
  return args;
}

export class WorkflowRunner {
  constructor({ httpInvoker = null } = {}) {
    this.workflows = new Map();
    this.runs = new Map();
    this.triggerHistories = new Map();
    this.httpInvoker = httpInvoker;
  }

  registerWorkflow({ workflowName, properties }) {
    this.workflows.set(workflowKey(workflowName), {
      workflowName: String(workflowName),
      state: properties?.state ?? 'Enabled',
      definition: properties?.definition ?? {},
    });
  }

  unregisterWorkflow(workflowName) {
    const key = workflowKey(workflowName);
    this.workflows.delete(key);
    for (const runKey of [...this.runs.keys()]) {
      if (runKey.startsWith(`${key}:`)) this.runs.delete(runKey);
    }
    for (const triggerKey of [...this.triggerHistories.keys()]) {
      if (triggerKey.startsWith(`${key}:`)) this.triggerHistories.delete(triggerKey);
    }
  }

  triggerHistoryKey(workflowName, triggerName) {
    return `${workflowKey(workflowName)}:${String(triggerName).toLowerCase()}`;
  }

  recordTriggerHistory({ workflowName, triggerName, run }) {
    const key = this.triggerHistoryKey(workflowName, triggerName);
    const entries = this.triggerHistories.get(key) ?? [];
    entries.push({
      name: `${triggerName}/${run.id}`,
      id: `/workflows/${workflowName}/triggers/${triggerName}/histories/${run.id}`,
      type: 'Microsoft.Logic/workflows/triggers/histories',
      properties: {
        workflow: workflowName,
        trigger: triggerName,
        runId: run.id,
        status: run.status,
        code: run.error?.code ?? null,
        startTime: run.startTime,
        endTime: run.endTime,
        fired: true,
      },
    });
    this.triggerHistories.set(key, entries);
  }

  evaluateExpression(value, context) {
    if (Array.isArray(value)) {
      return value.map(item => this.evaluateExpression(item, context));
    }
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, this.evaluateExpression(item, context)]));
    }
    if (typeof value !== 'string') return value;
    if ((value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"'))) {
      return value.slice(1, -1);
    }
    if (!value.startsWith('@')) return value;
    if (value === '@triggerBody()') return context.triggerBody;
    if (value === '@item()') return context.itemStack.at(-1) ?? null;

    let match = value.match(/^@triggerBody\(\)\?\['([^']+)'\]$/);
    if (match) return context.triggerBody?.[match[1]] ?? null;

    match = value.match(/^@item\(\)\?\['([^']+)'\]$/);
    if (match) return context.itemStack.at(-1)?.[match[1]] ?? null;

    match = value.match(/^@variables\('([^']+)'\)$/);
    if (match) return context.variables.get(match[1]) ?? null;

    match = value.match(/^@actions\('([^']+)'\)\.outputs$/);
    if (match) return context.actionOutputs.get(match[1]) ?? null;

    match = value.match(/^@actions\('([^']+)'\)\.outputs\.([A-Za-z0-9_.-]+)$/);
    if (match) {
      const output = context.actionOutputs.get(match[1]) ?? null;
      return String(match[2]).split('.').reduce((acc, key) => (acc && typeof acc === 'object' ? acc[key] : null), output);
    }

    if (value.startsWith('@equals(') && value.endsWith(')')) {
      const args = splitExpressionArgs(value.slice('@equals('.length, -1));
      const left = this.evaluateExpression(args[0]?.trim(), context);
      const right = this.evaluateExpression(args[1]?.trim(), context);
      return left === right;
    }

    return value;
  }

  async executeActions(declaredActions, context) {
    const pending = new Set(Object.keys(declaredActions ?? {}));
    const orderedResults = [];
    const actionStatuses = new Map();

    const record = (actionName, result) => {
      orderedResults.push(result);
      actionStatuses.set(actionName, result.status);
      if (result.outputs !== undefined) {
        context.actionOutputs.set(actionName, result.outputs);
      }
    };

    while (pending.size > 0) {
      let progressed = false;
      for (const actionName of [...pending]) {
        const action = declaredActions[actionName];
        const dependencies = Object.entries(action?.runAfter ?? {});
        if (dependencies.some(([dependency]) => !actionStatuses.has(dependency))) {
          continue;
        }
        const unsatisfiedDependency = dependencies.find(([dependency, statuses]) => {
          const actual = actionStatuses.get(dependency);
          return !Array.isArray(statuses) || !statuses.includes(actual);
        });
        if (unsatisfiedDependency) {
          record(actionName, {
            name: actionName,
            type: String(action?.type ?? ''),
            status: 'Skipped',
            startTime: new Date().toISOString(),
            endTime: new Date().toISOString(),
            outputs: {
              skippedBecause: unsatisfiedDependency[0],
            },
          });
          pending.delete(actionName);
          progressed = true;
          continue;
        }

        const startedAt = new Date().toISOString();
        try {
          const execution = await this.executeAction(actionName, action, context);
          record(actionName, {
            name: actionName,
            type: String(action?.type ?? ''),
            status: execution.status ?? 'Succeeded',
            startTime: startedAt,
            endTime: new Date().toISOString(),
            ...(execution.outputs !== undefined ? { outputs: execution.outputs } : {}),
            ...(execution.error ? { error: execution.error } : {}),
          });
          pending.delete(actionName);
          progressed = true;
          if (execution.halt) {
            return {
              status: execution.runStatus ?? 'Succeeded',
              actions: orderedResults,
              response: context.response,
              error: execution.error ?? null,
              outputs: Object.fromEntries(context.actionOutputs.entries()),
            };
          }
        } catch (error) {
          record(actionName, {
            name: actionName,
            type: String(action?.type ?? ''),
            status: 'Failed',
            startTime: startedAt,
            endTime: new Date().toISOString(),
            error: {
              code: 'UnsupportedWorkflowAction',
              message: error.message,
            },
          });
          pending.delete(actionName);
          return {
            status: 'Failed',
            actions: orderedResults,
            response: context.response,
            error: {
              code: 'UnsupportedWorkflowAction',
              message: error.message,
            },
            outputs: Object.fromEntries(context.actionOutputs.entries()),
          };
        }
      }

      if (progressed) continue;
      for (const actionName of [...pending]) {
        record(actionName, {
          name: actionName,
          type: String(declaredActions[actionName]?.type ?? ''),
          status: 'Skipped',
          startTime: new Date().toISOString(),
          endTime: new Date().toISOString(),
          outputs: {
            skippedBecause: 'runAfterDependencyNotSatisfied',
          },
        });
        pending.delete(actionName);
      }
    }

    return {
      status: 'Succeeded',
      actions: orderedResults,
      response: context.response,
      outputs: Object.fromEntries(context.actionOutputs.entries()),
    };
  }

  async executeAction(actionName, action, context) {
    const actionType = String(action?.type ?? '');
    if (actionType === 'Compose') {
      return {
        status: 'Succeeded',
        outputs: this.evaluateExpression(action.inputs ?? null, context),
      };
    }

    if (actionType === 'InitializeVariable') {
      for (const variable of action.inputs?.variables ?? []) {
        context.variables.set(variable.name, this.evaluateExpression(variable.value, context));
      }
      return {
        status: 'Succeeded',
        outputs: Object.fromEntries(context.variables.entries()),
      };
    }

    if (actionType === 'SetVariable') {
      const variableName = action.inputs?.name;
      context.variables.set(variableName, this.evaluateExpression(action.inputs?.value, context));
      return {
        status: 'Succeeded',
        outputs: { [variableName]: context.variables.get(variableName) },
      };
    }

    if (actionType === 'ParseJson') {
      const content = this.evaluateExpression(action.inputs?.content ?? null, context);
      const schema = action.inputs?.schema ?? {};
      if (schema?.type === 'object' && (!content || typeof content !== 'object' || Array.isArray(content))) {
        throw new Error(`ParseJson action '${actionName}' expected an object payload.`);
      }
      if (Array.isArray(schema?.required)) {
        for (const key of schema.required) {
          if (!(key in (content ?? {}))) {
            throw new Error(`ParseJson action '${actionName}' is missing required property '${key}'.`);
          }
        }
      }
      return {
        status: 'Succeeded',
        outputs: content,
      };
    }

    if (actionType === 'If') {
      const condition = Boolean(this.evaluateExpression(action.expression ?? false, context));
      const branch = condition ? 'actions' : 'else';
      const branchActions = condition ? (action.actions ?? {}) : (action.else?.actions ?? {});
      const branchResult = await this.executeActions(branchActions, context);
      if (branchResult.status === 'Failed' || branchResult.status === 'Cancelled') {
        return {
          status: branchResult.status === 'Failed' ? 'Failed' : 'Cancelled',
          outputs: {
            condition,
            branch,
            actions: branchResult.actions,
          },
          error: branchResult.error ?? null,
          halt: branchResult.status !== 'Succeeded',
          runStatus: branchResult.status,
        };
      }
      return {
        status: 'Succeeded',
        outputs: {
          condition,
          branch,
          actions: branchResult.actions,
        },
      };
    }

    if (actionType === 'Foreach') {
      const items = this.evaluateExpression(action.foreach ?? action.inputs ?? [], context);
      if (!Array.isArray(items)) {
        throw new Error(`Foreach action '${actionName}' expected an array.`);
      }
      const iterations = [];
      for (const item of items) {
        context.itemStack.push(item);
        try {
          const branchResult = await this.executeActions(action.actions ?? {}, context);
          iterations.push({
            item,
            status: branchResult.status,
            actions: branchResult.actions,
            outputs: branchResult.outputs,
          });
          if (branchResult.status === 'Failed' || branchResult.status === 'Cancelled') {
            return {
              status: branchResult.status,
              outputs: { iterations },
              error: branchResult.error ?? null,
              halt: true,
              runStatus: branchResult.status,
            };
          }
        } finally {
          context.itemStack.pop();
        }
      }
      return {
        status: 'Succeeded',
        outputs: {
          iterations,
        },
      };
    }

    if (actionType === 'Http') {
      const request = {
        method: String(this.evaluateExpression(action.inputs?.method ?? 'GET', context)).toUpperCase(),
        uri: String(this.evaluateExpression(action.inputs?.uri ?? '', context)),
        headers: this.evaluateExpression(action.inputs?.headers ?? {}, context),
        body: this.evaluateExpression(action.inputs?.body ?? null, context),
      };
      const response = this.httpInvoker
        ? this.httpInvoker(request)
        : fetch(request.uri, {
            method: request.method,
            headers: request.headers,
            body: request.body === null || request.body === undefined ? undefined : JSON.stringify(request.body),
          }).then(async result => {
            const text = await result.text().catch(() => '');
            let body = text || null;
            if (text) {
              try {
                body = JSON.parse(text);
              } catch {
                body = text;
              }
            }
            return {
              statusCode: result.status,
              headers: Object.fromEntries(result.headers.entries()),
              body,
            };
          });
      const result = await Promise.resolve(response);
      if ((result.statusCode ?? 500) >= 400) {
        return {
          status: 'Failed',
          outputs: result,
          error: {
            code: 'HttpActionFailed',
            message: `The HTTP action '${actionName}' returned status ${result.statusCode}.`,
          },
          halt: true,
          runStatus: 'Failed',
        };
      }
      return {
        status: 'Succeeded',
        outputs: result,
      };
    }

    if (actionType === 'Response') {
      const outputs = {
        statusCode: this.evaluateExpression(action.inputs?.statusCode ?? 200, context),
        headers: this.evaluateExpression(action.inputs?.headers ?? {}, context),
        body: this.evaluateExpression(action.inputs?.body ?? null, context),
      };
      context.response = outputs;
      return {
        status: 'Succeeded',
        outputs,
      };
    }

    if (actionType === 'Terminate') {
      const runStatus = String(this.evaluateExpression(action.inputs?.runStatus ?? 'Succeeded', context));
      const code = this.evaluateExpression(action.inputs?.runError?.code ?? 'WorkflowTerminated', context);
      const message = this.evaluateExpression(action.inputs?.runError?.message ?? `Workflow terminated with status '${runStatus}'.`, context);
      return {
        status: runStatus,
        outputs: {
          runStatus,
          code,
          message,
        },
        error: runStatus === 'Succeeded'
          ? null
          : {
              code,
              message,
            },
        halt: true,
        runStatus,
      };
    }

    throw new Error(`Unsupported workflow action type '${actionType}'.`);
  }

  async executeWorkflow(workflow, input) {
    const context = {
      triggerBody: input ?? null,
      variables: new Map(),
      actionOutputs: new Map(),
      response: null,
      itemStack: [],
    };
    return this.executeActions(workflow.definition?.actions ?? {}, context);
  }

  async invoke({ workflowName, triggerName, body }) {
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
    const execution = await this.executeWorkflow(workflow, body ?? null);
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
    this.recordTriggerHistory({
      workflowName: workflow.workflowName,
      triggerName,
      run,
    });
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

  listTriggerHistories({ workflowName, triggerName }) {
    const workflow = this.workflows.get(workflowKey(workflowName));
    if (!workflow) {
      return error(404, 'WorkflowNotFound', `The workflow '${workflowName}' was not found.`);
    }
    const trigger = workflow.definition?.triggers?.[triggerName];
    if (!trigger) {
      return error(404, 'TriggerNotFound', `The workflow trigger '${triggerName}' was not found.`);
    }
    return {
      status: 200,
      body: {
        value: [...(this.triggerHistories.get(this.triggerHistoryKey(workflowName, triggerName)) ?? [])],
      },
    };
  }

  listCallbackUrl({ workflowName, triggerName, origin, subscriptionId, resourceGroupName, apiVersion }) {
    const workflow = this.workflows.get(workflowKey(workflowName));
    if (!workflow) {
      return error(404, 'WorkflowNotFound', `The workflow '${workflowName}' was not found.`);
    }
    const trigger = workflow.definition?.triggers?.[triggerName];
    if (!trigger) {
      return error(404, 'TriggerNotFound', `The workflow trigger '${triggerName}' was not found.`);
    }
    return {
      status: 200,
      body: {
        value: `${origin}/subscriptions/${subscriptionId}/resourceGroups/${resourceGroupName}/providers/Microsoft.Logic/workflows/${workflowName}/triggers/${triggerName}/run?api-version=${apiVersion}`,
        method: 'POST',
      },
    };
  }

  resetTrigger({ workflowName, triggerName }) {
    const workflow = this.workflows.get(workflowKey(workflowName));
    if (!workflow) {
      return error(404, 'WorkflowNotFound', `The workflow '${workflowName}' was not found.`);
    }
    const trigger = workflow.definition?.triggers?.[triggerName];
    if (!trigger) {
      return error(404, 'TriggerNotFound', `The workflow trigger '${triggerName}' was not found.`);
    }
    this.triggerHistories.set(this.triggerHistoryKey(workflowName, triggerName), []);
    return {
      status: 200,
      body: {
        status: 'Reset',
        workflowName,
        triggerName,
      },
    };
  }
}

export function createWorkflowRunner(options = {}) {
  return new WorkflowRunner(options);
}
