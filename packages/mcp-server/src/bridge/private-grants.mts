import { execFileSync } from 'node:child_process';
import { constants, closeSync, fstatSync, fsyncSync, lstatSync, mkdirSync, openSync, readSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { userInfo, tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { localPrincipal } from './principal.mts';
import { STATUS_CAPABILITY, STATUS_RESOURCE } from './policy.mts';
import type { DiagnosticGrant, ReadonlyGrantStore } from './policy.mts';

const LIMIT = 16_384;
const MAX_LIFETIME = 3_600_000;
const root = new URL(import.meta.url.endsWith('.mts') ? '../../../../' : '../../../../../', import.meta.url);
const helper = fileURLToPath(new URL('dist/native/windows-private-policy.exe', root));
// Deliberately independent of XDG/APPDATA and MCP/environment-supplied paths.
const productionDirectory = () => path.join(userInfo().homedir, '.desktop-control-private');
interface Storage { read(): string; write(value: string): void; }

function native(mode: 'read' | 'write' | 'read-workspace' | 'write-workspace' | 'prepare-workspace' | 'read-control' | 'write-control' | 'prepare-browser' | 'clear-desktop-stop' | 'prepare-browser-runtime' | 'validate-browser-runtime', input?: string, testDirectory?: string): string {
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
  return {
    read() {
      assertParentTrust(directory);
      assertPosixDirectory(directory);
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

export type PrivateWorkspaceCapability = 'files.read' | 'files.write' | 'files.remove' | 'pdf.create';
const WORKSPACE_CAPABILITIES: readonly PrivateWorkspaceCapability[] = ['files.read', 'files.write', 'files.remove', 'pdf.create'];
const WORKSPACE_RESOURCE = 'local:desktop-control:workspace';
interface WorkspaceAccess { workspace: string; expiresAt: number; }
interface WorkspacePolicy { capabilities: PrivateWorkspaceCapability[]; expiresAt: number; }

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
    const now = Date.now();
    if (Object.keys(p).sort().join(',') !== 'capabilities,expiresAt,principal,resource,revoked,version' ||
        p.version !== 1 || p.principal !== principal || p.resource !== WORKSPACE_RESOURCE || p.revoked !== false ||
        !validCapabilities(p.capabilities) || !Number.isSafeInteger(p.expiresAt) ||
        (p.expiresAt as number) <= now || (p.expiresAt as number) - now > MAX_LIFETIME) return null;
    return { capabilities: p.capabilities, expiresAt: p.expiresAt as number };
  } catch { return null; }
}
function workspaceAuthority(source: Storage, testDirectory?: string) {
  return { authorize(capability: PrivateWorkspaceCapability): WorkspaceAccess | null {
    if (!WORKSPACE_CAPABILITIES.includes(capability)) return null;
    const policy = readWorkspacePolicy(source, testDirectory);
    return policy?.capabilities.includes(capability) ? { workspace: workspacePath(testDirectory), expiresAt: policy.expiresAt } : null;
  } };
}
/** Separate PRIVATE host policy. Never accepts workspace paths or grants from MCP input. */
export function createPrivateWorkspaceAuthority(): { authorize(capability: PrivateWorkspaceCapability): WorkspaceAccess | null } {
  return workspaceAuthority(storage(undefined, 'workspace'));
}
export function provisionPrivateWorkspace(action: 'grant' | 'revoke' | 'status', capabilities: readonly PrivateWorkspaceCapability[] = WORKSPACE_CAPABILITIES): {
  state: 'active' | 'denied' | 'revoked'; expiresAt?: number; capabilities?: readonly PrivateWorkspaceCapability[];
} {
  if (action !== 'grant' && action !== 'revoke' && action !== 'status') throw Error('PRIVATE_POLICY_UNAVAILABLE');
  const source = storage(undefined, 'workspace');
  if (action === 'status') {
    const policy = readWorkspacePolicy(source);
    return policy ? { state: 'active', expiresAt: policy.expiresAt, capabilities: policy.capabilities } : { state: 'denied' };
  }
  const principal = localPrincipal();
  if (!principal || !validCapabilities(capabilities)) throw Error('PRIVATE_POLICY_UNAVAILABLE');
  if (action === 'grant') prepareWorkspace();
  const expiresAt = Date.now() + (action === 'grant' ? 900_000 : 0);
  source.write(JSON.stringify({ version: 1, principal, resource: WORKSPACE_RESOURCE, capabilities, expiresAt, revoked: action === 'revoke' }));
  return action === 'grant' ? { state: 'active', expiresAt, capabilities: [...capabilities] } : { state: 'revoked' };
}

export type PrivateControlCapability = 'browser.read' | 'browser.interact' | 'desktop.read' | 'desktop.input' | 'terminal.exec';
const CONTROL_CAPABILITIES: readonly PrivateControlCapability[] = ['browser.read', 'browser.interact', 'desktop.read', 'desktop.input', 'terminal.exec'];
const CONTROL_RESOURCE = 'local:desktop-control:private-control';
interface ControlPolicy { capabilities: PrivateControlCapability[]; allowedOrigins: string[]; expiresAt: number; }
export interface PrivateControlAccess { expiresAt: number; allowedOrigins: string[]; profileDirectory: string; }
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
    const p = value as Record<string, unknown>, now = Date.now();
    if (Object.keys(p).sort().join(',') !== 'allowedOrigins,capabilities,expiresAt,principal,resource,revoked,version' ||
        p.version !== 1 || p.principal !== principal || p.resource !== CONTROL_RESOURCE || p.revoked !== false ||
        !validControlCapabilities(p.capabilities) || !validOrigins(p.allowedOrigins) ||
        (p.capabilities.some(c => c.startsWith('browser.')) && p.allowedOrigins.length === 0) ||
        !Number.isSafeInteger(p.expiresAt) || (p.expiresAt as number) <= now || (p.expiresAt as number) - now > MAX_LIFETIME) return null;
    if (process.platform !== 'win32' && p.capabilities.some(c => c.startsWith('browser.'))) {
      const profile = path.join(testDirectory ?? productionDirectory(), 'browser-profile');
      assertParentTrust(profile); assertPosixDirectory(profile);
    }
    return { capabilities: p.capabilities, allowedOrigins: p.allowedOrigins, expiresAt: p.expiresAt as number };
  } catch { return null; }
}
function controlAuthority(source: Storage, testDirectory?: string) {
  return { authorize(capability: PrivateControlCapability): PrivateControlAccess | null {
    if (!CONTROL_CAPABILITIES.includes(capability)) return null;
    const directory = testDirectory ?? productionDirectory();
    const policy = readControlPolicy(source, testDirectory);
    if (!policy?.capabilities.includes(capability) || (capability.startsWith('desktop.') && desktopStopped(directory))) return null;
    return { expiresAt: policy.expiresAt, allowedOrigins: [...policy.allowedOrigins], profileDirectory: path.join(directory, 'browser-profile') };
  } };
}
/** Trusted host only; paths, principals and grants are never accepted through MCP. */
export function createPrivateControlAuthority(): { authorize(capability: PrivateControlCapability): PrivateControlAccess | null } {
  return controlAuthority(storage(undefined, 'control'));
}
function provisionControl(source: Storage, action: 'grant' | 'revoke' | 'status', capabilities: readonly PrivateControlCapability[], allowedOrigins: readonly string[], testDirectory?: string): {
  state: 'active' | 'denied' | 'revoked'; capabilities?: PrivateControlCapability[]; allowedOrigins?: string[]; expiresAt?: number; desktopStopped?: boolean;
} {
  if (!['grant', 'revoke', 'status'].includes(action)) throw Error('PRIVATE_POLICY_UNAVAILABLE');
  if (action === 'status') {
    const policy = readControlPolicy(source, testDirectory);
    return policy ? { state: 'active', ...policy, desktopStopped: desktopStopped(testDirectory ?? productionDirectory()) } : { state: 'denied' };
  }
  const principal = localPrincipal();
  if (!principal || (action === 'grant' && (!validControlCapabilities(capabilities) || !validOrigins(allowedOrigins) ||
      (capabilities.some(c => c.startsWith('browser.')) && allowedOrigins.length === 0)))) throw Error('PRIVATE_POLICY_UNAVAILABLE');
  if (action === 'grant') prepareBrowser(testDirectory);
  const expiresAt = Date.now() + (action === 'grant' ? 900_000 : 0);
  source.write(JSON.stringify({ version: 1, principal, resource: CONTROL_RESOURCE, capabilities: [...capabilities], allowedOrigins: [...allowedOrigins], expiresAt, revoked: action === 'revoke' }));
  // Only this explicitly invoked local provisioning action may reset the durable stop.
  // A failed reset leaves the valid policy stopped, never re-enables through MCP.
  if (action === 'grant' && capabilities.some(c => c.startsWith('desktop.'))) clearDesktopStop(testDirectory);
  return action === 'grant' ? { state: 'active', capabilities: [...capabilities], allowedOrigins: [...allowedOrigins], expiresAt, desktopStopped: false } : { state: 'revoked' };
}
export function provisionPrivateControl(action: 'grant' | 'revoke' | 'status', capabilities: readonly PrivateControlCapability[] = [], allowedOrigins: readonly string[] = []) {
  return provisionControl(storage(undefined, 'control'), action, capabilities, allowedOrigins);
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
    const now = Date.now();
    if (Object.keys(p).sort().join(',') !== 'capability,expiresAt,principal,resource,revoked,version' ||
        p.version !== 1 || p.principal !== principal || p.capability !== STATUS_CAPABILITY ||
        p.resource !== STATUS_RESOURCE || p.revoked !== false ||
        !Number.isSafeInteger(p.expiresAt) || (p.expiresAt as number) <= now || (p.expiresAt as number) - now > MAX_LIFETIME) return null;
    return { principal, capability: STATUS_CAPABILITY, resource: STATUS_RESOURCE, expiresAt: p.expiresAt as number, revoked: false };
  } catch { return null; }
}

/** PRIVATE host only. Each authorization check re-reads protected local policy.
 * Same-user arbitrary code can provision policy; this is not isolation from the OS account.
 */
export function createPrivateGrantStore(): ReadonlyGrantStore {
  const source = storage();
  return { getGrants: () => { const grant = readGrant(source); return grant ? [grant] : []; } };
}

export function provisionPrivateGrant(action: 'grant' | 'revoke' | 'status'): { state: 'active' | 'denied' | 'revoked'; expiresAt?: number } {
  if (action !== 'grant' && action !== 'revoke' && action !== 'status') throw Error('PRIVATE_POLICY_UNAVAILABLE');
  const source = storage();
  if (action === 'status') {
    const grant = readGrant(source);
    return grant ? { state: 'active', expiresAt: grant.expiresAt } : { state: 'denied' };
  }
  const principal = localPrincipal();
  if (!principal) throw Error('PRIVATE_POLICY_UNAVAILABLE');
  const expiresAt = Date.now() + (action === 'grant' ? 900_000 : 0);
  source.write(JSON.stringify({ version: 1, principal, capability: STATUS_CAPABILITY, resource: STATUS_RESOURCE, expiresAt, revoked: action === 'revoke' }));
  return action === 'grant' ? { state: 'active', expiresAt } : { state: 'revoked' };
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
    writeRaw: (value: string) => source.write(value),
    workspaceAuthority: workspaceAuthority(workspaceSource, resolved),
    prepareWorkspace: () => prepareWorkspace(resolved),
    writeWorkspacePolicy: (value: unknown) => workspaceSource.write(JSON.stringify(value)),
    controlAuthority: controlAuthority(controlSource, resolved),
    prepareBrowser: () => prepareBrowser(resolved),
    prepareBrowserRuntime: () => browserRuntime(true, resolved),
    validateBrowserRuntime: () => browserRuntime(false, resolved),
    writeControlPolicy: (value: unknown) => controlSource.write(JSON.stringify(value)),
    provisionControl: (action: 'grant' | 'revoke' | 'status', capabilities: readonly PrivateControlCapability[] = [], origins: readonly string[] = []) => provisionControl(controlSource, action, capabilities, origins, resolved)
  };
}
