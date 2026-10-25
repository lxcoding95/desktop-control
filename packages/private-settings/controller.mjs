import { execFileSync, spawn } from 'node:child_process';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const source = path.join(root, 'packages/private-settings/native/PrivateSettings.cs');
const target = path.join(root, 'dist/private-settings/private-settings.exe');
const cli = path.join(root, 'packages/mcp-server/scripts/private-grant.mjs');
const digest = file => createHash('sha256').update(readFileSync(file)).digest('hex');

export function buildPrivateSettings() {
  if (process.platform !== 'win32') throw Error('PLATFORM_UNAVAILABLE');
  const compiler = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'Microsoft.NET/Framework64/v4.0.30319/csc.exe');
  const sourceHash = digest(source), compilerHash = digest(compiler);
  mkdirSync(path.dirname(target), { recursive: true });
  let current = false;
  try {
    const stamp = JSON.parse(readFileSync(target + '.build.json', 'utf8'));
    current = stamp.sourceHash === sourceHash && stamp.compilerHash === compilerHash && stamp.binaryHash === digest(target);
  } catch { /* Build missing or changed private helper. */ }
  if (!current) execFileSync(compiler, ['/nologo', '/optimize+', '/target:winexe', '/reference:System.Windows.Forms.dll', '/reference:System.Drawing.dll', '/reference:System.Web.Extensions.dll', `/out:${target}`, source],
    { windowsHide: true, timeout: 30_000, stdio: 'pipe' });
  writeFileSync(target + '.build.json', JSON.stringify({ sourceHash, compilerHash, binaryHash: digest(target) }));
  return target;
}

/** Opens a visible local permission UI; no grants are changed by opening it. */
export function openPrivateSettings() {
  if (process.platform !== 'win32') throw Error('PLATFORM_UNAVAILABLE');
  // Production packaging must ship and verify this binary before calling this API.
  const child = spawn(target, [process.execPath, cli], { windowsHide: false, stdio: 'ignore', detached: false });
  return child;
}

const literalObject = (value, keys) => value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype
  && Reflect.ownKeys(value).length === keys.length && keys.every(key => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor && Object.hasOwn(descriptor, 'value') && descriptor.enumerable;
  });
function validAction(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).sort().join(',') === 'details,kind,summary'
    && ['desktop.input', 'browser.interact'].includes(value.kind)
    && typeof value.details === 'string' && value.details.length > 0 && value.details.length <= 65536
    && /^[\x20-\x7e\r\n]*$/.test(value.details)
    && typeof value.summary === 'string' && value.summary.trim().length > 0 && value.summary.length <= 240
    && !Array.from(value.summary).some(character => {
      const code = character.codePointAt(0);
      return code < 32 || (code >= 127 && code <= 159) || (code >= 0x202a && code <= 0x202e) || (code >= 0x2066 && code <= 0x2069);
    });
}

const controls = ['browser.read', 'browser.interact', 'desktop.read', 'desktop.input', 'terminal.exec'];
const workspaceCapabilities = ['files.read', 'files.write', 'files.remove', 'pdf.create'];
function literalArray(value, maximum, validate) {
  return Array.isArray(value) && Object.getPrototypeOf(value) === Array.prototype && value.length <= maximum
    && Reflect.ownKeys(value).length === value.length + 1 && Array.from({ length: value.length }, (_, index) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      return descriptor && Object.hasOwn(descriptor, 'value') && descriptor.enumerable && validate(descriptor.value);
    }).every(Boolean) && new Set(value).size === value.length;
}
function permissionMessage(proposal) {
  try {
    if (!literalObject(proposal, ['controls', 'allowedOrigins', 'diagnostics', 'workspaceCapabilities', 'reenableStopped', 'lifetime']) ||
      !literalArray(proposal.controls, 5, item => controls.includes(item)) ||
      !literalArray(proposal.workspaceCapabilities, 4, item => workspaceCapabilities.includes(item)) ||
      !literalArray(proposal.allowedOrigins, 20, origin => {
        if (typeof origin !== 'string' || origin.length > 512 || !/^[\x20-\x7e]+$/.test(origin)) return false;
        try { const url = new URL(origin); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && url.origin === origin && url.hostname.length > 0; }
        catch { return false; }
      }) || (proposal.controls.some(capability => capability.startsWith('browser.')) && proposal.allowedOrigins.length === 0) ||
      typeof proposal.diagnostics !== 'boolean' || typeof proposal.reenableStopped !== 'boolean' ||
      !literalObject(proposal.lifetime, ['kind']) || proposal.lifetime.kind !== 'until-revoked') return null;
    // Serialize a fresh literal snapshot before waiting; later caller mutation cannot alter consent.
    const details = JSON.stringify({ controls: [...proposal.controls], allowedOrigins: [...proposal.allowedOrigins],
      diagnostics: proposal.diagnostics, workspaceCapabilities: [...proposal.workspaceCapabilities],
      reenableStopped: proposal.reenableStopped, lifetime: { kind: 'until-revoked' } }, null, 2);
    if (Buffer.byteLength(details, 'utf8') > 8192) return null;
    return { kind: 'permissions.grant', summary: 'Persistent Desktop Control permissions: until revoked', details };
  } catch { return null; }
}
function validPermissionMessage(message) {
  if (!literalObject(message, ['kind', 'summary', 'details']) || message.kind !== 'permissions.grant' ||
    message.summary !== 'Persistent Desktop Control permissions: until revoked' || typeof message.details !== 'string') return false;
  try { return permissionMessage(JSON.parse(message.details))?.details === message.details; } catch { return false; }
}
function createNativeConfirmer(spawnImpl, timeoutMs, validate) {
  if (typeof spawnImpl !== 'function' || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000) throw Error('INVALID_INPUT');
  let pending = false;
  return async (action, signal) => {
    if (!validate(action) || signal?.aborted || pending) return false;
    pending = true;
    return new Promise(resolve => {
      let child, timer, finished = false, terminated = false;
      const finish = approved => {
        if (finished) return;
        finished = true; clearTimeout(timer); signal?.removeEventListener('abort', abort);
        pending = false; resolve(approved === true && !terminated && !signal?.aborted);
      };
      const abort = () => {
        terminated = true;
        try { child?.kill(); } catch { /* Approval still fails closed. */ }
        finish(false);
      };
      try {
        child = spawnImpl(target, ['--confirm-action'], { windowsHide: false, stdio: ['pipe', 'ignore', 'ignore'] });
        child.once('error', () => finish(false));
        child.once('close', code => finish(code === 0));
        child.stdin.on('error', abort);
        signal?.addEventListener('abort', abort, { once: true });
        timer = setTimeout(abort, timeoutMs);
        if (signal?.aborted) { abort(); return; }
        child.stdin.end(JSON.stringify(action));
      } catch { abort(); }
    });
  };
}
/** Test-only dependency seam; never pass a test spawn implementation from MCP input. */
export function createPrivateActionConfirmerForTest(spawnImpl, timeoutMs = 60_000) {
  return createNativeConfirmer(spawnImpl, timeoutMs, validAction);
}
/** Test-only seam for exact permission proposals; this never provisions a grant. */
export function createPrivatePermissionConfirmerForTest(spawnImpl, timeoutMs = 60_000) {
  const confirm = createNativeConfirmer(spawnImpl, timeoutMs, validPermissionMessage);
  return (proposal, signal) => {
    const message = permissionMessage(proposal);
    return message ? confirm(message, signal) : Promise.resolve(false);
  };
}
// Shared production mutex: permission proposals cannot overlap browser/desktop prompts.
const confirmDialog = createNativeConfirmer(spawn, 60_000, message => validAction(message) || validPermissionMessage(message));
/** Conservative per-input local confirmation, never a persistent grant or MCP self-approval. */
export async function confirmPrivateAction(action, signal) {
  if (process.platform !== 'win32' || !validAction(action)) return false;
  return confirmDialog(action, signal);
}
/** Bound persistent permission consent only; the trusted host must separately apply the approved snapshot. */
export async function confirmPrivatePermissionProposal(proposal, signal) {
  if (process.platform !== 'win32') return false;
  const message = permissionMessage(proposal);
  return message ? confirmDialog(message, signal) : false;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    if (process.argv.length !== 3 || !['--build', '--open'].includes(process.argv[2])) throw Error('INVALID_INPUT');
    if (process.argv[2] === '--build') { buildPrivateSettings(); console.log('PRIVATE_SETTINGS_BUILD_OK'); }
    else { const child = openPrivateSettings(); child.once('error', () => { console.error('PRIVATE_SETTINGS_UNAVAILABLE'); process.exitCode = 2; }); }
  } catch { console.error('PRIVATE_SETTINGS_UNAVAILABLE'); process.exitCode = 2; }
}
