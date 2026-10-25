import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir, userInfo } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import { buildDesktopHelper, createDesktopController, defaultHelperPath } from '../controller.mjs';

const enabled = process.platform === 'win32' && process.env.DC_DESKTOP_INTERACTIVE_TEST === '1';
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
async function waitFor(check, timeout = 8000) {
  const deadline = Date.now() + timeout;
  do { if (await check()) return; await delay(50); } while (Date.now() < deadline);
  throw new Error('INTERACTIVE_OBSERVATION_TIMEOUT');
}
function leaveStopped(stopFile) {
  try { writeFileSync(stopFile, 'STOPPED\n', { flag: 'wx', mode: 0o600 }); }
  catch (error) { if (error.code !== 'EEXIST') throw Error('STOP_MARKER_CLEANUP_FAILED', { cause: error }); }
}
function removeFixtureDirectory(directory) {
  const target = path.resolve(directory);
  if (path.dirname(target) !== path.resolve(tmpdir()) || !path.basename(target).startsWith('desktop-control-owned-fixture-')) throw Error('UNSAFE_TEST_CLEANUP');
  rmSync(target, { recursive: true, force: true });
}
function fixtureClient(executable) {
  // This is the explicitly opt-in visible fixture, not a hidden background helper.
  const child = spawn(executable, [], { windowsHide: false, stdio: ['pipe', 'pipe', 'pipe'] });
  child.stderr.resume();
  let nextId = 1, readyResolve, readyReject;
  const pending = new Map();
  const ready = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
  const readyTimer = setTimeout(() => readyReject(Error('FIXTURE_START_TIMEOUT')), 30_000);
  function fail(code) {
    readyReject(Error(code));
    for (const value of pending.values()) { clearTimeout(value.timer); value.reject(Error(code)); }
    pending.clear();
  }
  child.on('error', () => fail('FIXTURE_PROCESS_ERROR'));
  child.on('exit', () => fail('FIXTURE_EXITED'));
  child.stdin.on('error', () => fail('FIXTURE_STDIN_ERROR'));
  const lines = createInterface({ input: child.stdout });
  lines.on('line', line => {
    if (line.length > 4096) { fail('FIXTURE_PROTOCOL'); child.kill(); return; }
    let message; try { message = JSON.parse(line); } catch { fail('FIXTURE_PROTOCOL'); child.kill(); return; }
    if (message.event === 'ready') { clearTimeout(readyTimer); readyResolve(); return; }
    if (message.event === 'failed') { clearTimeout(readyTimer); fail('FIXTURE_INITIALIZATION_FAILED'); return; }
    const request = pending.get(message.id); if (!request) return;
    pending.delete(message.id); clearTimeout(request.timer);
    if (message.ok === true) request.resolve(message.result); else request.reject(Error(/^[A-Z_]+$/.test(message.error) ? message.error : 'FIXTURE_REQUEST_FAILED'));
  });
  return {
    ready,
    request(action, values = {}) {
      const id = nextId++;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { pending.delete(id); reject(Error('FIXTURE_REQUEST_TIMEOUT')); }, 15_000);
        pending.set(id, { resolve, reject, timer });
        child.stdin.write(JSON.stringify({ id, action, ...values }) + '\n');
      });
    },
    async close() {
      clearTimeout(readyTimer); lines.close(); child.stdin.end();
      if (child.exitCode === null) await new Promise(resolve => {
        const timer = setTimeout(() => { child.kill(); resolve(); }, 1500);
        child.once('exit', () => { clearTimeout(timer); resolve(); });
      });
    },
  };
}

test('OPT-IN owned Windows fixture: input, banner, cursor, EOF, watchdog and durable Escape stop',
  { skip: !enabled, timeout: 180_000 }, async t => {
    // No provisioning, compilation, visible window or input occurs unless the explicit opt-in above is set.
    const { createPrivateControlAuthority, provisionPrivateControl } = await import('../../../dist/packages/mcp-server/src/bridge/private-grants.mjs');
    assert.notEqual(provisionPrivateControl('status').state, 'active', 'ACTIVE_CONTROL_POLICY: revoke it locally before an isolated interactive test');
    let directory, fixture, ownsGrant = false;
    const controllers = [], cleanupErrors = [];
    async function cleanup(action, code) {
      try { await action(); } catch { cleanupErrors.push(code); t.diagnostic(code); }
    }
    const stopFile = path.join(userInfo().homedir, '.desktop-control-private', 'desktop-stop');
    let helper, launches = 0, emergencies = 0, emergencyResolve;
    const emergency = new Promise(resolve => { emergencyResolve = resolve; });
    try {
      buildDesktopHelper();
      directory = mkdtempSync(path.join(tmpdir(), 'desktop-control-owned-fixture-'));
      const executable = path.join(directory, 'owned-fixture.exe');
      execFileSync('C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe', ['/nologo', '/platform:x64', '/target:exe',
        '/reference:System.Windows.Forms.dll', '/reference:System.Drawing.dll', '/reference:System.Web.Extensions.dll', `/out:${executable}`,
        fileURLToPath(new URL('./OwnedDesktopFixture.cs', import.meta.url))], { windowsHide: true, timeout: 30_000, stdio: 'pipe' });
      fixture = fixtureClient(executable); await fixture.ready;
      if (process.env.DC_DESKTOP_WAIT_FOR_FOCUS === '1') {
        process.stdout.write('READY_FOR_FOCUS: activate the Desktop Control owned test fixture within 60 seconds\n');
        await waitFor(async () => {
          try { return (await fixture.request('guard')).foreground === true; }
          catch (error) { if (error.message === 'FIXTURE_NOT_FOREGROUND') return false; throw error; }
        }, 60_000);
        process.stdout.write('OWNED_FIXTURE_FOREGROUND_CONFIRMED\n');
      }
      ownsGrant = true;
      assert.equal(provisionPrivateControl('grant', ['desktop.input']).state, 'active');
      const authority = createPrivateControlAuthority();
      const baseline = (await fixture.request('cursor')).hash;
      assert.match(baseline, /^[a-f0-9]{64}$/);
      function controller() {
        const value = createDesktopController({
          requestTimeoutMs: 30_000,
          async authorize(capability) {
            if (!authority.authorize(capability)) throw Error('PERMISSION_DENIED');
            // Fresh own-window guard before every admitted command/chunk and idle authorization poll.
            assert.equal((await fixture.request('guard')).foreground, true);
          },
          spawnHelper(executable, args, options) {
            assert.equal(executable, defaultHelperPath);
            helper = spawn(executable, args, options); launches++; return helper;
          },
          onEmergencyStop() { emergencies++; provisionPrivateControl('revoke'); emergencyResolve(); },
        });
        controllers.push(value); return value;
      }
      // 1. Actual click and text are limited to the foreground owned fixture.
      const button = await fixture.request('focus', { control: 'button' });
      const first = controller(); assert.equal((await first.start()).active, true);
      assert.notEqual((await fixture.request('cursor')).hash, baseline);
      assert.equal((await fixture.request('banner', { pid: helper.pid })).visible, true);
      const firstPid = helper.pid;
      const edges = await fixture.request('edges', { pid: firstPid });
      assert.equal(edges.count, edges.monitors * 4);
      assert.equal(edges.clickThrough, true); assert.equal(edges.nonActivating, true);
      assert.equal(edges.geometryValid, true); assert.equal(edges.completeScreens, true);
      t.diagnostic('Four native blue edges observed on ' + edges.monitors + ' actual monitor(s); no additional monitor hardware claimed.');
      await first.click({ x: button.x, y: button.y });
      await waitFor(async () => (await fixture.request('counts')).clicks === 1);
      await fixture.request('focus', { control: 'textbox' });
      const ownedText = 'Desktop Control owned fixture 0123456789';
      await first.typeText({ text: ownedText });
      await waitFor(async () => (await fixture.request('counts')).textLength === ownedText.length);
      await first.stop();
      await waitFor(async () => (await fixture.request('cursor')).hash === baseline);
      await waitFor(async () => (await fixture.request('edges', { pid: firstPid })).count === 0);
      assert.equal(emergencies, 0);
      // 2. Force only the captured helper PID; its independent watchdog must restore cursor resources.
      await fixture.request('focus', { control: 'button' });
      const second = controller(); await second.start();
      assert.notEqual((await fixture.request('cursor')).hash, baseline);
      const secondPid = helper.pid;
      assert.equal((await fixture.request('edges', { pid: secondPid })).count, edges.monitors * 4);
      const ownedHelper = helper; assert.ok(ownedHelper.pid > 0); ownedHelper.kill();
      await waitFor(async () => (await fixture.request('cursor')).hash === baseline);
      await waitFor(async () => (await fixture.request('edges', { pid: secondPid })).count === 0);
      await second.stop();
      // 3. Only the independent fixture may inject Escape. The product hook must persist/revoke/deny.
      await fixture.request('focus', { control: 'textbox' });
      const third = controller(); await third.start();
      assert.equal((await fixture.request('banner', { pid: helper.pid })).visible, true);
      const thirdPid = helper.pid;
      assert.equal((await fixture.request('edges', { pid: thirdPid })).count, edges.monitors * 4);
      await fixture.request('escape');
      await Promise.race([emergency, delay(5000).then(() => { throw Error('ESCAPE_CALLBACK_TIMEOUT'); })]);
      assert.equal(emergencies, 1);
      assert.equal(existsSync(stopFile), true);
      assert.equal(authority.authorize('desktop.input'), null);
      assert.equal(provisionPrivateControl('status').state, 'denied');
      await assert.rejects(() => third.click({ x: button.x, y: button.y }), /DESKTOP_STOPPED/);
      const beforeDenied = launches, denied = controller();
      await assert.rejects(() => denied.start(), /PERMISSION_DENIED/);
      assert.equal(launches, beforeDenied);
      await waitFor(async () => (await fixture.request('cursor')).hash === baseline);
      await waitFor(async () => (await fixture.request('edges', { pid: thirdPid })).count === 0);
    } finally {
      for (const value of controllers) await cleanup(() => value.stop(), 'CONTROLLER_CLEANUP_FAILED');
      if (ownsGrant) {
        await cleanup(() => provisionPrivateControl('revoke'), 'CONTROL_REVOKE_CLEANUP_FAILED');
        // Never re-enable after a test. Exclusive creation cannot overwrite an existing stop marker.
        await cleanup(() => leaveStopped(stopFile), 'STOP_MARKER_CLEANUP_FAILED');
      }
      if (fixture) await cleanup(() => fixture.close(), 'FIXTURE_CLOSE_FAILED');
      if (directory) await cleanup(() => removeFixtureDirectory(directory), 'FIXTURE_DIRECTORY_CLEANUP_FAILED');
    }
    assert.deepEqual(cleanupErrors, []);
  });
