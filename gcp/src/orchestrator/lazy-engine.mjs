export class LazyEngine {
  constructor({ name, start, stop, healthCheck }) {
    this.name = name;
    this.startEngine = start;
    this.stopEngine = stop;
    this.healthCheck = healthCheck;
    this.started = false;
  }

  async ensureStarted(context = {}) {
    if (this.started) return;
    await this.startEngine(context);
    if (this.healthCheck) {
      await this.healthCheck(context);
    }
    this.started = true;
  }

  async stop(context = {}) {
    if (!this.started) return;
    await this.stopEngine(context);
    this.started = false;
  }
}
