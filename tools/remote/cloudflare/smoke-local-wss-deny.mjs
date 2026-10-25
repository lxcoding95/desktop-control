#!/usr/bin/env node
/**
 * Local-only NEGATIVE WebSocket authentication integration smoke.
 *
 * Launches approved Worker source in Cloudflare workerd (Wrangler --local)
 * on 127.0.0.1. Uses a random, TEMPORARY test-only HMAC secret, NO approved
 * pairing records, NO OAuth, NO cloud account, and NO privileged MCP tools.
 * Do not deploy this fixture. This is NOT a test of valid device pairing.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const COMPAT_DATE = '2026-10-07'; // Max supported by pinned workerd (Windows confirmed).
const timeout = 30_000;

async function installedWrangler() {
  const filename = join(dir, 'node_modules', 'wrangler', 'package.json');
  const pkg = JSON.parse(await readFile(filename, 'utf8'));
  if (pkg.version !== '4.145.0') throw new Error('PINNED_WRANGLER_VERSION_REQUIRED');
  const bin = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin?.wrangler;
  if (typeof bin !== 'string' || bin.includes('..')) throw new Error('INVALID_WRANGLER_BIN');
  return resolve(dirname(filename), bin);
}
async function getPort() {
  return new Promise((resolve, reject) => {
    const listener = createServer();
    listener.once('error', reject);
    listener.listen(0, '127.0.0.1', () => {
      const port = listener.address().port;
      listener.close(error => error ? reject(error) : resolve(port));
    });
  });
}
function stopOwnChild(child) {
  if (!child?.pid || child.exitCode !== null) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
      windowsHide: true, timeout: 5000, stdio: 'ignore'
    });
  } else child.kill('SIGTERM');
}
async function request(base, pathname) {
  const response = await fetch(base + pathname, {
    redirect: 'manual', signal: AbortSignal.timeout(1000)
  });
  return [response.status, await response.text()];
}
async function expectWebSocketDenial(url, frame, label) {
  if (typeof WebSocket !== 'function') throw new Error('NATIVE_NODE_WEBSOCKET_REQUIRED');
  await new Promise((resolve, reject) => {
    let done = false;
    const ws = new WebSocket(url);
    const timer = setTimeout(() => finish(new Error(label + ': TIMEOUT')), 5000);
    function finish(error) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { ws.close(); } catch {}
      if (error) reject(error); else resolve();
    }
    ws.addEventListener('open', () => {
      try { ws.send(JSON.stringify(frame)); }
      catch { finish(new Error(label + ': SEND_FAILED')); }
    });
    ws.addEventListener('message', () => finish(new Error(label + ': UNEXPECTED_SERVER_REPLY')));
    ws.addEventListener('close', event => {
      if (event.code !== 1008) {
        finish(new Error(label + ': UNEXPECTED_CLOSE_' + event.code));
      } else finish();
    });
    ws.addEventListener('error', () => {
      // On some Node versions an 'error' precedes close. Observe close code.
    });
  });
}
async function run() {
  const wrangler = await installedWrangler();
  const port = await getPort();
  const scratch = await mkdtemp(join(tmpdir(), 'dc-workerd-wss-deny-'));
  const configFile = join(dir, '.dc-wss-local-' + randomUUID() + '.json');
  const key = randomBytes(32).toString('base64url');
  const config = {
    name: 'desktop-control-wss-local-deny',
    main: 'mcp-worker.ts',
    compatibility_date: COMPAT_DATE,
    compatibility_flags: ['nodejs_compat'],
    workers_dev: false, routes: [],
    vars: { ENABLE_REMOTE_HEALTH: '1', DEVICE_TICKET_HMAC_KEY: key },
    durable_objects: { bindings: [{ name: 'REMOTE_RELAY', class_name: 'RemoteHealthRelay' }] },
    migrations: [{ tag: 'local-wss-deny-v1', new_sqlite_classes: ['RemoteHealthRelay'] }]
  };
  const env = { ...process.env, CI: 'true' };
  for (const name of Object.keys(env)) {
    if (/^(CF_|CLOUDFLARE_|WRANGLER_)/i.test(name)) delete env[name];
  }
  env.WRANGLER_SEND_METRICS = 'false';
  let child;
  let diagnostics = '';
  try {
    // Deliberately local, one-time temporary fixture. No credentials logged.
    await writeFile(configFile, JSON.stringify(config, null, 2), { encoding: 'utf8', flag: 'wx' });
    child = spawn(process.execPath, [
      wrangler, 'dev', '--local', '--config', configFile,
      '--ip', '127.0.0.1', '--port', String(port),
      '--persist-to', scratch, '--log-level', 'error'
    ], { cwd: dir, env, windowsHide: true, stdio: ['ignore','pipe','pipe'] });
    child.on('error', () => {});
    const capture = buf => { diagnostics = (diagnostics + buf.toString('utf8')).slice(-4500); };
    child.stderr.on('data', capture);
    child.stdout.on('data', capture);
    const base = 'http://127.0.0.1:' + port;
    let ready = false;
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeout) {
      if (child.exitCode !== null || child.signalCode !== null) break;
      try {
        const [status] = await request(base, '/mcp');
        if (status === 503) { ready = true; break; }
      } catch { /* Waiting for loopback listener only. */ }
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    if (!ready) throw new Error('WORKER_START_FAILED\n' + diagnostics.slice(-1300));
    const [status, text] = await request(base, '/mcp');
    if (status !== 503 || text !== 'Service not configured') {
      throw new Error('OAUTH_GATE_UNEXPECTED_STATUS_' + status);
    }
    console.log('PASS /mcp unauthenticated HTTP_503');
    const wsurl = 'ws://127.0.0.1:' + port + '/device';
    const cases = [
      ['missing_ticket', { type: 'remote.device.authenticate', deviceId: 'pc-1', challenge: 'c-1' }],
      ['malformed_ticket', { type: 'remote.device.authenticate', deviceId: 'pc-1', challenge: 'c-2', ticket: 'bad' }],
      ['wrong_message_type', { type: 'remote.device.ready', deviceId: 'pc-1', challenge: 'c-3', ticket: 'x'.repeat(72) }],
      ['privileged_request', { type: 'desktop.terminal', command: 'whoami', id: 'c-4' }],
      ['syntactically_valid_but_unissued_ticket', {
        type: 'remote.device.authenticate', deviceId: 'pc-1',
        challenge: 'c-5', ticket: 'x'.repeat(72)
      }]
    ];
    for (const [label, frame] of cases) {
      await expectWebSocketDenial(wsurl, frame, label);
      console.log('PASS WSS_DENIED_' + label);
    }
    console.log('WSS_DENIALS=5');
    console.log('LOCAL_ONLY=true');
    console.log('PRODUCTION_AUTH=false');
    console.log('CLOUD_DEPLOYED=false');
    console.log('RESULT=WORKER_LOCAL_WSS_DENY_PASSED');
  } finally {
    stopOwnChild(child);
    await rm(configFile, { force: true }).catch(() => {});
    await rm(scratch, { recursive: true, force: true }).catch(() => {});
  }
}
try { await run(); }
catch (e) {
  console.error('RESULT=WORKER_LOCAL_WSS_DENY_FAILED');
  console.error(String(e?.message ?? e).slice(0,2000));
  process.exitCode = 1;
}
