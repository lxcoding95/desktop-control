// Fixed verification commands, raw logs, exit codes and hashes for one clean checkout.
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, createWriteStream, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../../', import.meta.url));
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
if (git('status', '--porcelain')) throw Error('Verify a clean committed checkout');
const head = git('rev-parse', 'HEAD');
const timestamp = new Date().toISOString();
const output = path.join(root, '.cache/private-builds/matrix', process.platform + '-' + timestamp.replace(/[:.]/g, '-'));
mkdirSync(output, { recursive: true });
const commands = [
  ['node-version', 'node', ['--version']], ['npm-version', 'npm', ['--version']], ['registry', 'npm', ['config', 'get', 'registry']],
  ['registry-ping', 'npm', ['ping', '--registry=https://registry.npmjs.org/']],
  ['npm-ci', 'npm', ['ci', '--ignore-scripts']], ['verify', 'npm', ['run', 'verify']],
  ['npm-ls', 'npm', ['ls', '--all']], ['npm-audit', 'npm', ['audit', '--json']], ['diff-check', 'git', ['diff', '--check']],
  ['archive-regressions', process.platform === 'win32' ? 'python' : 'python3', ['tools/plugin/test-archive.py']]
];
const receipt = { startedAt: timestamp, endedAt: null, platform: process.platform, architecture: process.arch, node: process.version, head, commands: [] };
for (const [name, command, args] of commands) {
  const log = path.join(output, name + '.log');
  const stream = createWriteStream(log);
  const startedAt = new Date().toISOString();
  console.log('START ' + name);
  const isWindowsNpm = process.platform === 'win32' && command === 'npm';
  // All shell words below are fixed constants from this file, never tool/user input.
  const child = spawn(isWindowsNpm ? process.env.ComSpec ?? 'C:\\Windows\\System32\\cmd.exe' : command,
    isWindowsNpm ? ['/d', '/s', '/c', ['npm', ...args].join(' ')] : args,
    { cwd: root, windowsHide: true, env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.pipe(stream, { end: false }); child.stderr.pipe(stream, { end: false });
  let error;
  const exitCode = await new Promise(resolve => { child.once('error', () => { error = 'COMMAND_UNAVAILABLE'; resolve(null); }); child.once('close', resolve); });
  await new Promise(resolve => stream.end(resolve));
  const bytes = readFileSync(log), text = bytes.toString('utf8');
  const totals = Object.fromEntries(['tests', 'pass', 'fail', 'skipped', 'cancelled'].map(key => [key,
    [...text.matchAll(new RegExp('(?:ℹ|#) ' + key + '\\s+(\\d+)', 'g'))].reduce((sum, match) => sum + Number(match[1]), 0)]));
  receipt.commands.push({ name, command: [command, ...args].join(' '), startedAt, endedAt: new Date().toISOString(), exitCode,
    ...(error ? { error } : {}), sha256: createHash('sha256').update(bytes).digest('hex'), ...(name === 'verify' ? { totals } : {}) });
  console.log('END ' + name + ' exit=' + exitCode + (name === 'verify' ? ' ' + JSON.stringify(totals) : ''));
  writeFileSync(path.join(output, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
}
receipt.endedAt = new Date().toISOString();
receipt.cleanAfter = !git('status', '--porcelain');
receipt.sameHead = git('rev-parse', 'HEAD') === head;
writeFileSync(path.join(output, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
console.log('RECEIPT ' + path.relative(root, path.join(output, 'receipt.json')));
if (!receipt.cleanAfter || !receipt.sameHead || receipt.commands.some(command => command.exitCode !== 0)) process.exitCode = 1;
