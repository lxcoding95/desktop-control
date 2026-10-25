import { spawn, execFileSync } from 'node:child_process';
import { Buffer } from 'node:buffer';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
export const defaultHelperPath = path.join(root, 'dist/private-desktop/desktop-controller.exe');
export function buildDesktopHelper() {
  if (process.platform !== 'win32') throw new Error('WINDOWS_REQUIRED');
  mkdirSync(path.dirname(defaultHelperPath), { recursive: true });
  const compiler = 'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe';
  execFileSync(compiler, ['/nologo', '/optimize+', '/platform:x64', '/target:exe',
    '/reference:System.Windows.Forms.dll', '/reference:System.Drawing.dll', '/reference:System.Web.Extensions.dll',
    `/out:${defaultHelperPath}`, path.join(root, 'packages/private-desktop/native/DesktopController.cs')],
  { windowsHide: true, timeout: 30_000, stdio: 'pipe' });
  return defaultHelperPath;
}

// Host policy remains mandatory and is evaluated at execution time, after queueing.
export function createDesktopController({ authorize, onEmergencyStop = () => {}, protectedProcessIds = [],
  helperPath = defaultHelperPath, requestTimeoutMs = 10_000, spawnHelper = spawn, ...unknownConfiguration } = {}) {
  if (Object.keys(unknownConfiguration).length) throw new Error('INVALID_CONFIGURATION');
  if (typeof authorize !== 'function') throw new Error('AUTHORIZATION_REQUIRED');
  if (typeof spawnHelper !== 'function') throw new Error('INVALID_TRANSPORT');
  if (!Array.isArray(protectedProcessIds) || protectedProcessIds.length > 128 ||
      protectedProcessIds.some(p => !Number.isSafeInteger(p) || p <= 0)) throw new Error('INVALID_PROTECTED_PIDS');
  if (!Number.isInteger(requestTimeoutMs) || requestTimeoutMs < 100 || requestTimeoutMs > 30_000) throw new Error('INVALID_TIMEOUT');
  let child, nextId = 1, queue = Promise.resolve(), stopped = false, pollTimer, pollDeadline;
  const pending = new Map();
  const failAll = code => { for (const p of pending.values()) { clearTimeout(p.timer); p.reject(new Error(code)); } pending.clear(); };
  function terminate(code) {
    stopped = true;
    clearTimeout(pollTimer); clearTimeout(pollDeadline);
    failAll(code);
    if (child && child.exitCode === null) child.kill();
  }
  function launch() {
    if (child) return;
    if (process.platform !== 'win32') throw new Error('WINDOWS_REQUIRED');
    child = spawnHelper(helperPath, ['--protected', protectedProcessIds.join(',')], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    child.stderr.resume(); // Never forward native diagnostics or environment details.
    child.stdin.on('error', () => terminate('HELPER_UNAVAILABLE'));
    child.stdout.on('error', () => terminate('HELPER_UNAVAILABLE'));
    let buffered = Buffer.alloc(0);
    child.stdout.on('data', chunk => {
      if (stopped) return;
      // Bound incomplete lines as well as complete replies, before concatenation.
      if (buffered.length + chunk.length > 6 * 1024 * 1024) { terminate('HELPER_PROTOCOL'); return; }
      buffered = Buffer.concat([buffered, chunk]);
      let newline;
      while ((newline = buffered.indexOf(10)) !== -1) {
        const line = buffered.subarray(0, newline); buffered = buffered.subarray(newline + 1);
        let message; try { message = JSON.parse(line.toString('utf8')); } catch { terminate('HELPER_PROTOCOL'); return; }
        if (!message || typeof message !== 'object' || Array.isArray(message)) { terminate('HELPER_PROTOCOL'); return; }
        if (message.event === 'emergencyStop') {
          terminate('DESKTOP_STOPPED');
          Promise.resolve().then(onEmergencyStop).catch(() => {}); return;
        }
        if (!Number.isSafeInteger(message.id) || typeof message.ok !== 'boolean' || !pending.has(message.id)) { terminate('HELPER_PROTOCOL'); return; }
        const p = pending.get(message.id);
        pending.delete(message.id); clearTimeout(p.timer);
        if (message.ok) p.resolve(message.result);
        else p.reject(new Error(typeof message.error === 'string' && /^[A-Z_]+$/.test(message.error) ? message.error : 'NATIVE_ERROR'));
      }
    });
    child.on('error', () => terminate('HELPER_UNAVAILABLE'));
    child.on('exit', () => { stopped = true; clearTimeout(pollTimer); clearTimeout(pollDeadline); failAll('HELPER_EXITED'); });
  }
  function request(action, args = {}) {
    try { launch(); } catch { terminate('HELPER_UNAVAILABLE'); throw new Error('HELPER_UNAVAILABLE'); }
    const id = nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => terminate('DESKTOP_TIMEOUT'), requestTimeoutMs);
      pending.set(id, { resolve, reject, timer });
      child.stdin.write(JSON.stringify({ id, action, ...args }) + '\n', error => { if (error) terminate('HELPER_UNAVAILABLE'); });
    });
  }
  function monitorAuthorization() {
    if (stopped || pollTimer || pollDeadline) return;
    pollTimer = setTimeout(async () => {
      pollTimer = undefined;
      // A broken/hanging policy backend must also stop an active desktop session.
      pollDeadline = setTimeout(() => terminate('PERMISSION_DENIED'), 1000);
      try { await authorize('desktop.input'); }
      catch { terminate('PERMISSION_DENIED'); }
      finally { clearTimeout(pollDeadline); pollDeadline = undefined; }
      if (!stopped) monitorAuthorization();
    }, 250);
  }
  function run(action, args, capability) {
    const task = queue.then(async () => {
      const chunks = action === 'typeText' ? Array.from(args.text).reduce((parts, character) => {
        if (!parts.length || Array.from(parts[parts.length - 1]).length === 32) parts.push('');
        parts[parts.length - 1] += character; return parts;
      }, []) : [null];
      if (!chunks.length) chunks.push('');
      let result;
      for (const chunk of chunks) {
        if (stopped) throw new Error('DESKTOP_STOPPED');
        try { await authorize(capability); } catch (error) { if (child) terminate('PERMISSION_DENIED'); throw error; }
        // The policy callback is allowed to stop the controller synchronously.
        if (stopped) throw new Error('DESKTOP_STOPPED');
        result = await request(action, action === 'typeText' ? { text: chunk } : args);
        if (action === 'start') monitorAuthorization();
      }
      return result;
    });
    queue = task.catch(() => {}); return task;
  }
  return {
    start: () => run('start', {}, 'desktop.input'),
    screenshot: () => run('screenshot', {}, 'desktop.read'),
    move: ({ x, y }) => {
      if (!Number.isInteger(x) || !Number.isInteger(y) || Math.abs(x) > 131072 || Math.abs(y) > 131072) return Promise.reject(new Error('INVALID_COORDINATES'));
      return run('move', { x, y }, 'desktop.input');
    },
    click: ({ button = 'left', x, y } = {}) => {
      if (!['left', 'right', 'middle'].includes(button)) return Promise.reject(new Error('INVALID_BUTTON'));
      if (x !== undefined || y !== undefined) {
        if (!Number.isInteger(x) || !Number.isInteger(y) || Math.abs(x) > 131072 || Math.abs(y) > 131072) return Promise.reject(new Error('INVALID_COORDINATES'));
        return run('click', { button, x, y }, 'desktop.input');
      }
      return run('click', { button }, 'desktop.input');
    },
    key: ({ key }) => ['Enter', 'Tab', 'Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(key) ? run('key', { key }, 'desktop.input') : Promise.reject(new Error('INVALID_KEY')),
    typeText: ({ text }) => typeof text === 'string' && Buffer.byteLength(text, 'utf8') <= 8192 ? run('typeText', { text }, 'desktop.input') : Promise.reject(new Error('INVALID_TEXT')),
    stop: async () => {
      stopped = true; clearTimeout(pollTimer); clearTimeout(pollDeadline); failAll('DESKTOP_STOPPED');
      if (child && child.exitCode === null) {
        // Native EOF is the normal stop path. Force termination is bounded recovery.
        child.stdin.end();
        await new Promise(resolve => {
          const timer = setTimeout(() => { child.kill(); resolve(); }, 1000);
          child.once('exit', () => { clearTimeout(timer); resolve(); });
        });
      }
    },
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) && process.argv[2] === '--build') buildDesktopHelper();
