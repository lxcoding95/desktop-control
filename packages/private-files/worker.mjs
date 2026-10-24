import { executeOperation } from './operations.mjs';
import { Buffer } from 'node:buffer';
import { TextDecoder } from 'node:util';

const MAX_INPUT = 2 * 1024 * 1024;
process.stdout.on('error', () => { process.exitCode = 1; });
let request;
let reply;
try {
  const chunks = [];
  let length = 0;
  for await (const chunk of process.stdin) {
    length += chunk.length;
    if (length > MAX_INPUT) throw new Error('limit');
    chunks.push(chunk);
  }
  const raw = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
  request = JSON.parse(raw);
} catch (error) {
  reply = { ok: false, error: { code: error.message === 'limit' ? 'LIMIT_EXCEEDED' : 'INVALID_INPUT' } };
}
reply ??= await executeOperation('/workspace', request);
process.stdout.write(`${JSON.stringify(reply)}\n`);
