import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { once } from 'node:events';
import { resolve } from 'node:path';
const root = resolve(process.argv[2] ?? '.');
const meta = { 'io.modelcontextprotocol/protocolVersion': '2026-07-28', 'io.modelcontextprotocol/clientInfo': { name: 'private-integration-proof', version: '1' }, 'io.modelcontextprotocol/clientCapabilities': {} };
const names = ['status', 'files_list', 'files_read', 'files_write', 'files_mkdir', 'files_remove', 'files_restore', 'pdf_create', 'terminal_run',
  'control_status', 'open_settings', 'stop_control', 'browser_start', 'browser_navigate', 'browser_snapshot', 'browser_click', 'browser_fill', 'browser_key', 'browser_scroll', 'browser_screenshot', 'browser_tabs', 'browser_new_tab', 'browser_select_tab', 'browser_close_tab', 'browser_stop',
  'desktop_start', 'desktop_screenshot', 'desktop_move', 'desktop_click', 'desktop_key', 'desktop_type', 'desktop_stop'];
const child = spawn(process.execPath, ['dist/packages/mcp-server/src/private.mjs'], { cwd: root, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
const closed = once(child, 'close');
const reader = createInterface({ input: child.stdout });
const iterator = reader[Symbol.asyncIterator]();
let stderr = '', id = 0, checks = 0;
child.stderr.on('data', data => { stderr += data; });
async function bounded(promise) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(Error('PRIVATE_PROTOCOL_TIMEOUT')), 15000); })]); }
  finally { clearTimeout(timer); }
}
async function request(method, params = {}) {
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params: { ...params, _meta: meta } }) + '\n');
  const line = await bounded(iterator.next()); assert.equal(line.done, false);
  const result = JSON.parse(line.value); assert.equal(result.id, id); return result;
}
async function call(name, args) { return request('tools/call', { name: 'desktop_control.' + name, arguments: args }); }
const pass = name => { checks++; console.log('PASS ' + name); };
try {
  assert.ok((await request('server/discover')).result.supportedVersions.includes('2026-07-28')); pass('modern discovery');
  const list = (await request('tools/list')).result.tools;
  assert.deepEqual(list.map(t => t.name).sort(), names.map(name => 'desktop_control.' + name).sort());
  assert.ok(list.every(t => t.inputSchema)); pass('exact 32-tool private contract');
  for (const [name, args] of [
    ['status', {}], ['files_read', { path: 'probe.txt' }], ['files_write', { path: 'probe.txt', data: 'x' }],
    ['terminal_run', { argv: ['node', '-e', 'process.exit(0)'] }], ['browser_start', {}], ['desktop_start', {}],
    ['browser_fill', { role: 'textbox', name: 'Fixture', value: 'x' }], ['browser_key', { selector: 'input', key: 'Enter' }]
  ]) {
    const reply = await call(name, args);
    assert.equal(reply.result?.isError, true); assert.equal(reply.result.content[0].text, 'PERMISSION_DENIED');
    pass('ungranted ' + name + ' refused before launch/confirmation');
  }
  const status = (await call('control_status', {})).result.structuredContent;
  assert.equal(typeof status.packageVersion, 'string'); assert.equal(status.controls, 'denied'); pass('safe package/grant state');
  for (const [name, args] of [['browser_fill', { role: 'textbox', name: 'Fixture', value: 'x', extra: true }], ['desktop_click', { x: '1', y: 2 }]]) {
    const reply = await call(name, args); assert.ok(reply.error || reply.result?.isError); pass('strict invalid ' + name);
  }
  assert.deepEqual((await call('browser_stop', {})).result.structuredContent, { stopped: true }); pass('browser safety stop without grant');
  child.stdin.end(); assert.deepEqual(await bounded(closed), [0, null]); pass('private EOF process lifecycle');
  assert.doesNotMatch(stderr, /S-1-5-21-|[A-Z]:\\Users\\|password|secret/i); pass('sanitized protocol stderr');
  console.log(JSON.stringify({ checks, passed: checks, failed: 0, skipped: 0 }));
} finally { reader.close(); child.stdin.end(); if (child.exitCode === null) child.kill(); await closed; }
