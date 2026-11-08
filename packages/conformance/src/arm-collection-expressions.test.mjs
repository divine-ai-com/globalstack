import assert from 'node:assert/strict';
import { test } from 'node:test';
import { evaluateArmValue } from '../../azure-control-plane/src/server-support.mjs';

test('Bicep application settings retain object and array types through nested ARM expressions', () => {
  const parameters = { additional: [{ name: 'SCANNER_SCOPE', value: 'api://example/.default' }] };
  assert.deepEqual(evaluateArmValue("[concat(createArray(createObject('name', 'SCANNER_ENDPOINT', 'value', 'https://scanner.example')), parameters('additional'))]", parameters),
    [{ name: 'SCANNER_ENDPOINT', value: 'https://scanner.example' }, ...parameters.additional]);
  assert.equal(evaluateArmValue("[concat('prefix', '-', 'suffix')]", {}), 'prefix-suffix');
  assert.deepEqual(evaluateArmValue("[concat(createArray(createArray('nested')), createArray('last'))]", {}), [['nested'], 'last']);
  assert.deepEqual(evaluateArmValue('[createObject()]', {}), {});
  const object = evaluateArmValue("[createObject('__proto__', createObject('safe', 'value'))]", {});
  assert.ok(Object.hasOwn(object, '__proto__')); assert.equal(Object.getPrototypeOf(object), Object.prototype);
});

test('invalid ARM collection arguments fail instead of silently producing string settings', () => {
  for (const expression of ["[concat(createArray('value'), 'other')]", '[concat()]', "[createObject('key')]", "[createObject(1, 'value')]"]) {
    assert.throws(() => evaluateArmValue(expression, {}), { code: 'InvalidTemplate' });
  }
});
