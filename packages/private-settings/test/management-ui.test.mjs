import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../management.html', import.meta.url), 'utf8');
test('management UI is self-contained, bounded and has no authority-bearing controls', () => {
  assert.ok(html.length < 40_000);
  assert.match(html, /lang="de"/);
  assert.match(html, /role="status"/);
  assert.doesNotMatch(html, /<script[^>]+src=|<iframe|https?:\/\/|fetch\(|XMLHttpRequest|WebSocket|localStorage|sessionStorage|innerHTML/);
  assert.doesNotMatch(html, /control-grant|workspace-grant|expiresAt\s*=|requestState|authorization|Bearer /);
  assert.match(html, /Noch nicht verfügbar/);
});

function harness() {
  const elements = new Map(), listeners = new Map(), calls = [];
  const element = id => {
    if (!elements.has(id)) elements.set(id, { textContent: '', disabled: ['stop', 'refresh', 'local-confirmation'].includes(id), dataset: {}, addEventListener(name, fn) { this[name] = fn; }, setAttribute() {} });
    return elements.get(id);
  };
  const parent = { postMessage(message) { calls.push(message); } };
  const window = { parent, addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name) };
  const document = { getElementById: element, addEventListener: (name, fn) => listeners.set('document:' + name, fn) };
  const script = /<script id="management-client">([\s\S]*?)<\/script>/.exec(html)?.[1];
  assert.ok(script);
  vm.runInNewContext(script, { window, document, Map, Set, Object, JSON, Error, Promise, Number, RegExp, setTimeout, clearTimeout });
  const reply = (request, result, source = parent) => listeners.get('message')?.({ source, origin: 'https://host.test', data: { jsonrpc: '2.0', id: request.id, result } });
  return { calls, elements, listeners, parent, reply, element };
}
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

test('in-app bridge ignores foreign replies and performs only status on initialization', async () => {
  const h = harness();
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].method, 'ui/initialize');
  h.reply(h.calls[0], { protocolVersion: '2026-01-26', hostCapabilities: { serverTools: {} } }, {}); await tick();
  assert.equal(h.calls.length, 1, 'foreign frame cannot complete initialization');
  h.reply(h.calls[0], { protocolVersion: '2026-01-26', hostCapabilities: { serverTools: {} } }); await tick();
  assert.equal(h.calls[1].method, 'ui/notifications/initialized');
  assert.equal(h.calls[2].method, 'tools/call');
  assert.equal(h.calls[2].params.name, 'desktop_control.control_status');
  h.reply(h.calls[2], { structuredContent: { packageVersion: '0.0.1-preview.5', platform: 'win32', controls: 'denied', diagnostics: 'denied', workspace: 'denied' } }); await tick();
  assert.equal(h.element('controls-state').textContent, 'Nicht freigegeben');
  assert.equal(h.element('package-version').textContent, '0.0.1-preview.5');
  assert.equal(h.calls.filter(call => call.method === 'tools/call').length, 1);
  // Explicit teardown prevents pending timers/listeners from surviving the view.
  h.listeners.get('message')({ source: h.parent, origin: 'https://host.test', data: { jsonrpc: '2.0', id: 80, method: 'ui/resource-teardown', params: {} } });
});

test('missing host capability leaves controls disabled and never falls back to direct network access', async () => {
  const h = harness(); h.reply(h.calls[0], { protocolVersion: '2026-01-26', hostCapabilities: {} }); await tick();
  assert.equal(h.calls.filter(call => call.method === 'tools/call').length, 0);
  assert.equal(h.element('stop').disabled, true);
  assert.match(h.element('notice').textContent, /unterstützt/);
  h.listeners.get('message')({ source: h.parent, origin: 'https://host.test', data: { jsonrpc: '2.0', id: 81, method: 'ui/resource-teardown', params: {} } });
});

test('native fallback requires its explicit button; Escape calls only the reducing stop tool', async () => {
  const h = harness(); h.reply(h.calls[0], { protocolVersion: '2026-01-26', hostCapabilities: { serverTools: {} } }); await tick();
  const status = { packageVersion: '0.0.1-preview.5', platform: 'win32', controls: 'active', diagnostics: 'denied', workspace: 'denied' };
  h.reply(h.calls[2], { structuredContent: status }); await tick();
  assert.equal(h.calls.some(call => call.params?.name === 'desktop_control.open_settings'), false);
  const local = h.element('local-confirmation').click();
  const localCall = h.calls.at(-1); assert.equal(localCall.params.name, 'desktop_control.open_settings');
  assert.deepEqual(JSON.parse(JSON.stringify(localCall.params.arguments)), {});
  h.reply(localCall, { structuredContent: { opened: true } }); await local;
  let prevented = false;
  h.listeners.get('document:keydown')({ key: 'Escape', preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  const stopCall = h.calls.at(-1); assert.equal(stopCall.params.name, 'desktop_control.stop_control');
  h.reply(stopCall, { structuredContent: { stopped: true } }); await tick();
  const refreshCall = h.calls.at(-1); assert.equal(refreshCall.params.name, 'desktop_control.control_status');
  h.reply(refreshCall, { structuredContent: { ...status, controls: 'denied' } }); await tick();
  assert.equal(h.element('controls-state').textContent, 'Nicht freigegeben');
  h.listeners.get('message')({ source: h.parent, origin: 'https://host.test', data: { jsonrpc: '2.0', id: 82, method: 'ui/resource-teardown', params: {} } });
});

test('unsupported UI protocol never enables action buttons', async () => {
  const h = harness(); h.reply(h.calls[0], { protocolVersion: 'unknown', hostCapabilities: { serverTools: {} } }); await tick();
  assert.equal(h.element('stop').disabled, true);
  assert.equal(h.calls.length, 1);
  h.listeners.get('message')({ source: h.parent, origin: 'https://host.test', data: { jsonrpc: '2.0', id: 83, method: 'ui/resource-teardown', params: {} } });
});
