import { randomUUID } from 'node:crypto';

export class OperationStore {
  #operations = new Map();

  create({ projectId, location = 'global', target, verb, metadata = {} }) {
    const id = randomUUID();
    const name = `projects/${projectId}/locations/${location}/operations/${id}`;
    const operation = {
      name,
      metadata: {
        target,
        verb,
        createTime: new Date().toISOString(),
        ...metadata,
      },
      done: false,
    };
    this.#operations.set(name, operation);
    return structuredClone(operation);
  }

  get(name) {
    const operation = this.#operations.get(name);
    return operation ? structuredClone(operation) : null;
  }

  complete(name, response = {}) {
    const operation = this.#operations.get(name);
    if (!operation) return null;
    operation.done = true;
    operation.response = response;
    operation.metadata.endTime = new Date().toISOString();
    return structuredClone(operation);
  }

  fail(name, error) {
    const operation = this.#operations.get(name);
    if (!operation) return null;
    operation.done = true;
    operation.error = error;
    operation.metadata.endTime = new Date().toISOString();
    return structuredClone(operation);
  }

  list() {
    return [...this.#operations.values()].map(operation => structuredClone(operation));
  }
}
