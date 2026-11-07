import assert from 'node:assert/strict';
import { test } from 'node:test';
import { recordLines, portalMode } from './recording.mjs';
import { sanitize } from '../paired-lifecycle/transport.mjs';

test('live recording redacts credentials split across stdout chunks and preserves UTF-8', () => {
  const output = [];
  const lines = recordLines((stream, text) => output.push({ stream, text }), text => sanitize(text, [['synthetic-private-token', '<redacted>']]));
  lines.write('stdout', Buffer.from('token: synthetic-'));
  lines.write('stdout', Buffer.from('private-token\n'));
  const encoded = Buffer.from('café\n');
  lines.write('stderr', encoded.subarray(0, 4)); lines.write('stderr', encoded.subarray(4));
  lines.write('stdout', Buffer.from('final line')); lines.end();
  assert.deepEqual(output, [{ stream: 'stdout', text: 'token: <redacted>\n' }, { stream: 'stderr', text: 'café\n' }, { stream: 'stdout', text: 'final line\n' }]);
});

test('recording does not emit unbounded unterminated output', () => {
  const output = [];
  const lines = recordLines((stream, text) => output.push(text), text => text);
  lines.write('stdout', Buffer.alloc(1048577, 120)); lines.end();
  assert.deepEqual(output, ['[oversized unterminated output omitted]\n']);
});

test('portal capture defaults to required and deferral must be explicit', () => {
  assert.equal(portalMode(), 'required'); assert.equal(portalMode('deferred'), 'deferred');
  assert.throws(() => portalMode('skip'));
});
