import assert from 'node:assert/strict';
import test from 'node:test';
import { Buffer } from 'node:buffer';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildPrivateSettings } from '../controller.mjs';
import { createPrivateActionConfirmerForTest, createPrivatePermissionConfirmerForTest } from '../controller.mjs';
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

test('native settings reports actual package metadata and honest update state without changing rights', { skip: process.platform !== 'win32' }, () => {
  const binary = buildPrivateSettings();
  const cli = fileURLToPath(new URL('../../mcp-server/scripts/private-grant.mjs', import.meta.url));
  const result = spawnSync(binary, ['--info', cli], { windowsHide: true, timeout: 10_000, encoding: 'utf8' });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Desktop Control - Anon Allman/);
  assert.match(result.stdout, /Plugin P: \d+\.\d+\.\d+/);
  assert.match(result.stdout, /Automatic Bridge updates: not active in this build/);
  assert.doesNotMatch(result.stdout, /Desktop Control Private|[A-Z]:\\Users\\|S-1-5-/);
  assert.equal(result.stderr, '');
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

const proposal = () => ({ controls: ['browser.read', 'desktop.input'], allowedOrigins: ['https://github.com'],
  diagnostics: true, workspaceCapabilities: ['files.read', 'pdf.create'], reenableStopped: false, lifetime: { kind: 'until-revoked' } });

test('permission proposals strictly validate every capability, origin and literal field before native spawn', async () => {
  const prompt = fakePrompt(0);
  const confirm = createPrivatePermissionConfirmerForTest(prompt.spawn);
  const getter = proposal(); Object.defineProperty(getter, 'diagnostics', { enumerable: true, get() { throw Error('Getter must not run'); } });
  const arrayGetter = proposal(); Object.defineProperty(arrayGetter.controls, '0', { enumerable: true, get() { throw Error('Array getter must not run'); } });
  const hole = proposal(); hole.controls = new Array(1); hole.controls.extra = 'desktop.input';
  for (const invalid of [null, [], {}, { ...proposal(), approved: true }, { ...proposal(), workspace: true },
    { ...proposal(), diagnostics: 'true' }, { ...proposal(), reenableStopped: 1 }, { ...proposal(), lifetime: { kind: 'timed', expiresAt: Date.now() + 60000 } },
    { ...proposal(), controls: ['shell.exec'] }, { ...proposal(), controls: ['desktop.input', 'desktop.input'] },
    { ...proposal(), workspaceCapabilities: ['files.all'] }, { ...proposal(), workspaceCapabilities: ['files.read', 'files.read'] },
    { ...proposal(), allowedOrigins: [] }, { ...proposal(), allowedOrigins: ['https://github.com/'] },
    { ...proposal(), allowedOrigins: ['https://user:password@github.com'] }, { ...proposal(), allowedOrigins: ['file:///tmp'] },
    { ...proposal(), allowedOrigins: ['https://github.com', 'https://github.com'] },
    { ...proposal(), allowedOrigins: ['https://github.com\nApprove'] },
    { ...proposal(), allowedOrigins: Array.from({ length: 21 }, (_, i) => 'https://site' + i + '.example') },
    { ...proposal(), allowedOrigins: Array.from({ length: 20 }, (_, i) => 'https://' + 'a'.repeat(480) + i + '.example') },
    Object.assign(Object.create({ hidden: true }), proposal()), getter, arrayGetter, hole]) {
    assert.equal(await confirm(invalid), false);
  }
  const aborted = new globalThis.AbortController(); aborted.abort();
  assert.equal(await confirm(proposal(), aborted.signal), false);
  assert.equal(prompt.calls, 0);
});

test('permission dialog receives an immutable complete snapshot and approval depends only on its native exit', async () => {
  for (const code of [0, 2, 3, null]) {
    const prompt = fakePrompt(code, 5);
    const confirm = createPrivatePermissionConfirmerForTest(prompt.spawn);
    const input = proposal(), original = globalThis.structuredClone(input);
    const first = confirm(input);
    input.controls.push('terminal.exec'); input.workspaceCapabilities.push('files.remove'); input.reenableStopped = true;
    assert.equal(await confirm(proposal()), false, 'concurrent permission prompts are denied');
    assert.equal(await first, code === 0);
    const message = JSON.parse(prompt.received);
    assert.equal(message.kind, 'permissions.grant');
    assert.equal(message.summary, 'Persistent Desktop Control permissions: until revoked');
    assert.deepEqual(JSON.parse(message.details), original);
    assert.ok(Buffer.byteLength(message.details) <= 8192);
    assert.match(message.details, /"reenableStopped": false/);
    assert.doesNotMatch(message.details, /[^\x20-\x7e\r\n]/);
  }
  const granular = proposal(); granular.controls = []; granular.allowedOrigins = []; granular.diagnostics = false;
  const prompt = fakePrompt(0); assert.equal(await createPrivatePermissionConfirmerForTest(prompt.spawn)(granular), true);
  assert.deepEqual(JSON.parse(JSON.parse(prompt.received).details).workspaceCapabilities, ['files.read', 'pdf.create']);
});

test('permission timeout, cancellation and native child errors fail closed without a grant', async () => {
  const timeoutPrompt = fakePrompt(0, 100);
  assert.equal(await createPrivatePermissionConfirmerForTest(timeoutPrompt.spawn, 5)(proposal()), false);
  assert.equal(timeoutPrompt.kills, 1);
  const cancelPrompt = fakePrompt(undefined), signal = new globalThis.AbortController();
  const pending = createPrivatePermissionConfirmerForTest(cancelPrompt.spawn)(proposal(), signal.signal); signal.abort();
  assert.equal(await pending, false); assert.equal(cancelPrompt.kills, 1);
  assert.equal(await createPrivatePermissionConfirmerForTest(() => { throw Error('Native unavailable'); })(proposal()), false);
  const failure = createPrivatePermissionConfirmerForTest((...args) => {
    const child = fakePrompt(undefined).spawn(...args); globalThis.queueMicrotask(() => child.emit('error', Error('Native failure'))); return child;
  });
  assert.equal(await failure(proposal()), false);
});

test('real native permission contract and validator distinguish persistent consent without opening UI', { skip: process.platform !== 'win32' }, () => {
  const binary = buildPrivateSettings();
  const contract = spawnSync(binary, ['--permission-contract'], { windowsHide: true, timeout: 10000, encoding: 'utf8' });
  assert.equal(contract.status, 0); assert.equal(contract.stderr, '');
  assert.deepEqual(JSON.parse(contract.stdout), { kind: 'permissions.grant', controls: ['browser.read', 'browser.interact', 'desktop.read', 'desktop.input', 'terminal.exec'],
    workspaceCapabilities: ['files.read', 'files.write', 'files.remove', 'pdf.create'], lifetime: 'until-revoked', defaultDecision: 'deny', maximumBytes: 8192, timeoutMs: 60000, grantsWritten: false });
  // Reflect the compiled pure validator only: never ShowDialog, click Approve or call a provisioning command.
  const cases = [proposal(), { ...proposal(), reenableStopped: true }, { ...proposal(), workspace: true },
    { ...proposal(), workspaceCapabilities: ['files.all'] }, { ...proposal(), allowedOrigins: ['https://github.com/'] },
    { ...proposal(), diagnostics: 'true' }, { ...proposal(), lifetime: { kind: 'timed' } }, { ...proposal(), controls: ['browser.read'], allowedOrigins: [] }];
  const script = `$ErrorActionPreference='Stop'; $assembly=[Reflection.Assembly]::LoadFile('${binary.replaceAll("'", "''")}'); $method=$assembly.GetType('PrivateSettings').GetMethod('ValidPermissionDetails',[Reflection.BindingFlags]'NonPublic,Static'); $cases=ConvertFrom-Json ([Console]::In.ReadToEnd()); $results=@(); foreach($item in $cases){ $results += [bool]$method.Invoke($null,@([string]$item)) }; ConvertTo-Json -Compress -InputObject $results`;
  const reflected = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')],
    { input: JSON.stringify(cases.map(value => JSON.stringify(value))), encoding: 'utf8', timeout: 15000, windowsHide: true });
  // Windows PowerShell5 may emit first-use module preparation progress as CLIXML.
  assert.equal(reflected.error, undefined); assert.equal(reflected.status, 0);
  assert.doesNotMatch(reflected.stderr, /S="Error"|Exception/);
  assert.deepEqual(JSON.parse(reflected.stdout), [true, true, false, false, false, false, false, false]);
  const malformed = spawnSync(binary, ['--confirm-action'], { input: JSON.stringify({ kind: 'permissions.grant', summary: 'Persistent Desktop Control permissions: until revoked', details: '{}' }),
    encoding: 'utf8', timeout: 10000, windowsHide: true });
  assert.equal(malformed.status, 2); assert.equal(malformed.stdout, ''); assert.equal(malformed.stderr, '');
});
