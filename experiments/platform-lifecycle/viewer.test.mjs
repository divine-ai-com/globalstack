import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

test('walkthrough routes untrusted text only to its two terminal panels', async () => {
  const html = await readFile(new URL('./walkthrough.html', import.meta.url), 'utf8');
  const script = html.match(/<script>\n([\s\S]*?)<\/script>/)[1];
  const elements = new Map(['title', 'identity', 'runstate', 'clock', 'seek', 'local', 'azure', 'local-status', 'azure-status'].map(id => [id, { textContent: '', scrollHeight: 0 }]));
  for (const el of elements.values()) Object.defineProperty(el, 'innerHTML', { set() { throw new Error('Untrusted text reached an HTML sink'); } });
  const document = { getElementById: id => elements.get(id) ?? null };
  const text = '<img src=x onerror="globalThis.injected=true">';
  const context = { document, performance: { now: () => 0 }, setInterval: () => {}, text };
  runInNewContext(script + `\nevent({type:'output',target:'local',text}); event({type:'output',target:'identity',text:'unexpected'});`, context);
  assert.equal(elements.get('local').textContent, text);
  assert.equal(elements.get('identity').textContent, '');
  assert.equal(context.injected, undefined);
});
