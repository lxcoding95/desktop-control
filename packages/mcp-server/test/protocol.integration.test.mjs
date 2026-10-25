import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { listenerQuery, windowsListenerCount } from './fixtures/windows-listeners.mjs';
import { once } from 'node:events';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const fixture = fileURLToPath(new URL('./fixtures/status-server.mjs', import.meta.url));
const meta = {
  'io.modelcontextprotocol/protocolVersion': '2026-07-28',
  'io.modelcontextprotocol/clientInfo': { name: 's02-independent-verification', version: '1' },
  'io.modelcontextprotocol/clientCapabilities': {}
};
function launch(mode) {
  const args = mode ? [fixture, mode] : ['dist/packages/mcp-server/src/index.mjs'];
  const child = spawn(process.execPath, args, { cwd: root, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  let stderr = '', buffer = '', nextId = 0, closed = false;
  const pending = new Map();
  const messages = [];
  const done = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code, signal) => { closed = true; resolve({ code, signal }); });
  });
  child.stdin.on('error', () => {});
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', chunk => { stderr += chunk; });
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', chunk => {
    buffer += chunk;
    let end;
    while ((end = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
      try {
        const message = JSON.parse(line); messages.push(message);
        const waiter = pending.get(message.id);
        if (waiter) { clearTimeout(waiter.timer); pending.delete(message.id); waiter.resolve(message); }
      } catch (error) {
        for (const waiter of pending.values()) { clearTimeout(waiter.timer); waiter.reject(error); }
        pending.clear();
      }
    }
  });
  function request(method, params = {}) {
    const id = ++nextId;
    const promise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(id); reject(Error(`Timed out: ${method}`)); }, 5000);
      pending.set(id, { resolve, reject, timer });
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params: { ...params, _meta: meta } }) + '\n');
    });
    return { id, promise };
  }
  async function close() {
    child.stdin.end();
    let timer;
    try { return await Promise.race([done, new Promise((_, reject) => { timer = setTimeout(() => reject(Error('EOF timeout')), 5000); })]); }
    finally {
      clearTimeout(timer);
      for (const waiter of pending.values()) clearTimeout(waiter.timer);
      if (!closed) child.kill();
      await done;
    }
  }
  function abandon(id) {
    const waiter = pending.get(id);
    if (waiter) { clearTimeout(waiter.timer); pending.delete(id); waiter.resolve({ locallyCancelled: true }); }
  }
  return { child, request, close, done, abandon, messages, get stderr() { return stderr; }, get buffer() { return buffer; } };
}

async function discover(s) {
  const response = await s.request('server/discover').promise;
  assert.equal(response.error, undefined);
  assert.ok(response.result.supportedVersions.includes('2026-07-28'));
}

for (const mode of ['allowed', 'denied', 'expired', 'revoked', 'error']) {
  test(`actual SDK stdio fixture ${mode}: result, adapter count, redaction and EOF`, async () => {
    const s = launch(mode);
    try {
      await discover(s);
      const response = await s.request('tools/call', { name: 'desktop_control.status', arguments: {} }).promise;
      if (mode === 'allowed') {
        assert.equal(response.result.isError, undefined);
        assert.deepEqual(response.result.structuredContent, { service: 'desktop-control', ready: true, api_version: 1 });
      } else {
        assert.equal(response.result.isError, true);
        assert.equal(response.result.content[0].text, mode === 'error' ? 'INTERNAL_ERROR' : 'PERMISSION_DENIED');
      }
      assert.doesNotMatch(JSON.stringify(s.messages), /S02_TEST_PRIVATE_MARKER/);
      assert.equal((await s.close()).code, 0);
      assert.equal((s.stderr.match(/S02_ADAPTER_CALL:/g) ?? []).length, ['allowed','error'].includes(mode) ? 1 : 0);
      assert.doesNotMatch(s.stderr, /S02_TEST_PRIVATE_MARKER/);
      assert.equal(s.buffer, '');
    } finally { await s.close(); }
  });
}

test('production built entry on Windows: malformed input, no TCP listener and EOF', { skip: process.platform !== 'win32' }, async () => {
  const s = launch();
  try {
    await discover(s);
    s.child.stdin.write('{malformed json}\n');
    assert.equal((await s.request('tools/list').promise).result.tools.length, 1);
    const bad = await s.request('tools/call', { name: 'desktop_control.status', arguments: [] }).promise;
    assert.ok(bad.error || bad.result?.isError);
    assert.equal(windowsListenerCount(s.child.pid), 0);
    assert.equal((await s.close()).code, 0);
    assert.equal(s.buffer, '');
  } finally { await s.close(); }
});

test('Windows listener oracle detects real TCP/UDP endpoints and fails closed on query errors', { skip: process.platform !== 'win32' }, async () => {
  const child = spawn(process.execPath, ['--input-type=module', '-e',
    `import net from 'node:net'; import dgram from 'node:dgram'; const t=net.createServer(); const u=dgram.createSocket('udp4'); t.listen(0,'127.0.0.1',()=>u.bind(0,'127.0.0.1',()=>console.log('READY'))); process.stdin.resume(); process.stdin.on('end',()=>{t.close();u.close();});`],
  { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  const done = once(child, 'close');
  let timer;
  try {
    await Promise.race([once(child.stdout, 'data'), new Promise((_, reject) => { timer = setTimeout(() => reject(Error('Listener control startup timeout')), 5000); })]);
    clearTimeout(timer);
    assert.ok(windowsListenerCount(child.pid) >= 2);
    for (const cmd of ['Get-NetTCPConnection', 'Get-NetUDPEndpoint']) {
      const script = `Import-Module NetTCPIP -ErrorAction Stop; function ${cmd} { Write-Error 'test query failure' }; ${listenerQuery(child.pid)}`;
      assert.throws(() => execFileSync('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script],
        { windowsHide: true, timeout: 30000, stdio: ['ignore', 'pipe', 'pipe'] }), error => error.status === 2);
    }
    child.stdin.end();
    timer = setTimeout(() => child.kill(), 5000);
    assert.deepEqual(await done, [0, null]);
  } finally { clearTimeout(timer); if (child.exitCode === null) child.kill(); await done; }
});

test('production built entry: unterminated input exceeding SDK 10 MiB bound terminates', async () => {
  const s = launch();
  try {
    await discover(s);
    s.child.stdin.write('x'.repeat(11 * 1024 * 1024), () => {});
    // No EOF: distinguish the SDK buffer bound from ordinary EOF shutdown.
    let timer;
    try {
      const exit = await Promise.race([s.done, new Promise((_, reject) => { timer = setTimeout(() => reject(Error('Oversized input did not terminate within 5 s')), 5000); })]);
      assert.equal(exit.code, 0);
    } finally { clearTimeout(timer); }
    assert.equal(s.buffer, '');
    assert.doesNotMatch(JSON.stringify(s.messages), /xxxxx/);
  } finally { await s.close(); }
});

test('actual SDK stdio fixture cancellation of in-flight adapter and subsequent liveness', async () => {
  const s = launch('pending');
  try {
    await discover(s);
    const call = s.request('tools/call', { name: 'desktop_control.status', arguments: {} });
    // Wait for observable adapter invocation, then cancel the actual request on the wire.
    const end = Date.now() + 3000;
    while (!s.stderr.includes('S02_ADAPTER_CALL:1') && Date.now() < end) await new Promise(resolve => setTimeout(resolve, 10));
    assert.match(s.stderr, /S02_ADAPTER_CALL:1/);
    s.child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/cancelled', params: { requestId: call.id, _meta: meta } }) + '\n');
    // SDK Protocol._onrequest suppresses replies after abort (installed SDK source).
    // The original oracle requiring a CANCELLED wire reply was incorrect.
    s.abandon(call.id);
    await call.promise;
    assert.equal((await s.request('tools/list').promise).result.tools.length, 1);
    assert.equal((await s.close()).code, 0);
    assert.equal(s.messages.some(message => message.id === call.id), false);
  } finally { await s.close(); }
});
