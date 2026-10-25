import { spawn, execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import type { createPrivateWorkspaceAuthority, PrivateWorkspaceCapability } from './private-grants.mts';

export const WORKSPACE_IMAGE = 'node@sha256:6449e19d8184d84062525b6a7524def03146c2cb04a7f08b076680d0e8e4240a';
const root = fileURLToPath(new URL(import.meta.url.endsWith('.mts') ? '../../../../' : '../../../../../', import.meta.url));
const MAX = 2 * 1024 * 1024;
type Authority = ReturnType<typeof createPrivateWorkspaceAuthority>;
export type SandboxRunner = (workspace: string, request: Record<string, unknown>, signal?: AbortSignal) => Promise<unknown>;
const fail = (code: string): never => { throw Error(code); };

type SandboxDependencies = {
  launch(args: string[]): ChildProcessWithoutNullStreams;
  command(args: string[]): Promise<string>;
};
const dockerDependencies: SandboxDependencies = {
  launch: args => spawn('docker', args, { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] }),
  command: args => new Promise((resolve, reject) => {
    execFile('docker', args, { windowsHide: true, timeout: 5000, maxBuffer: 4096, encoding: 'utf8' },
      (error, stdout) => error ? reject(Error('SANDBOX_CLEANUP_FAILED')) : resolve(stdout));
  })
};

/** Trusted test seam only; neither dependency can be supplied over MCP. */
export function createWorkspaceSandboxRunnerForTest(dependencies: SandboxDependencies): SandboxRunner {
  return createSandboxRunner(dependencies);
}

function createSandboxRunner(dependencies: SandboxDependencies): SandboxRunner {
  let jobs = 0;
  // A failed removal/absence check must never silently permit another job.
  // Retry verification on the next request; a daemon outage stays fail-closed.
  const quarantined = new Map<string, string>();
  const cleanup = async (identity: string, byId = false) => {
    try { await dependencies.command(['rm', '--force', identity]); } catch { /* Absence still needs an independent successful query. */ }
    const remaining = await dependencies.command(['ps', '-a', '--filter', `${byId ? 'id' : 'name'}=${identity}`, '--format', '{{.Names}}']);
    if (remaining.trim() !== '') throw Error('SANDBOX_CLEANUP_FAILED');
  };
  const finishJob = async (name: string, reservation: string) => {
    try { await cleanup(name); await cleanup(reservation, true); }
    catch { quarantined.set(name, reservation); throw Error('SANDBOX_CLEANUP_FAILED'); }
  };
  return async (workspace, request, signal) => {
  if (signal?.aborted) return fail('CANCELLED');
  if (jobs >= 2) return fail('BUSY');
  if ([root, workspace].some(value => /[,"\r\n]/.test(value))) return fail('SANDBOX_UNAVAILABLE');
  const input = JSON.stringify(request);
  if (Buffer.byteLength(input) > MAX) return fail('LIMIT_EXCEEDED');
  for (const [prior, reservation] of quarantined) {
    try { await cleanup(prior); await cleanup(reservation, true); quarantined.delete(prior); }
    catch { return fail('SANDBOX_CLEANUP_FAILED'); }
  }
  if (signal?.aborted) return fail('CANCELLED');
  if (jobs >= 2) return fail('BUSY');
  const name = 'desktop-control-job-' + randomUUID();
  const lockFile = path.join(path.dirname(workspace), 'workspace-lock');
  const canonicalWorkspace = process.platform === 'win32' ? path.resolve(workspace).toLowerCase() : path.resolve(workspace);
  const reservationName = 'desktop-control-reservation-' + createHash('sha256').update(canonicalWorkspace).digest('hex');
  const owner = randomUUID();
  let reservation: string;
  jobs++;
  try {
    // Docker owns this stopped name reservation outside the worker PID/filesystem
    // namespaces. An untrusted terminal cannot unlock it or kill its holder.
    reservation = (await dependencies.command(['create', '--pull', 'never', '--name', reservationName,
      '--label', `desktop-control.owner=${owner}`, '--network', 'none', '--read-only', '--cap-drop', 'ALL',
      '--security-opt', 'no-new-privileges', '--user', '1000:1000', WORKSPACE_IMAGE, 'node', '-e', 'process.exit(0)'])).trim();
    if (!/^[0-9a-f]{64}$/.test(reservation)) throw Error('SANDBOX_UNAVAILABLE');
  } catch {
    jobs--;
    let existing: string;
    try { existing = (await dependencies.command(['inspect', '--type', 'container', '--format', '{{.Id}} {{index .Config.Labels "desktop-control.owner"}}', reservationName])).trim(); }
    catch { return fail('SANDBOX_UNAVAILABLE'); }
    const [identity, existingOwner] = existing.split(' ');
    if (identity && /^[0-9a-f]{64}$/.test(identity) && existingOwner === owner) {
      // A create timeout can have succeeded daemon-side. Remove only this claim,
      // never the reservation of a concurrent host process.
      try { await cleanup(identity, true); } catch { quarantined.set(name, identity); return fail('SANDBOX_CLEANUP_FAILED'); }
      return fail('SANDBOX_UNAVAILABLE');
    }
    return fail('BUSY');
  }
  if (signal?.aborted) {
    try { await cleanup(reservation, true); }
    catch { quarantined.set(name, reservation); return fail('SANDBOX_CLEANUP_FAILED'); }
    finally { jobs--; }
    return fail('CANCELLED');
  }
  const args = ['run', '--rm', '-i', '--init', '--name', name,
    '--network', 'none', '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
    '--user', '1000:1000', '--pids-limit', '64', '--memory', '256m', '--cpus', '1',
    '--tmpfs', '/tmp:rw,noexec,nosuid,size=16m',
    '--mount', `type=bind,source=${path.resolve(root, 'dist/private-workspace-runtime')},target=/app,readonly`,
    '--mount', `type=bind,source=${workspace},target=/workspace`, WORKSPACE_IMAGE,
    '/usr/bin/flock', '--close', '--exclusive', '--wait', '2', '--conflict-exit-code', '75',
    '/run/desktop-control.lock', 'node', request.op === 'terminal' ? '/app/terminal.mjs' : '/app/worker.mjs'];
  // The stable lock inode is outside the writable workspace. The container can
  // acquire flock through its read-only descriptor but cannot unlink or replace it.
  args.splice(args.indexOf(WORKSPACE_IMAGE), 0, '--mount', `type=bind,source=${lockFile},target=/run/desktop-control.lock,readonly`);
  let timedOut = false, overflow = false, unavailable = false, code: number | null = null;
  let output = '';
  let child: ChildProcessWithoutNullStreams;
  try { child = dependencies.launch(args); }
  catch {
    try { await cleanup(reservation, true); }
    catch { quarantined.set(name, reservation); return fail('SANDBOX_CLEANUP_FAILED'); }
    finally { jobs--; }
    return fail('SANDBOX_UNAVAILABLE');
  }
  const terminate = () => { child.kill(); };
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
    try { await finishJob(name, reservation); } finally { jobs--; }
  }
  };
}

/** Only a fixed, non-networked Linux container receives the approved private workspace. */
export const runWorkspaceSandbox: SandboxRunner = createSandboxRunner(dockerDependencies);

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
      const safe = ['CANCELLED', 'BUSY', 'TIMEOUT', 'LIMIT_EXCEEDED', 'SANDBOX_UNAVAILABLE', 'SANDBOX_CLEANUP_FAILED'];
      return error(cause instanceof Error && safe.includes(cause.message) ? cause.message : 'INTERNAL_ERROR');
    }
    finally { clearInterval(watch); signal?.removeEventListener('abort', cancel); }
  };
}
