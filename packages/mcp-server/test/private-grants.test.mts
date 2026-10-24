import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, chmodSync, writeFileSync, unlinkSync, symlinkSync, readFileSync, linkSync } from 'node:fs';
import { tmpdir, userInfo } from 'node:os';
import path from 'node:path';
import { createPrivateGrantTestHarness } from '../src/bridge/private-grants.mts';
import { localPrincipal } from '../src/bridge/principal.mts';
import { execFileSync } from 'node:child_process';

const fixtureBase = () => process.platform === 'win32' ? userInfo().homedir : tmpdir();
const createFixture = () => mkdtempSync(path.join(fixtureBase(), 'DesktopControl-private-test-'));
function removeFixture(directory: string): void {
  const resolved = path.resolve(directory);
  assert.equal(path.dirname(resolved), path.resolve(fixtureBase()));
  assert.match(path.basename(resolved), /^DesktopControl-private-test-[A-Za-z0-9]+$/);
  rmSync(resolved, { recursive: true, force: true });
}

test('private policy fails closed, reads fresh, and revokes a native principal', () => {
  const directory = createFixture();
  try {
    const harness = createPrivateGrantTestHarness(directory);
    assert.deepEqual(harness.store.getGrants(), []);
    const principal = localPrincipal();
    if (process.platform === 'win32') assert.ok(principal, 'normal-user native principal must be available for the positive Windows roundtrip');
    const policy = { version: 1, principal, capability: 'diagnostics.read', resource: 'local:desktop-control', expiresAt: Date.now() + 900_000, revoked: false };
    for (const change of [{ principal: 'wrong' }, { expiresAt: Date.now() - 1 }, { expiresAt: Date.now() + 7_200_000 }, { expiresAt: Infinity }, { revoked: true }, { version: 2 }, { capability: 'anything' }]) {
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
  } finally { removeFixture(directory); }
});

test('Windows denies read and write beneath an ancestor mutable by another account', { skip: process.platform !== 'win32' }, () => {
  const directory = createFixture();
  const setParentRule = (rights: string, inheritOnly = false) => {
    const script = `$ErrorActionPreference='Stop'; $p='${directory.replaceAll("'", "''")}';
      $acl=[System.IO.Directory]::GetAccessControl($p);
      $sid=[System.Security.Principal.SecurityIdentifier]::new([System.Security.Principal.WellKnownSidType]::WorldSid,$null);
      $acl.PurgeAccessRules($sid);
      $rule=[System.Security.AccessControl.FileSystemAccessRule]::new($sid,[System.Security.AccessControl.FileSystemRights]::${rights},
        [System.Security.AccessControl.InheritanceFlags]::${inheritOnly ? 'ContainerInherit' : 'None'},
        [System.Security.AccessControl.PropagationFlags]::${inheritOnly ? 'InheritOnly' : 'None'},[System.Security.AccessControl.AccessControlType]::Allow);
      $acl.AddAccessRule($rule); [System.IO.Directory]::SetAccessControl($p,$acl);`;
    execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')],
      { timeout: 10_000, windowsHide: true, stdio: 'pipe' });
  };
  try {
    const harness = createPrivateGrantTestHarness(path.join(directory, 'policy-store'));
    const policy = { version: 1, principal: localPrincipal(), capability: 'diagnostics.read', resource: 'local:desktop-control', expiresAt: Date.now() + 900_000, revoked: false };
    assert.ok(policy.principal);
    harness.writePolicy(policy);
    harness.prepareWorkspace();
    harness.writeWorkspacePolicy({ version: 1, principal: policy.principal, resource: 'local:desktop-control:workspace', capabilities: ['files.read'], expiresAt: policy.expiresAt, revoked: false });
    assert.equal(harness.store.getGrants().length, 1);
    // Inherit-only grants do not apply to the ancestor itself; private store is protected.
    setParentRule('DeleteSubdirectoriesAndFiles', true);
    assert.equal(harness.store.getGrants().length, 1);
    for (const rights of ['DeleteSubdirectoriesAndFiles', 'Delete', 'ChangePermissions', 'TakeOwnership']) {
      setParentRule(rights);
      assert.equal(harness.store.getGrants().length, 0, `${rights} on ancestor must deny policy reads`);
      assert.throws(() => harness.writePolicy(policy), /PRIVATE_POLICY_UNAVAILABLE/, `${rights} on ancestor must deny policy writes`);
      assert.equal(harness.workspaceAuthority.authorize('files.read'), null, `${rights} on ancestor must deny workspace access`);
      assert.throws(() => harness.prepareWorkspace(), /PRIVATE_POLICY_UNAVAILABLE/, `${rights} on ancestor must deny workspace preparation`);
    }
  } finally { removeFixture(directory); }
});

test('POSIX denies permissive, linked and oversized policy files', { skip: process.platform === 'win32' }, () => {
  const directory = createFixture();
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
  } finally { removeFixture(directory); }
});

test('workspace policy stays separate, validates exact capabilities, and observes revoke', () => {
  const directory = createFixture();
  try {
    const h = createPrivateGrantTestHarness(directory);
    assert.equal(h.workspaceAuthority.authorize('files.read'), null);
    h.prepareWorkspace();
    const policy = { version: 1, principal: localPrincipal(), resource: 'local:desktop-control:workspace', capabilities: ['files.read', 'pdf.create'], expiresAt: Date.now() + 900_000, revoked: false };
    for (const change of [{ resource: 'local:desktop-control' }, { principal: 'wrong' }, { capabilities: [] }, { capabilities: ['files.read', 'files.read'] }, { capabilities: ['shell.exec'] }, { expiresAt: Date.now() + 7_200_000 }, { expiresAt: Date.now() - 1 }, { revoked: true }, { workspace: '/untrusted/path' }]) {
      h.writeWorkspacePolicy({ ...policy, ...change });
      assert.equal(h.workspaceAuthority.authorize('files.read'), null);
    }
    h.writeWorkspacePolicy(policy);
    const access = h.workspaceAuthority.authorize('files.read');
    assert.equal(Boolean(access), Boolean(policy.principal));
    if (access) assert.equal(access.workspace, path.join(directory, 'workspace'));
    assert.equal(h.workspaceAuthority.authorize('files.write'), null);
    assert.equal(h.store.getGrants().length, 0);
    h.writePolicy({ version: 1, principal: policy.principal, capability: 'diagnostics.read', resource: 'local:desktop-control', expiresAt: policy.expiresAt, revoked: false });
    h.writeWorkspacePolicy({ ...policy, revoked: true });
    assert.equal(h.workspaceAuthority.authorize('files.read'), null);
    assert.equal(h.store.getGrants().length, policy.principal ? 1 : 0, 'workspace revoke cannot revoke separate diagnostics');
    h.writeWorkspacePolicy(policy);
    if (process.platform !== 'win32') {
      chmodSync(path.join(directory, 'workspace'), 0o755);
      assert.equal(h.workspaceAuthority.authorize('files.read'), null);
      chmodSync(path.join(directory, 'workspace'), 0o700);
      chmodSync(directory, 0o755);
      assert.equal(h.workspaceAuthority.authorize('files.read'), null);
    } else {
      const cipher = readFileSync(path.join(directory, 'workspace-policy'));
      writeFileSync(path.join(directory, 'policy'), cipher);
      assert.equal(h.store.getGrants().length, 0, 'workspace ciphertext cannot authorize diagnostic policy');
    }
  } finally { removeFixture(directory); }
});
