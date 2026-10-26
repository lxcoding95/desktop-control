import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { issuePreviewLicense } from '../license/preview-license.mjs';
import { createSingleSeatLedger } from '../license/single-seat-ledger.mjs';
import { createConfiguredPreviewEntitlement } from './configured-entitlement.mjs';

// Ephemeral, isolated fixture issuer. Never reads the owner vault or issues a real license.
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 3072 });
const instant = 1_790_000_000_000;
const now = () => instant;
function store() {
  const map = new Map(); let tail = Promise.resolve(), writes = 0;
  const storage = { get: async key => map.get(key), put: async (key, value) => { writes++; map.set(key, structuredClone(value)); },
    transaction(fn) { const job = tail.then(() => fn(storage)); tail = job.catch(() => {}); return job; } };
  return { storage, count: () => map.size, writes: () => writes };
}
const token = await issuePreviewLicense({ privateKey, ownerId: 'test-owner', deviceId: 'test-device', licenseId: 'test-license',
  expiresAt: instant + 60_000, reserveSeat: () => Promise.resolve(true), now });
function configured(storage, overrides = {}) {
  return createConfiguredPreviewEntitlement({ storage, ownerId: 'test-owner', deviceId: 'test-device', token, publicKey, now, ...overrides });
}
test('existing signed health entitlement admits exactly one seat and works on a fresh gate', async () => {
  const state = store(), gate = configured(state.storage);
  assert.equal(await gate.check('test-owner', 'test-device'), true);
  assert.equal(await configured(state.storage).check('test-owner', 'test-device'), true);
  assert.equal(state.count(), 1); assert.equal(state.writes(), 1);
});
test('forged owner/device/signature/issuer and expired license never enroll a seat', async () => {
  const other = generateKeyPairSync('rsa', { modulusLength: 3072 });
  for (const overrides of [{ token: token.slice(0, -6) + 'abcdef' }, { publicKey: other.publicKey },
    { now: () => instant + 60_000 }, { token: '' }]) {
    const state = store(); assert.equal(await configured(state.storage, overrides).check('test-owner', 'test-device'), false);
    assert.equal(state.count(), 0);
  }
  const state = store(); assert.equal(await configured(state.storage).check('different-owner', 'test-device'), false);
  assert.equal(await configured(state.storage).check('test-owner', 'different-device'), false); assert.equal(state.count(), 0);
});
test('parallel admission cannot allocate two seats or replace a previous license', async () => {
  const state = store(), gate = configured(state.storage);
  await Promise.all(Array.from({ length: 16 }, () => gate.check('test-owner', 'test-device')));
  assert.equal(state.count(), 1); assert.equal(state.writes(), 1);
  const other = await issuePreviewLicense({ privateKey, ownerId: 'test-owner', deviceId: 'test-device', licenseId: 'different-test-license',
    expiresAt: instant + 60_000, reserveSeat: () => Promise.resolve(true), now });
  assert.equal(await configured(state.storage, { token: other }).check('test-owner', 'test-device'), false);
  assert.equal(state.writes(), 1);
});
test('authoritative revocation survives reconfiguration and is never silently reactivated', async () => {
  const state = store(); assert.equal(await configured(state.storage).check('test-owner', 'test-device'), true);
  const ledger = createSingleSeatLedger({ storage: state.storage, approvedOwnerId: 'test-owner', now });
  assert.equal(await ledger.revoke({ licenseId: 'test-license', verifyAdmin: () => Promise.resolve(true) }), true);
  assert.equal(await configured(state.storage).check('test-owner', 'test-device'), false);
  assert.equal(state.writes(), 2);
});
test('unavailable authoritative storage fails closed', async () => {
  const state = store(); state.storage.get = async () => { throw Error('PRIVATE_STORAGE'); };
  assert.equal(await configured(state.storage).check('test-owner', 'test-device'), false);
});
