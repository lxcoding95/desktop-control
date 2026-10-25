import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorkspaceExecutor, createWorkspaceSandboxRunnerForTest } from '../src/bridge/workspace.mts';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

test('private workspace refusal, revocation and cancellation cause zero sandbox invocations', async () => {
  let allowed = false, calls = 0;
  const authority = { authorize: () => allowed ? { workspace: 'test-only', expiresAt: Date.now() + 10000 } : null };
  const run = createWorkspaceExecutor(authority, () => { calls++; return Promise.resolve({ ok: true }); });
  assert.deepEqual(await run(['files.write'], {}), { ok: false, error: { code: 'PERMISSION_DENIED' } });
  allowed = true;
  const pending = run(['files.write'], {}); allowed = false;
  assert.deepEqual(await pending, { ok: false, error: { code: 'PERMISSION_DENIED' } });
  allowed = true;
  const controller = new AbortController();
  const cancelled = run(['files.write'], {}, controller.signal); controller.abort();
  assert.deepEqual(await cancelled, { ok: false, error: { code: 'CANCELLED' } });
  assert.equal(calls, 0);
});

test('private workspace requires every capability and redacts backend failures', async () => {
  let calls = 0;
  const authority = { authorize: (capability: string) => capability === 'files.read' ? { workspace: 'test-only', expiresAt: Date.now() + 10000 } : null };
  const run = createWorkspaceExecutor(authority, () => { calls++; return Promise.reject(Error('PRIVATE_BACKEND_MARKER')); });
  assert.deepEqual(await run(['files.read', 'files.write'], {}), { ok: false, error: { code: 'PERMISSION_DENIED' } });
  assert.equal(calls, 0);
  assert.deepEqual(await run(['files.read'], {}), { ok: false, error: { code: 'INTERNAL_ERROR' } });
  assert.equal(calls, 1);
});

test('revocation during a sandbox job aborts it and suppresses a late success', async () => {
  let allowed = true, aborted = false;
  const authority = { authorize: () => allowed ? { workspace: 'test-only', expiresAt: Date.now() + 10000 } : null };
  const run = createWorkspaceExecutor(authority, (_workspace, _request, signal) => new Promise(resolve => {
    signal?.addEventListener('abort', () => { aborted = true; resolve({ ok: true }); }, { once: true });
  }));
  const pending = run(['files.write'], {});
  await new Promise(resolve => setTimeout(resolve, 20));
  allowed = false;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([pending, new Promise(resolve => { deadline = setTimeout(() => resolve('NOT_ABORTED'), 1500); })]);
    assert.deepEqual(result, { ok: false, error: { code: 'PERMISSION_DENIED' } });
    assert.equal(aborted, true);
  } finally { clearTimeout(deadline); }
});

test('failed Docker cleanup quarantines future launches until absence is verified', async () => {
  let healthy = false, launches = 0;
  const commands: string[][] = [];
  const run = createWorkspaceSandboxRunnerForTest({
    launch(args) {
      launches++;
      assert.ok(args.some(value => value.includes('target=/run/desktop-control.lock,readonly')));
      assert.ok(args.includes('/run/desktop-control.lock'));
      assert.ok(!args.includes('/workspace/.desktop-control-lock'));
      const child = Object.assign(new EventEmitter(), { stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), kill: () => true });
      queueMicrotask(() => { child.stdout.write('{"ok":true}'); child.emit('close', 0); });
      return child as unknown as ChildProcessWithoutNullStreams;
    },
    command(args) {
      commands.push(args);
      if (args[0] === 'create') return Promise.resolve('c'.repeat(64));
      return healthy ? Promise.resolve('') : Promise.reject(Error('PRIVATE_DAEMON_FAILURE'));
    }
  });
  await assert.rejects(run(path.join('test-only', 'workspace'), { op: 'list' }), /^Error: SANDBOX_CLEANUP_FAILED$/);
  assert.equal(launches, 1);
  await assert.rejects(run(path.join('test-only', 'workspace'), { op: 'list' }), /^Error: SANDBOX_CLEANUP_FAILED$/);
  assert.equal(launches, 1, 'No new process starts while cleanup remains unverified');
  healthy = true;
  assert.deepEqual(await run(path.join('test-only', 'workspace'), { op: 'list' }), { ok: true });
  assert.equal(launches, 2);
  assert.ok(commands.some(command => command[0] === 'ps'));
});

test('Docker cleanup requires successful absence query even after rm succeeded', async () => {
  const run = createWorkspaceSandboxRunnerForTest({
    launch() {
      const child = Object.assign(new EventEmitter(), { stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), kill: () => true });
      queueMicrotask(() => { child.stdout.write('{"ok":true}'); child.emit('close', 0); });
      return child as unknown as ChildProcessWithoutNullStreams;
    },
    command: args => args[0] === 'create' ? Promise.resolve('c'.repeat(64)) : args[0] === 'rm' ? Promise.resolve('removed') : Promise.reject(Error('QUERY_FAILED'))
  });
  await assert.rejects(run(path.join('test-only', 'workspace'), { op: 'list' }), /SANDBOX_CLEANUP_FAILED/);
});

test('an existing reservation belongs to another host and is never removed', async () => {
  const commands: string[][] = [];
  const run = createWorkspaceSandboxRunnerForTest({
    launch: () => { throw Error('MUST_NOT_LAUNCH'); },
    command(args) {
      commands.push(args);
      return args[0] === 'inspect' ? Promise.resolve('b'.repeat(64) + ' foreign-owner') : Promise.reject(Error('NAME_CONFLICT'));
    }
  });
  await assert.rejects(run(path.join('test-only', 'workspace'), { op: 'list' }), /BUSY/);
  assert.deepEqual(commands.map(command => command[0]), ['create', 'inspect']);
});

test('cancellation while reserving a workspace never starts the worker', async () => {
  const controller = new AbortController();
  let launches = 0;
  const run = createWorkspaceSandboxRunnerForTest({
    launch: () => { launches++; throw Error('MUST_NOT_LAUNCH'); },
    command(args) {
      if (args[0] === 'create') { controller.abort(); return Promise.resolve('d'.repeat(64)); }
      return Promise.resolve('');
    }
  });
  await assert.rejects(run(path.join('test-only', 'workspace'), { op: 'list' }, controller.signal), /CANCELLED/);
  assert.equal(launches, 0);
});

test('worker staging refuses a dist junction before touching external files', () => {
  const base = mkdtempSync(path.join(tmpdir(), 'desktop-control-stage-'));
  const fixture = path.join(base, 'repo'), outside = path.join(base, 'outside');
  try {
    mkdirSync(path.join(fixture, 'tools/plugin'), { recursive: true });
    mkdirSync(path.join(outside, 'private-workspace-runtime'), { recursive: true });
    const marker = path.join(outside, 'private-workspace-runtime', 'keep.txt');
    writeFileSync(marker, 'PRESERVE_EXTERNAL_CONTENT');
    copyFileSync(fileURLToPath(new URL('../../../tools/plugin/stage-workspace.mjs', import.meta.url)), path.join(fixture, 'tools/plugin/stage-workspace.mjs'));
    symlinkSync(outside, path.join(fixture, 'dist'), process.platform === 'win32' ? 'junction' : 'dir');
    const result = spawnSync(process.execPath, [path.join(fixture, 'tools/plugin/stage-workspace.mjs')], { windowsHide: true, encoding: 'utf8', timeout: 10000 });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /INVALID_BUILD_DESTINATION/);
    assert.equal(readFileSync(marker, 'utf8'), 'PRESERVE_EXTERNAL_CONTENT');
  } finally {
    assert.equal(path.dirname(base), path.resolve(tmpdir()));
    assert.match(path.basename(base), /^desktop-control-stage-/);
    rmSync(base, { recursive: true, force: true });
  }
});
