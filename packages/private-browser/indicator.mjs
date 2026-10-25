/* global window, document, CustomEvent */

// Original page-local visual only. This DOM is not a trusted security boundary.
// No mousemove/pointermove listener exists: human movement never drives this AI
// indicator. The controller explicitly updates it immediately before input.
export function installBrowserIndicator() {
  if (window.top !== window) return;
  let cursor;
  let host;
  let position = { x: 32, y: 76 };
  function draw() {
    if (!cursor || !host) return;
    cursor.style.left = `${position.x}px`;
    cursor.style.top = `${position.y}px`;
    host.dataset.aiCursorX = String(position.x);
    host.dataset.aiCursorY = String(position.y);
  }
  function mount() {
    if (!document.documentElement || host?.isConnected) return;
    host = document.createElement('div');
    host.id = 'desktop-control-private-ai-indicator';
    host.style.cssText = 'all:initial!important;position:fixed!important;inset:0!important;pointer-events:none!important;z-index:2147483647!important;';
    const shadow = host.attachShadow({ mode: 'closed' });
    const banner = document.createElement('div');
    banner.textContent = 'Desktop-Control-Browser | ChatGPT controls your browser | Esc to stop';
    banner.setAttribute('role', 'status');
    banner.style.cssText = 'position:fixed;top:8px;left:50%;transform:translateX(-50%);padding:8px 16px;border:2px solid white;border-radius:8px;background:#111;color:white;font:600 14px/1.4 system-ui,sans-serif;box-shadow:0 2px 10px #0008;white-space:nowrap;';
    cursor = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    cursor.setAttribute('viewBox', '0 0 24 32');
    cursor.setAttribute('width', '24');
    cursor.setAttribute('height', '32');
    cursor.setAttribute('aria-hidden', 'true');
    cursor.style.cssText = 'position:fixed;filter:drop-shadow(1px 2px 2px #fff8);';
    const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    arrow.setAttribute('d', 'M2 1 L2 25 L8 19 L13 30 L18 28 L13 17 L22 17 Z');
    arrow.setAttribute('fill', '#000');
    arrow.setAttribute('stroke', '#fff');
    arrow.setAttribute('stroke-width', '1.5');
    arrow.setAttribute('stroke-linejoin', 'round');
    cursor.append(arrow);
    shadow.append(banner, cursor);
    document.documentElement.append(host);
    draw();
  }
  window.addEventListener('__desktopControlAiCursor', event => {
    const detail = event.detail;
    if (!detail || !Number.isFinite(detail.x) || !Number.isFinite(detail.y)) return;
    position = { x: Math.max(0, Math.min(window.innerWidth - 1, detail.x)), y: Math.max(0, Math.min(window.innerHeight - 1, detail.y)) };
    mount(); draw();
  });
  window.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (typeof window.__desktopControlEmergencyStop === 'function') {
      void Promise.resolve(window.__desktopControlEmergencyStop()).catch(() => {});
    }
  }, true);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();
}

export async function moveBrowserIndicator(page, x, y) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw Error('Invalid browser cursor position.');
  await page.mouse.move(x, y);
  await page.evaluate(({ x, y }) => window.dispatchEvent(new CustomEvent('__desktopControlAiCursor', { detail: { x, y } })), { x, y });
}
