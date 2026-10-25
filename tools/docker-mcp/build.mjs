// Local-only deterministic source staging. No credentials, working files or Git metadata enter Docker.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../../', import.meta.url));
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
const head = git('rev-parse', 'HEAD');
const context = path.join(root, '.cache/docker-mcp', head);
mkdirSync(path.dirname(context), { recursive: true });
mkdirSync(context, { recursive: false }); // Never reuse or overwrite a previous build context.
const tracked = git('ls-tree', '-r', '--name-only', head).split('\n');
const files = ['package.json', 'package-lock.json', 'LICENSE',
  ...tracked.filter(file => /^packages\/[^/]+\/package\.json$/.test(file)),
  'packages/mcp-server/src/index.mts', 'packages/mcp-server/src/server.mts',
  ...['status', 'policy', 'principal'].map(name => 'packages/mcp-server/src/bridge/' + name + '.mts')];
for (const file of files) {
  const target = path.join(context, file);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, execFileSync('git', ['show', head + ':' + file], { cwd: root, windowsHide: true }));
}
copyFileSync(fileURLToPath(new URL('./Dockerfile', import.meta.url)), path.join(context, 'Dockerfile'));
const image = 'desktop-control/mcp-local:' + head.slice(0, 12);
execFileSync('docker', ['build', '--build-arg', 'SOURCE_COMMIT=' + head, '-t', image, context],
  { cwd: root, windowsHide: true, stdio: 'inherit', timeout: 600000 });
const imageId = execFileSync('docker', ['image', 'inspect', image, '--format', '{{.Id}}'], { encoding: 'utf8', windowsHide: true }).trim();
writeFileSync(path.join(context, 'receipt.json'), JSON.stringify({ head, image, imageId, files,
  dockerfile: readFileSync(path.join(context, 'Dockerfile'), 'utf8'), builtAt: new Date().toISOString() }, null, 2) + '\n');
console.log(JSON.stringify({ head, image, imageId, context }));
