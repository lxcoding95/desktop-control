#!/usr/bin/env node
/**
 * Local-only negative smoke test against real Cloudflare workerd via Wrangler.
 * Runs OUR OWN default-disabled Worker on 127.0.0.1 only. No deploy, OAuth
 * credentials, secrets, Cloudflare login or remote bindings are permitted.
 */
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const timeout = 30_000;
const config = join(dir, 'wrangler.mcp.local-smoke.jsonc');

async function freeLocalPort() {
  return await new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(error => error ? reject(error) : resolve(port));
    });
  });
}
async function wranglerPath() {
  const path = join(dir, 'node_modules', 'wrangler', 'package.json');
  const pkg = JSON.parse(await readFile(path, 'utf8'));
  if (pkg.version !== '4.152.0') {
    throw new Error('PINNED_WRANGLER_VERSION_REQUIRED');
  }
  const bin = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin?.wrangler;
  if (typeof bin !== 'string' || bin.includes('..')) throw new Error('INVALID_WRANGLER_BIN');
  return resolve(dirname(path), bin);
}
function stopOwnChild(child) {
  if (!child?.pid || child.exitCode !== null) return;
  if (process.platform === 'win32') {
    // Terminate ONLY the Wrangler process tree created above, including workerd.
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
      windowsHide: true, stdio: 'ignore', timeout: 5000
    });
  } else {
    child.kill('SIGTERM');
  }
}
async function get(url) {
  return await fetch(url, {
    redirect: 'manual',
    signal: AbortSignal.timeout(1000),
    headers: { 'accept': 'text/plain' }
  });
}
async function run() {
  const bin = await wranglerPath();
  const port = await freeLocalPort();
  const persistent = await mkdtemp(join(tmpdir(), 'desktop-control-workerd-smoke-'));
  const env = { ...process.env };
  // Avoid even presenting preconfigured production cloud credentials to Wrangler.
  for (const name of Object.keys(env)) {
    if (/^(CF_|CLOUDFLARE_|WRANGLER_)/i.test(name)) delete env[name];
  }
  env.CI = 'true';
  env.WRANGLER_SEND_METRICS = 'false';
  const args = [
    bin, 'dev', '--local',
    '--config', config, '--ip', '127.0.0.1',
    '--port', String(port), '--persist-to', persistent, '--log-level', 'error'
  ];
  let child;
  let diagnostics = '';
  const start = Date.now();
  try {
    child = spawn(process.execPath, args, {
      cwd: dir, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']
    });
    child.once('error', () => {});
    const remember = buf => {
      diagnostics = (diagnostics + buf.toString('utf8')).slice(-5000);
    };
    child.stdout.on('data', remember);
    child.stderr.on('data', remember);
    const base = 'http://127.0.0.1:' + port;
    let ready = false;
    while (Date.now() - start < timeout) {
      if (child.exitCode !== null || child.signalCode !== null) break;
      try {
        const r = await get(base + '/device');
        const body = await r.text();
        if (r.status === 503 && body === 'Device endpoint unavailable') {
          ready = true;
          break;
        }
      } catch {
        // The loopback listener isn't ready. This is not a network request.
      }
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    if (!ready) throw new Error('LOCAL_WORKER_NOT_READY\n' + diagnostics.slice(-1800));
    const cases = [
      ['/device', 503, 'Device endpoint unavailable'],
      ['/device?ticket=must-not-be-used', 503, 'Device endpoint unavailable'],
      ['/mcp', 503, 'Service not configured'],
      ['/health', 503, 'Service not configured'],
      ['/oauth/token', 503, 'Service not configured']
    ];
    for (const [path, status, expectedBody] of cases) {
      const response = await get(base + path);
      const body = await response.text();
      if (response.status !== status || body !== expectedBody) {
        throw new Error('UNEXPECTED_RESPONSE path=' + path + ' status=' + response.status);
      }
      console.log('PASS local_default_deny ' + path + ' HTTP_' + status);
    }
    console.log('SMOKE_TESTS=5');
    console.log('LOCAL_ONLY=true');
    console.log('CLOUD_DEPLOYED=false');
    console.log('RESULT=WORKER_LOCAL_DENY_PASSED');
  } finally {
    stopOwnChild(child);
    await rm(persistent, { recursive: true, force: true }).catch(() => {});
  }
}
try {
  await run();
} catch (error) {
  console.error('RESULT=WORKER_LOCAL_DENY_FAILED');
  console.error(String(error?.message ?? error).slice(0,2200));
  process.exitCode = 1;
}
