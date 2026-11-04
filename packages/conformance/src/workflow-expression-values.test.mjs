import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createWorkflowRunner } from '../../azure-data-plane/src/workflow-runner.mjs';

test('workflow literals keep their JSON types while expression arguments are parsed', () => {
  const runner = createWorkflowRunner();
  const context = { variables: new Map([['count', 2]]) };
  const payload = { version: '1.0', code: '00123', quoted: "'literal'", count: 2, enabled: false, nested: ['2', 2] };
  assert.deepEqual(runner.evaluateExpression(payload, context), payload);
  assert.equal(runner.evaluateExpression("@equals(@variables('count'), 2)", context), true);
  assert.equal(runner.evaluateExpression("@equals(@variables('count'), '2')", context), false);
  assert.equal(runner.evaluateExpression("@add(@variables('count'), 1)", context), 3);
  assert.equal(runner.evaluateExpression("@less(@variables('count'), 3)", context), true);
});
