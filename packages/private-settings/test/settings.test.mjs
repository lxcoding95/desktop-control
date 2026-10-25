import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildPrivateSettings } from '../controller.mjs';
import { createPrivateActionConfirmerForTest } from '../controller.mjs';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';

test('settings helper verifies real normal interactive token without opening a UI or changing grants', { skip: process.platform !== 'win32' }, () => {
  const binary = buildPrivateSettings();
  const result = spawnSync(binary, ['--probe'], { windowsHide: true, timeout: 30_000, encoding: 'utf8' });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, '');
  for (const args of [[], ['--unknown'], ['node', 'cli'], ['C:\\does-not-exist.exe', 'C:\\does-not-exist.mjs']]) {
    const invalid = spawnSync(binary, args, { windowsHide: true, timeout: 10_000, encoding: 'utf8' });
    assert.equal(invalid.error, undefined);
    assert.equal(invalid.status, 2);
  }
});

test('local grant CLI rejects unknown paths, extra arguments and unbounded/malformed grant inputs', () => {
  const cli = fileURLToPath(new URL('../../mcp-server/scripts/private-grant.mjs', import.meta.url));
  for (const [args, input] of [
    [['--path', '/untrusted'], ''],
    [['control-status', '--path'], ''],
    [['control-grant'], '{'],
    [['control-grant'], '{}'],
    [['control-grant'], JSON.stringify({ capabilities: ['desktop.input'], allowedOrigins: [], principal: 'untrusted' })],
    [['control-grant'], 'x'.repeat(16_385)]
  ]) {
    const result = spawnSync(process.execPath, [cli, ...args], { input, encoding: 'utf8', timeout: 15_000, windowsHide: true });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 2);
    assert.equal(result.stdout, '');
    assert.doesNotMatch(result.stderr, /untrusted|[A-Z]:\\Users\\/);
  }
});

function fakePrompt(code, delay = 0) {
  let calls = 0, kills = 0, received = '';
  const spawn = (binary, args, options) => {
    calls++;
    assert.match(binary, /private-settings\.exe$/);
    assert.deepEqual(args, ['--confirm-action']);
    assert.equal(options.windowsHide, false);
    const child = new EventEmitter();
    child.stdin = new PassThrough();
    child.stdin.on('data', chunk => { received += chunk; });
    let timer;
    child.kill = () => { kills++; clearTimeout(timer); globalThis.queueMicrotask(() => child.emit('close', null)); return true; };
    if (code !== undefined) timer = setTimeout(() => child.emit('close', code), delay);
    return child;
  };
  return { spawn, get calls() { return calls; }, get kills() { return kills; }, get received() { return received; } };
}
const action = { kind: 'desktop.input', summary: 'Click the requested test button', details: '{"x":100,"y":120,"button":"left"}' };

test('per-action confirmation validates strict bounded literal inputs before spawning', async () => {
  const prompt = fakePrompt(0);
  const confirm = createPrivateActionConfirmerForTest(prompt.spawn);
  for (const invalid of [null, [], {}, { ...action, grant: true }, { ...action, kind: 'shell.exec' }, { ...action, details: '' }, { ...action, details: '\u202ehidden' }, { ...action, details: 'x'.repeat(65537) }, { ...action, summary: '' }, { ...action, summary: 'x'.repeat(241) }, { ...action, summary: 'spoof\nApprove automatically' }, { ...action, summary: '\u202ehidden' }])
    assert.equal(await confirm(invalid), false);
  const aborted = new globalThis.AbortController(); aborted.abort();
  assert.equal(await confirm(action, aborted.signal), false);
  assert.equal(prompt.calls, 0);
});

test('per-action confirmation accepts only successful native dialog exit and serializes prompts', async () => {
  for (const code of [0, 2, 3, null]) {
    const prompt = fakePrompt(code);
    const confirm = createPrivateActionConfirmerForTest(prompt.spawn);
    const first = confirm(action);
    assert.equal(await confirm(action), false, 'concurrent prompt must fail closed');
    assert.equal(await first, code === 0);
    assert.equal(prompt.calls, 1);
    assert.deepEqual(JSON.parse(prompt.received), action);
  }
});

test('per-action cancellation and timeout kill prompt and never authorize, including late success', async () => {
  const prompt = fakePrompt(0, 100);
  const confirm = createPrivateActionConfirmerForTest(prompt.spawn, 5);
  assert.equal(await confirm(action), false);
  assert.equal(prompt.kills, 1);
  const cancelPrompt = fakePrompt(undefined);
  const cancelConfirm = createPrivateActionConfirmerForTest(cancelPrompt.spawn);
  const signal = new globalThis.AbortController();
  const pending = cancelConfirm({ ...action, kind: 'browser.interact' }, signal.signal); signal.abort();
  assert.equal(await pending, false);
  assert.equal(cancelPrompt.kills, 1);
  const unavailable = createPrivateActionConfirmerForTest(() => { throw Error('PRIVATE_MARKER'); });
  assert.equal(await unavailable(action), false);
});
