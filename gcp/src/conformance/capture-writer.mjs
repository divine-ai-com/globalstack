import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sanitizeExchange, sanitizeMetadata } from './sanitizer.mjs';

export class CaptureWriter {
  constructor({ root = new URL('../../fixtures/captures/', import.meta.url), service, runId }) {
    this.root = root;
    this.service = service;
    this.runId = runId;
    this.events = [];
  }

  record(name, exchange, metadata = {}) {
    const event = {
      name,
      metadata: sanitizeMetadata(metadata),
      exchange: sanitizeExchange(exchange),
    };
    this.events.push(event);
    return event;
  }

  recordNote(name, metadata = {}) {
    const event = {
      name,
      metadata: sanitizeMetadata(metadata),
      exchange: null,
    };
    this.events.push(event);
    return event;
  }

  async write({ context, cleanup, status }) {
    const rootPath = this.root instanceof URL ? fileURLToPath(this.root) : this.root;
    const directory = join(rootPath, this.service, this.runId);
    await mkdir(directory, { recursive: true });
    const capture = {
      schema_version: 1,
      status,
      context: sanitizeMetadata(context),
      cleanup: sanitizeMetadata(cleanup),
      events: this.events,
      written_at: new Date().toISOString(),
    };
    const path = join(directory, 'capture.json');
    await writeFile(path, `${JSON.stringify(capture, null, 2)}\n`);
    return path;
  }
}
