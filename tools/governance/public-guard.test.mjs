import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, symlinkSync, unlinkSync, rmdirSync } from 'node:fs';
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
const git = (root, ...args) => execFileSync('git', args, { cwd: root });
const findings = p => JSON.parse(p.stdout).findings;
function withRepo(cb) { const root = repo(); try { return cb(root); } finally { dispose(root); } }

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


test('sensitive filenames are detected but never printed verbatim', () => {
  const root = repo();
  try {
    const name = ['private', 'example.invalid'].join('@') + '.txt';
    writeFileSync(join(root, name), 'safe content');
    const p = run(root); assert.equal(p.status, 1);
    const d = JSON.parse(p.stdout);
    assert.ok(d.findings.some(x => x.rule === 'sensitive-filename'));
    assert.ok(!p.stdout.includes(name));
  } finally { dispose(root); }
});

test('staged secret blocked even if worktree content replaced with innocuous text',()=>withRepo(root=>{
  const filename='staged-secret.txt',secret='github_pat_'+'B'.repeat(32);
  writeFileSync(join(root,filename),secret);git(root,'add',filename);
  writeFileSync(join(root,filename),'This new worktree content is safe.');
  const p=run(root);assert.equal(p.status,1);
  assert.ok(findings(p).some(x=>x.rule==='known-token'&&x.source==='index'));
  assert.ok(!p.stdout.includes(secret));
}));
test('worktree secret blocked even if staged blob is safe',()=>withRepo(root=>{
  const name='tracked.txt';writeFileSync(join(root,name),'Safe staged value');git(root,'add',name);
  writeFileSync(join(root,name),'github_pat_'+'C'.repeat(32));const p=run(root);
  assert.equal(p.status,1);assert.ok(findings(p).some(x=>x.source==='worktree'&&x.rule==='known-token'));
}));
test('sensitive directory and filenames are not leaked in stderr or JSON',()=>withRepo(root=>{
  const name='PrivatePersonConfidentialFolder'; mkdirSync(join(root,name));
  writeFileSync(join(root,name,'DeviceLabel_ABC.log'),'hello user');
  const p=run(root);assert.equal(p.status,0);
  assert.ok(!p.stdout.includes(name)&&!p.stdout.includes('DeviceLabel_ABC'));
  assert.ok(!p.stderr.includes(name));
}));
test('invalid UTF-8 binary without NUL fails closed',()=>withRepo(root=>{
  writeFileSync(join(root,'strange.bin'),Buffer.from([0xff,0xfe,0xfd]));
  const p=run(root);assert.equal(p.status,1);
  assert.ok(findings(p).some(x=>x.rule==='invalid-utf8-requires-review'));
}));
test('nontext control characters without NUL fail closed',()=>withRepo(root=>{
  writeFileSync(join(root,'control.dat'),Buffer.from([1,2,3]));
  const p=run(root);assert.equal(p.status,1);
  assert.ok(findings(p).some(x=>x.rule==='binary-requires-review'));
}));
test('large file size blocked without loading whole contents',()=>withRepo(root=>{
  writeFileSync(join(root,'big.log'),'x'.repeat(8*1024*1024+1));
  const p=run(root);assert.equal(p.status,1);
  assert.ok(findings(p).some(x=>x.rule==='oversize-requires-review'));
}));
test('symlink entries and Git symlink modes are not silently scanned as clean',()=>withRepo(root=>{
  writeFileSync(join(root,'target.txt'),'normal text');symlinkSync('target.txt',join(root,'alias.txt'));
  git(root,'add','alias.txt');const p=run(root);assert.equal(p.status,1);
  assert.ok(findings(p).some(x=>x.rule==='unreviewed-symlink'));
  assert.ok(findings(p).some(x=>x.rule==='unreviewed-git-mode'));
}));
test('tracked parent replaced with symlink is blocked',()=>withRepo(root=>{
  const actual=join(root,'actual'), original=join(root,'shortcut');
  mkdirSync(actual);mkdirSync(original);
  writeFileSync(join(actual,'one.txt'),'safe');
  writeFileSync(join(original,'one.txt'),'safe');
  git(root,'add','shortcut/one.txt');
  unlinkSync(join(original,'one.txt'));rmdirSync(original);
  symlinkSync('actual',original,'dir');
  const p=run(root);assert.equal(p.status,1);
  assert.ok(findings(p).some(x=>x.rule==='unreviewed-path-component'));
}));
test('staged deletion does not disclose absent path error',()=>withRepo(root=>{
  const name='no-longer-present.log';writeFileSync(join(root,name),'safe');git(root,'add',name);
  const p=run(root);assert.equal(p.status,0);
  unlinkSync(join(root,name));
  const q=run(root);assert.equal(q.status,1);
  assert.ok(findings(q).some(x=>x.rule==='unreadable-worktree-file'));
}));
test('many matched lines are bounded and no raw values emitted',()=>withRepo(root=>{
  const fake='github_pat_'+'D'.repeat(32);
  writeFileSync(join(root,'many.txt'),(fake+'\n').repeat(1200));
  const p=run(root);assert.equal(p.status,1);
  assert.ok(findings(p).some(x=>x.rule==='findings-limit-exceeded'));
  assert.ok(!p.stdout.includes(fake));
}));
test('non-Git-root argument rejected with redacted error',()=>{
  const root=mkdtempSync(join(tmpdir(),'dc-outside-'));
  try{const p=run(root);assert.equal(p.status,2);assert.ok(!p.stderr.includes(root));}finally{dispose(root);}
});
test('a subdirectory is not silently mistaken for a complete Git repository',()=>withRepo(root=>{
  const nested=join(root,'nested'); mkdirSync(nested);
  writeFileSync(join(root,'top-level.txt'),'safe');git(root,'add','top-level.txt');
  const p=run(nested); assert.equal(p.status,2);
  assert.ok(!p.stdout.includes(root) && !p.stderr.includes(root));
}));
test('working tree inode/path replacement errors are redacted and blocked',()=>withRepo(root=>{
  const dir=join(root,'sensitivePersonDevice');mkdirSync(dir);
  const file=join(dir,'data.txt');writeFileSync(file,'safe');git(root,'add','sensitivePersonDevice/data.txt');
  unlinkSync(file);
  const p=run(root);assert.equal(p.status,1);
  assert.ok(findings(p).some(x=>x.rule==='unreadable-worktree-file'));
  assert.ok(!p.stdout.includes('sensitivePersonDevice')&&!p.stderr.includes('sensitivePersonDevice'));
}));
