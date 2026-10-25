// Real Docker process and kernel containment, no mock server or host grant.
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { createInterface } from 'node:readline';
const image = process.argv[2];
assert.match(image ?? '', /^(sha256:[a-f0-9]{64}|desktop-control\/mcp-local:[a-f0-9]{12})$/);
const meta = { 'io.modelcontextprotocol/protocolVersion': '2026-07-28',
  'io.modelcontextprotocol/clientInfo': { name: 'docker-local-acceptance', version: '1' },
  'io.modelcontextprotocol/clientCapabilities': {} };
const name = 'desktop-control-test-' + process.pid + '-' + Date.now();
const args = ['run', '--rm', '-i', '--name', name, '--network', 'none', '--read-only', '--cap-drop', 'ALL',
  '--security-opt', 'no-new-privileges', '--pids-limit', '64', '--memory', '256m', '--cpus', '1', image];
const child = spawn('docker', args, { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
const closed = once(child, 'close');
const lines = createInterface({ input: child.stdout });
const iterator = lines[Symbol.asyncIterator]();
let stderr = '';
child.stderr.on('data', chunk => { stderr += chunk; });
async function bounded(promise) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(Error('Docker MCP deadline')), 15000); })]); }
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
  const denied = await request(3, 'tools/call', { name: 'desktop_control.status', arguments: {} });
  assert.equal(denied.result.isError, true);
  assert.equal(denied.result.content[0].text, 'PERMISSION_DENIED');
  const forged = await request(4, 'tools/call', { name: 'desktop_control.status', arguments: { grant: true } });
  assert.ok(forged.error || forged.result?.isError);
  const unknown = await request(5, 'tools/call', { name: 'desktop_control.terminal_run', arguments: {} });
  assert.ok(unknown.error || unknown.result?.isError);
  const inspection = JSON.parse(execFileSync('docker', ['inspect', name], { encoding: 'utf8', windowsHide: true }))[0];
  assert.equal(inspection.Config.User, '1000:1000');
  assert.equal(inspection.HostConfig.NetworkMode, 'none');
  assert.equal(inspection.HostConfig.ReadonlyRootfs, true);
  assert.deepEqual(inspection.HostConfig.CapDrop, ['ALL']);
  assert.ok(inspection.HostConfig.SecurityOpt.includes('no-new-privileges'));
  assert.equal(inspection.Mounts.length, 0);
  assert.equal(inspection.HostConfig.Privileged, false);
  assert.equal(Object.keys(inspection.NetworkSettings.Ports ?? {}).length, 0);
  child.stdin.end();
  assert.deepEqual(await bounded(closed), [0, null]);
  assert.doesNotMatch(stderr, /S-1-5-21-|password|secret|[A-Z]:\\Users\\/i);
  assert.equal(execFileSync('docker', ['ps', '-aq', '--filter', 'name=^/' + name + '$'], { encoding: 'utf8', windowsHide: true }).trim(), '');
  console.log(JSON.stringify({ discovery: 'PASS', toolList: 'PASS', denial: 'PASS',
    forgedGrant: 'PASS', terminalAbsent: 'PASS', containment: 'PASS', EOF: 'PASS', removal: 'PASS' }));
} finally {
  lines.close(); child.stdin.end();
  if (child.exitCode === null) {
    try { execFileSync('docker', ['stop', '-t', '1', name], { windowsHide: true, stdio: 'pipe', timeout: 10000 }); } catch { /* closed or startup failure */ }
    child.kill();
  }
}
