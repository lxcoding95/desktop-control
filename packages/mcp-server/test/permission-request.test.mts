import test from 'node:test';
import assert from 'node:assert/strict';
import { createPermissionRequester } from '../src/permission-request.mts';
const selection = { scope: 'workspace', capabilities: ['files.read'], allowedOrigins: [], reenableStopped: false };
const requester = (host: Omit<Parameters<typeof createPermissionRequester>[0], 'begin' | 'commit'>) =>
  createPermissionRequester({ ...host, begin: () => 'isolated-test-transaction', commit: () => {} });
test('ordinary tool input cannot self-approve, select multiple groups or forge a principal', async () => {
  let calls = 0;
  const run = requester({ principal: () => 'test-user', confirm: () => { calls++; return Promise.resolve(true); }, apply: () => { calls++; }, revoke: () => { calls++; } });
  for (const input of [{ ...selection, approved: true }, { ...selection, principal: 'admin' },
    { ...selection, capabilities: ['files.read', 'desktop.input'] }, { ...selection, reenableStopped: true },
    { scope: 'controls', capabilities: ['desktop.input'], allowedOrigins: [], reenableStopped: true },
    { ...selection, allowedOrigins: ['https://example.com'] }, { ...selection, capabilities: ['files.read', 'files.read'] }])
    await assert.rejects(run(input, new AbortController().signal), /PERMISSION_DENIED/);
  assert.equal(calls, 0);
});
test('only a fresh native approval applies the immutable exact one-group selection', async () => {
  let writes = 0, prompts = 0;
  const run = requester({ principal: () => 'test-user', confirm: proposal => {
    prompts++; assert.deepEqual(proposal.workspaceCapabilities, ['files.read']); assert.equal(proposal.diagnostics, false);
    assert.equal(Object.isFrozen(proposal.workspaceCapabilities), true); assert.deepEqual(proposal.lifetime, { kind: 'until-revoked' }); return Promise.resolve(prompts > 1);
  }, apply: request => { writes++; assert.deepEqual(request, selection); assert.equal(Object.isFrozen(request), true); }, revoke: () => assert.fail('No rollback needed') });
  assert.deepEqual(await run(selection, new AbortController().signal), { granted: false }); assert.equal(writes, 0);
  assert.deepEqual(await run(selection, new AbortController().signal), { granted: true }); assert.equal(writes, 1);
  assert.equal(prompts, 2, 'previous approval cannot be reused');
});
test('cancellation and changed native identity between confirmation and write confer no rights', async () => {
  for (const changeIdentity of [false, true]) {
    const signal = new AbortController(); let principal = 'test-user', writes = 0;
    const run = requester({ principal: () => principal, confirm: () => { if (changeIdentity) principal = 'different'; else signal.abort(); return Promise.resolve(true); },
      apply: () => { writes++; }, revoke: () => assert.fail('No write occurred') });
    await assert.rejects(run(selection, signal.signal), /PERMISSION_DENIED/); assert.equal(writes, 0);
  }
});
test('cancelled applied replacement is revoked and failure remains redacted', async () => {
  const signal = new AbortController(); let revoked = 0;
  const run = requester({ principal: () => 'test-user', confirm: () => Promise.resolve(true),
    apply: () => { signal.abort(); throw Error('PRIVATE_PATH'); }, revoke: scope => { assert.equal(scope, 'workspace'); revoked++; } });
  await assert.rejects(run(selection, signal.signal), /^Error: PERMISSION_DENIED$/); assert.equal(revoked, 1);
});
test('a pending native confirmation cannot be overlapped by another tool invocation', async () => {
  let release!: (value: boolean) => void;
  const run = requester({ principal: () => 'test-user', confirm: () => new Promise(resolve => { release = resolve; }),
    apply: () => assert.fail('Denied'), revoke: () => assert.fail('No grant') });
  const first = run(selection, new AbortController().signal);
  await assert.rejects(run(selection, new AbortController().signal), /PERMISSION_DENIED/);
  release(false); assert.deepEqual(await first, { granted: false });
});

test('durable marker precedes the write; commit failure never clears pending recovery', async () => {
  for (const failCommit of [false, true]) {
    const events: string[] = [];
    const run = createPermissionRequester({ principal: () => 'test-user', confirm: () => Promise.resolve(true),
      begin: scope => { events.push('begin:' + scope); return 'test-only'; },
      apply: () => { events.push('apply'); },
      commit: (scope, token) => { assert.equal(scope, 'workspace'); assert.equal(token, 'test-only'); events.push('commit'); if (failCommit) throw Error('PRIVATE_MARKER'); },
      revoke: () => { events.push('revoke'); } });
    if (failCommit) await assert.rejects(run(selection, new AbortController().signal), /PERMISSION_DENIED/);
    else assert.deepEqual(await run(selection, new AbortController().signal), { granted: true });
    assert.deepEqual(events, failCommit ? ['begin:workspace', 'apply', 'commit', 'revoke'] : ['begin:workspace', 'apply', 'commit']);
  }
});
