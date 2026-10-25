import test from 'node:test';
import assert from 'node:assert/strict';
import { createBrowserController, normalizeBrowserUrl } from '../controller.mjs';
import { NO_SANDBOX_PATTERN, ownedProcessStopScript } from './owned-process-fixture.mjs';

test('native browser fixture detects real no-sandbox flag with preserved whitespace escapes', () => {
  const pattern = new RegExp(NO_SANDBOX_PATTERN);
  for (const line of ['chrome.exe --no-sandbox --other', 'chrome.exe\t--no-sandbox', '--no-sandbox']) assert.equal(pattern.test(line), true);
  for (const line of ['chrome.exe --no-sandbox-fake', 'chrome.exe --sandbox', 'chrome.exe --other']) assert.equal(pattern.test(line), false);
  assert.ok(ownedProcessStopScript.includes(NO_SANDBOX_PATTERN));
});

test('URL policy rejects non-web, credentials, and private destinations', () => {
  for (const url of ['file:///C:/Windows', 'data:text/html,hi', 'javascript:alert(1)', 'https://user:secret@example.com', 'http://127.0.0.1', 'http://[::1]', 'http://localhost', 'http://192.168.1.2', 'http://198.18.0.1', 'http://192.0.0.8', 'http://192.0.2.1', 'http://198.51.100.1', 'http://203.0.113.1']) {
    assert.throws(() => normalizeBrowserUrl(url));
  }
  assert.equal(normalizeBrowserUrl('https://example.com/path').origin, 'https://example.com');
  assert.equal(normalizeBrowserUrl('http://127.0.0.1:123', true).origin, 'http://127.0.0.1:123');
});

test('denied start and read never launch a browser; errors are redacted', async () => {
  const controller = createBrowserController({ authorize: async () => { throw new Error('private-profile SECRET'); } });
  await assert.rejects(controller.start(), { message: 'Browser permission denied.' });
  await assert.rejects(controller.snapshot(), { message: 'Browser permission denied.' });
  assert.deepEqual(await controller.stop(), { stopped: true });
});

test('empty, expired, oversized and malformed-origin grants deny before startup', async () => {
  for (const grant of [
    { expiresAt: Date.now() - 100, allowedOrigins: ['https://example.com'] },
    { expiresAt: Date.now() + 5000, allowedOrigins: [] },
    { expiresAt: Date.now() + 5000, allowedOrigins: Array(21).fill('https://example.com') },
    { expiresAt: Date.now() + 5000, allowedOrigins: ['https://example.com/path'] },
    { expiresAt: Infinity, allowedOrigins: ['https://example.com'] },
  ]) {
    const controller = createBrowserController({ authorize: async () => grant });
    await assert.rejects(controller.start(), { message: 'Browser permission denied.' });
  }
});
