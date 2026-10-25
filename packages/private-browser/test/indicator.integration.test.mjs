/* global window, document */
import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { installBrowserIndicator, moveBrowserIndicator } from '../indicator.mjs';
import { managedBrowserExecutable } from '../runtime.mjs';

test('own visible page: AI cursor ignores independent trusted mouse moves; Esc invokes stop only', {
  skip: process.env.DC_BROWSER_INTERACTIVE_TEST !== '1' ? 'Requires explicitly coordinated visible browser fixture' : false,
  timeout: 30000,
}, async () => {
  const executable = process.env.DC_BROWSER_MANAGED_TEST === '1'
    ? { executablePath: await managedBrowserExecutable() } : { channel: 'msedge' };
  const browser = await chromium.launch({ ...executable, headless: false, chromiumSandbox: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    let stops = 0;
    await context.exposeBinding('__desktopControlEmergencyStop', () => { stops++; return { stopped: true }; });
    await context.addInitScript(installBrowserIndicator);
    const page = await context.newPage();
    await page.goto('data:text/html,<title>Desktop Control cursor fixture</title><body style="background:white"><h1>AI cursor fixture only</h1></body>');
    const cursor = () => page.evaluate(() => {
      const host = document.getElementById('desktop-control-private-ai-indicator');
      return { x: Number(host?.dataset.aiCursorX), y: Number(host?.dataset.aiCursorY) };
    });
    await moveBrowserIndicator(page, 200, 250);
    assert.deepEqual(await cursor(), { x: 200, y: 250 });
    // This generates real trusted DOM mousemove input without our indicator
    // update event; it models an independent pointer, not an OS SendInput call.
    await page.mouse.move(900, 600);
    assert.deepEqual(await cursor(), { x: 200, y: 250 });
    assert.match(await page.locator('body').ariaSnapshot(), /AI cursor fixture only/);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => window.__desktopControlEmergencyStop !== undefined);
    // Await the binding round trip without exposing arbitrary execution in MCP.
    for (let attempt = 0; attempt < 20 && stops === 0; attempt++) await new Promise(resolve => setTimeout(resolve, 25));
    assert.equal(stops, 1);
  } finally { await browser.close(); }
});
