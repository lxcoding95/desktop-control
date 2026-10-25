import { execFileSync, spawn } from 'node:child_process';
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

/** Test-only dependency seam. Production callers use confirmPrivateAction below. */
export function createPrivateActionConfirmerForTest(spawnImpl, timeoutMs = 60_000) {
  if (typeof spawnImpl !== 'function' || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000) throw Error('INVALID_INPUT');
  let pending = false;
  return async (action, signal) => {
    if (!validAction(action) || signal?.aborted || pending) return false;
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
const confirmAction = createPrivateActionConfirmerForTest(spawn);
/** Conservative per-input local confirmation, never a persistent grant or MCP self-approval. */
export async function confirmPrivateAction(action, signal) {
  if (process.platform !== 'win32') return false;
  return confirmAction(action, signal);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    if (process.argv.length !== 3 || !['--build', '--open'].includes(process.argv[2])) throw Error('INVALID_INPUT');
    if (process.argv[2] === '--build') { buildPrivateSettings(); console.log('PRIVATE_SETTINGS_BUILD_OK'); }
    else { const child = openPrivateSettings(); child.once('error', () => { console.error('PRIVATE_SETTINGS_UNAVAILABLE'); process.exitCode = 2; }); }
  } catch { console.error('PRIVATE_SETTINGS_UNAVAILABLE'); process.exitCode = 2; }
}
