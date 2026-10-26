import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createInterface } from 'node:readline';

test('private host settings advertise safe actions and cannot provision grants', { timeout: 15000 }, async () => {
  const child = spawn(process.execPath, ['dist/packages/mcp-server/src/private.mjs'], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  const closed = once(child, 'close');
  const reader = createInterface({ input: child.stdout });
  const iterator = reader[Symbol.asyncIterator]();
  child.stderr.resume();
  let id = 0;
  async function request(method, params = {}) {
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params: { ...params, _meta: {
      'io.modelcontextprotocol/protocolVersion': '2026-07-28',
      'io.modelcontextprotocol/clientInfo': { name: 'settings-contract', version: '1' },
      'io.modelcontextprotocol/clientCapabilities': {}
    } } }) + '\n');
    let timer;
    try {
      const line = await Promise.race([iterator.next(), new Promise((_, reject) => { timer = setTimeout(() => reject(Error('SETTINGS_TIMEOUT')), 5000); })]);
      assert.equal(line.done, false);
      const response = JSON.parse(line.value);
      assert.equal(response.id, id);
      return response;
    } finally { clearTimeout(timer); }
  }
  const call = (name, args) => request('tools/call', { name: 'desktop_control.' + name, arguments: args });
  try {
    const discovery = (await request('server/discover')).result;
    assert.deepEqual(discovery.capabilities.extensions['openai/settings'], {
      readTool: 'desktop_control.settings_read', updateTool: 'desktop_control.settings_update'
    });
    const before = (await call('control_status', {})).result.structuredContent;
    const result = (await call('settings_read', {})).result.structuredContent;
    assert.deepEqual(result.schema, { type: 'object', properties: {} });
    assert.deepEqual(result.values, {});
    const actions = result.layout.flatMap(group => group.items.map(item => item.tool));
    assert.deepEqual(actions, ['desktop_control.management', 'desktop_control.stop_control', 'desktop_control.control_status']);
    const opened = await call('management', {});
    assert.deepEqual(opened.result.structuredContent, { view: 'management', grantsChanged: false });
    const view = await request('resources/read', { uri: 'ui://desktop-control/management' });
    assert.equal(view.result.contents[0].mimeType, 'text/html;profile=mcp-app');
    assert.deepEqual((await call('settings_update', { set: {} })).result.structuredContent, { values: {} });
    for (const args of [{ set: { 'desktop.input': true } }, { set: {}, grant: true }, { set: [] }, {}]) {
      const response = await call('settings_update', args);
      assert.ok(response.error || response.result?.isError);
    }
    for (const args of [
      { scope: 'workspace', capabilities: ['files.read'], allowedOrigins: [], reenableStopped: false, approved: true },
      { scope: 'workspace', capabilities: ['files.read', 'desktop.input'], allowedOrigins: [], reenableStopped: false },
      { scope: 'controls', capabilities: ['browser.read'], allowedOrigins: ['https://example.com/'], reenableStopped: false }
    ]) {
      const response = await call('permissions_request', args);
      assert.ok(response.error || response.result?.isError, 'forged proposals never reach a native prompt');
    }
    const after = (await call('control_status', {})).result.structuredContent;
    assert.deepEqual(after, before);
    child.stdin.end();
    assert.deepEqual(await closed, [0, null]);
  } finally {
    reader.close(); child.stdin.end(); if (child.exitCode === null) child.kill(); await closed;
  }
});
