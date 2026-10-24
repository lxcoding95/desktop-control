import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createInterface } from 'node:readline';
import { resolve } from 'node:path';
const root = resolve(process.argv[2]);
const meta = { 'io.modelcontextprotocol/protocolVersion': '2026-07-28', 'io.modelcontextprotocol/clientInfo': { name: 'private-archive-test', version: '1' }, 'io.modelcontextprotocol/clientCapabilities': {} };
// Test-only explicit host injection. This file and its grant are never packaged.
const hostFixture = `import {serveStdio} from '@modelcontextprotocol/server/stdio'; import {createServer} from './dist/packages/mcp-server/src/server.mjs'; import {localPrincipal} from './dist/packages/mcp-server/src/bridge/principal.mjs'; const principal=localPrincipal(); const expiresAt=Date.now()+60000; const grants={getGrants:()=>[{principal,capability:'diagnostics.read',resource:'local:desktop-control',revoked:false,expiresAt}]}; void serveStdio(()=>createServer({grants}));`;
for (const mode of ['production-denied', 'isolated-host-grant', 'production-restarted']) {
  const child = spawn(process.execPath, mode === 'isolated-host-grant' ? ['--input-type=module', '-e', hostFixture] : ['start.mjs'], { cwd: root, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  const closed = once(child, 'close');
  const lines = createInterface({ input: child.stdout });
  const iterator = lines[Symbol.asyncIterator]();
  let stderr = '';
  child.stderr.on('data', chunk => { stderr += chunk; });
  async function bounded(promise) {
    let timer;
    try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(Error('Package protocol deadline')), 10000); })]); }
    finally { clearTimeout(timer); }
  }
  async function request(id, method, params = {}) {
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params: { ...params, _meta: meta } }) + '\n');
    const line = await bounded(iterator.next());
    assert.equal(line.done, false);
    const message = JSON.parse(line.value);
    assert.equal(message.id, id);
    return message;
  }
  try {
    assert.ok((await request(1, 'server/discover')).result.supportedVersions.includes('2026-07-28'));
    assert.deepEqual((await request(2, 'tools/list')).result.tools.map(tool => tool.name), ['desktop_control.status']);
    const reply = await request(3, 'tools/call', { name: 'desktop_control.status', arguments: {} });
    if (mode === 'isolated-host-grant') assert.deepEqual(reply.result.structuredContent, { service: 'desktop-control', ready: true, api_version: 1 });
    else { assert.equal(reply.result.isError, true); assert.equal(reply.result.content[0].text, 'PERMISSION_DENIED'); }
    const invalid = await request(4, 'tools/call', { name: 'desktop_control.status', arguments: { grant: true } });
    assert.ok(invalid.error || invalid.result?.isError);
    child.stdin.end();
    assert.deepEqual(await bounded(closed), [0, null]);
    assert.doesNotMatch(stderr, /S-1-5-21-|password|secret|[A-Z]:\\Users\\/i);
    console.log(JSON.stringify({ platform: process.platform, mode, discovery: 'PASS', list: 'PASS', call: 'PASS', strict_input: 'PASS', EOF: 'PASS', exit: 0 }));
  } finally { lines.close(); child.stdin.end(); if (child.exitCode === null) child.kill(); await closed; }
}
