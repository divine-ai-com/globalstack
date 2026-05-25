function key(accountName, queueName) {
  return `${String(accountName ?? '').toLowerCase()}\0${String(queueName ?? '').toLowerCase()}`;
}

export const queueDeleteStaleReadObservedThroughMs = 2000;
export const queueDeleteStaleReadObservedGoneByMs = 2500;
export const queueDeleteStaleReadWindowMs = queueDeleteStaleReadObservedGoneByMs;

export class QueueDeleteStaleReadTracker {
  constructor({ now = () => Date.now(), windowMs = queueDeleteStaleReadWindowMs } = {}) {
    this.now = now;
    this.windowMs = windowMs;
    this.lastPeekBodies = new Map();
    this.tombstones = new Map();
  }

  recordPeek({ accountName, queueName, body }) {
    if (!body) return;
    this.lastPeekBodies.set(key(accountName, queueName), body);
  }

  armDelete({ accountName, queueName, body = null }) {
    const entryKey = key(accountName, queueName);
    const snapshot = body ?? this.lastPeekBodies.get(entryKey) ?? null;
    this.lastPeekBodies.delete(entryKey);
    if (!snapshot) {
      this.tombstones.delete(entryKey);
      return false;
    }
    this.tombstones.set(entryKey, {
      body: snapshot,
      expiresAt: this.now() + this.windowMs,
    });
    return true;
  }

  readAfterDelete({ accountName, queueName }) {
    const entryKey = key(accountName, queueName);
    const tombstone = this.tombstones.get(entryKey);
    if (!tombstone) return null;
    if (this.now() >= tombstone.expiresAt) {
      this.tombstones.delete(entryKey);
      return null;
    }
    return tombstone.body;
  }

  clear({ accountName, queueName }) {
    const entryKey = key(accountName, queueName);
    this.lastPeekBodies.delete(entryKey);
    this.tombstones.delete(entryKey);
  }
}
