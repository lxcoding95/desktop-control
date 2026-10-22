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
  const bad = createStatusExecutor({ grants: allowed, adapter: { readStatus: () => ({ ...staticStatusAdapter.readStatus(), ready: false as true }) } });
  for (const run of [throws, bad]) {
    const result = await run(ctx);
    assert.equal(result.content[0].text, 'INTERNAL_ERROR');
    assert.equal(JSON.stringify(result).includes('private system path'), false);
  }
});
