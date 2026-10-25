import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, chmodSync, writeFileSync, unlinkSync, symlinkSync, readFileSync, linkSync, lstatSync } from 'node:fs';
import { tmpdir, userInfo } from 'node:os';
import path from 'node:path';
import { createPrivateGrantTestHarness, privateAccessIsCurrent, privateAccessIntersection } from '../src/bridge/private-grants.mts';
import type { PrivateWorkspaceCapability } from '../src/bridge/private-grants.mts';
import { isAuthorized } from '../src/bridge/policy.mts';
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

test('persistent v2 permissions survive fresh authorities and a distant clock, revoke freshly, and refuse unavailable native identity', t => {
  const directory = createFixture();
  try {
    const h = createPrivateGrantTestHarness(directory), principal = localPrincipal();
    if (!principal) {
      assert.throws(() => h.provisionGrant('grant'), /PRIVATE_POLICY_UNAVAILABLE/);
      assert.throws(() => h.provisionWorkspace('grant'), /PRIVATE_POLICY_UNAVAILABLE/);
      assert.throws(() => h.provisionControl('grant', ['desktop.read']), /PRIVATE_POLICY_UNAVAILABLE/);
      assert.equal(h.store.getGrants().length, 0); return;
    }
    const now = Date.now();
    assert.equal(h.provisionGrant('grant').state, 'active');
    assert.equal(h.provisionWorkspace('grant', ['files.read']).state, 'active');
    assert.equal(h.provisionControl('grant', ['browser.read', 'desktop.read'], ['https://example.com']).state, 'active');
    for (const persisted of [h.readPolicy(), h.readWorkspacePolicy(), h.readControlPolicy()]) {
      const policy = persisted as Record<string, unknown>;
      assert.equal(policy.version, 2); assert.deepEqual(policy.lifetime, { kind: 'until-revoked' });
      assert.equal(Object.hasOwn(policy, 'expiresAt'), false, 'persistent policy contains no sentinel or artificial date');
    }
    t.mock.method(Date, 'now', () => now + 365 * 86_400_000);
    const restarted = createPrivateGrantTestHarness(directory);
    assert.equal(isAuthorized({ principal, capability: 'diagnostics.read', resource: 'local:desktop-control' }, restarted.store), true);
    const workspace = restarted.workspaceAuthority.authorize('files.read'), control = restarted.controlAuthority.authorize('browser.read');
    assert.ok(workspace); assert.ok(control);
    assert.equal(privateAccessIsCurrent(workspace), true); assert.equal(privateAccessIsCurrent(control), true);
    assert.equal(Object.hasOwn(workspace, 'expiresAt'), false); assert.equal(Object.hasOwn(control, 'expiresAt'), false);
    assert.deepEqual(restarted.provisionGrant('status').lifetime, { kind: 'until-revoked' });
    for (const capability of ['files.write', 'files.remove', 'pdf.create'] as const)
      assert.equal(restarted.workspaceAuthority.authorize(capability), null, 'persistence does not broaden a read-only workspace selection');
    assert.equal(restarted.controlAuthority.authorize('browser.interact'), null);
    const childCode = `const {createPrivateGrantTestHarness}=await import(process.argv[1]);Date.now=()=>Number(process.argv[3]);const h=createPrivateGrantTestHarness(process.argv[2]);console.log(JSON.stringify({diagnostics:h.store.getGrants().length===1,workspace:Boolean(h.workspaceAuthority.authorize('files.read')),control:Boolean(h.controlAuthority.authorize('browser.read'))}));`;
    const processProof: unknown = JSON.parse(execFileSync(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', childCode,
      new URL('../src/bridge/private-grants.mts', import.meta.url).href, directory, String(now + 365 * 86_400_000)],
    { encoding: 'utf8', windowsHide: true, timeout: 30_000, stdio: ['ignore', 'pipe', 'pipe'] }));
    assert.deepEqual(processProof, { diagnostics: true, workspace: true, control: true }, 'a fresh real process reads persistent policies without renewal');
    restarted.provisionGrant('revoke'); restarted.provisionWorkspace('revoke'); restarted.provisionControl('revoke');
    assert.equal(h.store.getGrants().length, 0, 'previous authority observes fresh revocation');
    assert.equal(h.workspaceAuthority.authorize('files.read'), null); assert.equal(h.controlAuthority.authorize('browser.read'), null);
  } finally { removeFixture(directory); }
});

test('granular workspace grant rejects invalid selections without changing or revoking the existing read-only policy', () => {
  const directory = createFixture();
  try {
    const h = createPrivateGrantTestHarness(directory); if (!localPrincipal()) return;
    h.provisionWorkspace('grant', ['files.read']);
    const before = JSON.stringify(h.readWorkspacePolicy());
    for (const value of [[], ['files.read', 'files.read'], ['terminal.exec'], ['files.read', 'files.write', 'files.remove', 'pdf.create', 'shell.exec']]) {
      const capabilities = value as PrivateWorkspaceCapability[];
      assert.throws(() => h.provisionWorkspace('grant', capabilities), /PRIVATE_POLICY_UNAVAILABLE/);
      assert.throws(() => h.provisionWorkspace('revoke', capabilities), /PRIVATE_POLICY_UNAVAILABLE/);
      assert.equal(JSON.stringify(h.readWorkspacePolicy()), before);
    }
    assert.ok(h.workspaceAuthority.authorize('files.read'));
    for (const capability of ['files.write', 'files.remove', 'pdf.create'] as const) assert.equal(h.workspaceAuthority.authorize(capability), null);
  } finally { removeFixture(directory); }
});

test('v2 policy lifetime is exact and refuses hybrid expiry, malformed lifetime, crossover, wrong identity and revocation', () => {
  const directory = createFixture();
  try {
    const h = createPrivateGrantTestHarness(directory), principal = localPrincipal();
    if (!principal) return;
    h.prepareWorkspace(); h.prepareBrowser();
    const base = { version: 2, principal, lifetime: { kind: 'until-revoked' }, revoked: false };
    const diagnostic = { ...base, capability: 'diagnostics.read', resource: 'local:desktop-control' };
    const workspace = { ...base, capabilities: ['files.read'], resource: 'local:desktop-control:workspace' };
    const control = { ...base, capabilities: ['browser.read'], allowedOrigins: ['https://example.com'], resource: 'local:desktop-control:private-control' };
    const changes = [
      { lifetime: undefined }, { lifetime: null }, { lifetime: {} }, { lifetime: [] }, { lifetime: 'until-revoked' },
      { lifetime: { kind: 'forever' } }, { lifetime: { kind: 'timed', expiresAt: Date.now() + 900_000 } },
      { lifetime: { kind: 'until-revoked', extra: true } }, { lifetime: { kind: 'until-revoked', expiresAt: Number.MAX_SAFE_INTEGER } },
      { expiresAt: Number.MAX_SAFE_INTEGER }, { expiresAt: null }, { principal: 'wrong' }, { revoked: true },
      { version: 1 }, { version: 3 }, { resource: 'untrusted' }, { extra: true }
    ];
    for (const change of changes) {
      h.writePolicy({ ...diagnostic, ...change }); h.writeWorkspacePolicy({ ...workspace, ...change }); h.writeControlPolicy({ ...control, ...change });
      assert.equal(h.store.getGrants().length, 0); assert.equal(h.workspaceAuthority.authorize('files.read'), null); assert.equal(h.controlAuthority.authorize('browser.read'), null);
    }
    h.writePolicy(diagnostic); h.writeWorkspacePolicy(workspace); h.writeControlPolicy(control);
    assert.equal(h.store.getGrants().length, 1); assert.ok(h.workspaceAuthority.authorize('files.read')); assert.ok(h.controlAuthority.authorize('browser.read'));
    h.writePolicy(workspace); h.writeWorkspacePolicy(control); h.writeControlPolicy(diagnostic);
    assert.equal(h.store.getGrants().length, 0); assert.equal(h.workspaceAuthority.authorize('files.read'), null); assert.equal(h.controlAuthority.authorize('browser.read'), null);
  } finally { removeFixture(directory); }
});

test('legacy v1 timed permissions expire unchanged and status never migrates their stored format', t => {
  const directory = createFixture();
  try {
    const h = createPrivateGrantTestHarness(directory), principal = localPrincipal();
    if (!principal) return;
    h.prepareWorkspace(); h.prepareBrowser();
    const now = Date.now(), expiresAt = now + 900_000;
    h.writePolicy({ version: 1, principal, capability: 'diagnostics.read', resource: 'local:desktop-control', expiresAt, revoked: false });
    h.writeWorkspacePolicy({ version: 1, principal, capabilities: ['files.read'], resource: 'local:desktop-control:workspace', expiresAt, revoked: false });
    h.writeControlPolicy({ version: 1, principal, capabilities: ['desktop.read'], allowedOrigins: [], resource: 'local:desktop-control:private-control', expiresAt, revoked: false });
    assert.equal(h.store.getGrants().length, 1); assert.ok(h.workspaceAuthority.authorize('files.read')); assert.ok(h.controlAuthority.authorize('desktop.read'));
    assert.deepEqual(h.workspaceAuthority.authorize('files.read')?.lifetime, { kind: 'timed', expiresAt });
    h.provisionGrant('status'); h.provisionWorkspace('status'); h.provisionControl('status');
    t.mock.method(Date, 'now', () => expiresAt + 1);
    const restarted = createPrivateGrantTestHarness(directory);
    assert.equal(restarted.store.getGrants().length, 0); assert.equal(restarted.workspaceAuthority.authorize('files.read'), null); assert.equal(restarted.controlAuthority.authorize('desktop.read'), null);
    assert.equal(restarted.provisionGrant('status').state, 'denied');
    for (const persisted of [h.readPolicy(), h.readWorkspacePolicy(), h.readControlPolicy()]) {
      const policy = persisted as Record<string, unknown>;
      assert.equal(policy.version, 1); assert.equal(policy.expiresAt, expiresAt); assert.equal(Object.hasOwn(policy, 'lifetime'), false);
    }
  } finally { removeFixture(directory); }
});

test('persistent control permission does not clear Esc unless locally and explicitly re-enabled', () => {
  const directory = createFixture();
  try {
    const h = createPrivateGrantTestHarness(directory); if (!localPrincipal()) return;
    h.provisionControl('grant', ['browser.read', 'desktop.input'], ['https://example.com']); h.stopControls();
    h.provisionControl('grant', ['browser.read', 'desktop.input'], ['https://example.com']);
    const restarted = createPrivateGrantTestHarness(directory);
    assert.equal(restarted.controlAuthority.authorize('browser.read'), null); assert.equal(restarted.controlAuthority.authorize('desktop.input'), null);
    assert.equal(restarted.provisionControl('status').desktopStopped, true);
    restarted.provisionControl('grant', ['browser.read'], ['https://example.com'], { reenableStopped: true });
    assert.ok(restarted.controlAuthority.authorize('browser.read')); assert.equal(restarted.controlAuthority.authorize('desktop.input'), null);
    assert.ok(lstatSync(path.join(directory, 'desktop-stop')).isFile());
    restarted.provisionControl('grant', ['desktop.input'], [], { reenableStopped: true }); assert.ok(restarted.controlAuthority.authorize('desktop.input'));
  } finally { removeFixture(directory); }
});

test('access lifetime checks and intersections preserve legacy timed bounds without implicit or hybrid persistence', () => {
  const now = Date.now(), persistent = { lifetime: { kind: 'until-revoked' } } as const;
  const legacy = { expiresAt: now + 1000 }, timed = { lifetime: { kind: 'timed', expiresAt: now + 500 }, expiresAt: now + 500 } as const;
  for (const access of [persistent, legacy, timed]) assert.equal(privateAccessIsCurrent(access, now), true);
  for (const access of [{}, { lifetime: undefined, expiresAt: now + 1000 }, { lifetime: null, expiresAt: now + 1000 },
    { lifetime: { kind: 'until-revoked', extra: true } }, { ...persistent, expiresAt: Number.MAX_SAFE_INTEGER },
    { expiresAt: Infinity }, { expiresAt: now }, { ...timed, expiresAt: now + 1000 }]) assert.equal(privateAccessIsCurrent(access, now), false);
  assert.equal(privateAccessIsCurrent(persistent, NaN), false);
  assert.deepEqual(privateAccessIntersection(persistent, persistent, now), persistent);
  assert.deepEqual(privateAccessIntersection(persistent, legacy, now), { lifetime: { kind: 'timed', expiresAt: legacy.expiresAt }, expiresAt: legacy.expiresAt });
  assert.deepEqual(privateAccessIntersection(legacy, timed, now), timed);
  assert.equal(privateAccessIntersection(legacy, timed, now + 501), null);
});

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
    harness.prepareBrowserRuntime();
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
      assert.throws(() => harness.validateBrowserRuntime(), /PRIVATE_POLICY_UNAVAILABLE/, `${rights} on ancestor must deny runtime validation`);
      assert.throws(() => harness.prepareBrowserRuntime(), /PRIVATE_POLICY_UNAVAILABLE/, `${rights} on ancestor must deny runtime preparation`);
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

test('control policy validates principal, exact origins and capability bounds without diagnostic/workspace crossover', () => {
  const directory = createFixture();
  try {
    const h = createPrivateGrantTestHarness(directory);
    assert.equal(h.controlAuthority.authorize('browser.read'), null);
    h.prepareBrowser();
    const policy = { version: 1, principal: localPrincipal(), resource: 'local:desktop-control:private-control', capabilities: ['browser.read', 'desktop.input'], allowedOrigins: ['https://example.com'], expiresAt: Date.now() + 900_000, revoked: false };
    for (const change of [{ principal: 'wrong' }, { resource: 'local:desktop-control' }, { capabilities: [] }, { capabilities: ['browser.read', 'browser.read'] }, { capabilities: ['shell.exec'] }, { allowedOrigins: ['https://example.com/path'] }, { allowedOrigins: ['https://user@example.com'] }, { allowedOrigins: ['file:///'] }, { allowedOrigins: ['*'] }, { allowedOrigins: [] }, { expiresAt: Date.now() - 1 }, { expiresAt: Date.now() + 7_200_000 }, { revoked: true }, { profileDirectory: '/untrusted' }]) {
      h.writeControlPolicy({ ...policy, ...change });
      assert.equal(h.controlAuthority.authorize('browser.read'), null);
    }
    h.writeControlPolicy(policy);
    const allowed = h.controlAuthority.authorize('browser.read');
    assert.equal(Boolean(allowed), Boolean(policy.principal));
    if (allowed) {
      assert.deepEqual(allowed.allowedOrigins, ['https://example.com']);
      allowed.allowedOrigins.push('https://untrusted.example');
      assert.deepEqual(h.controlAuthority.authorize('browser.read')?.allowedOrigins, ['https://example.com']);
      assert.equal(allowed.profileDirectory, path.join(directory, 'browser-profile'));
    }
    assert.equal(h.controlAuthority.authorize('browser.interact'), null);
    assert.equal(h.store.getGrants().length, 0);
    assert.equal(h.workspaceAuthority.authorize('files.write'), null);
    h.writeControlPolicy({ ...policy, revoked: true });
    assert.equal(h.controlAuthority.authorize('browser.read'), null);
  } finally { removeFixture(directory); }
});

test('durable desktop stop denies only desktop until an explicit trusted local re-enable, and revoke remains separate', () => {
  const directory = createFixture();
  try {
    const h = createPrivateGrantTestHarness(directory);
    const principal = localPrincipal();
    if (!principal) { assert.throws(() => h.provisionControl('grant', ['desktop.read'])); return; }
    assert.equal(h.provisionControl('grant', ['desktop.read', 'desktop.input', 'terminal.exec']).state, 'active');
    assert.ok(h.controlAuthority.authorize('desktop.input'));
    writeFileSync(path.join(directory, 'desktop-stop'), 'stopped', { mode: 0o600 });
    assert.equal(h.controlAuthority.authorize('desktop.read'), null);
    assert.equal(h.controlAuthority.authorize('desktop.input'), null);
    assert.ok(h.controlAuthority.authorize('terminal.exec'));
    assert.equal(h.provisionControl('status').desktopStopped, true);
    assert.equal(h.controlAuthority.authorize('desktop.input'), null, 'status cannot clear stop');
    assert.equal(h.provisionControl('grant', ['terminal.exec']).state, 'active');
    assert.equal(h.provisionControl('status').desktopStopped, true, 'unrelated grant cannot clear stop');
    assert.equal(h.provisionControl('grant', ['desktop.input'], [], { reenableStopped: true }).state, 'active');
    assert.ok(h.controlAuthority.authorize('desktop.input'));
    assert.equal(h.provisionControl('revoke').state, 'revoked');
    assert.equal(h.controlAuthority.authorize('desktop.input'), null);
    for (const origins of [[], ['https://example.com/'], ['https://example.com', 'https://example.com']])
      assert.throws(() => h.provisionControl('grant', ['browser.read'], origins), /PRIVATE_POLICY_UNAVAILABLE/);
  } finally { removeFixture(directory); }
});

test('fixed browser runtime storage validates native identity, private permissions and rejects linked directories without granting', () => {
  const directory = createFixture();
  const outside = createFixture();
  try {
    const h = createPrivateGrantTestHarness(directory);
    assert.throws(() => h.validateBrowserRuntime());
    if (!localPrincipal()) { assert.throws(() => h.prepareBrowserRuntime()); return; }
    const runtime = h.prepareBrowserRuntime();
    assert.equal(runtime, path.join(directory, 'browser-runtime'));
    assert.equal(h.validateBrowserRuntime(), runtime);
    assert.equal(h.prepareBrowserRuntime(), runtime);
    assert.equal(h.controlAuthority.authorize('browser.read'), null, 'preparation cannot grant');
    if (process.platform !== 'win32') {
      chmodSync(runtime, 0o755);
      assert.throws(() => h.validateBrowserRuntime(), /PRIVATE_POLICY_UNAVAILABLE/);
      assert.throws(() => h.prepareBrowserRuntime(), /PRIVATE_POLICY_UNAVAILABLE/, 'existing insecure directory is not silently repaired');
      chmodSync(runtime, 0o700);
    }
    rmSync(runtime, { recursive: true });
    symlinkSync(outside, runtime, process.platform === 'win32' ? 'junction' : 'dir');
    assert.throws(() => h.validateBrowserRuntime(), /PRIVATE_POLICY_UNAVAILABLE/);
    assert.throws(() => h.prepareBrowserRuntime(), /PRIVATE_POLICY_UNAVAILABLE/);
    rmSync(runtime);
  } finally { removeFixture(directory); removeFixture(outside); }
});

test('workspace uses a stable protected lock outside container-writable data and rejects missing, modified or linked locks', () => {
  const directory = createFixture();
  try {
    const h = createPrivateGrantTestHarness(directory);
    h.prepareWorkspace();
    const file = path.join(directory, 'workspace-lock');
    const stat = lstatSync(file);
    assert.ok(stat.isFile()); assert.equal(stat.nlink, 1);
    assert.equal(readFileSync(file, 'ascii'), 'LOCK_V1');
    assert.notEqual(path.dirname(file), path.join(directory, 'workspace'));
    h.prepareWorkspace();
    assert.equal(lstatSync(file).ino, stat.ino, 'repeat provisioning must retain the shared lock inode');
    const policy = { version: 1, principal: localPrincipal(), resource: 'local:desktop-control:workspace', capabilities: ['files.read'], expiresAt: Date.now() + 900_000, revoked: false };
    h.writeWorkspacePolicy(policy);
    assert.equal(Boolean(h.workspaceAuthority.authorize('files.read')), Boolean(policy.principal));
    writeFileSync(file, 'BADLOCK');
    assert.equal(h.workspaceAuthority.authorize('files.read'), null);
    assert.throws(() => h.prepareWorkspace(), /PRIVATE_POLICY_UNAVAILABLE/, 'invalid existing lock must not be silently replaced');
    writeFileSync(file, 'LOCK_V1');
    const alias = path.join(directory, 'lock-alias');
    linkSync(file, alias);
    assert.equal(h.workspaceAuthority.authorize('files.read'), null);
    assert.throws(() => h.prepareWorkspace(), /PRIVATE_POLICY_UNAVAILABLE/, 'linked lock cannot be accepted');
    unlinkSync(alias);
    if (process.platform !== 'win32') {
      chmodSync(file, 0o644);
      assert.equal(h.workspaceAuthority.authorize('files.read'), null);
      assert.throws(() => h.prepareWorkspace(), /PRIVATE_POLICY_UNAVAILABLE/);
      chmodSync(file, 0o600);
      unlinkSync(file);
      writeFileSync(alias, 'LOCK_V1', { mode: 0o600 }); symlinkSync(alias, file);
      assert.equal(h.workspaceAuthority.authorize('files.read'), null);
      assert.throws(() => h.prepareWorkspace());
      unlinkSync(file);
    } else unlinkSync(file);
    assert.equal(h.workspaceAuthority.authorize('files.read'), null, 'missing fixed lock denies even with a valid grant');
  } finally { removeFixture(directory); }
});

test('emergency host stop survives a fresh authority and only explicit matching local grants clear its markers', () => {
  const directory = createFixture();
  try {
    const h = createPrivateGrantTestHarness(directory);
    if (!localPrincipal()) { assert.throws(() => h.stopControls()); return; }
    h.provisionControl('grant', ['browser.read', 'desktop.input'], ['https://example.com']);
    assert.ok(h.controlAuthority.authorize('browser.read'));
    h.stopControls();
    const restarted = createPrivateGrantTestHarness(directory);
    assert.equal(restarted.controlAuthority.authorize('browser.read'), null);
    assert.equal(restarted.controlAuthority.authorize('desktop.input'), null);
    restarted.provisionControl('status');
    assert.equal(restarted.controlAuthority.authorize('browser.read'), null);
    restarted.provisionControl('grant', ['browser.read'], ['https://example.com'], { reenableStopped: true });
    assert.ok(restarted.controlAuthority.authorize('browser.read'));
    assert.ok(lstatSync(path.join(directory, 'desktop-stop')).isFile(), 'browser re-enable cannot clear desktop stop');
    restarted.provisionControl('grant', ['desktop.input'], [], { reenableStopped: true });
    assert.ok(restarted.controlAuthority.authorize('desktop.input'));
  } finally { removeFixture(directory); }
});

test('partial local re-enable failure never activates either requested capability', () => {
  const directory = createFixture();
  try {
    const h = createPrivateGrantTestHarness(directory);
    if (!localPrincipal()) return;
    h.provisionControl('grant', ['desktop.input', 'browser.read'], ['https://example.com']);
    h.stopControls();
    const marker = path.join(directory, 'browser-stop');
    unlinkSync(marker); mkdirSync(marker);
    assert.throws(() => h.provisionControl('grant', ['desktop.input', 'browser.read'], ['https://example.com'], { reenableStopped: true }), /PRIVATE_POLICY_UNAVAILABLE/);
    assert.equal(h.controlAuthority.authorize('desktop.input'), null, 'successful first marker reset cannot activate desktop');
    assert.equal(h.controlAuthority.authorize('browser.read'), null);
    assert.equal(createPrivateGrantTestHarness(directory).controlAuthority.authorize('desktop.input'), null, 'fresh process sees revoked staged selection');
    assert.equal(h.provisionControl('status').state, 'denied');
  } finally { removeFixture(directory); }
});
