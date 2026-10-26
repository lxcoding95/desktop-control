import { execFileSync } from 'node:child_process';
import { constants, closeSync, fstatSync, fsyncSync, lstatSync, mkdirSync, openSync, readSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { userInfo, tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { localPrincipal } from './principal.mts';
import { STATUS_CAPABILITY, STATUS_RESOURCE, isPersistentLifetime } from './policy.mts';
import type { AccessLifetime, DiagnosticGrant, ReadonlyGrantStore } from './policy.mts';

const LIMIT = 16_384;
const MAX_LIFETIME = 3_600_000;
const root = new URL(import.meta.url.endsWith('.mts') ? '../../../../' : '../../../../../', import.meta.url);
const helper = fileURLToPath(new URL('dist/native/windows-private-policy.exe', root));
// Deliberately independent of XDG/APPDATA and MCP/environment-supplied paths.
const productionDirectory = () => path.join(userInfo().homedir, '.desktop-control-private');
interface Storage { read(): string; write(value: string): void; }
export type PrivatePermissionScope = 'diagnostics' | 'workspace' | 'controls';

/** No sentinel deadlines: persistence is explicit at the trusted access boundary too. */
type TimedLifetime = Extract<AccessLifetime, { kind: 'timed' }>;
type PersistentWindow = { lifetime: Extract<AccessLifetime, { kind: 'until-revoked' }>; expiresAt?: never };
type ExplicitPrivateAccessWindow = { lifetime: TimedLifetime; expiresAt: number } | PersistentWindow;
export type PrivateAccessWindow = { lifetime?: TimedLifetime; expiresAt: number } | PersistentWindow;

export function privateAccessIsCurrent(access: unknown, now: number = Date.now()): boolean {
  if (!Number.isSafeInteger(now) || now < 0 || !access || typeof access !== 'object' || Array.isArray(access)) return false;
  const value = access as Record<string, unknown>;
  if (!Object.hasOwn(value, 'lifetime')) return Object.hasOwn(value, 'expiresAt') && typeof value.expiresAt === 'number' &&
    Number.isSafeInteger(value.expiresAt) && value.expiresAt > now;
  if (isPersistentLifetime(value.lifetime)) return !Object.hasOwn(value, 'expiresAt');
  if (!value.lifetime || typeof value.lifetime !== 'object' || Array.isArray(value.lifetime)) return false;
  const lifetime = value.lifetime as Record<string, unknown>;
  return Object.keys(lifetime).sort().join(',') === 'expiresAt,kind' && lifetime.kind === 'timed' &&
    Number.isSafeInteger(lifetime.expiresAt) && typeof lifetime.expiresAt === 'number' && lifetime.expiresAt > now &&
    Object.hasOwn(value, 'expiresAt') && value.expiresAt === lifetime.expiresAt;
}

/** Combine independently fresh authorizations without manufacturing an infinite deadline. */
export function privateAccessIntersection(left: PrivateAccessWindow, right: PrivateAccessWindow, now: number = Date.now()): PrivateAccessWindow | null {
  if (!privateAccessIsCurrent(left, now) || !privateAccessIsCurrent(right, now)) return null;
  if (left.lifetime?.kind === 'until-revoked' && right.lifetime?.kind === 'until-revoked') return { lifetime: { kind: 'until-revoked' } };
  const deadlines = [left, right].flatMap(value => typeof value.expiresAt === 'number' ? [value.expiresAt] : []);
  const expiresAt = Math.min(...deadlines);
  return { lifetime: { kind: 'timed', expiresAt }, expiresAt };
}

function readLifetime(policy: Record<string, unknown>, baseKeys: readonly string[]): ExplicitPrivateAccessWindow | null {
  const now = Date.now();
  if (!Number.isSafeInteger(now) || now < 0) return null;
  if (policy.version === 1) {
    if (Object.keys(policy).sort().join(',') !== [...baseKeys, 'expiresAt'].sort().join(',') ||
        typeof policy.expiresAt !== 'number' || !Number.isSafeInteger(policy.expiresAt) || policy.expiresAt <= now ||
        policy.expiresAt - now > MAX_LIFETIME) return null;
    return { lifetime: { kind: 'timed', expiresAt: policy.expiresAt }, expiresAt: policy.expiresAt };
  }
  if (policy.version === 2 && Object.keys(policy).sort().join(',') === [...baseKeys, 'lifetime'].sort().join(',') &&
      isPersistentLifetime(policy.lifetime)) return { lifetime: { kind: 'until-revoked' } };
  return null;
}

function native(mode: 'read' | 'write' | 'read-workspace' | 'write-workspace' | 'prepare-workspace' | 'read-control' | 'write-control' | 'prepare-browser' | 'clear-desktop-stop' | 'clear-browser-stop' | 'stop-controls' | 'prepare-browser-runtime' | 'validate-browser-runtime' | `begin-change-${PrivatePermissionScope}` | `commit-change-${PrivatePermissionScope}`, input?: string, testDirectory?: string): string {
  return execFileSync(helper, testDirectory ? [mode, '--test-directory', testDirectory] : [mode], {
    ...(input === undefined ? {} : { input }), encoding: 'utf8', timeout: 2_000,
    maxBuffer: 32_768, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe']
  });
}

function assertPosixDirectory(directory: string): void {
  const uid = process.geteuid?.();
  const stat = lstatSync(directory);
  if (!uid || stat.isSymbolicLink() || !stat.isDirectory() || stat.uid !== uid || (stat.mode & 0o077) !== 0)
    throw Error('PRIVATE_POLICY_UNAVAILABLE');
}

function assertParentTrust(directory: string): void {
  let parent = path.dirname(directory);
  while (true) {
    const stat = lstatSync(parent);
    // Root-owned sticky /tmp is an accepted parent for explicitly isolated tests.
    if (stat.isSymbolicLink() || !stat.isDirectory() ||
        (stat.uid !== 0 && stat.uid !== process.geteuid?.()) ||
        ((stat.mode & 0o022) !== 0 && !(stat.uid === 0 && (stat.mode & 0o1000) !== 0)))
      throw Error('PRIVATE_POLICY_UNAVAILABLE');
    const next = path.dirname(parent);
    if (next === parent) return;
    parent = next;
  }
}

function storage(testDirectory?: string, kind: 'diagnostic' | 'workspace' | 'control' = 'diagnostic'): Storage {
  if (process.platform === 'win32') return {
    read: () => native(kind === 'workspace' ? 'read-workspace' : kind === 'control' ? 'read-control' : 'read', undefined, testDirectory),
    write: value => { native(kind === 'workspace' ? 'write-workspace' : kind === 'control' ? 'write-control' : 'write', value, testDirectory); }
  };
  const directory = testDirectory ?? productionDirectory();
  const file = path.join(directory, kind === 'workspace' ? 'workspace-policy' : kind === 'control' ? 'control-policy' : 'policy');
  const assertNoPending = () => {
    try { lstatSync(path.join(directory, 'pending-' + (kind === 'diagnostic' ? 'diagnostics' : kind === 'control' ? 'controls' : 'workspace'))); throw Error('PRIVATE_POLICY_UNAVAILABLE'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  };
  return {
    read() {
      assertParentTrust(directory);
      assertPosixDirectory(directory);
      assertNoPending();
      const fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
      try {
        const stat = fstatSync(fd);
        if (!stat.isFile() || stat.nlink !== 1 || stat.uid !== process.geteuid?.() || (stat.mode & 0o077) !== 0 || stat.size > LIMIT)
          throw Error('PRIVATE_POLICY_UNAVAILABLE');
        const buffer = Buffer.alloc(LIMIT + 1);
        let length = 0;
        while (length < buffer.length) {
          const count = readSync(fd, buffer, length, buffer.length - length, null);
          if (count === 0) break;
          length += count;
        }
        if (length > LIMIT) throw Error('PRIVATE_POLICY_UNAVAILABLE');
        // A complete replacement can also remove its pending marker before
        // this read finishes. Do not return an obsolete, formerly allowed inode.
        const current = lstatSync(file);
        if (current.dev !== stat.dev || current.ino !== stat.ino || current.isSymbolicLink())
          throw Error('PRIVATE_POLICY_UNAVAILABLE');
        // A concurrent process may have begun a replacement while this stable
        // inode was read. Never return its snapshot without checking the barrier again.
        assertNoPending();
        return buffer.subarray(0, length).toString('utf8');
      } finally { closeSync(fd); }
    },
    write(value) {
      assertParentTrust(directory);
      try { mkdirSync(directory, { mode: 0o700, recursive: false }); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
      assertPosixDirectory(directory);
      const temporary = path.join(directory, '.policy-' + randomUUID());
      const fd = openSync(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
      try { writeFileSync(fd, value, 'utf8'); fsyncSync(fd); }
      finally { closeSync(fd); }
      try { renameSync(temporary, file); }
      finally { try { unlinkSync(temporary); } catch { /* rename consumed it */ } }
    }
  };
}

function permissionChange(scope: PrivatePermissionScope, transaction?: string, testDirectory?: string): string {
  if (!['diagnostics', 'workspace', 'controls'].includes(scope) || !localPrincipal() ||
      (transaction !== undefined && !/^[a-f0-9]{32}$/.test(transaction))) throw Error('PRIVATE_POLICY_UNAVAILABLE');
  if (process.platform === 'win32') return native(transaction === undefined ? `begin-change-${scope}` : `commit-change-${scope}`, transaction, testDirectory).trim();
  const directory = testDirectory ?? productionDirectory();
  assertParentTrust(directory);
  if (transaction === undefined) {
    try { mkdirSync(directory, { mode: 0o700 }); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
  }
  assertPosixDirectory(directory);
  const marker = path.join(directory, 'pending-' + scope);
  const syncDirectory = () => {
    const fd = openSync(directory, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    try { fsyncSync(fd); } finally { closeSync(fd); }
  };
  if (transaction === undefined) {
    const token = randomUUID().replaceAll('-', '');
    const fd = openSync(marker, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    try { writeFileSync(fd, token, 'ascii'); fsyncSync(fd); } finally { closeSync(fd); }
    syncDirectory(); return token;
  }
  const fd = openSync(marker, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = fstatSync(fd), bytes = Buffer.alloc(33);
    if (!stat.isFile() || stat.nlink !== 1 || stat.uid !== process.geteuid?.() || (stat.mode & 0o077) !== 0 || stat.size !== 32 ||
        readSync(fd, bytes, 0, 33, null) !== 32 || bytes.subarray(0, 32).toString('ascii') !== transaction) throw Error('PRIVATE_POLICY_UNAVAILABLE');
  } finally { closeSync(fd); }
  // Unlink is the commit point. Do not perform a fallible operation afterwards:
  // a crash retaining the directory entry merely denies again (safe recovery).
  unlinkSync(marker); return '';
}
/** Trusted write-ahead barrier: a fresh process denies this scope until its exact transaction commits.
 * Tokens are host-private, never tool arguments. Interrupted markers are never auto-cleared;
 * trusted local recovery must revoke/inspect stored policy before repairing a pending marker.
 */
export function beginPrivatePermissionChange(scope: PrivatePermissionScope): string { return permissionChange(scope); }
export function commitPrivatePermissionChange(scope: PrivatePermissionScope, transaction: string): void {
  if (typeof transaction !== 'string' || !/^[a-f0-9]{32}$/.test(transaction)) throw Error('PRIVATE_POLICY_UNAVAILABLE');
  permissionChange(scope, transaction);
}

export type PrivateWorkspaceCapability = 'files.read' | 'files.write' | 'files.remove' | 'pdf.create';
const WORKSPACE_CAPABILITIES: readonly PrivateWorkspaceCapability[] = ['files.read', 'files.write', 'files.remove', 'pdf.create'];
const WORKSPACE_RESOURCE = 'local:desktop-control:workspace';
export type WorkspaceAccess = { workspace: string } & PrivateAccessWindow;
type WorkspacePolicy = { capabilities: PrivateWorkspaceCapability[] } & ExplicitPrivateAccessWindow;

function workspacePath(testDirectory?: string): string { return path.join(testDirectory ?? productionDirectory(), 'workspace'); }
function workspaceLockPath(testDirectory?: string): string { return path.join(testDirectory ?? productionDirectory(), 'workspace-lock'); }
function assertPosixWorkspaceLock(testDirectory?: string): void {
  const fd = openSync(workspaceLockPath(testDirectory), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.nlink !== 1 || stat.uid !== process.geteuid?.() || (stat.mode & 0o077) !== 0 || stat.size !== 7)
      throw Error('PRIVATE_POLICY_UNAVAILABLE');
    const bytes = Buffer.alloc(7);
    if (readSync(fd, bytes, 0, 7, null) !== 7 || bytes.toString('ascii') !== 'LOCK_V1') throw Error('PRIVATE_POLICY_UNAVAILABLE');
  } finally { closeSync(fd); }
}
function prepareWorkspace(testDirectory?: string): void {
  if (process.platform === 'win32') { native('prepare-workspace', undefined, testDirectory); return; }
  const directory = testDirectory ?? productionDirectory();
  assertParentTrust(directory);
  for (const target of [directory, workspacePath(testDirectory)]) {
    try { mkdirSync(target, { mode: 0o700 }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
    assertPosixDirectory(target);
  }
  // Stable inode outside the writable workspace. Never replace/repair an existing lock.
  try {
    const fd = openSync(workspaceLockPath(testDirectory), constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    try { writeFileSync(fd, 'LOCK_V1', 'ascii'); fsyncSync(fd); }
    finally { closeSync(fd); }
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
  assertPosixWorkspaceLock(testDirectory);
}
function validCapabilities(value: unknown): value is PrivateWorkspaceCapability[] {
  return Array.isArray(value) && value.length > 0 && value.length <= WORKSPACE_CAPABILITIES.length &&
    new Set(value).size === value.length && value.every(v => WORKSPACE_CAPABILITIES.includes(v as PrivateWorkspaceCapability));
}
function readWorkspacePolicy(source: Storage, testDirectory?: string): WorkspacePolicy | null {
  try {
    const principal = localPrincipal();
    if (!principal) return null;
    if (process.platform !== 'win32') {
      assertParentTrust(workspacePath(testDirectory));
      assertPosixDirectory(workspacePath(testDirectory));
      assertPosixWorkspaceLock(testDirectory);
    }
    const raw = source.read();
    if (Buffer.byteLength(raw) > LIMIT) return null;
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const p = value as Record<string, unknown>;
    const lifetime = readLifetime(p, ['capabilities', 'principal', 'resource', 'revoked', 'version']);
    if (!lifetime || p.principal !== principal || p.resource !== WORKSPACE_RESOURCE || p.revoked !== false ||
        !validCapabilities(p.capabilities)) return null;
    return { capabilities: [...p.capabilities], ...lifetime };
  } catch { return null; }
}
function workspaceAuthority(source: Storage, testDirectory?: string) {
  return { authorize(capability: PrivateWorkspaceCapability): WorkspaceAccess | null {
    if (!WORKSPACE_CAPABILITIES.includes(capability)) return null;
    const policy = readWorkspacePolicy(source, testDirectory);
    if (!policy?.capabilities.includes(capability)) return null;
    return policy.lifetime.kind === 'until-revoked'
      ? { workspace: workspacePath(testDirectory), lifetime: { kind: 'until-revoked' } }
      : { workspace: workspacePath(testDirectory), lifetime: { kind: 'timed', expiresAt: policy.lifetime.expiresAt }, expiresAt: policy.lifetime.expiresAt };
  } };
}
/** Separate PRIVATE host policy. Never accepts workspace paths or grants from MCP input. */
export function createPrivateWorkspaceAuthority(): { authorize(capability: PrivateWorkspaceCapability): WorkspaceAccess | null } {
  return workspaceAuthority(storage(undefined, 'workspace'));
}
interface ProvisionResult {
  state: 'active' | 'denied' | 'revoked'; expiresAt?: number; lifetime?: AccessLifetime;
  capabilities?: readonly (PrivateWorkspaceCapability | PrivateControlCapability)[];
  allowedOrigins?: readonly string[]; desktopStopped?: boolean;
}
function provisionWorkspace(source: Storage, action: 'grant' | 'revoke' | 'status', capabilities: readonly PrivateWorkspaceCapability[], testDirectory?: string): ProvisionResult {
  if (action !== 'grant' && action !== 'revoke' && action !== 'status') throw Error('PRIVATE_POLICY_UNAVAILABLE');
  if (action === 'status') {
    const policy = readWorkspacePolicy(source, testDirectory);
    return policy ? { state: 'active', ...policy } : { state: 'denied' };
  }
  const principal = localPrincipal();
  if (!principal || !validCapabilities(capabilities)) throw Error('PRIVATE_POLICY_UNAVAILABLE');
  if (action === 'grant') prepareWorkspace(testDirectory);
  source.write(JSON.stringify({ version: 2, principal, resource: WORKSPACE_RESOURCE, capabilities: [...capabilities], lifetime: { kind: 'until-revoked' }, revoked: action === 'revoke' }));
  return action === 'grant' ? { state: 'active', lifetime: { kind: 'until-revoked' }, capabilities: [...capabilities] } : { state: 'revoked' };
}
export function provisionPrivateWorkspace(action: 'grant' | 'revoke' | 'status', capabilities: readonly PrivateWorkspaceCapability[] = WORKSPACE_CAPABILITIES): ProvisionResult {
  return provisionWorkspace(storage(undefined, 'workspace'), action, capabilities);
}

export type PrivateControlCapability = 'browser.read' | 'browser.interact' | 'desktop.read' | 'desktop.input' | 'terminal.exec';
const CONTROL_CAPABILITIES: readonly PrivateControlCapability[] = ['browser.read', 'browser.interact', 'desktop.read', 'desktop.input', 'terminal.exec'];
const CONTROL_RESOURCE = 'local:desktop-control:private-control';
type ControlPolicy = { capabilities: PrivateControlCapability[]; allowedOrigins: string[] } & ExplicitPrivateAccessWindow;
export type PrivateControlAccess = { allowedOrigins: string[]; profileDirectory: string } & PrivateAccessWindow;
function validControlCapabilities(value: unknown): value is PrivateControlCapability[] {
  return Array.isArray(value) && value.length > 0 && value.length <= CONTROL_CAPABILITIES.length &&
    new Set(value).size === value.length && value.every(v => CONTROL_CAPABILITIES.includes(v as PrivateControlCapability));
}
function validOrigins(value: unknown): value is string[] {
  return Array.isArray(value) && value.length <= 20 && new Set(value).size === value.length && value.every(origin => {
    if (typeof origin !== 'string' || origin.length > 512) return false;
    try { const u = new URL(origin); return ['http:', 'https:'].includes(u.protocol) && !u.username && !u.password && u.origin === origin && u.hostname.length > 0; }
    catch { return false; }
  });
}
function desktopStopped(directory: string): boolean {
  try { lstatSync(path.join(directory, 'desktop-stop')); return true; }
  catch (error) { return (error as NodeJS.ErrnoException).code !== 'ENOENT'; }
}
function browserStopped(directory: string): boolean {
  try { lstatSync(path.join(directory, 'browser-stop')); return true; }
  catch (error) { return (error as NodeJS.ErrnoException).code !== 'ENOENT'; }
}
function clearBrowserStop(testDirectory?: string): void {
  if (process.platform === 'win32') { native('clear-browser-stop', undefined, testDirectory); return; }
  const directory = testDirectory ?? productionDirectory();
  assertParentTrust(directory); assertPosixDirectory(directory);
  const sentinel = path.join(directory, 'browser-stop');
  try {
    const stat = lstatSync(sentinel);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.uid !== process.geteuid?.() || stat.nlink !== 1) throw Error('PRIVATE_POLICY_UNAVAILABLE');
    unlinkSync(sentinel);
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
}
function stopControls(testDirectory?: string): void {
  if (!localPrincipal()) throw Error('PRIVATE_POLICY_UNAVAILABLE');
  if (process.platform === 'win32') { native('stop-controls', undefined, testDirectory); return; }
  const directory = testDirectory ?? productionDirectory();
  assertParentTrust(directory); assertPosixDirectory(directory);
  for (const name of ['browser-stop', 'desktop-stop']) {
    try {
      const fd = openSync(path.join(directory, name), constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
      try { writeFileSync(fd, 'STOPPED\n'); fsyncSync(fd); } finally { closeSync(fd); }
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
  }
}
/** Safety-only operation: denies controls; never grants or clears a stop. */
export function stopPrivateControls(): void { stopControls(); }
function prepareBrowser(testDirectory?: string): void {
  if (process.platform === 'win32') { native('prepare-browser', undefined, testDirectory); return; }
  const directory = testDirectory ?? productionDirectory();
  assertParentTrust(directory);
  for (const target of [directory, path.join(directory, 'browser-profile')]) {
    try { mkdirSync(target, { mode: 0o700 }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
    assertPosixDirectory(target);
  }
}
function browserRuntime(prepare: boolean, testDirectory?: string): string {
  if (!localPrincipal()) throw Error('PRIVATE_POLICY_UNAVAILABLE');
  const directory = testDirectory ?? productionDirectory();
  const runtime = path.join(directory, 'browser-runtime');
  if (process.platform === 'win32') {
    native(prepare ? 'prepare-browser-runtime' : 'validate-browser-runtime', undefined, testDirectory);
    return runtime;
  }
  assertParentTrust(directory);
  if (prepare) {
    for (const target of [directory, runtime]) {
      try { mkdirSync(target, { mode: 0o700 }); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
      assertPosixDirectory(target);
    }
  }
  assertPosixDirectory(directory); assertParentTrust(runtime); assertPosixDirectory(runtime);
  return runtime;
}
/** Trusted local installer storage only. These functions never grant browser access or download files. */
export function preparePrivateBrowserRuntime(): string { return browserRuntime(true); }
export function validatePrivateBrowserRuntime(): string { return browserRuntime(false); }
function clearDesktopStop(testDirectory?: string): void {
  if (process.platform === 'win32') { native('clear-desktop-stop', undefined, testDirectory); return; }
  const directory = testDirectory ?? productionDirectory();
  assertParentTrust(directory); assertPosixDirectory(directory);
  const sentinel = path.join(directory, 'desktop-stop');
  try {
    const stat = lstatSync(sentinel);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.uid !== process.geteuid?.() || stat.nlink !== 1) throw Error('PRIVATE_POLICY_UNAVAILABLE');
    unlinkSync(sentinel);
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
}
function readControlPolicy(source: Storage, testDirectory?: string): ControlPolicy | null {
  try {
    const principal = localPrincipal(); if (!principal) return null;
    const raw = source.read(); if (Buffer.byteLength(raw) > LIMIT) return null;
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const p = value as Record<string, unknown>;
    const lifetime = readLifetime(p, ['allowedOrigins', 'capabilities', 'principal', 'resource', 'revoked', 'version']);
    if (!lifetime || p.principal !== principal || p.resource !== CONTROL_RESOURCE || p.revoked !== false ||
        !validControlCapabilities(p.capabilities) || !validOrigins(p.allowedOrigins) ||
        (p.capabilities.some(c => c.startsWith('browser.')) && p.allowedOrigins.length === 0)) return null;
    if (process.platform !== 'win32' && p.capabilities.some(c => c.startsWith('browser.'))) {
      const profile = path.join(testDirectory ?? productionDirectory(), 'browser-profile');
      assertParentTrust(profile); assertPosixDirectory(profile);
    }
    return { capabilities: [...p.capabilities], allowedOrigins: [...p.allowedOrigins], ...lifetime };
  } catch { return null; }
}
function controlAuthority(source: Storage, testDirectory?: string) {
  return { authorize(capability: PrivateControlCapability): PrivateControlAccess | null {
    if (!CONTROL_CAPABILITIES.includes(capability)) return null;
    const directory = testDirectory ?? productionDirectory();
    const policy = readControlPolicy(source, testDirectory);
    if (!policy?.capabilities.includes(capability) || (capability.startsWith('desktop.') && desktopStopped(directory)) || (capability.startsWith('browser.') && browserStopped(directory))) return null;
    const context = { allowedOrigins: [...policy.allowedOrigins], profileDirectory: path.join(directory, 'browser-profile') };
    return policy.lifetime.kind === 'until-revoked' ? { ...context, lifetime: { kind: 'until-revoked' } }
      : { ...context, lifetime: { kind: 'timed', expiresAt: policy.lifetime.expiresAt }, expiresAt: policy.lifetime.expiresAt };
  } };
}
/** Trusted host only; paths, principals and grants are never accepted through MCP. */
export function createPrivateControlAuthority(): { authorize(capability: PrivateControlCapability): PrivateControlAccess | null } {
  return controlAuthority(storage(undefined, 'control'));
}
export interface PrivateControlGrantOptions { reenableStopped?: boolean; }
function provisionControl(source: Storage, action: 'grant' | 'revoke' | 'status', capabilities: readonly PrivateControlCapability[], allowedOrigins: readonly string[], testDirectory?: string, options: PrivateControlGrantOptions = {}): ProvisionResult {
  if (!['grant', 'revoke', 'status'].includes(action)) throw Error('PRIVATE_POLICY_UNAVAILABLE');
  if (!options || typeof options !== 'object' || Array.isArray(options) || Object.getPrototypeOf(options) !== Object.prototype || Object.keys(options).some(key => key !== 'reenableStopped') ||
      (Object.hasOwn(options, 'reenableStopped') && typeof options.reenableStopped !== 'boolean') ||
      (action !== 'grant' && options.reenableStopped === true)) throw Error('PRIVATE_POLICY_UNAVAILABLE');
  if (action === 'status') {
    const policy = readControlPolicy(source, testDirectory);
    return policy ? { state: 'active', ...policy, desktopStopped: desktopStopped(testDirectory ?? productionDirectory()) } : { state: 'denied' };
  }
  const principal = localPrincipal();
  if (!principal || (action === 'grant' && (!validControlCapabilities(capabilities) || !validOrigins(allowedOrigins) ||
      (capabilities.some(c => c.startsWith('browser.')) && allowedOrigins.length === 0)))) throw Error('PRIVATE_POLICY_UNAVAILABLE');
  if (action === 'grant') prepareBrowser(testDirectory);
  const replacement = { version: 2, principal, resource: CONTROL_RESOURCE, capabilities: [...capabilities], allowedOrigins: [...allowedOrigins], lifetime: { kind: 'until-revoked' }, revoked: true };
  // First revoke the replacement selection atomically. Partial marker reset must
  // never expose a newly active subset when a later reset fails.
  source.write(JSON.stringify(replacement));
  // Persistent permission is not permission to resume after Esc. Only a separately
  // confirmed, explicitly requested local re-enable may clear the selected markers.
  if (action === 'grant' && options.reenableStopped === true && capabilities.some(c => c.startsWith('desktop.'))) clearDesktopStop(testDirectory);
  if (action === 'grant' && options.reenableStopped === true && capabilities.some(c => c.startsWith('browser.'))) clearBrowserStop(testDirectory);
  if (action === 'grant') source.write(JSON.stringify({ ...replacement, revoked: false }));
  return action === 'grant' ? { state: 'active', capabilities: [...capabilities], allowedOrigins: [...allowedOrigins], lifetime: { kind: 'until-revoked' }, desktopStopped: desktopStopped(testDirectory ?? productionDirectory()) } : { state: 'revoked' };
}
export function provisionPrivateControl(action: 'grant' | 'revoke' | 'status', capabilities: readonly PrivateControlCapability[] = [], allowedOrigins: readonly string[] = [], options: PrivateControlGrantOptions = {}) {
  return provisionControl(storage(undefined, 'control'), action, capabilities, allowedOrigins, undefined, options);
}

function readGrant(source: Storage): DiagnosticGrant | null {
  try {
    const principal = localPrincipal();
    if (!principal) return null;
    const raw = source.read();
    if (Buffer.byteLength(raw) > LIMIT) return null;
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const p = value as Record<string, unknown>;
    const lifetime = readLifetime(p, ['capability', 'principal', 'resource', 'revoked', 'version']);
    if (!lifetime || p.principal !== principal || p.capability !== STATUS_CAPABILITY ||
        p.resource !== STATUS_RESOURCE || p.revoked !== false) return null;
    const identity = { principal, capability: STATUS_CAPABILITY, resource: STATUS_RESOURCE, revoked: false } as const;
    return lifetime.lifetime.kind === 'until-revoked' ? { ...identity, lifetime: { kind: 'until-revoked' } }
      : { ...identity, expiresAt: lifetime.lifetime.expiresAt };
  } catch { return null; }
}

/** PRIVATE host only. Each authorization check re-reads protected local policy.
 * Same-user arbitrary code can provision policy; this is not isolation from the OS account.
 */
export function createPrivateGrantStore(): ReadonlyGrantStore {
  const source = storage();
  return { getGrants: () => { const grant = readGrant(source); return grant ? [grant] : []; } };
}

function provisionGrant(source: Storage, action: 'grant' | 'revoke' | 'status'): ProvisionResult {
  if (action !== 'grant' && action !== 'revoke' && action !== 'status') throw Error('PRIVATE_POLICY_UNAVAILABLE');
  if (action === 'status') {
    const grant = readGrant(source);
    if (!grant) return { state: 'denied' };
    return typeof grant.expiresAt === 'number' ? { state: 'active', expiresAt: grant.expiresAt, lifetime: { kind: 'timed', expiresAt: grant.expiresAt } }
      : { state: 'active', lifetime: { kind: 'until-revoked' } };
  }
  const principal = localPrincipal();
  if (!principal) throw Error('PRIVATE_POLICY_UNAVAILABLE');
  source.write(JSON.stringify({ version: 2, principal, capability: STATUS_CAPABILITY, resource: STATUS_RESOURCE, lifetime: { kind: 'until-revoked' }, revoked: action === 'revoke' }));
  return action === 'grant' ? { state: 'active', lifetime: { kind: 'until-revoked' } } : { state: 'revoked' };
}
export function provisionPrivateGrant(action: 'grant' | 'revoke' | 'status'): ProvisionResult {
  return provisionGrant(storage(), action);
}

/** Explicit test seam, never used by the host or provisioning CLI. */
export function createPrivateGrantTestHarness(directory: string) {
  const resolved = path.resolve(directory);
  const testRoot = path.basename(resolved) === 'policy-store' ? path.dirname(resolved) : resolved;
  const testBase = process.platform === 'win32' ? userInfo().homedir : tmpdir();
  if (path.dirname(testRoot) !== path.resolve(testBase) || !/^DesktopControl-private-test-[A-Za-z0-9]+$/.test(path.basename(testRoot)))
    throw Error('PRIVATE_TEST_DIRECTORY_INVALID');
  const source = storage(resolved);
  const workspaceSource = storage(resolved, 'workspace');
  const controlSource = storage(resolved, 'control');
  return {
    store: { getGrants: () => { const grant = readGrant(source); return grant ? [grant] : []; } } satisfies ReadonlyGrantStore,
    writePolicy: (value: unknown) => source.write(JSON.stringify(value)),
    readPolicy: () => JSON.parse(source.read()) as unknown,
    provisionGrant: (action: 'grant' | 'revoke' | 'status') => provisionGrant(source, action),
    writeRaw: (value: string) => source.write(value),
    workspaceAuthority: workspaceAuthority(workspaceSource, resolved),
    prepareWorkspace: () => prepareWorkspace(resolved),
    writeWorkspacePolicy: (value: unknown) => workspaceSource.write(JSON.stringify(value)),
    readWorkspacePolicy: () => JSON.parse(workspaceSource.read()) as unknown,
    provisionWorkspace: (action: 'grant' | 'revoke' | 'status', capabilities: readonly PrivateWorkspaceCapability[] = WORKSPACE_CAPABILITIES) => provisionWorkspace(workspaceSource, action, capabilities, resolved),
    controlAuthority: controlAuthority(controlSource, resolved),
    prepareBrowser: () => prepareBrowser(resolved),
    prepareBrowserRuntime: () => browserRuntime(true, resolved),
    validateBrowserRuntime: () => browserRuntime(false, resolved),
    writeControlPolicy: (value: unknown) => controlSource.write(JSON.stringify(value)),
    readControlPolicy: () => JSON.parse(controlSource.read()) as unknown,
    provisionControl: (action: 'grant' | 'revoke' | 'status', capabilities: readonly PrivateControlCapability[] = [], origins: readonly string[] = [], options: PrivateControlGrantOptions = {}) => provisionControl(controlSource, action, capabilities, origins, resolved, options),
    stopControls: () => stopControls(resolved),
    beginPermissionChange: (scope: PrivatePermissionScope) => permissionChange(scope, undefined, resolved),
    commitPermissionChange: (scope: PrivatePermissionScope, transaction: string) => {
      if (typeof transaction !== 'string' || !/^[a-f0-9]{32}$/.test(transaction)) throw Error('PRIVATE_POLICY_UNAVAILABLE');
      permissionChange(scope, transaction, resolved);
    }
  };
}
