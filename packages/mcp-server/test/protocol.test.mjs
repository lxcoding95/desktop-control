import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const meta = {
  'io.modelcontextprotocol/protocolVersion': '2026-07-28',
  'io.modelcontextprotocol/clientInfo': { name: 'desktop-control-test', version: '0.0.1' },
  'io.modelcontextprotocol/clientCapabilities': {}
};

/** An actual stdio JSON-RPC smoke test, not a substitute for the official Inspector. */
test('modern MCP stdio discovery, strict arguments, default denial and clean EOF', async () => {
  const child = spawn(process.execPath,
    ['--experimental-strip-types', 'packages/mcp-server/src/index.mts'],
    { cwd: root, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  let stdout = '', stderr = '', closed = false;
  const pending = new Map();
  let messageCount = 0;
  const done = new Promise((resolve) => {
    child.once('close', (code, signal) => { closed = true; resolve({ code, signal }); });
  });
  child.once('error', error => {
    for (const { reject } of pending.values()) reject(error);
    pending.clear();
  });
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', chunk => { stderr += chunk; if (stderr.length > 65_536) child.kill(); });
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', chunk => {
    stdout += chunk;
    if (stdout.length > 1_000_000) {
      child.kill();
      for (const { reject } of pending.values()) reject(Error('stdout exceeded bound'));
      pending.clear();
      return;
    }
    let lineEnd;
    while ((lineEnd = stdout.indexOf('\n')) !== -1) {
      const line = stdout.slice(0, lineEnd).trim();
      stdout = stdout.slice(lineEnd + 1);
      if (!line) continue;
      let message;
      try { message = JSON.parse(line); }
      catch {
        for (const { reject } of pending.values()) reject(Error('Non-protocol bytes on stdout'));
        pending.clear(); child.kill(); return;
      }
      messageCount++;
      const item = pending.get(message.id);
      if (item) { pending.delete(message.id); clearTimeout(item.timer); item.resolve(message); }
    }
  });
  let nextId = 0;
  async function request(method, params = {}) {
    const id = ++nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id); reject(Error(`${method} timed out; process closed=${closed}; stderr=${stderr.slice(-500)}`));
      }, 5_000);
      pending.set(id, { resolve, reject, timer });
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params: { ...params, _meta: meta } }) + '\n');
    });
  }
  try {
    const discover = await request('server/discover');
    assert.equal(discover.error, undefined, JSON.stringify(discover.error));
    assert.ok(discover.result?.supportedVersions?.includes('2026-07-28'));

    const list = await request('tools/list');
    assert.equal(list.error, undefined, JSON.stringify(list.error));
    assert.deepEqual(list.result?.tools?.map(item => item.name), ['desktop_control.status']);
    assert.deepEqual(list.result.tools[0].inputSchema?.properties ?? {}, {});

    const denied = await request('tools/call', { name: 'desktop_control.status', arguments: {} });
    assert.equal(denied.result?.isError, true, JSON.stringify(denied));
    assert.match(JSON.stringify(denied.result.content), /PERMISSION_DENIED/);
    assert.doesNotMatch(JSON.stringify(denied), /secret|private key/i);

    const badInput = await request('tools/call', { name: 'desktop_control.status', arguments: { unexpected: 'value' } });
    assert.ok(badInput.error || badInput.result?.isError === true, 'unexpected tool argument must fail');

    const unknown = await request('tools/call', { name: 'desktop_control.unknown', arguments: {} });
    assert.ok(unknown.error || unknown.result?.isError === true, 'unknown tool must fail');
    assert.doesNotMatch(JSON.stringify(unknown), /PERMISSION_DENIED/);

    child.stdin.end();
    const exit = await Promise.race([
      done,
      new Promise((_, reject) => setTimeout(() => reject(Error('stdio EOF did not terminate child within 5 s')), 5_000))
    ]);
    assert.equal(exit.code, 0, `Child exited incorrectly: ${JSON.stringify(exit)}; stderr=${stderr.slice(-500)}`);
    assert.ok(messageCount >= 5);
    assert.match(stderr, /capability_check/);
    assert.doesNotMatch(stderr, /password|private key|secret/i);
  } finally {
    for (const { timer } of pending.values()) clearTimeout(timer);
    if (!closed) child.kill();
    await done;
  }
});
