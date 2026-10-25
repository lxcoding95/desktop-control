#!/usr/bin/env node
// Lightweight deny-by-default public-content guard; NOT a substitute for history scanners.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { constants as fsConstants, closeSync, fstatSync, lstatSync, openSync, readFileSync, realpathSync } from 'node:fs';
import { resolve, relative, isAbsolute, sep, join } from 'node:path';

const MAX_FILE = 8 * 1024 * 1024;
const MAX_INVENTORY = 16 * 1024 * 1024;
const MAX_FINDINGS = 1000;
const args = process.argv.slice(2);
const json = args.includes('--json');
const validArgs = args.every((v, i) => v === '--json' || v === '--root' || (args[i - 1] === '--root' && !v.startsWith('--')));
const rootOption = args.indexOf('--root');
if (!validArgs || (rootOption >= 0 && (!args[rootOption + 1] || args[rootOption + 1].startsWith('--')))) {
  process.stderr.write('ERROR: invalid arguments; use [--root DIRECTORY] [--json].\n');
  process.exit(2);
}
const root = resolve(rootOption >= 0 ? args[rootOption + 1] : process.cwd());
const patterns = [
  ['private-key', /-----BEGIN (?:OPENSSH|RSA|EC|DSA|ENCRYPTED|PGP)?\s*PRIVATE KEY-----/g],
  ['known-token', /(?:github_pat_[A-Za-z0-9_]{20,}|gh[pousr]_[A-Za-z0-9_]{20,}|sk-proj-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{30,})/g],
  ['credential-assignment', /\b(?:password|passwd|private[_-]?key|client[_-]?secret|access[_-]?token|api[_-]?key)\s*[:=]\s*["']?(?!REDACTED\b|EXAMPLE\b|PLACEHOLDER\b)[A-Za-z0-9_+/.=-]{12,}/gi],
  ['windows-user-home', /[A-Za-z]:\\Users\\[^\\\s\r\n"'<>]+/g],
  ['linux-user-home', /\/home\/[A-Za-z_][A-Za-z0-9_.-]+\//g],
  ['email-address', /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi],
  ['private-ipv4', /\b(?:192\.168|10\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01]))\.\d{1,3}\.\d{1,3}\b/g],
  ['windows-sid', /\bS-1-5-21-\d+-\d+-\d+-\d+\b/g],
];
const filenameSensitive = /(?:[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|(?:^|\/)\.env(?:\.|$)|\.(?:p12|pfx|pem|key|kdbx|sqlite|db|bak)$)/i;
const findings = [];
let truncated = false;
const opaque = path => '[file-sha256:' + createHash('sha256').update(path).digest('hex').slice(0, 16) + ']';
const add = (path, source, rule, line = null) => {
  if (findings.length >= MAX_FINDINGS) { truncated = true; return; }
  findings.push({ path: opaque(path), source, rule, line });
};
const git = (command, ...argv) => execFileSync('git', [command, ...argv], {
  cwd: root, encoding: null, maxBuffer: MAX_INVENTORY, stdio: ['ignore', 'pipe', 'ignore'],
});
const nulItems = bytes => {
  const items = [];
  let start = 0;
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] !== 0) continue;
    if (i > start) items.push(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(start, i)));
    start = i + 1;
  }
  if (start !== bytes.length) throw new Error('INVALID_GIT_INVENTORY');
  return items;
};
const included = file => {
  if (typeof file !== 'string' || file.includes('\0') || file === '' || isAbsolute(file) || file === '..' || file.startsWith('../') || file.includes('/../') || file.includes('\\')) return false;
  const full = resolve(root, file);
  return full !== root && full.startsWith(root + sep) && !relative(root, full).startsWith('..');
};
function checkPathComponents(file) {
  const parts = file.split('/');
  let current = root;
  // A symlinked ancestor may redirect outside the repo despite a safe string prefix.
  for (const part of parts.slice(0, -1)) {
    current = join(current, part);
    const st = lstatSync(current);
    if (!st.isDirectory() || st.isSymbolicLink()) return 'unreviewed-path-component';
  }
  const full = resolve(root, file);
  const st = lstatSync(full);
  if (st.isSymbolicLink()) return 'unreviewed-symlink';
  if (!st.isFile()) return 'unreviewed-file-type';
  if (st.size > MAX_FILE) return 'oversize-requires-review';
  return null;
}
function reviewBytes(file, source, body) {
  if (body.length > MAX_FILE) { add(file, source, 'oversize-requires-review'); return; }
  if (body.includes(0)) { add(file, source, 'binary-requires-review'); return; }
  let content;
  try { content = new TextDecoder('utf-8', { fatal: true }).decode(body); }
  catch { add(file, source, 'invalid-utf8-requires-review'); return; }
  if (/[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(content)) { add(file, source, 'binary-requires-review'); return; }
  const newlineOffsets = [];
  for (let i = 0; i < content.length; ++i) if (content.charCodeAt(i) === 10) newlineOffsets.push(i);
  const lineNumber = index => {
    let lo = 0, hi = newlineOffsets.length;
    while (lo < hi) { const mid = (lo + hi) >>> 1; if (newlineOffsets[mid] < index) lo = mid + 1; else hi = mid; }
    return lo + 1;
  };
  for (const [rule, re] of patterns) {
    re.lastIndex = 0;
    let match;
    while ((match = re.exec(content)) !== null) {
      add(file, source, rule, lineNumber(match.index));
      if (truncated) return;
      if (match[0].length === 0) re.lastIndex++;
    }
  }
}
let count = 0;
let phase = 'root-validation';
try {
  // Reject an arbitrary subdirectory that could silently reduce scan scope.
  const gitRoot = git('rev-parse', '--show-toplevel').toString('utf8').trim();
  // Git for Windows may spell the same on-disk root with slash and case differences.
  // Compare canonical filesystem identities, not the textual spelling of a path.
  const a = realpathSync.native(root);
  const b = realpathSync.native(resolve(gitRoot));
  const same = process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
  if (!same) throw new Error('GIT_ROOT_MISMATCH');
  phase = 'index-inventory';
  // Git index and working tree are independent. Scanning only working tree is unsafe:
  // a staged secret can be overwritten in the worktree and still be committed.
  const index = new Map();
  for (const rec of nulItems(git('ls-files', '--stage', '-z'))) {
    const m = /^(\d{6}) ([a-f0-9]{40,64}) ([0-3])\t([\s\S]+)$/.exec(rec);
    if (!m) throw new Error('INVALID_INDEX_RECORD');
    const [,mode,sha,stage,file] = m;
    if (!index.has(file)) index.set(file, []);
    index.get(file).push({ mode, sha, stage });
  }
  phase = 'untracked-inventory';
  const untracked = new Set(nulItems(git('ls-files', '--others', '--exclude-standard', '-z')));
  const files = [...new Set([...index.keys(), ...untracked])].sort();
  count = files.length;
  phase = 'file-inspection';
  for (const file of files) {
    if (!included(file)) { add(file, 'inventory', 'path-escape'); continue; }
    if (filenameSensitive.test(file)) add(file, 'inventory', 'sensitive-filename');
    for (const { mode, sha, stage } of index.get(file) ?? []) {
      if (stage !== '0') { add(file, 'index', 'unmerged-index-stage'); continue; }
      if (mode !== '100644' && mode !== '100755') { add(file, 'index', 'unreviewed-git-mode'); continue; }
      try {
        const size = Number(git('cat-file', '-s', sha).toString('ascii').trim());
        if (!Number.isSafeInteger(size) || size > MAX_FILE) { add(file, 'index', 'oversize-requires-review'); continue; }
        reviewBytes(file, 'index', git('cat-file', 'blob', sha));
      } catch { add(file, 'index', 'unreadable-index-blob'); }
    }
    try {
      const issue = checkPathComponents(file);
      if (issue) { add(file, 'worktree', issue); continue; }
      // Use a no-follow file descriptor where the platform exposes O_NOFOLLOW,
      // and reject replacement between lstat and open by comparing file IDs.
      // This does not replace an OS-isolated pre-commit build environment.
      const full = resolve(root, file);
      const before = lstatSync(full);
      const fd = openSync(full, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
      try {
        const after = fstatSync(fd);
        if (!after.isFile() || after.dev !== before.dev || after.ino !== before.ino || after.size > MAX_FILE) {
          add(file, 'worktree', 'changed-during-scan');
          continue;
        }
        reviewBytes(file, 'worktree', readFileSync(fd));
      } finally { closeSync(fd); }
    } catch { add(file, 'worktree', 'unreadable-worktree-file'); }
  }
} catch (err) {
  const reason = ['GIT_ROOT_MISMATCH', 'INVALID_INDEX_RECORD', 'INVALID_GIT_INVENTORY'].includes(err?.message) ? err.message : 'IO_OR_GIT_FAILURE';
  // Only fixed machine-readable categories; never include OS path or Git stderr.
  process.stderr.write('ERROR: Preflight unavailable [' + phase + ':' + reason + ']. No content certified.\n');
  process.exit(2);
}
if (truncated) findings.push({ path: '[multiple]', source: 'inventory', rule: 'findings-limit-exceeded', line: null });
const result = { status: findings.length ? 'BLOCK' : 'PASS-LIMITED', filesChecked: count, findings };
process.stdout.write(json ? JSON.stringify(result) + '\n' : result.status + ': ' + count + ' files; ' + findings.length + ' finding(s)\n' + findings.map(f => f.path + ':' + (f.line ?? '?') + ' [' + f.source + '] ' + f.rule).join('\n') + '\n');
if (findings.length) process.exitCode = 1;
