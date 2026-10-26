import test from 'node:test';
import assert from 'node:assert/strict';
import { createPermissionQuarantine, createJournaledPermissionRevoker } from '../src/permission-quarantine.mts';
import { createPermissionRequester } from '../src/permission-request.mts';
import { createWorkspaceExecutor } from '../src/bridge/workspace.mts';
import { createStatusExecutor, staticStatusAdapter } from '../src/bridge/status.mts';
import { privateAccessIntersection } from '../src/bridge/private-grants.mts';
import type { PrivateControlCapability, PrivateWorkspaceCapability } from '../src/bridge/private-grants.mts';
import type { ReadonlyGrantStore } from '../src/bridge/policy.mts';

const rawDiagnostics: ReadonlyGrantStore = { getGrants: () => [{ principal: 'posix:1000', capability: 'diagnostics.read', resource: 'local:desktop-control', revoked: false, lifetime: { kind: 'until-revoked' } }] };
const rawWorkspace = { authorize: (capability: PrivateWorkspaceCapability) => capability.startsWith('files.') || capability === 'pdf.create'
  ? { workspace: 'test-only', lifetime: { kind: 'until-revoked' as const } } : null };
const rawControls = { authorize: (capability: PrivateControlCapability) => capability.startsWith('browser.') || capability.startsWith('desktop.') || capability === 'terminal.exec'
  ? { lifetime: { kind: 'until-revoked' as const } } : null };
const denied = { ok: false, error: { code: 'PERMISSION_DENIED' } };

test('failed diagnostics revoke blocks the real status adapter despite an unchanged persistent store', async () => {
  const quarantine = createPermissionQuarantine();
  let calls = 0;
  const run = createStatusExecutor({ grants: quarantine.guardGrantStore(rawDiagnostics), adapter: { readStatus: () => { calls++; return staticStatusAdapter.readStatus(); } } });
  assert.throws(() => quarantine.revoke('diagnostics', () => { throw Error('PRIVATE_STORAGE_MARKER'); }), /^Error: PERMISSION_RECOVERY_REQUIRED$/);
  assert.equal(rawDiagnostics.getGrants().length, 1, 'failed disk write may leave the old grant intact');
  assert.equal((await run({ principal: 'posix:1000' })).content[0].text, 'PERMISSION_DENIED');
  assert.equal(calls, 0);
  assert.equal(quarantine.isQuarantined('workspace'), false);
});

for (const scope of ['workspace', 'controls'] as const) {
  test(`failed ${scope} revoke blocks terminal and its affected adapters with zero backend invocations`, async () => {
    const quarantine = createPermissionQuarantine();
    const workspace = quarantine.guardAuthority('workspace', rawWorkspace);
    const controls = quarantine.guardAuthority('controls', rawControls);
    let calls = 0;
    const runner = () => { calls++; return Promise.resolve({ ok: true }); };
    const terminal = createWorkspaceExecutor({ authorize(capability) {
      const left = controls.authorize('terminal.exec'), right = workspace.authorize(capability);
      if (!left || !right) return null;
      const lifetime = privateAccessIntersection(left, right);
      return lifetime ? { workspace: right.workspace, ...lifetime } : null;
    } }, runner);
    assert.throws(() => quarantine.revoke(scope, () => { throw Error('WRITE_FAILED'); }), /PERMISSION_RECOVERY_REQUIRED/);
    assert.deepEqual(await terminal(['files.write'], { op: 'terminal' }), denied);
    assert.equal(calls, 0);
    if (scope === 'workspace') {
      const files = createWorkspaceExecutor(workspace, runner);
      assert.deepEqual(await files(['files.read'], { op: 'read' }), denied);
      assert.equal(calls, 0);
    } else {
      assert.equal(controls.authorize('desktop.input'), null);
      assert.equal(controls.authorize('browser.read'), null);
      assert.ok(workspace.authorize('files.read'), 'unaffected independent workspace grant is preserved');
    }
  });
}

test('cancelled workspace grant with failed rollback is quarantined before any later file operation', async () => {
  const quarantine = createPermissionQuarantine(), signal = new AbortController();
  let applied = false, backendCalls = 0;
  const requester = createPermissionRequester({ principal: () => 'fixture-user', confirm: () => Promise.resolve(true), begin: () => 'test-only', commit: () => {},
    apply: () => { applied = true; signal.abort(); },
    revoke: scope => quarantine.revoke(scope, () => { throw Error('PRIVATE_WRITE_FAILURE'); }) });
  await assert.rejects(requester({ scope: 'workspace', capabilities: ['files.write'], allowedOrigins: [], reenableStopped: false }, signal.signal), /^Error: PERMISSION_RECOVERY_REQUIRED$/);
  assert.equal(applied, true, 'the successful write is the regression precondition');
  const files = createWorkspaceExecutor(quarantine.guardAuthority('workspace', rawWorkspace), () => { backendCalls++; return Promise.resolve({ ok: true }); });
  assert.deepEqual(await files(['files.write'], { op: 'write' }), denied);
  assert.equal(backendCalls, 0);
  assert.throws(() => quarantine.assertGrantAllowed('workspace'), /PERMISSION_RECOVERY_REQUIRED/);
});

test('quarantine during an authorization read suppresses a returned allow decision', () => {
  const quarantine = createPermissionQuarantine();
  const workspace = quarantine.guardAuthority('workspace', { authorize: () => { quarantine.quarantine('workspace'); return rawWorkspace.authorize('files.read'); } });
  assert.equal(workspace.authorize('files.read'), null);
  const store = quarantine.guardGrantStore({ getGrants: () => { quarantine.quarantine('diagnostics'); return rawDiagnostics.getGrants(); } });
  assert.deepEqual(store.getGrants(), []);
});

test('quarantine aborts an outstanding workspace operation and rejects a late success', async () => {
  const quarantine = createPermissionQuarantine();
  let aborted = false;
  const files = createWorkspaceExecutor(quarantine.guardAuthority('workspace', rawWorkspace), (_workspace, _request, signal) => new Promise(resolve => {
    signal?.addEventListener('abort', () => { aborted = true; resolve({ ok: true }); }, { once: true });
  }));
  const pending = files(['files.write'], { op: 'write' });
  await new Promise(resolve => setTimeout(resolve, 20));
  quarantine.quarantine('workspace');
  assert.deepEqual(await pending, denied); assert.equal(aborted, true);
});

test('successful retry or another model grant cannot clear an instance quarantine', () => {
  const quarantine = createPermissionQuarantine();
  assert.throws(() => quarantine.revoke('controls', () => { throw Error('Unavailable'); }));
  quarantine.revoke('controls', () => {});
  assert.equal(quarantine.isQuarantined('controls'), true);
  assert.throws(() => quarantine.assertGrantAllowed('controls'), /PERMISSION_RECOVERY_REQUIRED/);
  assert.equal(Object.hasOwn(quarantine, 'clear'), false);
  assert.equal(Object.hasOwn(quarantine, 'reset'), false);
});

test('scope latch is explicitly instance-local and is not proof of durable storage revocation', () => {
  const original = createPermissionQuarantine(); original.quarantine('diagnostics');
  assert.deepEqual(original.guardGrantStore(rawDiagnostics).getGrants(), []);
  const restarted = createPermissionQuarantine();
  assert.equal(restarted.guardGrantStore(rawDiagnostics).getGrants().length, 1,
    'operator must repair/revoke stored policy and verify denial BEFORE restart; an in-memory latch cannot do this');
});

test('direct revocation creates a write-ahead barrier before a failing policy write and never commits it', () => {
  const quarantine = createPermissionQuarantine(), order: string[] = [];
  let pending = false;
  const revoke = createJournaledPermissionRevoker(quarantine, {
    begin: scope => { assert.equal(scope, 'workspace'); order.push('begin'); pending = true; return 'opaque-test-transaction'; },
    revoke: () => { assert.equal(pending, true); order.push('revoke'); throw Error('POLICY_WRITE_FAILED'); },
    commit: () => assert.fail('A failed policy revoke must not remove the pending barrier')
  });
  assert.throws(() => revoke('workspace'), /PERMISSION_RECOVERY_REQUIRED/);
  assert.deepEqual(order, ['begin', 'revoke']); assert.equal(pending, true);
  assert.equal(quarantine.isQuarantined('workspace'), true);
});

test('direct revocation commits only after durable revoke; failed barrier creation never mutates policy', () => {
  const quarantine = createPermissionQuarantine(), order: string[] = [];
  const revoke = createJournaledPermissionRevoker(quarantine, {
    begin: () => { order.push('begin'); return 'opaque-test-transaction'; },
    revoke: () => { order.push('revoke'); },
    commit: (_scope, transaction) => { assert.equal(transaction, 'opaque-test-transaction'); order.push('commit'); }
  });
  revoke('diagnostics'); assert.deepEqual(order, ['begin', 'revoke', 'commit']);
  const unavailable = createJournaledPermissionRevoker(quarantine, {
    begin: () => { throw Error('MARKER_STORAGE_FAILED'); }, revoke: () => assert.fail('No barrier, no mutation'), commit: () => assert.fail('No transaction')
  });
  assert.throws(() => unavailable('controls'), /PERMISSION_RECOVERY_REQUIRED/);
  assert.equal(quarantine.isQuarantined('controls'), true);
});
