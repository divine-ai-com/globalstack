import { appendFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { StringDecoder } from 'node:string_decoder';

export function createRecording(directory, metadata) {
  const file = resolve(directory, 'events.ndjson');
  writeFileSync(file, '', { mode: 0o600, flag: 'wx' });
  const started = performance.now();
  let sequence = 0;
  const emit = (type, data) => appendFileSync(file, JSON.stringify({ sequence: sequence++, elapsed: (performance.now() - started) / 1000, at: new Date().toISOString(), type, ...data }) + '\n');
  emit('run-start', metadata);
  return emit;
}

// Buffer complete lines so a credential split across process chunks is still redacted.
export function recordLines(emit, redact) {
  const streams = Object.fromEntries(['stdout', 'stderr'].map(name => [name, { decoder: new StringDecoder('utf8'), pending: '', discarded: false, total: 0 }]));
  const consume = (name, text, final = false) => {
    const stream = streams[name];
    stream.pending += text;
    const parts = stream.pending.split(/\r?\n/);
    stream.pending = parts.pop();
    if (final && stream.pending) { parts.push(stream.pending); stream.pending = ''; }
    for (const line of parts) {
      if (!stream.discarded && stream.total + line.length <= 1048576) {
        emit(name, redact(line + '\n')); stream.total += line.length;
      } else if (!stream.discarded) {
        emit(name, '[recording output limit reached]\n'); stream.discarded = true;
      }
    }
    if (stream.pending.length > 1048576) { stream.pending = ''; stream.discarded = true; emit(name, '[oversized unterminated output omitted]\n'); }
  };
  return {
    write: (name, bytes) => consume(name, streams[name].decoder.write(bytes)),
    end: () => { for (const [name, stream] of Object.entries(streams)) consume(name, stream.decoder.end(), true); },
  };
}

export function portalMode(value = 'required') {
  if (!['required', 'deferred'].includes(value)) throw new Error('Choose --portal=required or --portal=deferred');
  return value;
}
