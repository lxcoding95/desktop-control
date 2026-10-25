// Explicit host-side setup for ONE local profile. No registry push or client connection.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
const receipt = JSON.parse(readFileSync(path.join(root, '.cache/docker-mcp', head, 'receipt.json'), 'utf8'));
if (receipt.head !== head || !/^sha256:[a-f0-9]{64}$/.test(receipt.imageId)) throw Error('Build receipt mismatch');
const run = (...args) => execFileSync('docker', args, { encoding: 'utf8', windowsHide: true, timeout: 60000 });
const profiles = JSON.parse(run('mcp', 'profile', 'list', '--format', 'json'));
if (profiles.some(profile => profile.id === 'desktop-control')) throw Error('Existing Desktop Control profile preserved; explicit reviewed migration required');
const inspected = JSON.parse(run('image', 'inspect', receipt.imageId))[0];
if (inspected.Config.User !== '1000:1000' || inspected.Config.Labels['org.opencontainers.image.revision'] !== head) throw Error('Unexpected image identity');
execFileSync(process.execPath, [fileURLToPath(new URL('./test.mjs', import.meta.url)), receipt.imageId], { cwd: root, stdio: 'inherit', windowsHide: true, timeout: 60000 });
const directory = path.join(homedir(), '.docker/mcp/catalogs');
mkdirSync(directory, { recursive: true });
const definition = path.join(directory, 'desktop-control-' + head.slice(0, 12) + '.yaml');
writeFileSync(definition, 'name: desktop-control\ntitle: Desktop Control\ntype: server\nimage: ' + receipt.imageId +
  '\ndescription: Local deny-by-default MCP core; no Windows desktop access.\n', { flag: 'wx' });
run('mcp', 'profile', 'create', '--id', 'desktop-control', '--name', 'Desktop Control', '--server', 'file://' + definition.replaceAll('\\', '/'));
run('mcp', 'profile', 'tools', 'desktop-control', '--enable', 'desktop-control.desktop_control.status');
console.log('Created Desktop Control local profile. No client connected and no artifact uploaded.');
