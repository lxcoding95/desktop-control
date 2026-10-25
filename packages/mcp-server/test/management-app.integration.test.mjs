import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

test('actual MCP management resource and entrypoints are read-only, bounded and strict', async () => {
  const code = `import {McpServer} from '@modelcontextprotocol/server';
    import {serveStdio} from '@modelcontextprotocol/server/stdio';
    import {registerManagementApp} from './packages/mcp-server/src/management-app.mts';
    void serveStdio(()=>{const server=new McpServer({name:'management-contract',version:'1'});registerManagementApp(server);return server;});`;
  const child = spawn(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', code], {
    cwd: fileURLToPath(new URL('../../../', import.meta.url)), windowsHide: true, stdio: ['pipe', 'pipe', 'pipe']
  });
  const closed = once(child, 'close');
  const lines = createInterface({ input: child.stdout });
  const iterator = lines[Symbol.asyncIterator]();
  let error = '', id = 0;
  child.stderr.on('data', bytes => { error += bytes; if (error.length > 65536) child.kill(); });
  const bounded = async promise => {
    let timer;
    try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(Error('Management protocol deadline')), 10000); })]); }
    finally { clearTimeout(timer); }
  };
  async function request(method, params = {}) {
    const current = ++id;
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: current, method, params: { ...params, _meta: {
      'io.modelcontextprotocol/protocolVersion': '2026-07-28',
      'io.modelcontextprotocol/clientInfo': { name: 'management-test', version: '1' },
      'io.modelcontextprotocol/clientCapabilities': { extensions: { 'io.modelcontextprotocol/ui': { mimeTypes: ['text/html;profile=mcp-app'] } } }
    } } }) + '\n');
    const line = await bounded(iterator.next()); assert.equal(line.done, false);
    const response = JSON.parse(line.value); assert.equal(response.id, current); return response;
  }
  try {
    assert.ok((await request('server/discover')).result.supportedVersions.includes('2026-07-28'));
    const list = (await request('tools/list')).result.tools;
    assert.equal(list.length, 1);
    assert.equal(list[0].name, 'desktop_control.management');
    assert.equal(list[0].annotations.readOnlyHint, true);
    assert.equal(list[0]._meta.ui.resourceUri, 'ui://desktop-control/management');
    assert.deepEqual(list[0]._meta['openai/ui'].entrypoints, [{ type: 'global' }, { type: 'thread' }]);
    const opened = await request('tools/call', { name: list[0].name, arguments: {} });
    assert.deepEqual(opened.result.structuredContent, { view: 'management', grantsChanged: false });
    const forged = await request('tools/call', { name: list[0].name, arguments: { grant: true } });
    assert.ok(forged.error || forged.result?.isError);
    const resource = (await request('resources/read', { uri: 'ui://desktop-control/management' })).result.contents[0];
    assert.equal(resource.mimeType, 'text/html;profile=mcp-app');
    assert.ok(resource.text.length < 40000);
    assert.match(resource.text, /<html lang="de">/);
    assert.deepEqual(resource._meta.ui.csp, { connectDomains: [], resourceDomains: [], frameDomains: [], baseUriDomains: [] });
    assert.doesNotMatch(resource.text, /<script[^>]+src=|<iframe|localStorage|control-grant|workspace-grant/);
    const unknown = await request('resources/read', { uri: 'file:///untrusted' });
    assert.ok(unknown.error || unknown.result?.isError);
    child.stdin.end(); assert.deepEqual(await bounded(closed), [0, null]);
    assert.doesNotMatch(error, /S-1-5-21-|[A-Z]:\\Users\\/i);
  } finally { lines.close(); child.stdin.end(); if (child.exitCode === null) child.kill(); await closed; }
});
