import assert from 'node:assert/strict';

export function requiredPhases(platform) {
  if (platform.family === 'hcl') return ['version', 'format', 'init', 'validate', 'plan-create', 'apply-create', 'plan-stable', 'refresh', 'plan-update', 'apply-update', 'plan-drift', 'apply-repair', 'state-remove', 'import', 'plan-imported', 'destroy'];
  if (platform.family === 'pulumi') return ['version', ...(platform.fixture === 'pulumi-yaml' ? [] : ['dependencies']), 'provider-install', 'stack-init', 'config-azure-native:subscriptionId', 'config-groupName', 'config-location', 'config-runId', 'config-expires', 'config-revision', 'preview-create', 'up-create', 'preview-stable', 'refresh', 'config-revision', 'preview-update', 'up-update', 'refresh-drift', 'up-repair', 'state-export', 'state-remove', 'import', 'preview-imported', 'destroy'];
  if (platform.family === 'ansible') return ['version', 'syntax-check', 'check-create', 'apply-create', 'repeat-stable', 'check-stable', 'check-update', 'apply-update', 'check-drift', 'apply-repair', 'repeat-final', 'destroy'];
  if (platform.family === 'cli') return ['version', 'syntax-check', 'apply-create', 'repeat-stable', 'read', 'apply-update', 'read-drift', 'apply-repair', 'repeat-final', 'destroy'];
  if (platform.family === 'template') return [...(platform.fixture === 'bicep' ? ['version', 'compile'] : ['validate-json']), 'cli-version', 'deploy-create', 'deploy-create-read-0', 'read-stable', 'read-group', 'deploy-update', 'deploy-update-read-0', 'read-drift', 'deploy-repair', 'deploy-repair-read-0', 'read-final', 'destroy-group', 'destroy-deployment'];
  throw new Error('Unknown lifecycle family');
}

export function validateCapture(report, platform) {
  assert.equal(report.schemaVersion, 2);
  assert.equal(report.platform, platform.id);
  assert.equal(report.sourceDirty, false, 'Final captures require a clean source revision');
  assert.equal(report.ok, true);
  for (const target of report.targets) {
    assert.equal(target.ok, true); assert.equal(target.sourceUnchanged, true);
    assert.equal(target.cleanup.nativeDestroy, true); assert.equal(target.cleanup.absent, true); assert.equal(target.cleanup.privateFilesRemoved, true);
    if (platform.family === 'template') assert.equal(target.cleanup.deploymentAbsent, true);
    const phases = target.phases.filter(phase => !/^deploy-(create|update|repair)-read-[1-9][0-9]*$/.test(phase.phase));
    assert.deepEqual(phases.map(phase => phase.phase), requiredPhases(platform), 'Missing, reordered or unexpected native stages');
    for (const phase of target.phases) {
      assert.ok(phase.expectedExitCodes.includes(phase.exitCode) && !phase.timedOut);
      assert.ok(Date.parse(phase.completedAt) >= Date.parse(phase.startedAt));
    }
    for (const trace of target.traces) {
      assert.ok(trace.request && trace.response && !trace.blocked && !trace.transportError);
      assert.ok(target.phases.some(phase => phase.phase === trace.phase && phase.startedAt <= trace.startedAt && phase.completedAt >= trace.completedAt), 'An exchange has no matching command interval');
    }
    for (const probe of ['read-create', 'read-update', 'inject-drift', 'read-repair']) assert.equal(target.probes.find(item => item.phase === probe)?.status, 200, `Missing successful ${probe}`);
    assert.equal(target.probes.find(item => item.phase === 'read-create').body?.tags?.revision, 'one');
    assert.equal(target.probes.find(item => item.phase === 'read-update').body?.tags?.revision, 'two');
    assert.equal(target.probes.find(item => item.phase === 'inject-drift').body?.tags?.revision, 'external');
    assert.equal(target.probes.find(item => item.phase === 'read-repair').body?.tags?.revision, 'two');
    assert.ok(target.probes.some(item => item.phase.startsWith('post-destroy-read-') && item.status === 404));
    const create = platform.family === 'pulumi' ? 'up-create' : platform.family === 'template' ? 'deploy-create' : 'apply-create';
    assert.ok(target.traces.some(trace => trace.phase === create && trace.method === 'PUT' && [200, 201, 202].includes(trace.status)), 'Missing native creation request');
    assert.ok(target.traces.some(trace => trace.phase.startsWith('destroy') && trace.method === 'DELETE' && [200, 202, 204].includes(trace.status)), 'Missing native deletion request');
  }
  return true;
}
