#!/usr/bin/env node
// Lightweight deny-by-default public-content guard; NOT a substitute for history scanners.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync } from 'node:fs';
import { resolve, relative, isAbsolute, sep } from 'node:path';

const args = process.argv.slice(2);
const rootIndex = args.indexOf('--root');
if (rootIndex !== -1 && (!args[rootIndex + 1] || args[rootIndex + 1].startsWith('--'))) {
  process.stderr.write('usage: node tools/governance/public-guard.mjs [--root DIRECTORY] [--json]\n');
  process.exit(2);
}
const root = resolve(rootIndex !== -1 ? args[rootIndex + 1] : process.cwd());
const json = args.includes('--json');
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
const findings = [];
let files = [];
try {
  files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
    cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
  }).split('\0').filter(Boolean);
} catch {
  process.stderr.write('ERROR: Git inventory unavailable; cannot certify repository content.\n');
  process.exit(2);
}
files = [...new Set(files)].sort();
const filenameSensitive = /(?:[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|(?:^|\/)\.env(?:\.|$)|\.(?:p12|pfx|pem|key|kdbx|sqlite|db|bak)$)/i;
const safePath = path => filenameSensitive.test(path) ? '[sensitive-filename-sha256:' + createHash('sha256').update(path).digest('hex').slice(0, 12) + ']' : path;
const add = (path, rule, line = null) => findings.push({ path: safePath(path), rule, line });
for (const file of files) {
  if (filenameSensitive.test(file)) add(file, 'sensitive-filename');
  const full = resolve(root, file);
  if (full !== root && !full.startsWith(root + sep)) { add(file, 'path-escape'); continue; }
  if (isAbsolute(file) || relative(root, full).startsWith('..')) { add(file, 'path-escape'); continue; }
  let st;
  try { st = lstatSync(full); } catch { add(file, 'missing-file'); continue; }
  if (st.isSymbolicLink()) { add(file, 'unreviewed-symlink'); continue; }
  if (!st.isFile()) continue;
  // Binary content is not silently exempt: it requires explicit independent inspection.
  const body = readFileSync(full);
  if (body.includes(0)) { add(file, 'binary-requires-review'); continue; }
  const content = body.toString('utf8');
  for (const [rule, regex] of patterns) {
    regex.lastIndex = 0;
    let m;
    while ((m = regex.exec(content)) !== null) {
      const line = content.slice(0, m.index).split('\n').length;
      add(file, rule, line);
      if (m[0].length === 0) regex.lastIndex++;
    }
  }
}
const output = { status: findings.length ? 'BLOCK' : 'PASS-LIMITED', filesChecked: files.length, findings };
// No source lines, matched values or secret substrings printed, even for errors.
process.stdout.write(json ? JSON.stringify(output) + '\n' : output.status + ': ' + output.filesChecked + ' files; ' + findings.length + ' finding(s)\n' + findings.map(f => f.path + ':' + (f.line ?? '?') + ' ' + f.rule).join('\n') + '\n');
if (findings.length) process.exitCode = 1;
