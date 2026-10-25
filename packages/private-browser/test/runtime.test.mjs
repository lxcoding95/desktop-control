import test from 'node:test';
import assert from 'node:assert/strict';
import { MANAGED_BROWSER, verifyPinnedBrowserManifest, installerEnvironment, browserExecutableRelative } from '../runtime.mjs';

test('browser installer pins the actual SDK browser manifest and original binary identity', () => {
  const manifest = { browsers: [{ name: 'chromium', ...MANAGED_BROWSER }] };
  const metadata = { version: '1.64.1' };
  assert.deepEqual(verifyPinnedBrowserManifest(manifest, metadata), MANAGED_BROWSER);
  for (const changed of [{ revision: '9999' }, { title: 'Desktop Control Chromium' }, { browserVersion: '1.0.0' }]) {
    assert.throws(() => verifyPinnedBrowserManifest({ browsers: [{ ...manifest.browsers[0], ...changed }] }, metadata));
  }
  assert.throws(() => verifyPinnedBrowserManifest(manifest, { version: '1.64.2' }));
});

test('browser installer removes download host/path overrides and Node injection variables', () => {
  const environment = installerEnvironment({
    PLAYWRIGHT_DOWNLOAD_HOST: 'https://untrusted.invalid', PLAYWRIGHT_CHROMIUM_DOWNLOAD_HOST: 'bad',
    npm_config_playwright_download_host: 'bad', npm_package_config_playwright_chromium_download_host: 'bad',
    PLAYWRIGHT_BROWSERS_PATH: 'other', PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1',
    NODE_OPTIONS: '--import attacker.mjs', NODE_PATH: 'attacker', HTTPS_PROXY: 'retained-existing-proxy',
  }, 'fixed-runtime');
  assert.equal(environment.PLAYWRIGHT_BROWSERS_PATH, 'fixed-runtime');
  assert.equal(environment.PLAYWRIGHT_SKIP_BROWSER_GC, '1');
  assert.equal(environment.HTTPS_PROXY, 'retained-existing-proxy');
  for (const key of Object.keys(environment)) assert.ok(!/download_host|node_options|node_path|skip_browser_download/i.test(key));
});

test('dedicated browser executable paths have no user channel/profile fallback', () => {
  assert.match(browserExecutableRelative('win32', 'x64').replaceAll('\\', '/'), /^chromium-1248\/chrome-win64\/chrome.exe$/);
  assert.match(browserExecutableRelative('linux', 'x64').replaceAll('\\', '/'), /^chromium-1248\/chrome-linux64\/chrome$/);
  assert.throws(() => browserExecutableRelative('darwin', 'arm64'));
});
