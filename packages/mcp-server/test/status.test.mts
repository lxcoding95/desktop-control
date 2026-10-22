import assert from 'node:assert/strict';
import test from 'node:test';
import { createStatusExecutor, staticStatusAdapter } from '../src/bridge/status.mts';
import { STATUS_CAPABILITY, STATUS_RESOURCE } from '../src/bridge/policy.mts';
import type { DiagnosticGrant, ReadonlyGrantStore } from '../src/bridge/policy.mts';
const now = 1_700_000_000_000;
const grant: DiagnosticGrant = { principal: 'posix:1000', capability: STATUS_CAPABILITY, resource: STATUS_RESOURCE, expiresAt: now + 10000, revoked: false };
const allowed: ReadonlyGrantStore = { getGrants: () => [grant] };
const ctx = { principal: 'posix:1000', now };

test('denied request never invokes adapter', async () => {
  let calls = 0;
  const run = createStatusExecutor({ adapter: { readStatus: () => { calls++; return staticStatusAdapter.readStatus(); } } });
  const result = await run(ctx);
  assert.equal('isError' in result && result.isError, true);
  assert.equal(result.content[0].text, 'PERMISSION_DENIED');
  assert.equal(calls, 0);
});
test('test-only explicit grant allows bounded structured result', async () => {
  const run = createStatusExecutor({ grants: allowed, adapter: staticStatusAdapter });
  const result = await run(ctx);
  assert.equal('isError' in result, false);
  assert.deepEqual('structuredContent' in result ? result.structuredContent : undefined, { service: 'desktop-control', ready: true, api_version: 1 });
});
test('revoke between calls blocks subsequent execution', async () => {
  let revoked = false, calls = 0;
  const run = createStatusExecutor({ grants: { getGrants: () => [{ ...grant, revoked }] }, adapter: { readStatus: () => { calls++; return staticStatusAdapter.readStatus(); } } });
  const first = await run(ctx); assert.equal('isError' in first, false);
  revoked = true;
  const second = await run(ctx); assert.equal(second.content[0].text, 'PERMISSION_DENIED');
  assert.equal(calls, 1);
});
test('cancelled request never reaches adapter', async () => {
  const controller = new AbortController(); controller.abort();
  let calls = 0;
  const run = createStatusExecutor({ grants: allowed, adapter: { readStatus: () => { calls++; return staticStatusAdapter.readStatus(); } } });
  const result = await run({...ctx, signal: controller.signal });
  assert.equal(result.content[0].text, 'CANCELLED'); assert.equal(calls, 0);
});
test('adapter exceptions and invalid shapes redact as INTERNAL_ERROR', async () => {
  const throws = createStatusExecutor({ grants: allowed, adapter: { readStatus: () => { throw Error('private system path'); } } });
  const bad = createStatusExecutor({ grants: allowed, adapter: { readStatus: () => ({ service: 'desktop-control', api_version: 1, ready: false as true }) } });
  for (const run of [throws, bad]) {
    const result = await run(ctx);
    assert.equal(result.content[0].text, 'INTERNAL_ERROR');
    assert.equal(JSON.stringify(result).includes('private system path'), false);
  }
});

test('revocation before deferred adapter entry prevents invocation', async () => {
  let revoked = false, calls = 0;
  const run = createStatusExecutor({
    grants: { getGrants: () => [{ ...grant, revoked }] },
    adapter: { readStatus: () => { calls++; return staticStatusAdapter.readStatus(); } }
  });
  const pending = run(ctx);
  revoked = true;
  const result = await pending;
  assert.equal(calls, 0);
  assert.equal(result.content[0].text, 'PERMISSION_DENIED');
});

test('cancellation before deferred adapter entry prevents invocation', async () => {
  let calls = 0;
  const controller = new AbortController();
  const run = createStatusExecutor({ grants: allowed, adapter: {
    readStatus: () => { calls++; return staticStatusAdapter.readStatus(); }
  } });
  const pending = run({ ...ctx, signal: controller.signal });
  controller.abort();
  const result = await pending;
  assert.equal(calls, 0);
  assert.equal(result.content[0].text, 'CANCELLED');
});

test('adapter timeout returns a bounded redacted failure', async () => {
  const run = createStatusExecutor({ grants: allowed, timeoutMs: 25, adapter: {
    readStatus: () => new Promise(() => {})
  } });
  assert.equal((await run(ctx)).content[0].text, 'TIMEOUT');
});

test('in-flight abort returns CANCELLED without waiting for adapter', async () => {
  const controller = new AbortController();
  const run = createStatusExecutor({ grants: allowed, adapter: {
    readStatus: () => new Promise(() => {})
  } });
  const pending = run({ ...ctx, signal: controller.signal });
  // Yield to let the adapter begin; the earlier test covers abort before entry.
  await Promise.resolve();
  controller.abort();
  assert.equal((await pending).content[0].text, 'CANCELLED');
});

test('extra adapter fields are excluded from the public response', async () => {
  const run = createStatusExecutor({ grants: allowed, adapter: {
    readStatus: () => ({ service: 'desktop-control', ready: true, api_version: 1, extra: 'S02_TEST_MARKER' })
  } });
  const result = await run(ctx);
  assert.doesNotMatch(JSON.stringify(result), /S02_TEST_MARKER/);
  assert.deepEqual('structuredContent' in result && result.structuredContent,
    { service: 'desktop-control', ready: true, api_version: 1 });
});
