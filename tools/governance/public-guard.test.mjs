import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const checker = resolve(import.meta.dirname, 'public-guard.mjs');
const repo = () => {
  const root = mkdtempSync(join(tmpdir(), 'dc-public-guard-'));
  execFileSync('git', ['init', '-q'], { cwd: root });
  return root;
};
const run = root => spawnSync(process.execPath, [checker, '--root', root, '--json'], { encoding: 'utf8' });
const dispose = root => rmSync(root, { recursive: true, force: true });

test('clean tracked document passes with no disclosure', () => {
  const root = repo();
  try {
    writeFileSync(join(root, 'README.md'), '# Example\nPublic documentation.\n');
    execFileSync('git', ['add', 'README.md'], { cwd: root });
    const p = run(root); assert.equal(p.status, 0); assert.equal(JSON.parse(p.stdout).status, 'PASS-LIMITED');
  } finally { dispose(root); }
});

test('detects untracked private home and email without printing matched values', () => {
  const root = repo();
  try {
    const home = ['C:', 'Users', 'exampleperson', 'private.txt'].join('\\');
    const email = ['someone', 'example.invalid'].join('@');
    writeFileSync(join(root, 'run.log'), home + '\n' + email + '\n');
    const p = run(root); assert.equal(p.status, 1);
    const d = JSON.parse(p.stdout); assert.ok(d.findings.some(x => x.rule === 'windows-user-home'));
    assert.ok(d.findings.some(x => x.rule === 'email-address'));
    assert.ok(!p.stdout.includes('exampleperson') && !p.stdout.includes(email));
  } finally { dispose(root); }
});

test('detects synthetic fake token and keys without printing matched values', () => {
  const root = repo();
  try {
    const secret = 'github_pat_' + 'A'.repeat(32);
    writeFileSync(join(root, 'demo.txt'), secret + '\n');
    const p = run(root); assert.equal(p.status, 1);
    assert.equal(JSON.parse(p.stdout).findings[0].rule, 'known-token');
    assert.ok(!p.stdout.includes(secret));
  } finally { dispose(root); }
});

test('binary files fail closed instead of being silently skipped', () => {
  const root = repo();
  try {
    mkdirSync(join(root, 'files'));
    writeFileSync(join(root, 'files', 'dump.bin'), Buffer.from([0, 1, 2, 3]));
    const p = run(root); assert.equal(p.status, 1);
    assert.ok(JSON.parse(p.stdout).findings.some(x=>x.rule === 'binary-requires-review'));
  } finally { dispose(root); }
});

test('fails with code 2 outside Git rather than reporting all-clear', () => {
  const root = mkdtempSync(join(tmpdir(), 'dc-public-guard-no-git-'));
  try { const p = run(root); assert.equal(p.status, 2); } finally { dispose(root); }
});
