import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readdir, readlink } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../', import.meta.url));

test('Linux built production entry has no open socket descriptors after MCP discovery', {
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
    const fds = await readdir(`/proc/${child.pid}/fd`);
    const targets = await Promise.all(fds.map(async fd => {
      try { return await readlink(`/proc/${child.pid}/fd/${fd}`); }
      catch (error) {
        if (error?.code === 'ENOENT') return '(fd closed during inspection)';
        throw error;
      }
    }));
    const openSockets = targets.filter(target => target.startsWith('socket:['));
    assert.deepEqual(openSockets, [], 'the MCP child must not own any socket descriptor at inspection time');
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
