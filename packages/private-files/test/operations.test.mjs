import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { executeOperation } from '../operations.mjs';
import { Buffer } from 'node:buffer';

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'desktop-control-private-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return { root, run: (request) => executeOperation(root, request) };
}
function denied(reply, code) { assert.deepEqual(reply, { ok: false, error: { code } }); }

test('real UTF-8 and arbitrary binary roundtrips; reads are strict UTF-8', async (t) => {
  const { run } = await fixture(t);
  const written = await run({ op: 'write', path: 'hello.txt', data: 'Grüße 😀\n' });
  assert.equal(written.ok, true);
  const read = await run({ op: 'read', path: 'hello.txt' });
  assert.equal(read.data, 'Grüße 😀\n');
  assert.equal(read.sha256, written.sha256);
  assert.equal(read.bytes, Buffer.byteLength(read.data));
  const binary = Buffer.from([0, 255, 128, 1, 47]);
  assert.equal((await run({ op: 'write', path: 'binary.exe', encoding: 'base64', data: binary.toString('base64') })).ok, true);
  assert.equal((await run({ op: 'read', path: 'binary.exe', encoding: 'base64' })).data, binary.toString('base64'));
  denied(await run({ op: 'read', path: 'binary.exe' }), 'INVALID_INPUT');
});

test('exclusive creation and hash precondition protect overwrite', async (t) => {
  const { root, run } = await fixture(t);
  const first = await run({ op: 'write', path: 'file.txt', data: 'first' });
  denied(await run({ op: 'write', path: 'file.txt', data: 'second' }), 'CONFLICT');
  denied(await run({ op: 'write', path: 'file.txt', data: 'second', expectedSha256: '0'.repeat(64) }), 'CONFLICT');
  denied(await run({ op: 'write', path: 'missing', data: '', expectedSha256: first.sha256 }), 'CONFLICT');
  assert.equal(await fs.readFile(path.join(root, 'file.txt'), 'utf8'), 'first');
  const replaced = await run({ op: 'write', path: 'file.txt', data: 'second', expectedSha256: first.sha256 });
  assert.equal(replaced.ok, true);
  assert.notEqual(replaced.sha256, first.sha256);
  assert.equal(await fs.readFile(path.join(root, 'file.txt'), 'utf8'), 'second');
  assert.deepEqual((await fs.readdir(root)).sort(), ['file.txt']);
});

test('mkdir supports validated recursive parents; list is bounded and hides internals', async (t) => {
  const { root, run } = await fixture(t);
  denied(await run({ op: 'mkdir', path: 'absent/child' }), 'NOT_FOUND');
  assert.equal((await run({ op: 'mkdir', path: 'parent/child', recursive: true })).ok, true);
  assert.equal((await run({ op: 'write', path: 'parent/child/a', data: 'abc' })).ok, true);
  assert.deepEqual((await run({ op: 'list', path: 'parent/child' })).entries, [{ name: 'a', type: 'file', bytes: 3 }]);
  await fs.mkdir(path.join(root, '.desktop-control-trash'));
  await fs.mkdir(path.join(root, '.git'));
  assert.deepEqual((await run({ op: 'list' })).entries, [{ name: 'parent', type: 'directory' }]);
  denied(await run({ op: 'mkdir', path: 'other', recursive: 'true' }), 'INVALID_INPUT');
  for (let i = 0; i < 201; i++) await fs.writeFile(path.join(root, `item${i}`), '');
  denied(await run({ op: 'list' }), 'LIMIT_EXCEEDED');
});

test('remove soft-deletes, collision leaves trash recoverable, token restores original path', async (t) => {
  const { root, run } = await fixture(t);
  const original = await run({ op: 'write', path: 'report.txt', data: 'original' });
  denied(await run({ op: 'remove', path: 'report.txt' }), 'INVALID_INPUT');
  denied(await run({ op: 'remove', path: 'report.txt', expectedSha256: '0'.repeat(64) }), 'CONFLICT');
  const removed = await run({ op: 'remove', path: 'report.txt', expectedSha256: original.sha256 });
  assert.match(removed.token, /^[0-9a-f-]{36}$/);
  denied(await run({ op: 'read', path: 'report.txt' }), 'NOT_FOUND');
  assert.equal((await run({ op: 'list' })).entries.length, 0);
  assert.equal(await fs.readFile(path.join(root, '.desktop-control-trash', removed.token), 'utf8'), 'original');
  const collision = await run({ op: 'write', path: 'report.txt', data: 'collision' });
  denied(await run({ op: 'restore', token: removed.token }), 'CONFLICT');
  const second = await run({ op: 'remove', path: 'report.txt', expectedSha256: collision.sha256 });
  assert.equal(second.ok, true);
  const restored = await run({ op: 'restore', token: removed.token });
  assert.equal(restored.sha256, original.sha256);
  assert.equal((await run({ op: 'read', path: 'report.txt' })).data, 'original');
  denied(await run({ op: 'restore', token: removed.token }), 'NOT_FOUND');
  denied(await run({ op: 'restore', token: '../escape' }), 'INVALID_INPUT');
  denied(await run({ op: 'restore', token: second.token, path: 'elsewhere' }), 'INVALID_INPUT');
});

test('strict request and portable path validation reject escape forms', async (t) => {
  const { run } = await fixture(t);
  const paths = ['../escape', 'a/../escape', '/tmp/escape', '//server/share', 'C:/escape', 'a\\b', 'x:stream', '.git/config', '.GIT/config', '.desktop-control-trash/x', 'a/.desktop-control-temp-x', 'aux.txt', 'CON', 'CONIN$', 'CONOUT$', 'lpt1.ext', 'COM¹', 'a.', 'a ', 'a//b', './a', 'a\u0000b', 'a\u007fb', 'a\u0085b', 'a\ud800b', 'a?b'];
  for (const relative of paths) denied(await run({ op: 'write', path: relative, data: 'no' }), 'PATH_NOT_ALLOWED');
  denied(await run({ op: 'write', path: 'a/'.repeat(16) + 'x', data: '' }), 'LIMIT_EXCEEDED');
  denied(await run({ op: 'write', path: 'a'.repeat(513), data: '' }), 'INVALID_INPUT');
  for (const request of [null, [], { op: 'shell' }, { op: 'list', root: '/tmp' }, { op: 'read', path: 'x', encoding: 'hex' }, { op: 'write', path: 'x', data: '', expectedSha256: 123 }]) {
    denied(await run(request), 'INVALID_INPUT');
  }
});

test('symlinks and directory junctions cannot cross the root', async (t) => {
  const { root, run } = await fixture(t);
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'desktop-control-outside-'));
  t.after(() => fs.rm(outside, { recursive: true, force: true }));
  await fs.writeFile(path.join(outside, 'secret'), 'outside');
  try { await fs.symlink(outside, path.join(root, 'linked'), process.platform === 'win32' ? 'junction' : 'dir'); }
  catch (error) { if (error.code === 'EPERM' || error.code === 'EACCES') { t.skip('OS did not permit symlink/junction creation'); return; } throw error; }
  denied(await run({ op: 'read', path: 'linked/secret' }), 'PATH_NOT_ALLOWED');
  denied(await run({ op: 'mkdir', path: 'linked/new' }), 'PATH_NOT_ALLOWED');
  denied(await run({ op: 'write', path: 'linked/new', data: 'no' }), 'PATH_NOT_ALLOWED');
  denied(await run({ op: 'list' }), 'PATH_NOT_ALLOWED');
  assert.deepEqual(await fs.readdir(outside), ['secret']);
});

test('hardlinked files are refused for read/write/remove/list', async (t) => {
  const { root, run } = await fixture(t);
  await fs.writeFile(path.join(root, 'source'), 'secret');
  await fs.link(path.join(root, 'source'), path.join(root, 'alias'));
  for (const request of [{ op: 'read', path: 'alias' }, { op: 'write', path: 'alias', data: 'no', expectedSha256: '0'.repeat(64) }, { op: 'remove', path: 'alias', expectedSha256: '0'.repeat(64) }, { op: 'list' }]) {
    denied(await run(request), 'PATH_NOT_ALLOWED');
  }
  assert.equal(await fs.readFile(path.join(root, 'source'), 'utf8'), 'secret');
});

test('size ceilings and canonical base64 reject oversized or malformed content', async (t) => {
  const { root, run } = await fixture(t);
  for (const data of ['YQ', 'YQ==\n', 'YR==', '!!!!']) denied(await run({ op: 'write', path: 'x', encoding: 'base64', data }), 'INVALID_INPUT');
  denied(await run({ op: 'write', path: 'x', data: '\ud800' }), 'INVALID_INPUT');
  denied(await run({ op: 'write', path: 'x', data: 'a'.repeat(1024 * 1024 + 1) }), 'LIMIT_EXCEEDED');
  await fs.writeFile(path.join(root, 'large'), Buffer.alloc(1024 * 1024 + 1));
  denied(await run({ op: 'read', path: 'large' }), 'LIMIT_EXCEEDED');
});

test('restore rejects tampered metadata paths and hashes without losing stored bytes', async (t) => {
  const { root, run } = await fixture(t);
  const file = await run({ op: 'write', path: 'original.txt', data: 'recoverable' });
  const removed = await run({ op: 'remove', path: 'original.txt', expectedSha256: file.sha256 });
  const metadata = path.join(root, '.desktop-control-trash', `${removed.token}.json`);
  await fs.writeFile(metadata, JSON.stringify({ path: '../escape', sha256: file.sha256 }));
  denied(await run({ op: 'restore', token: removed.token }), 'PATH_NOT_ALLOWED');
  await fs.writeFile(metadata, JSON.stringify({ path: 'original.txt', sha256: '0'.repeat(64) }));
  denied(await run({ op: 'restore', token: removed.token }), 'CONFLICT');
  assert.equal(await fs.readFile(path.join(root, '.desktop-control-trash', removed.token), 'utf8'), 'recoverable');
  await fs.writeFile(metadata, JSON.stringify({ path: 'original.txt', sha256: file.sha256 }));
  assert.equal((await run({ op: 'restore', token: removed.token })).ok, true);
});

test('trusted text PDF creates a real bounded document and obeys create/overwrite rules', async (t) => {
  const { root, run } = await fixture(t);
  const { PDFDocument } = await import('pdf-lib');
  const pdf = await run({ op: 'pdf', path: 'report.pdf', text: 'Grüße\n' + 'line\n'.repeat(50) });
  assert.equal(pdf.ok, true);
  const bytes = await fs.readFile(path.join(root, 'report.pdf'));
  assert.equal(bytes.subarray(0, 5).toString('ascii'), '%PDF-');
  assert.equal((await PDFDocument.load(bytes)).getPageCount(), 2);
  denied(await run({ op: 'pdf', path: 'report.pdf', text: 'collision' }), 'CONFLICT');
  assert.equal((await run({ op: 'pdf', path: 'report.pdf', text: 'replacement', expectedSha256: pdf.sha256 })).ok, true);
  denied(await run({ op: 'pdf', path: 'unsupported.pdf', text: '😀' }), 'INVALID_INPUT');
  denied(await run({ op: 'pdf', path: 'oversized.pdf', text: 'a'.repeat(32769) }), 'LIMIT_EXCEEDED');
  assert.equal((await run({ op: 'pdf', path: 'thirty.pdf', text: '\n'.repeat(1379) })).ok, true);
  assert.equal((await PDFDocument.load(await fs.readFile(path.join(root, 'thirty.pdf')))).getPageCount(), 30);
  denied(await run({ op: 'pdf', path: 'many.pdf', text: '\n'.repeat(1380) }), 'LIMIT_EXCEEDED');
});
