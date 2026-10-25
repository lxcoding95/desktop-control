// Build a minimal worker mount. Never mount the checkout, .git or private evidence.
import { cpSync, existsSync, mkdirSync, readFileSync, realpathSync, rmSync, lstatSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../../', import.meta.url));
const destination = path.join(root, 'dist/private-workspace-runtime');
if (path.dirname(destination) !== path.join(root, 'dist')) throw Error('INVALID_BUILD_DESTINATION');
if (existsSync(destination) && lstatSync(destination).isSymbolicLink()) throw Error('INVALID_BUILD_DESTINATION');
rmSync(destination, { recursive: true, force: true });
mkdirSync(destination, { recursive: true });
for (const name of ['operations.mjs', 'worker.mjs', 'terminal.mjs', 'package.json'])
  cpSync(path.join(root, 'packages/private-files', name), path.join(destination, name));
const require = createRequire(path.join(root, 'packages/private-files/package.json'));
const seen = new Map();
function copyDependency(name, requester) {
  if (!/^(?:@[a-z0-9_.-]+\/)?[a-z0-9_.-]+$/.test(name)) throw Error('INVALID_DEPENDENCY_NAME');
  const search = createRequire(requester).resolve.paths(name) ?? [];
  const sourceManifest = search.map(base => path.join(base, ...name.split('/'), 'package.json')).find(existsSync);
  if (!sourceManifest) throw Error('DEPENDENCY_NOT_INSTALLED');
  const source = realpathSync(path.dirname(sourceManifest));
  if (!source.startsWith(realpathSync(path.join(root, 'node_modules')) + path.sep)) throw Error('DEPENDENCY_OUTSIDE_INSTALL');
  const manifest = JSON.parse(readFileSync(sourceManifest, 'utf8'));
  if (seen.has(name)) { if (seen.get(name) !== manifest.version) throw Error('DEPENDENCY_VERSION_CONFLICT'); return; }
  seen.set(name, manifest.version);
  const target = path.join(destination, 'node_modules', ...name.split('/'));
  cpSync(source, target, { recursive: true, filter: candidate => {
    if (lstatSync(candidate).isSymbolicLink()) throw Error('DEPENDENCY_SYMLINK');
    return true;
  } });
  for (const child of Object.keys(manifest.dependencies ?? {})) copyDependency(child, sourceManifest);
}
const manifest = require('./package.json');
for (const name of Object.keys(manifest.dependencies)) copyDependency(name, path.join(root, 'packages/private-files/package.json'));
writeFileSync(path.join(destination, 'runtime-inventory.json'), JSON.stringify({ dependencies: Object.fromEntries(seen) }, null, 2) + '\n');
console.log('Staged isolated workspace worker; dependencies=' + seen.size);
