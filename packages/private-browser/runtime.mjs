import { createRequire } from 'node:module';
import { dirname, join, resolve, relative, isAbsolute } from 'node:path';
import { readFile, lstat, realpath, open, rename, unlink } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
export const MANAGED_BROWSER = Object.freeze({ sdkVersion: '1.64.1', revision: '1248', browserVersion: '156.0.8078.4', title: 'Chrome for Testing' });
const unavailable = () => Error('Dedicated browser runtime unavailable. Use the trusted local browser installer.');

export function verifyPinnedBrowserManifest(manifest, packageMetadata) {
  const browser = manifest?.browsers?.find(value => value.name === 'chromium');
  if (packageMetadata?.version !== MANAGED_BROWSER.sdkVersion || !browser ||
    browser.revision !== MANAGED_BROWSER.revision || browser.browserVersion !== MANAGED_BROWSER.browserVersion || browser.title !== MANAGED_BROWSER.title) throw unavailable();
  return { ...MANAGED_BROWSER };
}

export function installerEnvironment(environment, directory) {
  const result = { ...environment };
  for (const key of Object.keys(result)) {
    if (/^(?:npm_config_|npm_package_config_)?playwright_/i.test(key) || /^(?:NODE_OPTIONS|NODE_PATH)$/i.test(key)) delete result[key];
  }
  result.PLAYWRIGHT_BROWSERS_PATH = directory;
  result.PLAYWRIGHT_SKIP_BROWSER_GC = '1';
  result.PLAYWRIGHT_DOWNLOAD_CONNECTION_TIMEOUT = '120000';
  return result;
}

export function browserExecutableRelative(platform = process.platform, architecture = process.arch) {
  if (architecture !== 'x64') throw unavailable();
  if (platform === 'win32') return join('chromium-1248', 'chrome-win64', 'chrome.exe');
  if (platform === 'linux') return join('chromium-1248', 'chrome-linux64', 'chrome');
  throw unavailable();
}

async function registry() {
  const packageRoot = dirname(require.resolve('playwright-core/package.json'));
  const metadata = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'));
  const manifest = JSON.parse(await readFile(join(packageRoot, 'browsers.json'), 'utf8'));
  verifyPinnedBrowserManifest(manifest, metadata);
  return packageRoot;
}

async function protectedDirectory(prepare = false) {
  const policy = await import(new URL('../../dist/packages/mcp-server/src/bridge/private-grants.mjs', import.meta.url));
  const operation = prepare ? policy.preparePrivateBrowserRuntime : policy.validatePrivateBrowserRuntime;
  if (typeof operation !== 'function') throw unavailable();
  return operation();
}

async function regularInside(directory, file) {
  const target = resolve(directory, file);
  const tail = relative(directory, target);
  if (!tail || tail.startsWith('..') || isAbsolute(tail)) throw unavailable();
  let current = target;
  while (current !== directory) {
    const stat = await lstat(current);
    if (stat.isSymbolicLink() || (current === target ? !stat.isFile() || stat.nlink !== 1 : !stat.isDirectory())) throw unavailable();
    current = dirname(current);
  }
  if (await realpath(target) !== target) throw unavailable();
  return target;
}

async function sha256(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

export async function managedBrowserExecutable() {
  try {
    await registry();
    const directory = await protectedDirectory();
    return await regularInside(directory, browserExecutableRelative());
  } catch { throw unavailable(); }
}

export async function browserRuntimeStatus() {
  try {
    const executable = await managedBrowserExecutable();
    return { state: 'installed', ...MANAGED_BROWSER, platform: process.platform, architecture: process.arch, executableSha256: await sha256(executable),
      upstreamSignatureVerified: false, redistributionAccepted: false };
  } catch {
    return { state: 'unavailable', ...MANAGED_BROWSER, platform: process.platform, architecture: process.arch };
  }
}

export async function installManagedBrowser() {
  const packageRoot = await registry();
  const directory = await protectedDirectory(true);
  const args = [join(packageRoot, 'cli.js'), 'install', 'chromium', '--no-shell', '--no-remove', '--no-progress'];
  const exitCode = await new Promise((fulfill, reject) => {
    const child = spawn(process.execPath, args, { env: installerEnvironment(process.env, directory), stdio: 'inherit', windowsHide: true });
    child.once('error', () => reject(unavailable()));
    child.once('close', code => fulfill(code));
  });
  if (exitCode !== 0) throw unavailable();
  const status = await browserRuntimeStatus();
  if (status.state !== 'installed') throw unavailable();
  const receipt = { receiptVersion: 1, installedAt: new Date().toISOString(), ...status,
    source: 'Pinned Playwright SDK browser manifest; original Chrome for Testing binary, not a Desktop Control Chromium fork',
    archiveSignatureVerified: false, notes: 'Local executable hash is an installation receipt, not independent upstream authenticity or redistribution approval.' };
  const temporary = join(directory, `.install-${randomUUID()}.json`);
  const target = join(directory, 'install-receipt.json');
  try {
    const file = await open(temporary, 'wx', 0o600);
    try { await file.writeFile(JSON.stringify(receipt, null, 2) + '\n'); await file.sync(); }
    finally { await file.close(); }
    await rename(temporary, target);
  } finally { await unlink(temporary).catch(() => {}); }
  return receipt;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const command = process.argv[2];
  if (!['install', 'status'].includes(command) || process.argv.length !== 3) {
    console.error('Usage: node packages/private-browser/runtime.mjs install|status');
    process.exitCode = 2;
  } else {
    try { console.log(JSON.stringify(command === 'install' ? await installManagedBrowser() : await browserRuntimeStatus(), null, 2)); }
    catch { console.error('Dedicated browser runtime installation failed. No permissions were enabled.'); process.exitCode = 1; }
  }
}
