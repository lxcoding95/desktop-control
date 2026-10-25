import { homedir } from 'node:os';
import { join } from 'node:path';
import { isIP } from 'node:net';
import { Buffer } from 'node:buffer';
import { setInterval, clearInterval } from 'node:timers';
import { managedBrowserExecutable } from './runtime.mjs';
import { installBrowserIndicator, moveBrowserIndicator } from './indicator.mjs';

const fail = (message) => Object.assign(new Error(message), { safeBrowserError: true });
const denied = () => fail('Browser permission denied.');
const LIMIT = 32768;

/** Authority callbacks may return an explicit persistent grant; absence never means forever. */
export function validBrowserAccessLifetime(grant, now = Date.now()) {
  if (!grant || typeof grant !== 'object' || !Number.isSafeInteger(now) || now < 0) return false;
  const current = expiry => Number.isSafeInteger(expiry) && expiry > now;
  if (!Object.hasOwn(grant, 'lifetime')) {
    if (!Object.hasOwn(grant, 'expiresAt')) return false;
    return current(typeof grant.expiresAt === 'number' ? grant.expiresAt : Date.parse(grant.expiresAt));
  }
  const lifetime = grant.lifetime;
  if (!lifetime || Object.getPrototypeOf(lifetime) !== Object.prototype) return false;
  if (lifetime.kind === 'until-revoked') return Object.keys(lifetime).join(',') === 'kind' && !Object.hasOwn(grant, 'expiresAt');
  return lifetime.kind === 'timed' && Object.keys(lifetime).sort().join(',') === 'expiresAt,kind' &&
    current(lifetime.expiresAt) && (!Object.hasOwn(grant, 'expiresAt') || grant.expiresAt === lifetime.expiresAt);
}

export function normalizeBrowserUrl(value, allowPrivateOrigins = false) {
  if (typeof value !== 'string' || value.length > 4096) throw denied();
  let url;
  try { url = new URL(value); } catch { throw denied(); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw denied();
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  const ip = isIP(host);
  const octets = host.split('.').map(Number);
  const privateHost = host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') ||
    (ip === 4 && (octets[0] === 0 || octets[0] === 10 || octets[0] === 127 || octets[0] >= 224 ||
      (octets[0] === 169 && octets[1] === 254) || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
      (octets[0] === 192 && (octets[1] === 168 || (octets[1] === 0 && [0, 2].includes(octets[2])))) ||
      (octets[0] === 198 && (octets[1] === 18 || octets[1] === 19 || (octets[1] === 51 && octets[2] === 100))) ||
      (octets[0] === 203 && octets[1] === 0 && octets[2] === 113) ||
      (octets[0] === 100 && octets[1] >= 64 && octets[1] <= 127))) ||
    (ip === 6 && !/^2[0-9a-f]{3}:/.test(host)) || !host.includes('.');
  if (privateHost && !allowPrivateOrigins) throw denied();
  return url;
}

/** Host-only constructor: never expose profileDirectory/allowPrivateOrigins as MCP arguments. */
export function createBrowserController({ authorize, profileDirectory = join(homedir(), '.desktop-control-private', 'browser-profile'), channel, allowPrivateOrigins = false, onEmergencyStop } = {}) {
  if (typeof authorize !== 'function') throw denied();
  if (channel !== undefined && channel !== 'msedge') throw denied();
  if (onEmergencyStop !== undefined && typeof onEmergencyStop !== 'function') throw denied();
  let context;
  let active;
  let timer;
  let queue = Promise.resolve();
  let sequence = 0;
  const ids = new Map();
  let closing;
  let generation = 0;
  let emergencyLatched = false;

  async function close() {
    generation++;
    clearInterval(timer);
    timer = undefined;
    const prior = context;
    context = undefined;
    active = undefined;
    ids.clear();
    if (prior) {
      closing = prior.close().catch(() => {});
      await closing;
      closing = undefined;
    } else if (closing) await closing;
  }

  async function check(capability, origin) {
    try {
      const grant = await authorize(capability, origin);
      if (!validBrowserAccessLifetime(grant) || !Array.isArray(grant?.allowedOrigins) || !grant.allowedOrigins.length || grant.allowedOrigins.length > 20) throw denied();
      const origins = grant.allowedOrigins.map(value => {
        const parsed = normalizeBrowserUrl(value, allowPrivateOrigins);
        if (parsed.origin !== value) throw denied();
        return value;
      });
      if (origin && !origins.includes(origin)) throw denied();
      return origins;
    } catch {
      await close();
      throw denied();
    }
  }

  function currentOrigin() {
    if (!active || active.isClosed() || active.url() === 'about:blank') return undefined;
    return normalizeBrowserUrl(active.url(), allowPrivateOrigins).origin;
  }

  function action(capability, fn, allowSelfClose = false) {
    const acceptedGeneration = generation;
    const result = queue.then(async () => {
      try {
        if (emergencyLatched || acceptedGeneration !== generation) throw fail('Browser was stopped.');
        await check(capability, currentOrigin());
        if (emergencyLatched || acceptedGeneration !== generation) throw fail('Browser was stopped.');
        const result = await fn(acceptedGeneration);
        if (emergencyLatched || (acceptedGeneration !== generation && !allowSelfClose)) throw fail('Browser was stopped.');
        return result;
      } catch (error) {
        if (error?.safeBrowserError) throw error;
        await close();
        throw fail('Browser action failed. Check the visible browser and local permissions.');
      }
    });
    queue = result.catch(() => {});
    return result;
  }

  function page() {
    if (!context || !active || active.isClosed()) throw fail('Browser is not running.');
    return active;
  }

  function bindPage(target) {
    ids.set(String(++sequence), target);
    target.setDefaultTimeout(5000);
    target.on('dialog', dialog => { void dialog.dismiss().catch(() => {}); });
    target.on('download', download => { void download.cancel().catch(() => {}); });
    target.on('close', () => {
      for (const [id, value] of ids) if (value === target) ids.delete(id);
      if (active === target) active = [...ids.values()].find(value => !value.isClosed());
    });
    target.on('framenavigated', frame => {
      if (frame.url() === 'about:blank') return;
      void (async () => {
        try { await check('browser.interact', normalizeBrowserUrl(frame.url(), allowPrivateOrigins).origin); }
        catch { await close(); }
      })();
    });
  }

  function locator(args = {}) {
    if (args.selector !== undefined) {
      if (typeof args.selector !== 'string' || !args.selector.length || args.selector.length > 512) throw fail('Invalid browser target.');
      return page().locator(args.selector);
    }
    if (typeof args.role !== 'string' || args.role.length > 64 || typeof args.name !== 'string' || args.name.length > 512) throw fail('Invalid browser target.');
    return page().getByRole(args.role, { name: args.name, exact: true });
  }

  async function indicatedTarget(args) {
    const target = locator(args);
    await target.scrollIntoViewIfNeeded({ timeout: 5000 });
    const bounds = await target.boundingBox();
    if (!bounds) throw fail('Invalid browser target.');
    await moveBrowserIndicator(page(), bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    return target;
  }

  async function goto(url, target = page()) {
    const parsed = normalizeBrowserUrl(url, allowPrivateOrigins);
    await check('browser.interact', parsed.origin);
    await target.goto(parsed.href, { timeout: 5000, waitUntil: 'domcontentloaded' });
    await check('browser.interact', normalizeBrowserUrl(target.url(), allowPrivateOrigins).origin);
    return { tabId: [...ids].find(([, value]) => value === target)?.[0], origin: parsed.origin };
  }

  return {
    start: () => action('browser.interact', async acceptedGeneration => {
      if (context) return { running: true };
      if (closing) await closing;
      const { chromium } = await import('playwright-core');
      const executable = channel ? { channel } : { executablePath: await managedBrowserExecutable() };
      const candidate = await chromium.launchPersistentContext(profileDirectory, {
        ...executable, headless: false, chromiumSandbox: true, viewport: { width: 1280, height: 720 }, timeout: 20000,
        acceptDownloads: false, serviceWorkers: 'block', permissions: [],
        args: ['--disable-background-networking', '--disable-component-update', '--disable-sync'],
      });
      if (acceptedGeneration !== generation) {
        await candidate.close();
        throw fail('Browser was stopped.');
      }
      context = candidate;
      candidate.on('close', () => {
        if (context !== candidate) return;
        generation++;
        clearInterval(timer);
        timer = undefined;
        context = undefined;
        active = undefined;
        ids.clear();
      });
      context.setDefaultTimeout(5000);
      await context.exposeBinding('__desktopControlEmergencyStop', async () => {
        if (emergencyLatched) return { stopped: true };
        // Latch before any asynchronous work: callback/persistence failures
        // must never permit this controller instance to restart after Esc.
        emergencyLatched = true;
        generation++;
        try {
          // Invoke the trusted host immediately so its connection gate and
          // durable revocation begin before browser cleanup. Do not await it:
          // the callback may itself stop this controller and await close().
          void Promise.resolve(onEmergencyStop?.()).catch(() => {});
        } catch { /* Synchronous host failure does not clear the local latch. */ }
        await close();
        return { stopped: true };
      });
      await context.addInitScript(installBrowserIndicator);
      await context.route('**/*', async route => {
        let response;
        try {
          const origin = normalizeBrowserUrl(route.request().url(), allowPrivateOrigins).origin;
          await check('browser.interact', origin);
          // Playwright's continue follows redirects without re-routing each hop.
          // Fetch exactly one response. All HTTP redirects fail closed: merely
          // validating the first hop is insufficient because later redirects of
          // that same request are not routed through Playwright again.
          response = await route.fetch({ maxRedirects: 0, maxRetries: 0, timeout: 5000 });
          if ([301, 302, 303, 307, 308].includes(response.status())) {
            await route.abort('blockedbyclient');
            return;
          }
          await check('browser.interact', origin);
          await route.fulfill({ response });
        } catch { await route.abort('blockedbyclient').catch(() => {}); }
        finally { await response?.dispose().catch(() => {}); }
      });
      // No WebSocket connections: allowlisted page origins are not a socket grant.
      await context.routeWebSocket('**/*', socket => socket.close());
      context.on('page', target => {
        if (ids.size >= 8) { void target.close().catch(() => {}); return; }
        bindPage(target);
        void (async () => {
          try {
            if (target.url() !== 'about:blank') await check('browser.interact', normalizeBrowserUrl(target.url(), allowPrivateOrigins).origin);
          } catch { await close(); }
        })();
      });
      for (const existing of context.pages()) await existing.close();
      active = await context.newPage();
      timer = setInterval(() => {
        void (async () => {
          try { await check('browser.interact', currentOrigin()); }
          catch { await close(); }
        })();
      }, 1000);
      timer.unref();
      return { running: true };
    }),
    navigate: ({ url } = {}) => action('browser.interact', () => goto(url)),
    snapshot: () => action('browser.read', async () => {
      const text = await page().locator('body').ariaSnapshot({ timeout: 5000 });
      return { snapshot: Buffer.from(text).subarray(0, LIMIT).toString('utf8'), truncated: Buffer.byteLength(text) > LIMIT };
    }),
    click: args => action('browser.interact', async () => { await (await indicatedTarget(args)).click({ timeout: 5000 }); return { clicked: true }; }),
    fill: args => action('browser.interact', async () => {
      if (typeof args?.value !== 'string' || Buffer.byteLength(args.value) > 8192) throw fail('Invalid browser input.');
      await (await indicatedTarget(args)).fill(args.value, { timeout: 5000 }); return { filled: true };
    }),
    press: args => action('browser.interact', async () => {
      if (!['Enter', 'Tab', 'Escape', 'Backspace', 'Delete', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown', 'Space'].includes(args?.key)) throw fail('Invalid browser key.');
      await (await indicatedTarget(args)).press(args.key, { timeout: 5000 }); return { pressed: true };
    }),
    scroll: ({ deltaY } = {}) => action('browser.interact', async () => {
      if (!Number.isInteger(deltaY) || Math.abs(deltaY) > 2000) throw fail('Invalid browser scroll.');
      const viewport = page().viewportSize();
      await moveBrowserIndicator(page(), (viewport?.width ?? 1280) / 2, (viewport?.height ?? 720) / 2);
      await page().mouse.wheel(0, deltaY); return { scrolled: true };
    }),
    screenshot: () => action('browser.read', async () => {
      const data = await page().screenshot({ type: 'png', fullPage: false, timeout: 5000 });
      if (data.length > 4 * 1024 * 1024) throw fail('Browser image exceeds size limit.');
      return { mimeType: 'image/png', data: data.toString('base64') };
    }),
    tabs: () => action('browser.read', async () => {
      page();
      const result = [];
      for (const [tabId, target] of ids) {
        if (target.isClosed()) continue;
        const origin = target.url() === 'about:blank' ? undefined : normalizeBrowserUrl(target.url(), allowPrivateOrigins).origin;
        await check('browser.read', origin);
        result.push({ tabId, origin: origin ?? 'about:blank', active: target === active });
      }
      return { tabs: result };
    }),
    newTab: ({ url } = {}) => action('browser.interact', async () => {
      page();
      if (ids.size >= 8) throw fail('Browser tab limit reached.');
      const parsed = normalizeBrowserUrl(url, allowPrivateOrigins);
      await check('browser.interact', parsed.origin);
      active = await context.newPage();
      return goto(url);
    }),
    selectTab: ({ tabId } = {}) => action('browser.interact', async () => {
      const target = ids.get(tabId);
      if (!target || target.isClosed()) throw fail('Unknown browser tab.');
      const origin = target.url() === 'about:blank' ? undefined : normalizeBrowserUrl(target.url(), allowPrivateOrigins).origin;
      await check('browser.interact', origin);
      await target.bringToFront();
      active = target;
      return { tabId, active: true };
    }),
    closeTab: ({ tabId } = {}) => action('browser.interact', async () => {
      const target = ids.get(tabId);
      if (!target || target.isClosed()) throw fail('Unknown browser tab.');
      await target.close();
      ids.delete(tabId);
      active = [...ids.values()].find(value => !value.isClosed());
      if (!active) await close();
      return { closed: true };
    }, true),
    // Safety shutdown is always available, including after a grant was revoked.
    stop: async () => { await close(); return { stopped: true }; },
  };
}
