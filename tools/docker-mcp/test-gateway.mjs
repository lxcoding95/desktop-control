// Exercise only the dedicated Desktop Control profile; never connect/change a client.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createInterface } from 'node:readline';
import { createWriteStream } from 'node:fs';
import { fileURLToPath } from 'node:url';
const child = spawn('docker', ['mcp', 'gateway', 'run', '--profile', 'desktop-control', '--log-calls=false'],
  { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
const closed = once(child, 'close');
const lines = createInterface({ input: child.stdout });
const iterator = lines[Symbol.asyncIterator]();
const diagnostics = createWriteStream(fileURLToPath(new URL('../../.cache/docker-mcp-gateway-stderr.log', import.meta.url)));
child.stderr.pipe(diagnostics); // Private diagnostics remain local, never print them.
async function bounded(promise) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(Error('Gateway deadline')), 20000); })]); }
  finally { clearTimeout(timer); }
}
async function request(id, method, params = {}) {
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  while (true) {
    const line = await bounded(iterator.next());
    assert.equal(line.done, false);
    const message = JSON.parse(line.value);
    if (message.id === id) return message;
  }
}
try {
  const hello = await request(1, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'desktop-control-local-test', version: '1' } });
  assert.ok(hello.result?.protocolVersion);
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
  const listing = await request(2, 'tools/list');
  console.log(JSON.stringify({ listedTools: listing.result?.tools.map(tool => tool.name) }));
  const tool = listing.result?.tools.find(tool => /desktop_control[._]status$/.test(tool.name));
  assert.ok(tool, 'Desktop Control status must be discovered through the gateway');
  const denied = await request(3, 'tools/call', { name: tool.name, arguments: {} });
  assert.equal(denied.result?.isError, true);
  assert.ok(denied.result.content.some(content => content.text?.includes('PERMISSION_DENIED')));
  const forged = await request(4, 'tools/call', { name: tool.name, arguments: { grant: true } });
  assert.ok(forged.error || forged.result?.isError);
  child.stdin.end();
  const [code] = await bounded(closed);
  assert.equal(code, 0);
  console.log(JSON.stringify({ gatewayInitialization: 'PASS', discovery: 'PASS', statusDenied: 'PASS', forgedGrantDenied: 'PASS', EOF: 'PASS' }));
} finally {
  lines.close(); child.stdin.end();
  if (child.exitCode === null) child.kill();
}
