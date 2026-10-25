// Explicit integration check; requires the existing local Docker daemon/image.
// No production grant is changed. All files belong to a fresh private test directory.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { userInfo, tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createPrivateGrantTestHarness } from '../../dist/packages/mcp-server/src/bridge/private-grants.mjs';
import { localPrincipal } from '../../dist/packages/mcp-server/src/bridge/principal.mjs';
import { runWorkspaceSandbox, createWorkspaceExecutor, WORKSPACE_IMAGE } from '../../dist/packages/mcp-server/src/bridge/workspace.mjs';

const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8', windowsHide: true, timeout: 15000, stdio: ['pipe', 'pipe', 'pipe'] });
docker('image', 'inspect', WORKSPACE_IMAGE);
const base = process.platform === 'win32' ? userInfo().homedir : tmpdir();
const directory = mkdtempSync(path.join(base, 'DesktopControl-private-test-'));
const harness = createPrivateGrantTestHarness(directory);
const workspace = path.join(directory, 'workspace');
const lockName = 'desktop-control-lock-control-' + randomUUID();
let holder;
let checks = 0;
function pass(name) { checks++; console.log('PASS ' + name); }
try {
  harness.prepareWorkspace();
  harness.writeWorkspacePolicy({ version: 1, principal: localPrincipal(), resource: 'local:desktop-control:workspace',
    capabilities: ['files.read', 'files.write', 'files.remove', 'pdf.create'], expiresAt: Date.now() + 900000, revoked: false });
  const execute = createWorkspaceExecutor(harness.workspaceAuthority);
  const written = await execute(['files.write'], { op: 'write', path: 'probe.txt', data: 'sandbox proof' });
  assert.equal(written.ok, true);
  const read = await execute(['files.read'], { op: 'read', path: 'probe.txt' });
  assert.equal(read.data, 'sandbox proof'); pass('real protected policy and Docker write/read');
  assert.equal((await execute(['files.read'], { op: 'read', path: '../policy' })).error.code, 'PATH_NOT_ALLOWED');
  pass('policy directory traversal refused');
  const pdf = await execute(['files.write', 'pdf.create'], { op: 'pdf', path: 'probe.pdf', text: 'Private integration proof' });
  assert.equal(pdf.ok, true);
  const pdfRead = await execute(['files.read'], { op: 'read', path: 'probe.pdf', encoding: 'base64' });
  assert.equal(Buffer.from(pdfRead.data, 'base64').subarray(0, 5).toString(), '%PDF-'); pass('real isolated PDF generation');
  const removed = await execute(['files.remove'], { op: 'remove', path: 'probe.txt', expectedSha256: written.sha256 });
  assert.equal(removed.ok, true);
  assert.equal((await execute(['files.read'], { op: 'read', path: 'probe.txt' })).error.code, 'NOT_FOUND');
  assert.equal((await execute(['files.write', 'files.remove'], { op: 'restore', token: removed.token })).sha256, written.sha256);
  pass('recoverable removal and restore');
  const shell = await runWorkspaceSandbox(workspace, { op: 'terminal', argv: ['node', '-e',
    "const fs=require('fs');if(fs.existsSync('/app/.git')||fs.existsSync('/app/.cache')||fs.existsSync('/var/run/docker.sock'))process.exit(9);try{fs.writeFileSync('/app/forbidden','x');process.exit(8)}catch{};console.log('ISOLATED')"] });
  assert.equal(shell.ok, true); assert.equal(shell.exitCode, 0); assert.equal(shell.stdout.trim(), 'ISOLATED');
  pass('actual terminal read-only runtime mount without checkout/evidence/Docker socket');
  const noisy = await runWorkspaceSandbox(workspace, { op: 'terminal', argv: ['node', '-e', "process.stdout.write('x'.repeat(100000))"] });
  assert.equal(noisy.error.code, 'LIMIT_EXCEEDED'); pass('actual terminal output limit');
  const hung = await runWorkspaceSandbox(workspace, { op: 'terminal', argv: ['node', '-e', 'setInterval(()=>{},1000)'] });
  assert.equal(hung.error.code, 'TIMEOUT'); pass('actual terminal timeout');

  // Positive control: another actual container holds the same OS lock.
  holder = spawn('docker', ['run', '--rm', '--name', lockName, '--network', 'none', '--read-only', '--cap-drop', 'ALL',
    '--security-opt', 'no-new-privileges', '--user', '1000:1000', '--pids-limit', '16', '--memory', '64m',
    '--mount', `type=bind,source=${workspace},target=/workspace`, WORKSPACE_IMAGE,
    '/usr/bin/flock', '--exclusive', '/workspace/.desktop-control-lock', 'node', '-e',
    "console.log('LOCKED');setTimeout(()=>{},30000)"], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  holder.stderr.resume();
  let timer;
  await new Promise((resolve, reject) => {
    timer = setTimeout(() => reject(Error('LOCK_CONTROL_TIMEOUT')), 10000);
    holder.once('error', reject); holder.once('exit', () => reject(Error('LOCK_CONTROL_EXIT')));
    holder.stdout.once('data', data => data.toString().includes('LOCKED') ? resolve() : reject(Error('LOCK_CONTROL_PROTOCOL')));
  }).finally(() => clearTimeout(timer));
  await assert.rejects(runWorkspaceSandbox(workspace, { op: 'list' }), /BUSY/); pass('cross-container mutation lock positive control');
  const controller = new AbortController();
  const pending = runWorkspaceSandbox(workspace, { op: 'list' }, controller.signal);
  setTimeout(() => controller.abort(), 200);
  await assert.rejects(pending, /CANCELLED/); pass('actual Docker job cancellation');
  const leaked = docker('ps', '-a', '--filter', 'name=desktop-control-job-', '--format', '{{.Names}}').trim();
  assert.equal(leaked, ''); pass('cancelled/completed job container cleanup');
  harness.writeWorkspacePolicy({ version: 1, principal: localPrincipal(), resource: 'local:desktop-control:workspace',
    capabilities: ['files.read'], expiresAt: Date.now() + 900000, revoked: true });
  assert.equal((await execute(['files.read'], { op: 'read', path: 'probe.txt' })).error.code, 'PERMISSION_DENIED');
  pass('real protected grant revocation');
  console.log(JSON.stringify({ checks, passed: checks, failed: 0, skipped: 0 }));
} finally {
  try { docker('rm', '--force', lockName); } catch { /* No holder on early failure. */ }
  holder?.kill();
  // Only this exact freshly-created test root is ever removed.
  assert.equal(path.dirname(directory), path.resolve(base));
  assert.match(path.basename(directory), /^DesktopControl-private-test-[A-Za-z0-9]+$/);
  rmSync(directory, { recursive: true, force: true });
}
