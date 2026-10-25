import test from 'node:test';
import assert from 'node:assert/strict';
import { createDesktopController } from '../controller.mjs';

test('mandatory host authorization is never optional', () => {
  assert.throws(() => createDesktopController(), /AUTHORIZATION_REQUIRED/);
  assert.throws(() => createDesktopController({ authorize() {}, protectedProcessIds: ['123'] }), /INVALID_PROTECTED_PIDS/);
  assert.throws(() => createDesktopController({ authorize() {}, requestTimeoutMs: 99 }), /INVALID_TIMEOUT/);
});

test('denied authorization prevents native start and every input/read', async () => {
  const capabilities = [];
  const controller = createDesktopController({ helperPath: 'must-never-be-launched.exe', authorize(capability) { capabilities.push(capability); throw Error('DENIED'); } });
  for (const operation of [() => controller.start(), () => controller.screenshot(), () => controller.move({ x: 10, y: 10 }),
    () => controller.click(), () => controller.key({ key: 'Enter' }), () => controller.typeText({ text: 'fixture' })]) await assert.rejects(operation, /DENIED/);
  assert.deepEqual(capabilities, ['desktop.input', 'desktop.read', 'desktop.input', 'desktop.input', 'desktop.input', 'desktop.input']);
  await controller.stop();
});

test('invalid text, coordinates, mouse buttons and unsupported keys never reach policy or native', async () => {
  const controller = createDesktopController({ authorize() { assert.fail('invalid action reached authorization'); } });
  await assert.rejects(() => controller.typeText({ text: 'x'.repeat(8193) }), /INVALID_TEXT/);
  await assert.rejects(() => controller.typeText({ text: '€'.repeat(2731) }), /INVALID_TEXT/);
  await assert.rejects(() => controller.move({ x: NaN, y: 0 }), /INVALID_COORDINATES/);
  await assert.rejects(() => controller.click({ x: 0 }), /INVALID_COORDINATES/);
  await assert.rejects(() => controller.click({ button: 'extra' }), /INVALID_BUTTON/);
  await assert.rejects(() => controller.key({ key: 'Escape' }), /INVALID_KEY/);
});

test('queued operations recheck authorization instead of caching an earlier approval', async () => {
  let checks = 0;
  const controller = createDesktopController({ authorize() { checks++; throw Error(checks === 1 ? 'FIRST_DENIED' : 'REVOKED'); } });
  const first = controller.screenshot(), second = controller.click({ x: 1, y: 1 });
  await assert.rejects(first, /FIRST_DENIED/);
  await assert.rejects(second, /REVOKED/);
  assert.equal(checks, 2);
});

test('explicit stop is local and does not need a fresh grant', async () => {
  const controller = createDesktopController({ authorize() { assert.fail('stop queried permission'); } });
  await controller.stop();
  await assert.rejects(() => controller.screenshot(), /DESKTOP_STOPPED/);
  await assert.rejects(() => controller.start(), /DESKTOP_STOPPED/);
});

test('stop during pending authorization prevents launching helper afterwards', async () => {
  let release;
  const waiting = new Promise(resolve => { release = resolve; });
  const controller = createDesktopController({ helperPath: 'must-never-be-launched.exe', authorize: () => waiting });
  const reading = controller.screenshot();
  await Promise.resolve(); await controller.stop(); release();
  await assert.rejects(reading, /DESKTOP_STOPPED/);
});

// OS spawning is replaced only here to force transport faults deterministically.
const windowsOnly = { skip: process.platform !== 'win32' };
test('native stdin failure fails closed and never launches a replacement', windowsOnly, async () => {
  const { transportFixture } = await import('./transport-fixture.mjs');
  let launches = 0;
  const child = transportFixture((request, process) => process.stdin.emit('error', Error('private EPIPE detail')));
  const controller = createDesktopController({ authorize() {}, helperPath: 'TEST_ONLY_DO_NOT_EXECUTE', spawnHelper() { launches++; return child; } });
  await assert.rejects(() => controller.start(), /HELPER_UNAVAILABLE/);
  await assert.rejects(() => controller.click(), /DESKTOP_STOPPED/);
  assert.equal(launches, 1);
  assert.notEqual(child.exitCode, null);
  await controller.stop();
});

test('malformed native reply stops helper and future input', windowsOnly, async () => {
  const { transportFixture } = await import('./transport-fixture.mjs');
  const child = transportFixture((request, process) => process.stdout.write('null\n'));
  const controller = createDesktopController({ authorize() {}, helperPath: 'TEST_ONLY_DO_NOT_EXECUTE', spawnHelper: () => child });
  await assert.rejects(() => controller.start(), /HELPER_PROTOCOL/);
  await assert.rejects(() => controller.click(), /DESKTOP_STOPPED/);
  await controller.stop();
});

test('authorization revocation after activation stops active helper', windowsOnly, async () => {
  const { transportFixture } = await import('./transport-fixture.mjs');
  const child = transportFixture((request, process) => process.stdout.write(JSON.stringify({ id: request.id, ok: true, result: { active: true } }) + '\n'));
  let granted = true;
  const controller = createDesktopController({ authorize() { if (!granted) throw Error('REVOKED'); }, helperPath: 'TEST_ONLY_DO_NOT_EXECUTE', spawnHelper: () => child });
  await controller.start(); granted = false;
  await assert.rejects(() => controller.click(), /REVOKED/);
  assert.notEqual(child.exitCode, null);
  await assert.rejects(() => controller.start(), /DESKTOP_STOPPED/);
});

test('oversized unterminated native output is bounded and fails closed', windowsOnly, async () => {
  const { transportFixture } = await import('./transport-fixture.mjs');
  const child = transportFixture((request, process) => process.stdout.write('x'.repeat(6 * 1024 * 1024 + 1)));
  const controller = createDesktopController({ authorize() {}, helperPath: 'TEST_ONLY_DO_NOT_EXECUTE', spawnHelper: () => child });
  await assert.rejects(() => controller.start(), /HELPER_PROTOCOL/);
  assert.notEqual(child.exitCode, null);
});


test('unknown transport configuration is rejected instead of silently using real desktop', () => {
  assert.throws(() => createDesktopController({ authorize() {}, spwanHelper() {} }), /INVALID_CONFIGURATION/);
});

test('emergency native event revokes once and prevents every queued action', windowsOnly, async () => {
  const { transportFixture } = await import('./transport-fixture.mjs');
  let revoked = 0;
  const child = transportFixture((request, process) => process.stdout.write(JSON.stringify({ event: 'emergencyStop' }) + '\n'));
  const controller = createDesktopController({ authorize() {}, helperPath: 'TEST_ONLY_DO_NOT_EXECUTE', spawnHelper: () => child, onEmergencyStop() { revoked++; } });
  const starting = controller.start(), queued = controller.click();
  await assert.rejects(starting, /DESKTOP_STOPPED/);
  await assert.rejects(queued, /DESKTOP_STOPPED/);
  await Promise.resolve();
  assert.equal(revoked, 1);
  assert.notEqual(child.exitCode, null);
});

test('spawn exception fails closed with a redacted error', windowsOnly, async () => {
  const controller = createDesktopController({ authorize() {}, helperPath: 'TEST_ONLY_DO_NOT_EXECUTE', spawnHelper() { throw Error('private path'); } });
  await assert.rejects(() => controller.start(), /HELPER_UNAVAILABLE/);
  await assert.rejects(() => controller.click(), /DESKTOP_STOPPED/);
});

test('idle active session detects revocation and terminates without another input request', windowsOnly, async () => {
  const { transportFixture } = await import('./transport-fixture.mjs');
  let granted = true, checks = 0;
  const child = transportFixture((request, process) => process.stdout.write(JSON.stringify({ id: request.id, ok: true, result: { active: true } }) + '\n'));
  const controller = createDesktopController({ authorize() { checks++; if (!granted) throw Error('REVOKED'); }, helperPath: 'TEST_ONLY_DO_NOT_EXECUTE', spawnHelper: () => child });
  await controller.start(); granted = false;
  await new Promise((resolve, reject) => { const deadline = setTimeout(() => reject(Error('revocation monitor did not stop helper')), 1500); child.once('exit', () => { clearTimeout(deadline); resolve(); }); });
  assert.ok(checks >= 2);
  await assert.rejects(() => controller.click(), /DESKTOP_STOPPED/);
});

test('long text checks fresh authorization before each bounded chunk', windowsOnly, async () => {
  const { transportFixture } = await import('./transport-fixture.mjs');
  let checks = 0; const actions = [];
  const child = transportFixture((request, process) => { actions.push(request); process.stdout.write(JSON.stringify({ id: request.id, ok: true, result: { active: true } }) + '\n'); });
  const controller = createDesktopController({ authorize() { if (++checks === 3) throw Error('REVOKED'); }, helperPath: 'TEST_ONLY_DO_NOT_EXECUTE', spawnHelper: () => child });
  await controller.start();
  await assert.rejects(() => controller.typeText({ text: 'x'.repeat(100) }), /REVOKED/);
  assert.equal(actions.length, 2);
  assert.ok(actions[1].text.length <= 32);
  assert.notEqual(child.exitCode, null);
});
