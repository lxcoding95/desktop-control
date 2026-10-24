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

function native(mode: 'read' | 'write', input?: string, testDirectory?: string): string {
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

function storage(testDirectory?: string): Storage {
  if (process.platform === 'win32') return {
    read: () => native('read', undefined, testDirectory),
    write: value => { native('write', value, testDirectory); }
  };
  const directory = testDirectory ?? productionDirectory();
  const file = path.join(directory, 'policy');
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
  if (path.dirname(resolved) !== path.resolve(tmpdir()) || !/^DesktopControl-private-test-[A-Za-z0-9]+$/.test(path.basename(resolved)))
    throw Error('PRIVATE_TEST_DIRECTORY_INVALID');
  const source = storage(resolved);
  return {
    store: { getGrants: () => { const grant = readGrant(source); return grant ? [grant] : []; } } satisfies ReadonlyGrantStore,
    writePolicy: (value: unknown) => source.write(JSON.stringify(value)),
    writeRaw: (value: string) => source.write(value)
  };
}
