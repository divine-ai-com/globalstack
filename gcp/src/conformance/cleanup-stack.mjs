export class CleanupStack {
  #steps = [];

  push(name, fn) {
    this.#steps.push({ name, fn });
  }

  async run() {
    const results = [];
    for (const step of [...this.#steps].reverse()) {
      try {
        await step.fn();
        results.push({ name: step.name, status: 'deleted' });
      } catch (error) {
        results.push({
          name: step.name,
          status: 'failed',
          error: {
            name: error.name,
            message: error.message,
          },
        });
      }
    }
    return results;
  }
}
