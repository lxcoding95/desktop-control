import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorkspaceExecutor } from '../src/bridge/workspace.mts';

test('private workspace refusal, revocation and cancellation cause zero sandbox invocations', async () => {
  let allowed = false, calls = 0;
  const authority = { authorize: () => allowed ? { workspace: 'test-only', expiresAt: Date.now() + 10000 } : null };
  const run = createWorkspaceExecutor(authority, () => { calls++; return Promise.resolve({ ok: true }); });
  assert.deepEqual(await run(['files.write'], {}), { ok: false, error: { code: 'PERMISSION_DENIED' } });
  allowed = true;
  const pending = run(['files.write'], {}); allowed = false;
  assert.deepEqual(await pending, { ok: false, error: { code: 'PERMISSION_DENIED' } });
  allowed = true;
  const controller = new AbortController();
  const cancelled = run(['files.write'], {}, controller.signal); controller.abort();
  assert.deepEqual(await cancelled, { ok: false, error: { code: 'CANCELLED' } });
  assert.equal(calls, 0);
});

test('private workspace requires every capability and redacts backend failures', async () => {
  let calls = 0;
  const authority = { authorize: (capability: string) => capability === 'files.read' ? { workspace: 'test-only', expiresAt: Date.now() + 10000 } : null };
  const run = createWorkspaceExecutor(authority, () => { calls++; return Promise.reject(Error('PRIVATE_BACKEND_MARKER')); });
  assert.deepEqual(await run(['files.read', 'files.write'], {}), { ok: false, error: { code: 'PERMISSION_DENIED' } });
  assert.equal(calls, 0);
  assert.deepEqual(await run(['files.read'], {}), { ok: false, error: { code: 'INTERNAL_ERROR' } });
  assert.equal(calls, 1);
});

test('revocation during a sandbox job aborts it and suppresses a late success', async () => {
  let allowed = true, aborted = false;
  const authority = { authorize: () => allowed ? { workspace: 'test-only', expiresAt: Date.now() + 10000 } : null };
  const run = createWorkspaceExecutor(authority, (_workspace, _request, signal) => new Promise(resolve => {
    signal?.addEventListener('abort', () => { aborted = true; resolve({ ok: true }); }, { once: true });
  }));
  const pending = run(['files.write'], {});
  await new Promise(resolve => setTimeout(resolve, 20));
  allowed = false;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([pending, new Promise(resolve => { deadline = setTimeout(() => resolve('NOT_ABORTED'), 1500); })]);
    assert.deepEqual(result, { ok: false, error: { code: 'PERMISSION_DENIED' } });
    assert.equal(aborted, true);
  } finally { clearTimeout(deadline); }
});
