import { spawn, execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import type { createPrivateWorkspaceAuthority, PrivateWorkspaceCapability } from './private-grants.mts';

export const WORKSPACE_IMAGE = 'node@sha256:6449e19d8184d84062525b6a7524def03146c2cb04a7f08b076680d0e8e4240a';
const root = fileURLToPath(new URL(import.meta.url.endsWith('.mts') ? '../../../../' : '../../../../../', import.meta.url));
const MAX = 2 * 1024 * 1024;
let jobs = 0;
type Authority = ReturnType<typeof createPrivateWorkspaceAuthority>;
export type SandboxRunner = (workspace: string, request: Record<string, unknown>, signal?: AbortSignal) => Promise<unknown>;
const fail = (code: string): never => { throw Error(code); };

/** Only a fixed, non-networked Linux container receives the approved private workspace. */
export const runWorkspaceSandbox: SandboxRunner = async (workspace, request, signal) => {
  if (signal?.aborted) return fail('CANCELLED');
  if (jobs >= 2) return fail('BUSY');
  if ([root, workspace].some(value => /[,"\r\n]/.test(value))) return fail('SANDBOX_UNAVAILABLE');
  const input = JSON.stringify(request);
  if (Buffer.byteLength(input) > MAX) return fail('LIMIT_EXCEEDED');
  const name = 'desktop-control-job-' + randomUUID();
  const cleanup = () => new Promise<void>(resolve => {
    execFile('docker', ['rm', '--force', name], { windowsHide: true, timeout: 5000, maxBuffer: 4096 }, () => resolve());
  });
  const args = ['run', '--rm', '-i', '--init', '--name', name,
    '--network', 'none', '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
    '--user', '1000:1000', '--pids-limit', '64', '--memory', '256m', '--cpus', '1',
    '--tmpfs', '/tmp:rw,noexec,nosuid,size=16m',
    '--mount', `type=bind,source=${path.resolve(root, 'dist/private-workspace-runtime')},target=/app,readonly`,
    '--mount', `type=bind,source=${workspace},target=/workspace`, WORKSPACE_IMAGE,
    '/usr/bin/flock', '--exclusive', '--wait', '2', '--conflict-exit-code', '75',
    '/workspace/.desktop-control-lock', 'node', request.op === 'terminal' ? '/app/terminal.mjs' : '/app/worker.mjs'];
  jobs++;
  let timedOut = false, overflow = false, unavailable = false, code: number | null = null;
  let output = '';
  const child = spawn('docker', args, { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  const terminate = () => { child.kill(); void cleanup(); };
  const onAbort = () => terminate();
  signal?.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(() => { timedOut = true; terminate(); }, 12000);
  child.stdin.on('error', () => {});
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => {
    if (overflow) return;
    output += chunk;
    if (Buffer.byteLength(output) > MAX) { overflow = true; output = ''; terminate(); }
  });
  // OS/Docker diagnostics can contain host paths. Never forward or log them.
  child.stderr.resume();
  try {
    await new Promise<void>(resolve => {
      child.once('error', () => { unavailable = true; resolve(); });
      child.once('close', value => { code = value; resolve(); });
      if (signal?.aborted) terminate();
      child.stdin.end(input);
    });
    if (signal?.aborted) return fail('CANCELLED');
    if (timedOut) return fail('TIMEOUT');
    if (overflow) return fail('LIMIT_EXCEEDED');
    if (unavailable) return fail('SANDBOX_UNAVAILABLE');
    if (code === 75) return fail('BUSY');
    if (code !== 0) return fail('SANDBOX_UNAVAILABLE');
    try { return JSON.parse(output) as unknown; } catch { return fail('INTERNAL_ERROR'); }
  } finally {
    clearTimeout(timer); signal?.removeEventListener('abort', onAbort);
    await cleanup(); jobs--;
  }
};

export function createWorkspaceExecutor(authority: Authority, runner: SandboxRunner = runWorkspaceSandbox) {
  return async (capabilities: readonly PrivateWorkspaceCapability[], request: Record<string, unknown>, signal?: AbortSignal): Promise<unknown> => {
    const error = (code: string) => ({ ok: false, error: { code } });
    const authorize = () => {
      let workspace: string | undefined;
      for (const capability of capabilities) {
        const access = authority.authorize(capability);
        if (!access || access.expiresAt <= Date.now() || (workspace && workspace !== access.workspace)) return null;
        workspace = access.workspace;
      }
      return workspace;
    };
    if (signal?.aborted) return error('CANCELLED');
    if (!authorize()) return error('PERMISSION_DENIED');
    await Promise.resolve();
    if (signal?.aborted) return error('CANCELLED');
    const workspace = authorize();
    if (!workspace) return error('PERMISSION_DENIED');
    const controller = new AbortController();
    let revoked = false;
    const cancel = () => controller.abort();
    signal?.addEventListener('abort', cancel, { once: true });
    if (signal?.aborted) cancel();
    // Poll the protected host policy while work is outstanding. Already committed
    // filesystem changes cannot be rolled back by cancellation; no atomic-revoke claim.
    const watch = setInterval(() => {
      if (authorize() !== workspace) { revoked = true; controller.abort(); }
    }, 250);
    try {
      const result = await runner(workspace, request, controller.signal);
      if (revoked || authorize() !== workspace) return error('PERMISSION_DENIED');
      if (signal?.aborted) return error('CANCELLED');
      return result;
    }
    catch (cause) {
      if (revoked) return error('PERMISSION_DENIED');
      const safe = ['CANCELLED', 'BUSY', 'TIMEOUT', 'LIMIT_EXCEEDED', 'SANDBOX_UNAVAILABLE'];
      return error(cause instanceof Error && safe.includes(cause.message) ? cause.message : 'INTERNAL_ERROR');
    }
    finally { clearInterval(watch); signal?.removeEventListener('abort', cancel); }
  };
}
