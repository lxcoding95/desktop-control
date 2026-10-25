import { cpSync, mkdirSync, readFileSync, writeFileSync, readdirSync, lstatSync, existsSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { inventoryLicenses, runtimeSbom, RUNTIME_NAMES } from './licenses-runtime.mjs';

const root = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const sourceCommit = git('rev-parse', 'HEAD');
if (git('status', '--porcelain')) throw Error('Package only a clean committed checkout');
// Compile this checkout rather than silently accepting stale ignored dist files.
execFileSync(process.execPath, [join(root, 'node_modules/typescript/bin/tsc'), '--project', join(root, 'tsconfig.json')], { cwd: root, stdio: 'inherit' });
execFileSync(process.execPath, [join(root, 'packages/mcp-server/scripts/build-native.mjs')], { cwd: root, stdio: 'inherit' });
execFileSync(process.execPath, [join(root, 'tools/plugin/build-private.mjs')], { cwd: root, stdio: 'inherit' });
const output = resolve(process.argv[2] ?? join(root, '.cache/private-plugin'));
mkdirSync(output, { recursive: true });
// Never overwrite an existing package or delete a caller-selected directory.
const stage = join(output, `desktop-control-${process.platform}-${Date.now()}`);
mkdirSync(stage);
const copy = (from, to = from) => {
  mkdirSync(resolve(stage, to, '..'), { recursive: true });
  cpSync(join(root, from), join(stage, to), { recursive: true, dereference: false, errorOnExist: true });
};
for (const name of ['plugin.json', 'mcp.json', '.codex-plugin/plugin.json', '.mcp.json', 'start.mjs', 'grant.mjs', 'README.md']) copy(`plugin/${name}`, name);
copy('LICENSE'); copy('THIRD-PARTY-NOTICES.md');
copy('dist/packages/mcp-server/src');
copy('dist/private-workspace-runtime');
for (const name of ['private-browser', 'private-desktop', 'private-settings']) {
  for (const file of ['controller.mjs', 'package.json']) copy(`packages/${name}/${file}`);
}
for (const file of ['runtime.mjs', 'indicator.mjs']) copy(`packages/private-browser/${file}`);
copy('packages/mcp-server/scripts/private-grant.mjs');
copy('packages/private-settings/management.mjs');
copy('packages/private-settings/management.html');
copy('packages/private-desktop/native/DesktopController.cs');
copy('packages/private-settings/native/PrivateSettings.cs');
copy('plugin/skills', 'skills');
for (const file of ['desktop-control.svg', 'desktop-control.png']) copy(`plugin/assets/${file}`, `assets/${file}`);
if (process.platform === 'win32') {
  copy('dist/native/windows-token.exe');
  copy('dist/native/windows-private-policy.exe');
  copy('dist/private-desktop/desktop-controller.exe');
  copy('dist/private-settings/private-settings.exe');
}
copy('packages/mcp-server/native/WindowsToken.cs', 'source/WindowsToken.cs');
copy('packages/mcp-server/native/WindowsPrivatePolicy.cs', 'source/WindowsPrivatePolicy.cs');
const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'));
const dependencies = [];
const names = RUNTIME_NAMES;
for (const name of names) {
  const key = `node_modules/${name}`;
  const manifest = JSON.parse(readFileSync(join(root, key, 'package.json'), 'utf8'));
  const pinned = lock.packages[key];
  if (!pinned?.integrity || pinned.version !== manifest.version || !pinned.resolved.startsWith('https://registry.npmjs.org/')) throw Error('Dependency provenance mismatch');
  for (const dep of Object.keys(manifest.dependencies ?? {})) if (!names.includes(dep)) throw Error('Uninventoried runtime dependency');
  copy(key);
  dependencies.push({ name, version: manifest.version, resolved: pinned.resolved, integrity: pinned.integrity });
}
const licenses = inventoryLicenses(root);
writeFileSync(join(stage, 'RUNTIME-LICENSES.json'), JSON.stringify({ schemaVersion: licenses.schemaVersion, counts: {
  runtimeExternalPackages: licenses.counts.runtimeExternalPackages, runtimeLicenseFiles: licenses.counts.runtimeLicenseFiles },
  packageLockSha256: licenses.packageLockSha256, runtime: licenses.runtime }, null, 2));
writeFileSync(join(stage, 'SBOM.cdx.json'), JSON.stringify(runtimeSbom(licenses), null, 2));
const manifest = JSON.parse(readFileSync(join(stage, 'plugin.json'), 'utf8'));
writeFileSync(join(stage, 'PROVENANCE.json'), JSON.stringify({
  plugin_version: manifest.version,
  source_commit: sourceCommit,
  dirty: false,
  platform: process.platform, arch: process.arch, node: process.versions.node,
  contract: 'Private host capabilities / S02 status API1 / MCP2026-07-28', dependencies,
  worker_dependencies: JSON.parse(readFileSync(join(stage, 'dist/private-workspace-runtime/runtime-inventory.json'), 'utf8')).dependencies,
  external_prerequisites: ['Node.js >=22.19', 'Docker for isolated workspace/terminal', 'Separately installed pinned Chrome for Testing runtime; not included in archive', 'Windows interactive session for native desktop/settings']
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
if (existsSync(archive)) throw Error('Use a new build output directory; never overwrite a private archive');
if (git('rev-parse', 'HEAD') !== sourceCommit || git('status', '--porcelain')) throw Error('Source changed during packaging');
execFileSync(process.platform === 'win32' ? 'python' : 'python3', [join(root, 'tools/plugin/zip.py'), stage, archive], { stdio: 'inherit' });
console.log(JSON.stringify({ stage, archive, sha256: createHash('sha256').update(readFileSync(archive)).digest('hex'), files: Object.keys(files).length + 1 }));
