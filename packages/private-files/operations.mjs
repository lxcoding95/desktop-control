import * as fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { TextDecoder } from 'node:util';
import { Buffer } from 'node:buffer';

const MAX = 1024 * 1024;
const TRASH = '.desktop-control-trash';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA = /^[0-9a-f]{64}$/;
const fields = {
  list: ['path'], read: ['path', 'encoding'], write: ['path', 'encoding', 'data', 'expectedSha256'],
  mkdir: ['path', 'recursive'], remove: ['path', 'expectedSha256'], restore: ['token'],
  pdf: ['path', 'text', 'expectedSha256'],
};
const fail = (code) => { throw Object.assign(new Error(code), { safeCode: code }); };
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const result = (relative, bytes) => ({ path: relative, bytes: bytes.length, sha256: digest(bytes) });

function validatePath(value, allowRoot = false) {
  if (allowRoot && value === undefined) return '';
  if (typeof value !== 'string' || !value || value.length > 512) fail('INVALID_INPUT');
  if (/[:\\]|\p{Cc}/u.test(value) || value.startsWith('/') || Buffer.from(value, 'utf8').toString('utf8') !== value) fail('PATH_NOT_ALLOWED');
  const parts = value.split('/');
  if (parts.length > 16) fail('LIMIT_EXCEEDED');
  for (const part of parts) {
    if (!part || part === '.' || part === '..' || /[. ]$/.test(part) ||
        /^(?:\.git|\.desktop-control.*)$/i.test(part) ||
        /^(?:con|conin\$|conout\$|clock\$|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(part) || /[<>"|?*]/.test(part)) fail('PATH_NOT_ALLOWED');
  }
  return value;
}

async function stat(target) {
  try { return await fs.lstat(target); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
async function directory(target) {
  const item = await stat(target);
  if (!item) fail('NOT_FOUND');
  if (!item.isDirectory() || item.isSymbolicLink()) fail('PATH_NOT_ALLOWED');
  if (await fs.realpath(target) !== path.resolve(target)) fail('PATH_NOT_ALLOWED');
}
async function resolveTarget(root, relative, createParents = false) {
  await directory(root);
  const parts = relative ? relative.split('/') : [];
  let current = root;
  for (const part of parts.slice(0, -1)) {
    current = path.join(current, part);
    if (createParents && !(await stat(current))) await fs.mkdir(current, { mode: 0o700 });
    await directory(current);
  }
  return path.join(root, ...parts);
}
async function regular(target) {
  const item = await stat(target);
  if (!item) fail('NOT_FOUND');
  if (!item.isFile() || item.isSymbolicLink() || item.nlink !== 1) fail('PATH_NOT_ALLOWED');
  if (item.size > MAX) fail('LIMIT_EXCEEDED');
}
async function readBytes(target) {
  await regular(target);
  const handle = await fs.open(target, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const item = await handle.stat();
    if (!item.isFile() || item.nlink !== 1) fail('PATH_NOT_ALLOWED');
    if (item.size > MAX) fail('LIMIT_EXCEEDED');
    const buffer = Buffer.alloc(MAX + 1);
    let count = 0;
    while (count < buffer.length) {
      const read = await handle.read(buffer, count, buffer.length - count, null);
      if (!read.bytesRead) break;
      count += read.bytesRead;
    }
    if (count > MAX) fail('LIMIT_EXCEEDED');
    return buffer.subarray(0, count);
  } finally { await handle.close(); }
}
function encoding(request) {
  const value = request.encoding ?? 'utf8';
  if (value !== 'utf8' && value !== 'base64') fail('INVALID_INPUT');
  return value;
}
function decode(request) {
  if (typeof request.data !== 'string') fail('INVALID_INPUT');
  const enc = encoding(request);
  if (request.data.length > MAX * 2) fail('LIMIT_EXCEEDED');
  const bytes = Buffer.from(request.data, enc);
  if (enc === 'base64' && bytes.toString('base64') !== request.data) fail('INVALID_INPUT');
  if (enc === 'utf8' && bytes.toString('utf8') !== request.data) fail('INVALID_INPUT');
  if (bytes.length > MAX) fail('LIMIT_EXCEEDED');
  return bytes;
}
async function precondition(target, expected) {
  const existing = await stat(target);
  if (expected === undefined) { if (existing) fail('CONFLICT'); return false; }
  if (!SHA.test(expected)) fail('INVALID_INPUT');
  if (!existing) fail('CONFLICT');
  if (digest(await readBytes(target)) !== expected) fail('CONFLICT');
  return true;
}
async function writeBytes(target, bytes, expected) {
  const replacing = await precondition(target, expected);
  const temp = path.join(path.dirname(target), `.desktop-control-temp-${randomUUID()}`);
  try {
    await fs.writeFile(temp, bytes, { flag: 'wx', mode: 0o600 });
    if (replacing) {
      await precondition(target, expected);
      await fs.rename(temp, target);
    } else {
      await fs.link(temp, target); // Atomic exclusive create; rename would overwrite a collision.
    }
  } finally { await fs.unlink(temp).catch(() => {}); }
}
async function trashDirectory(root) {
  const target = path.join(root, TRASH);
  if (!(await stat(target))) await fs.mkdir(target, { mode: 0o700 });
  await directory(target);
  return target;
}
async function createPdf(text) {
  if (typeof text !== 'string') fail('INVALID_INPUT');
  if (Buffer.byteLength(text, 'utf8') > 32768) fail('LIMIT_EXCEEDED');
  if ([...text].some((c) => (c.codePointAt(0) < 32 && c !== '\n') || c.codePointAt(0) === 127)) fail('INVALID_INPUT');
  const { PDFDocument, StandardFonts } = await import('pdf-lib');
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  try { font.encodeText(text.replaceAll('\n', '')); } catch { fail('INVALID_INPUT'); }
  const lines = [];
  for (const source of text.split('\n')) {
    let line = '';
    for (const character of source) {
      if (font.widthOfTextAtSize(line + character, 12) > 490) { lines.push(line); line = ''; }
      line += character;
    }
    lines.push(line);
  }
  if (lines.length > 30 * 46) fail('LIMIT_EXCEEDED');
  for (let offset = 0; offset < lines.length; offset += 46) {
    const page = document.addPage([612, 792]);
    lines.slice(offset, offset + 46).forEach((line, index) => page.drawText(line, { x: 60, y: 732 - index * 15, size: 12, font }));
  }
  const bytes = Buffer.from(await document.save());
  if (bytes.length > MAX) fail('LIMIT_EXCEEDED');
  return bytes;
}

async function perform(root, request) {
  if (!request || typeof request !== 'object' || Array.isArray(request) || !Object.hasOwn(fields, request.op)) fail('INVALID_INPUT');
  if (Object.keys(request).some((key) => key !== 'op' && !fields[request.op].includes(key))) fail('INVALID_INPUT');
  if (request.expectedSha256 !== undefined && (typeof request.expectedSha256 !== 'string' || !SHA.test(request.expectedSha256))) fail('INVALID_INPUT');
  if (request.op === 'restore') {
    if (typeof request.token !== 'string' || !UUID.test(request.token)) fail('INVALID_INPUT');
    await directory(root);
    const trash = await trashDirectory(root);
    const stored = path.join(trash, request.token);
    const metadata = path.join(trash, `${request.token}.json`);
    let record;
    try { record = JSON.parse((await readBytes(metadata)).toString('utf8')); } catch (error) { if (error.safeCode) throw error; fail('INVALID_INPUT'); }
    if (!record || Object.keys(record).sort().join(',') !== 'path,sha256' || !SHA.test(record.sha256)) fail('INVALID_INPUT');
    const relative = validatePath(record.path);
    const target = await resolveTarget(root, relative);
    const bytes = await readBytes(stored);
    if (digest(bytes) !== record.sha256) fail('CONFLICT');
    await fs.link(stored, target);
    await fs.unlink(stored);
    await fs.unlink(metadata);
    return result(relative, bytes);
  }
  const relative = validatePath(request.path, request.op === 'list');
  const target = await resolveTarget(root, relative, request.op === 'mkdir' && request.recursive === true);
  switch (request.op) {
    case 'list': {
      await directory(target);
      const entries = [];
      const dir = await fs.opendir(target);
      for await (const entry of dir) {
        if (/^\.desktop-control/i.test(entry.name) || /^\.git$/i.test(entry.name)) continue;
        validatePath(entry.name);
        if (entries.length >= 200) fail('LIMIT_EXCEEDED');
        const child = path.join(target, entry.name);
        const item = await fs.lstat(child);
        if (item.isSymbolicLink() || (!item.isDirectory() && (!item.isFile() || item.nlink !== 1))) fail('PATH_NOT_ALLOWED');
        entries.push({ name: entry.name, type: item.isDirectory() ? 'directory' : 'file', ...(item.isFile() ? { bytes: item.size } : {}) });
      }
      return { path: relative, entries: entries.sort((a, b) => a.name.localeCompare(b.name)) };
    }
    case 'read': {
      const enc = encoding(request);
      const bytes = await readBytes(target);
      let data;
      try { data = enc === 'base64' ? bytes.toString('base64') : new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { fail('INVALID_INPUT'); }
      return { ...result(relative, bytes), encoding: enc, data };
    }
    case 'write': case 'pdf': {
      const bytes = request.op === 'pdf' ? await createPdf(request.text) : decode(request);
      await writeBytes(target, bytes, request.expectedSha256);
      return result(relative, bytes);
    }
    case 'mkdir':
      if (request.recursive !== undefined && typeof request.recursive !== 'boolean') fail('INVALID_INPUT');
      await fs.mkdir(target, { mode: 0o700 });
      return { path: relative };
    case 'remove': {
      if (!request.expectedSha256) fail('INVALID_INPUT');
      const bytes = await readBytes(target);
      if (digest(bytes) !== request.expectedSha256) fail('CONFLICT');
      const trash = await trashDirectory(root);
      const token = randomUUID();
      const metadata = path.join(trash, `${token}.json`);
      await fs.writeFile(metadata, JSON.stringify({ path: relative, sha256: digest(bytes) }), { flag: 'wx', mode: 0o600 });
      try { await fs.rename(target, path.join(trash, token)); } catch (error) { await fs.unlink(metadata); throw error; }
      return { token };
    }
    default: fail('INVALID_INPUT');
  }
}

export async function executeOperation(root, request) {
  try { return { ok: true, ...await perform(path.resolve(root), request) }; }
  catch (error) {
    const code = error.safeCode ?? ({ ENOENT: 'NOT_FOUND', EEXIST: 'CONFLICT', ENOTDIR: 'PATH_NOT_ALLOWED', ELOOP: 'PATH_NOT_ALLOWED' }[error.code]) ?? 'INTERNAL_ERROR';
    return { ok: false, error: { code } };
  }
}
