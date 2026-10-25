import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Buffer } from 'node:buffer';

const worker = fileURLToPath(new URL('../worker.mjs', import.meta.url));
function request(input) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [worker], { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += chunk; });
    child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
    child.stdin.on('error', (error) => { if (error.code !== 'EPIPE') reject(error); });
    child.stdin.end(input);
  });
}
test('CLI bounds malformed input and emits one redacted JSON response', async () => {
  for (const input of ['not json', '{}\n{}', Buffer.from([255]), '{"op":"shell","command":"private"}']) {
    const reply = await request(input);
    assert.equal(reply.code, 0);
    assert.equal(reply.stderr, '');
    assert.equal(reply.stdout, '{"ok":false,"error":{"code":"INVALID_INPUT"}}\n');
  }
});
test('CLI rejects input above 2 MiB before any filesystem operation', async () => {
  const reply = await request(' '.repeat(2 * 1024 * 1024 + 1));
  assert.equal(reply.code, 0);
  assert.equal(reply.stderr, '');
  assert.equal(reply.stdout, '{"ok":false,"error":{"code":"LIMIT_EXCEEDED"}}\n');
});
