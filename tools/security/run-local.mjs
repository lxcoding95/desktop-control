#!/usr/bin/env node
/**
 * Local-only S02 security toolchain.
 * GitHub release assets are version-pinned and SHA256 checked before execution.
 * No CI, PR publishing, credentials, host privilege changes, or background service.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const here = join(root, 'tools', 'security');
const lock = JSON.parse(readFileSync(join(here, 'toolchain.lock.json'), 'utf8'));
const platform = process.platform + '-' + process.arch;
const installation = join(here, '.installed', platform);
const reports = join(here, '.reports');
const mode = process.argv[2] ?? 'help';
const tools = ['opengrep', 'osv-scanner', 'reviewdog'];
const toolBin = (id) => join(installation, id, lock.tools[id].assets[platform].executable);
const sourceAsset = (id) => join(installation, id, 'verified-' + lock.tools[id].assets[platform].file);

function demand(condition, message) {
  if (!condition) throw new Error(message);
}
function run(binary, args, options={}) {
  const started = new Date().toISOString();
  const out = spawnSync(binary, args, {
    cwd: root, encoding: 'utf8', windowsHide: true,
    maxBuffer: 32 * 1024 * 1024,
    input: options.input,
    timeout: options.timeout ?? 180_000
  });
  return {
    started, command: [basename(binary), ...args], exit: out.status,
    signal: out.signal, error: out.error?.message ?? null,
    stdout: out.stdout ?? '', stderr: out.stderr ?? ''
  };
}
function digest(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}
async function installOne(id) {
  const tool = lock.tools[id];
  const asset = tool.assets[platform];
  demand(asset, 'Unsupported platform ' + platform + '; no unverified fallback');
  const sourcePath = sourceAsset(id);
  const folder = dirname(sourcePath);
  mkdirSync(folder, { recursive: true });
  if (existsSync(sourcePath)) {
    const actual = digest(readFileSync(sourcePath));
    if (actual !== asset.sha256) throw new Error('Cached release digest MISMATCH: ' + id);
  } else {
    demand(asset.url.startsWith('https://github.com/'), 'Release URL not github.com: ' + id);
    const response = await fetch(asset.url, { signal: AbortSignal.timeout(180_000) });
    demand(response.ok, 'Download failed: ' + id + ', HTTP ' + response.status);
    const buffer = Buffer.from(await response.arrayBuffer());
    demand(digest(buffer) === asset.sha256, 'Publisher asset SHA256 MISMATCH: ' + id);
    writeFileSync(sourcePath, buffer, { flag: 'wx' });
  }
  if (asset.archive) {
    const result = run('tar', ['-xzf', sourcePath, '-C', folder]);
    demand(result.exit === 0, 'Verified archive extraction failed: ' + id + ': ' + result.stderr);
    // Find expected executable, allowing official archives to contain a folder.
    const expected = asset.executable;
    const queue = [{ path: folder, level: 0 }];
    let found;
    while (queue.length && !found) {
      const item = queue.shift();
      if (item.level > 3) continue;
      for (const name of readdirSync(item.path)) {
        const candidate = join(item.path, name);
        if (candidate === sourcePath) continue;
        if (statSync(candidate).isDirectory()) queue.push({ path: candidate, level: item.level + 1 });
        else if (name.toLowerCase() === expected.toLowerCase()) {
          found = candidate;
          break;
        }
      }
    }
    demand(found, 'Executable missing in archive: ' + id + ' ' + expected);
    // Always refer to the binary as actually extracted; no PATH changes.
    if (resolve(found) !== resolve(toolBin(id))) {
      const { copyFileSync } = await import('node:fs');
      copyFileSync(found, toolBin(id));
    }
  } else if (sourcePath !== toolBin(id)) {
    const { copyFileSync } = await import('node:fs');
    copyFileSync(sourcePath, toolBin(id));
  }
  if (process.platform !== 'win32') chmodSync(toolBin(id), 0o700);
  const probe = run(toolBin(id), ['--help'], { timeout: 20_000 });
  demand(probe.exit === 0, id + ' installed but --help failed (exit ' + probe.exit + '): ' + probe.stderr.slice(-700));
  return { id, version: tool.version, asset: asset.file, sha256: asset.sha256, helpExit: probe.exit };
}
function checkInstalled() {
  for (const id of tools) {
    demand(lock.tools[id]?.assets?.[platform], 'Unsupported platform ' + platform);
    demand(existsSync(toolBin(id)) && existsSync(sourceAsset(id)), id + ' not installed. Run install.');
    const expected = lock.tools[id].assets[platform].sha256;
    demand(digest(readFileSync(sourceAsset(id))) === expected, id + ': cached release digest mismatch');
  }
}
function redactRun(record) {
  return {
    started: record.started, command: record.command, exit: record.exit,
    signal: record.signal, error: record.error,
    stderrTail: record.stderr.slice(-3000)
  };
}
function output(name, data) {
  mkdirSync(reports, { recursive: true });
  writeFileSync(join(reports, name), data);
}
function sourceTargets(folder) {
  const targets = [];
  for (const item of readdirSync(folder, { withFileTypes: true })) {
    const p = join(folder, item.name);
    if (item.isDirectory()) targets.push(...sourceTargets(p));
    else if (item.isFile() && (p.endsWith('.mts') || p.endsWith('.ts') || p.endsWith('.mjs')))
      targets.push(p);
  }
  return targets;
}
function opengrepArgs(fmt, path) {
  return [
    'scan', '--scan-unknown-extensions', '--config', join(here, 'rules.yml'),
    fmt === 'sarif' ? '--sarif' : '--json',
    '-o', path,
    '--error'
  ];
}
async function scan() {
  checkInstalled();
  mkdirSync(reports, { recursive: true });
  // Target only S02 product source. Never silently scan or execute the fixtures.
  const sarif = join(reports, 'opengrep.sarif');
  const targets = sourceTargets(join(root, 'packages', 'mcp-server', 'src'));
  demand(targets.length >= 4, 'Source target discovery found too few files; refusing empty SAST scan');
  const og = run(toolBin('opengrep'), [
    ...opengrepArgs('sarif', sarif),
    ...targets
  ]);
  output('opengrep.stderr.txt', og.stderr);
  const osv = run(toolBin('osv-scanner'), [
    'scan', 'source', '--lockfile', 'package-lock.json',
    '--format', 'json', '--output-file', join(reports, 'osv.json')
  ], { timeout: 240_000 });
  output('osv.stderr.txt', osv.stderr);
  let dog = { started: new Date().toISOString(), command: ['reviewdog'], exit: null,
              signal: null, error: 'No Opengrep SARIF output', stderr: '' };
  if (existsSync(sarif)) {
    dog = run(toolBin('reviewdog'), [
      '-f=sarif', '-reporter=rdjson', '-filter-mode=nofilter'
    ], { input: readFileSync(sarif, 'utf8') });
    output('reviewdog.rdjson', dog.stdout);
    output('reviewdog.stderr.txt', dog.stderr);
  }
  const summary = {
    generated: new Date().toISOString(), scope: 'S02 source + project package-lock',
    head: run('git', ['rev-parse', 'HEAD']).stdout.trim(),
    results: { opengrep: redactRun(og), osv: redactRun(osv), reviewdog: redactRun(dog) },
    note: 'Local scans, not an independent semantic code review or CI. Findings must be triaged; no token or PR reporter used.'
  };
  output('summary.json', JSON.stringify(summary, null, 2) + '\n');
  console.log(JSON.stringify({
    reportDirectory: join(here, '.reports'),
    exitCodes: Object.fromEntries(Object.entries(summary.results).map(([k,v])=>[k,v.exit]))
  }));
  demand([og, osv, dog].every(x => x.exit === 0),
    'Security scanner failed or found findings. Read tools/security/.reports/summary.json; do NOT merge.');
}
async function selftest() {
  checkInstalled();
  mkdirSync(reports, { recursive: true });
  const resultFile = join(reports, 'positive-control.json');
  const result = run(toolBin('opengrep'), [
    ...opengrepArgs('json', resultFile),
    join(here, 'fixtures', 'intentionally-unsafe.ts')
  ]);
  demand(existsSync(resultFile), 'Opengrep positive control generated no output');
  const parsed = JSON.parse(readFileSync(resultFile, 'utf8'));
  demand(Array.isArray(parsed.results) && parsed.results.some(v => v.check_id?.includes('no-dynamic-eval')),
    'Opengrep did not find deliberately unsafe eval fixture');
  demand(result.exit === 1, 'Expected Opengrep --error exit1 on fixture, got ' + result.exit);
  console.log('PASS: local SAST positive control detected deliberate eval and exited nonzero.');
}
if (mode === 'help') {
  console.log('Use: node tools/security/run-local.mjs install|selftest|scan');
} else if (mode === 'install') {
  try {
    demand(lock.schemaVersion === 1, 'Toolchain lock schema mismatch');
    for (const id of tools) console.log(JSON.stringify(await installOne(id)));
    console.log('Installed pinned, SHA256-verified local scanners; no system PATH or admin changes.');
  } catch (error) {
    console.error(error.message); process.exitCode = 1;
  }
} else if (mode === 'selftest' || mode === 'scan') {
  try { await (mode === 'selftest' ? selftest() : scan()); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
} else {
  console.error('Unknown mode: ' + mode); process.exitCode = 2;
}
