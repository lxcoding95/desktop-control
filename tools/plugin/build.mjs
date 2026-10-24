import { cpSync, mkdirSync, readFileSync, writeFileSync, readdirSync, lstatSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const output = resolve(process.argv[2] ?? join(root, '.cache/private-plugin'));
mkdirSync(output, { recursive: true });
// Never overwrite an existing package or delete a caller-selected directory.
const stage = join(output, `desktop-control-${process.platform}-${Date.now()}`);
mkdirSync(stage);
const copy = (from, to = from) => {
  mkdirSync(resolve(stage, to, '..'), { recursive: true });
  cpSync(join(root, from), join(stage, to), { recursive: true, dereference: false, errorOnExist: true });
};
for (const name of ['plugin.json', 'mcp.json', 'start.mjs', 'README.md']) copy(`plugin/${name}`, name);
copy('LICENSE'); copy('THIRD-PARTY-NOTICES.md');
copy('dist/packages/mcp-server/src');
if (process.platform === 'win32') copy('dist/native/windows-token.exe');
copy('packages/mcp-server/native/WindowsToken.cs', 'source/WindowsToken.cs');
const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'));
const dependencies = [];
const names = ['@modelcontextprotocol/server', '@modelcontextprotocol/core', 'zod'];
for (const name of names) {
  const key = `node_modules/${name}`;
  const manifest = JSON.parse(readFileSync(join(root, key, 'package.json'), 'utf8'));
  const pinned = lock.packages[key];
  if (!pinned?.integrity || pinned.version !== manifest.version || !pinned.resolved.startsWith('https://registry.npmjs.org/')) throw Error('Dependency provenance mismatch');
  for (const dep of Object.keys(manifest.dependencies ?? {})) if (!names.includes(dep)) throw Error('Uninventoried runtime dependency');
  copy(key);
  dependencies.push({ name, version: manifest.version, resolved: pinned.resolved, integrity: pinned.integrity });
}
const manifest = JSON.parse(readFileSync(join(stage, 'plugin.json'), 'utf8'));
writeFileSync(join(stage, 'PROVENANCE.json'), JSON.stringify({
  plugin_version: manifest.version,
  source_commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  dirty: execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim() !== '',
  platform: process.platform, arch: process.arch, node: process.versions.node,
  contract: 'S02 diagnostics.read / API1 / MCP2026-07-28', dependencies
}, null, 2));
const files = {};
function inventory(folder) {
  for (const name of readdirSync(folder).sort()) {
    const p = join(folder, name), st = lstatSync(p);
    if (st.isSymbolicLink()) throw Error('Symlink forbidden in private package');
    if (st.isDirectory()) inventory(p);
    else if (st.isFile()) files[relative(stage, p).replaceAll('\\', '/')] = createHash('sha256').update(readFileSync(p)).digest('hex');
    else throw Error('Non-regular package member');
  }
}
inventory(stage);
writeFileSync(join(stage, 'FILES.sha256.json'), JSON.stringify(files, null, 2));
const archive = join(output, `desktop-control-${manifest.version}-${process.platform}-${process.arch}.zip`);
execFileSync(process.platform === 'win32' ? 'python' : 'python3', [join(root, 'tools/plugin/zip.py'), stage, archive], { stdio: 'inherit' });
console.log(JSON.stringify({ stage, archive, sha256: createHash('sha256').update(readFileSync(archive)).digest('hex'), files: Object.keys(files).length + 1 }));
