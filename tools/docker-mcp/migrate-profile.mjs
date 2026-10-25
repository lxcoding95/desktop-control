// One-time guarded migration of our exact local profile, never another user's configuration.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createHash } from 'node:crypto';
const root = fileURLToPath(new URL('../../', import.meta.url));
const source = '9ec243963ec0bd4b1325863aab99d4bcee53a7bc';
const oldImage = 'desktop-control/mcp-local:9ec243963ec0';
const imageId = 'sha256:11c6f85d8ca36069d0b7b08a4cc4114b505ba9a95bdbff840d0bd58389b49e91';
const description = 'Local deny-by-default Desktop Control MCP core. No Windows desktop access.';
const run = (...args) => execFileSync('docker', args, { encoding: 'utf8', windowsHide: true, timeout: 60000 });
const expected = image => ({ version: 1, id: 'desktop-control', name: 'Desktop Control', servers: [{
  type: 'image', secrets: 'default', tools: ['desktop_control.status'], image,
  snapshot: { server: { name: 'desktop-control', type: 'server', image, description, title: 'Desktop Control', remote: {} } }
}], secrets: { default: { provider: 'docker-desktop-store' } } });
const before = JSON.parse(run('mcp', 'profile', 'show', 'desktop-control', '--format', 'json'));
assert.deepEqual(before, expected(oldImage), 'Unexpected existing profile preserved; do not migrate it automatically');
for (const ref of [oldImage, imageId]) {
  const inspection = JSON.parse(run('image', 'inspect', ref))[0];
  assert.equal(inspection.Id, imageId);
  assert.equal(inspection.Config.User, '1000:1000');
  assert.equal(inspection.Config.Labels['org.opencontainers.image.revision'], source);
  assert.equal(inspection.Config.Labels['org.opencontainers.image.authors'], 'Anon Allman');
  assert.equal(inspection.Config.Labels['org.opencontainers.image.source'], 'https://github.com/lxcoding95/desktop-control');
}
const folder = path.join(root, '.cache/docker-mcp');
mkdirSync(folder, { recursive: true });
const stamp = new Date().toISOString().replaceAll(/[:.]/g, '-');
const backup = path.join(folder, 'profile-before-pin-' + stamp + '.json');
assert.equal(existsSync(backup), false);
run('mcp', 'profile', 'export', 'desktop-control', backup);
const backupBytes = readFileSync(backup);
const directory = path.join(homedir(), '.docker/mcp/catalogs');
mkdirSync(directory, { recursive: true });
const definition = path.join(directory, 'desktop-control-pinned-' + stamp + '.yaml');
writeFileSync(definition, 'name: desktop-control\ntitle: Desktop Control\ntype: server\nimage: ' + imageId +
  '\ndescription: ' + description + '\n', { flag: 'wx' });
try {
  run('mcp', 'profile', 'server', 'add', 'desktop-control', '--server', 'file://' + definition.replaceAll('\\', '/'));
} catch (error) {
  assert.deepEqual(JSON.parse(run('mcp', 'profile', 'show', 'desktop-control', '--format', 'json')), before,
    'Migration failed and changed profile; recover using the retained export, do not continue');
  throw error;
}
// Never enable all tools. New snapshot imports may omit the old explicit list.
run('mcp', 'profile', 'tools', 'desktop-control', '--disable-all', 'desktop-control');
run('mcp', 'profile', 'tools', 'desktop-control', '--enable', 'desktop-control.desktop_control.status');
const after = JSON.parse(run('mcp', 'profile', 'show', 'desktop-control', '--format', 'json'));
assert.deepEqual(after, expected(imageId), 'Pinned profile readback differs; do not connect a client');
writeFileSync(path.join(folder, 'profile-pin-' + stamp + '.json'), JSON.stringify({
  migratedAt: new Date().toISOString(), source, imageId, backup, backupSha256: createHash('sha256').update(backupBytes).digest('hex'),
  onlyProductTool: 'desktop_control.status', clientConnected: false
}, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ pinned: true, imageId, onlyProductTool: 'desktop_control.status', backupPreserved: true, clientConnected: false }));
