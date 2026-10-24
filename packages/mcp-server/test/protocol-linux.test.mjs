import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { inspectSockets } from './fixtures/socket-inspection.mjs';
import { createInterface } from 'node:readline';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../', import.meta.url));

test('Linux production entry has no unexpected sockets beyond inherited Unix stdio', {
  skip: process.platform !== 'linux' ? 'Requires Linux /proc/<pid>/fd' : false,
  timeout: 10_000
}, async () => {
  const child = spawn(process.execPath, ['dist/packages/mcp-server/src/index.mjs'], {
    cwd: root, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true
  });
  const output = createInterface({ input: child.stdout, crlfDelay: Infinity });
  const lines = output[Symbol.asyncIterator]();
  let closed = false;
  const exitPromise = once(child, 'close').then(([code, signal]) => {
    closed = true;
    return { code, signal };
  });
  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', chunk => { stderr += chunk; if (stderr.length > 32_768) child.kill(); });

  try {
    assert.ok(child.pid && child.pid > 0, 'a native child PID must exist');
    child.stdin.write(JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'server/discover',
      params: { _meta: {
        'io.modelcontextprotocol/protocolVersion': '2026-07-28',
        'io.modelcontextprotocol/clientInfo': { name: 'linux-no-listener-test', version: '0.0.1' },
        'io.modelcontextprotocol/clientCapabilities': {}
      } }
    }) + '\n');
    const line = await Promise.race([
      lines.next(),
      new Promise((_, reject) => setTimeout(() => reject(Error('server/discover did not respond')), 4_000))
    ]);
    assert.equal(line.done, false);
    const response = JSON.parse(line.value);
    assert.equal(response.id, 1);
    assert.equal(response.error, undefined, JSON.stringify(response.error));
    assert.ok(response.result?.supportedVersions?.includes('2026-07-28'));
    const sockets = await inspectSockets(child.pid);
    assert.deepEqual(sockets.unexpected, [], 'no additional Unix or TCP/UDP sockets, including on stdio fds');
    child.stdin.end();
    const exit = await Promise.race([
      exitPromise,
      new Promise((_, reject) => setTimeout(() => reject(Error('stdio EOF process shutdown timed out')), 4_000))
    ]);
    assert.equal(exit.code, 0, `process exit ${JSON.stringify(exit)}; stderr=${stderr.slice(-200)}`);
  } finally {
    output.close();
    child.stdin.end();
    if (!closed) child.kill();
    await exitPromise.catch(() => {});
  }
});

test('Linux socket detector finds deliberately listening TCP and UDP test endpoints', {
  skip: process.platform !== 'linux' ? 'Requires Linux /proc/<pid>/fd' : false,
  timeout: 10_000
}, async () => {
  const child = spawn(process.execPath, ['--input-type=module', '-e', `
    import net from 'node:net'; import dgram from 'node:dgram';
    const tcp = net.createServer(); const udp = dgram.createSocket('udp4');
    await new Promise(resolve => tcp.listen(0, '127.0.0.1', resolve));
    await new Promise(resolve => udp.bind(0, '127.0.0.1', resolve));
    process.stdout.write('ready\\n'); process.stdin.resume();
    process.stdin.on('end', () => { tcp.close(); udp.close(); });
  `], { stdio: ['pipe', 'pipe', 'pipe'] });
  const closed = once(child, 'close');
  const output = createInterface({ input: child.stdout });
  let timer;
  try {
    const first = await Promise.race([output[Symbol.asyncIterator]().next(),
      new Promise((_, reject) => { timer = setTimeout(() => reject(Error('listener fixture timeout')), 4000); })]);
    clearTimeout(timer);
    assert.equal(first.value, 'ready');
    const sockets = await inspectSockets(child.pid);
    assert.ok(sockets.unexpected.some(item => item.networkKinds.includes('tcp')), 'TCP listener must be detected');
    assert.ok(sockets.unexpected.some(item => item.networkKinds.includes('udp')), 'UDP endpoint must be detected');
    child.stdin.end();
    const [code] = await Promise.race([closed, new Promise((_, reject) => {
      timer = setTimeout(() => reject(Error('listener fixture EOF timeout')), 4000);
    })]);
    assert.equal(code, 0);
    await assert.rejects(inspectSockets(child.pid), { code: 'ENOENT' }, 'dead/inaccessible PID must not silently pass');
  } finally {
    clearTimeout(timer); output.close(); child.stdin.end();
    if (child.exitCode === null) child.kill();
    await closed;
  }
});
