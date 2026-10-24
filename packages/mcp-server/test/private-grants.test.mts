import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, chmodSync, writeFileSync, unlinkSync, symlinkSync, readFileSync, linkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createPrivateGrantTestHarness } from '../src/bridge/private-grants.mts';
import { localPrincipal } from '../src/bridge/principal.mts';

test('private policy fails closed, reads fresh, and revokes a native principal', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'DesktopControl-private-test-'));
  try {
    const harness = createPrivateGrantTestHarness(directory);
    assert.deepEqual(harness.store.getGrants(), []);
    const principal = localPrincipal();
    if (process.platform === 'win32') assert.ok(principal, 'normal-user native principal must be available for the positive Windows roundtrip');
    const policy = { version: 1, principal, capability: 'diagnostics.read', resource: 'local:desktop-control', expiresAt: Date.now() + 900_000, revoked: false };
    for (const change of [{ principal: 'wrong' }, { expiresAt: Date.now() - 1 }, { expiresAt: Date.now() + 3_601_000 }, { expiresAt: Infinity }, { revoked: true }, { version: 2 }, { capability: 'anything' }]) {
      harness.writePolicy({ ...policy, ...change });
      assert.deepEqual(harness.store.getGrants(), []);
    }
    harness.writePolicy(policy);
    assert.equal(harness.store.getGrants().length, principal ? 1 : 0);
    harness.writePolicy({ ...policy, revoked: true });
    assert.deepEqual(harness.store.getGrants(), []);
    harness.writeRaw('malformed');
    assert.deepEqual(harness.store.getGrants(), []);
    if (process.platform === 'win32') {
      harness.writePolicy(policy);
      const cipher = readFileSync(path.join(directory, 'policy'));
      cipher[0] = (cipher[0] ?? 0) ^ 255;
      writeFileSync(path.join(directory, 'policy'), cipher);
      assert.deepEqual(harness.store.getGrants(), [], 'invalid DPAPI ciphertext must deny');
    }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('POSIX denies permissive, linked and oversized policy files', { skip: process.platform === 'win32' }, () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'DesktopControl-private-test-'));
  try {
    const harness = createPrivateGrantTestHarness(directory);
    const policy = { version: 1, principal: localPrincipal(), capability: 'diagnostics.read', resource: 'local:desktop-control', expiresAt: Date.now() + 900_000, revoked: false };
    harness.writePolicy(policy);
    chmodSync(path.join(directory, 'policy'), 0o644);
    assert.deepEqual(harness.store.getGrants(), []);
    unlinkSync(path.join(directory, 'policy'));
    writeFileSync(path.join(directory, 'other'), JSON.stringify(policy), { mode: 0o600 });
    symlinkSync(path.join(directory, 'other'), path.join(directory, 'policy'));
    assert.deepEqual(harness.store.getGrants(), []);
    unlinkSync(path.join(directory, 'policy'));
    linkSync(path.join(directory, 'other'), path.join(directory, 'policy'));
    assert.deepEqual(harness.store.getGrants(), []);
    unlinkSync(path.join(directory, 'policy'));
    harness.writeRaw('x'.repeat(16_385));
    assert.deepEqual(harness.store.getGrants(), []);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
