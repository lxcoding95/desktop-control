// Deterministic installed-package provenance and original notice inventory.
// No network, package scripts, account data or private file paths are inspected.
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const RUNTIME_NAMES = Object.freeze(['@modelcontextprotocol/server', '@modelcontextprotocol/core', 'zod', 'pdf-lib', '@pdf-lib/standard-fonts', '@pdf-lib/upng', 'pako', 'tslib', 'playwright-core']);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const licenseName = name => /^(?:licen[sc]e|notice|copying|copyright(?:notice)?|thirdpartynotices)(?:[._-]|$)/i.test(name) || /\.licen[sc]e(?:\.[a-z]+)?$/i.test(name);

function inspectFiles(root, directory) {
  const licenses = [], binaries = [];
  function walk(folder) {
    for (const name of readdirSync(folder).sort()) {
      if (name === 'node_modules') continue;
      const file = join(folder, name), stat = lstatSync(file);
      if (stat.isSymbolicLink()) throw Error('Package symlink requires explicit review');
      if (stat.isDirectory()) walk(file);
      else if (stat.isFile()) {
        const path = relative(root, file).replaceAll('\\', '/');
        if (licenseName(name)) licenses.push({ path, bytes: stat.size, sha256: digest(readFileSync(file)) });
        if (/\.(?:exe|dll|node|so|dylib|wasm)$/i.test(name)) binaries.push({ path, bytes: stat.size, sha256: digest(readFileSync(file)) });
      } else throw Error('Non-regular installed package member');
    }
  }
  walk(directory);
  return { licenses, binaries };
}

export function inventoryLicenses(root) {
  const lockBytes = readFileSync(join(root, 'package-lock.json'));
  const lock = JSON.parse(lockBytes);
  const installed = [];
  let externalLockEntries = 0;
  for (const [key, pinned] of Object.entries(lock.packages).sort(([a], [b]) => a.localeCompare(b))) {
    if (!key.includes('node_modules/') || pinned.link) continue;
    externalLockEntries++;
    if (key.split('/').some(part => part === '..') || key.includes('\\')) throw Error('Unsafe lock path');
    const directory = join(root, key), manifestPath = join(directory, 'package.json');
    if (!existsSync(manifestPath)) continue; // Optional packages can legitimately be OS-filtered.
    if (lstatSync(directory).isSymbolicLink()) throw Error('Installed dependency must be regular directory');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    if (manifest.version !== pinned.version) throw Error('Installed package/lock version mismatch');
    const files = inspectFiles(root, directory);
    installed.push({ name: manifest.name, version: manifest.version, installPath: key, development: pinned.dev === true,
      declaredLicense: manifest.license ?? null, resolved: pinned.resolved ?? null, integrity: pinned.integrity ?? null, ...files });
  }
  const dependencies = RUNTIME_NAMES.map(name => {
    const record = installed.find(item => item.installPath === 'node_modules/' + name);
    if (!record || !record.integrity || !record.resolved?.startsWith('https://registry.npmjs.org/')) throw Error('Missing locked runtime provenance');
    if (!record.licenses.length) throw Error('Original runtime license missing');
    const manifest = JSON.parse(readFileSync(join(root, record.installPath, 'package.json'), 'utf8'));
    for (const child of Object.keys(manifest.dependencies ?? {})) if (!RUNTIME_NAMES.includes(child)) throw Error('Runtime closure expanded; review required');
    return record;
  });
  return { schemaVersion: 1, platform: process.platform, arch: process.arch, node: process.versions.node,
    packageLockSha256: digest(lockBytes), counts: { externalLockEntries, installedExternalPackages: installed.length,
      installedLicenseFiles: installed.reduce((n, item) => n + item.licenses.length, 0), runtimeExternalPackages: dependencies.length,
      runtimeLicenseFiles: dependencies.reduce((n, item) => n + item.licenses.length, 0) },
    runtime: dependencies, installed, missingStandaloneLicenses: installed.filter(item => !item.licenses.length).map(item => ({ name: item.name, version: item.version, development: item.development })) };
}

export function runtimeSbom(inventory) {
  return { bomFormat: 'CycloneDX', specVersion: '1.6', version: 1,
    metadata: { component: { type: 'application', name: 'Desktop Control Private', version: 'source-preview' },
      properties: [{ name: 'desktop-control:scope', value: 'Selected external runtime closure; Node, Docker, OS and separately installed browser runtime are external prerequisites' },
        { name: 'desktop-control:package-lock-sha256', value: inventory.packageLockSha256 }] },
    components: inventory.runtime.map(item => ({ type: 'library', name: item.name, version: item.version,
      'bom-ref': `pkg:npm/${item.name.replace('@', '%40')}@${item.version}`, purl: `pkg:npm/${item.name.replace('@', '%40')}@${item.version}`,
      licenses: typeof item.declaredLicense === 'string' ? [{ expression: item.declaredLicense }] : [],
      externalReferences: [{ type: 'distribution', url: item.resolved }],
      properties: [{ name: 'desktop-control:npm-integrity', value: item.integrity },
        { name: 'desktop-control:original-license-files', value: JSON.stringify(item.licenses) }] })) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const root = resolve(fileURLToPath(new URL('../../', import.meta.url)));
  const output = resolve(process.argv[2] ?? join(root, '.cache/private-builds/licenses-' + process.platform));
  mkdirSync(output, { recursive: true });
  const result = inventoryLicenses(root);
  writeFileSync(join(output, 'LICENSE-INVENTORY.json'), JSON.stringify(result, null, 2) + '\n');
  writeFileSync(join(output, 'SBOM.cdx.json'), JSON.stringify(runtimeSbom(result), null, 2) + '\n');
  console.log(JSON.stringify({ result: 'PASS_TECHNICAL_INVENTORY', ...result.counts, missingStandaloneLicenses: result.missingStandaloneLicenses.length,
    legalCertification: false, packageLockSha256: result.packageLockSha256 }));
}
