import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createBrowserController } from '../controller.mjs';
import { ownedProcessStopScript } from './owned-process-fixture.mjs';

test('managed single-tab closure releases the profile before an immediate restart', {
  skip: process.env.DC_BROWSER_INTERACTIVE_TEST !== '1' ? 'Requires explicitly coordinated visible Desktop-Control-Browser fixture' : false,
  timeout: 90000,
}, async () => {
  const profileDirectory = await mkdtemp(join(tmpdir(), 'desktop-control-browser-fixture-'));
  const controller = createBrowserController({ profileDirectory, authorize: async () => ({
    expiresAt: Date.now() + 30000, allowedOrigins: ['https://example.com'],
  }) });
  try {
    for (let iteration = 0; iteration < 6; iteration++) {
      assert.deepEqual(await controller.start(), { running: true });
      const tabs = (await controller.tabs()).tabs;
      assert.equal(tabs.length, 1);
      assert.deepEqual(await controller.closeTab({ tabId: tabs[0].tabId }), { closed: true });
    }
  } finally {
    await controller.stop();
    await rm(profileDirectory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});

test('headed private browser: own fixture interactions, exact origins and revocation', {
  skip: process.env.DC_BROWSER_INTERACTIVE_TEST !== '1' ? 'Requires explicitly coordinated visible Desktop-Control-Browser fixture' : false,
  timeout: 90000,
}, async () => {
  let secondHits = 0;
  const foreign = createServer((_request, response) => { secondHits++; response.end('outside grant'); });
  foreign.listen(0, '127.0.0.1');
  await once(foreign, 'listening');
  const otherOrigin = `http://127.0.0.1:${foreign.address().port}`;
  const fixture = createServer((request, response) => {
    if (request.url === '/chain') { response.writeHead(302, { location: '/redirect' }); response.end(); return; }
    if (request.url === '/redirect') { response.writeHead(302, { location: otherOrigin }); response.end(); return; }
    response.setHeader('content-type', 'text/html; charset=utf-8');
    response.end('<!doctype html><title>Desktop Control private fixture</title><h1>Private browser fixture</h1><label>Fixture input<input aria-label="Fixture input"></label><button onclick="this.textContent=\'Clicked\'">Test button</button>');
  });
  fixture.listen(0, '127.0.0.1');
  await once(fixture, 'listening');
  const origin = `http://127.0.0.1:${fixture.address().port}`;
  const profileDirectory = await mkdtemp(join(tmpdir(), 'desktop-control-browser-fixture-'));
  let granted = true;
  let emergencyStops = 0;
  const controller = createBrowserController({ profileDirectory, allowPrivateOrigins: true, onEmergencyStop: () => { emergencyStops++; throw new Error('FIXTURE_HOST_CALLBACK_FAILURE'); }, authorize: async (_capability, requestedOrigin) => {
    if (!granted || (requestedOrigin && requestedOrigin !== origin)) throw new Error('fixture denied');
    return { expiresAt: Date.now() + 30000, allowedOrigins: [origin] };
  } });
  let stage = 'initial startup';
  try {
    assert.deepEqual(await controller.start(), { running: true });
    stage = 'initial navigation';
    assert.equal((await controller.navigate({ url: origin })).origin, origin);
    stage = 'initial snapshot';
    assert.match((await controller.snapshot()).snapshot, /Private browser fixture/);
    stage = 'initial fill';
    await controller.fill({ role: 'textbox', name: 'Fixture input', value: 'fixture only' });
    stage = 'initial click';
    await controller.click({ role: 'button', name: 'Test button' });
    assert.match((await controller.snapshot()).snapshot, /Clicked/);
    const image = await controller.screenshot();
    assert.equal(image.mimeType, 'image/png');
    assert.ok(image.data.length > 16); // Never print or persist private pixels.
    stage = 'tab lifecycle';
    assert.equal((await controller.tabs()).tabs.length, 1);
    const originalTab = (await controller.tabs()).tabs[0].tabId;
    await controller.newTab({ url: origin });
    assert.equal((await controller.tabs()).tabs.length, 2);
    await controller.selectTab({ tabId: originalTab });
    assert.equal((await controller.tabs()).tabs.find(tab => tab.active).tabId, originalTab);
    stage = 'interrupt pending locator';
    const waiting = controller.click({ role: 'button', name: 'Never present' });
    const rejected = assert.rejects(waiting);
    await delay(100);
    const stopStarted = Date.now();
    await controller.stop();
    assert.ok(Date.now() - stopStarted < 2000, 'stop must interrupt an active locator instead of queueing behind its timeout');
    await rejected;
    await controller.start();
    await controller.navigate({ url: origin });
    stage = 'active-process crash and queued input';
    // Terminate only the browser whose command line contains this freshly
    // created unique test profile. No normal user profile/process is targeted.
    const running = controller.click({ role: 'button', name: 'Never present before fixture crash' });
    const pendingCrash = running.then(() => ({ succeeded: true }), error => ({ error: error.message }));
    const stale = controller.fill({ role: 'textbox', name: 'Fixture input', value: 'must not dispatch after crash' });
    const staleRejected = stale.then(() => ({ succeeded: true }), error => ({ error: error.message }));
    await delay(100);
    const killed = await promisify(execFile)('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      ownedProcessStopScript], {
      env: { ...process.env, DC_BROWSER_FIXTURE_PROFILE: profileDirectory, DC_BROWSER_FIXTURE_PROCESS: 'chrome.exe' }, timeout: 10000, windowsHide: true,
    });
    assert.equal(killed.stdout.trim(), '1');
    assert.ok((await pendingCrash).error);
    assert.deepEqual(await staleRejected, { error: 'Browser was stopped.' });
    await assert.rejects(controller.snapshot(), { message: 'Browser is not running.' });
    stage = 'active-process restart';
    await controller.start();
    await controller.navigate({ url: origin });
    assert.match((await controller.snapshot()).snapshot, /Private browser fixture/);
    stage = 'idle-process crash and restart';
    // Also exercise idle closure: there is no failed in-flight action whose
    // catch handler could incidentally clear the stale context for us.
    await promisify(execFile)('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      ownedProcessStopScript], {
      env: { ...process.env, DC_BROWSER_FIXTURE_PROFILE: profileDirectory, DC_BROWSER_FIXTURE_PROCESS: 'chrome.exe' }, timeout: 10000, windowsHide: true,
    });
    await delay(500);
    await controller.start();
    await controller.navigate({ url: origin });
    assert.match((await controller.snapshot()).snapshot, /Private browser fixture/);
    stage = 'revocation and blocked redirect';
    granted = false;
    await assert.rejects(controller.click({ role: 'button', name: 'Test button' }), { message: 'Browser permission denied.' });
    assert.deepEqual(await controller.stop(), { stopped: true });
    granted = true;
    await controller.start();
    await assert.rejects(controller.navigate({ url: `${origin}/chain` }));
    assert.equal(secondHits, 0, 'outside-origin redirect must be blocked before its HTTP request');
    await assert.rejects(controller.snapshot(), { message: 'Browser is not running.' });
    await controller.start();
    const lastTab = (await controller.tabs()).tabs[0].tabId;
    assert.deepEqual(await controller.closeTab({ tabId: lastTab }), { closed: true });
    stage = 'page Escape restart after last-tab closure';
    await controller.start();
    stage = 'page Escape own-fixture navigation';
    await controller.navigate({ url: origin });
    stage = 'page Escape dispatch';
    await controller.press({ role: 'textbox', name: 'Fixture input', key: 'Escape' }).catch(() => {});
    stage = 'page Escape latch and failed host callback';
    for (let attempt = 0; attempt < 20 && emergencyStops === 0; attempt++) await delay(25);
    assert.equal(emergencyStops, 1, 'page Esc must notify only the host stop callback');
    await assert.rejects(controller.snapshot(), { message: 'Browser was stopped.' });
    await assert.rejects(controller.start(), { message: 'Browser was stopped.' });
    await controller.stop();
    await assert.rejects(controller.start(), { message: 'Browser was stopped.' });
  } catch (error) {
    throw new Error(`Owned-browser fixture failed at ${stage}.`, { cause: error });
  } finally {
    await controller.stop();
    fixture.closeAllConnections(); foreign.closeAllConnections();
    await Promise.all([new Promise(resolve => fixture.close(resolve)), new Promise(resolve => foreign.close(resolve))]);
    await rm(profileDirectory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});
