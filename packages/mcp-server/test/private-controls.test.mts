import test from 'node:test';
import assert from 'node:assert/strict';
import * as z from 'zod/v4';
import { formatPrivateOutput } from '../src/private-controls.mts';
const output = z.strictObject({ mimeType: z.literal('image/png'), data: z.string().max(100), width: z.number().int().positive(), height: z.number().int().positive(), x: z.number().int(), y: z.number().int() });
test('desktop image reply preserves geometry required by its MCP output contract', () => {
  const original = { mimeType: 'image/png', data: 'TEST_FIXTURE_NO_PIXELS', width: 100, height: 80, x: -100, y: 0 };
  const reply = formatPrivateOutput(output, original, true);
  assert.ok('structuredContent' in reply);
  assert.deepEqual(output.parse(reply.structuredContent), original);
  assert.deepEqual(reply.content, [{ type: 'image', mimeType: 'image/png', data: original.data }]);
});
test('malformed private output fails closed without echoing backend details', () => {
  for (const bad of [{ mimeType: 'image/png', data: 'PRIVATE_MARKER' }, { width: 10, private: 'PRIVATE_MARKER' }]) {
    assert.deepEqual(formatPrivateOutput(output, bad, true), { isError: true, content: [{ type: 'text', text: 'INTERNAL_ERROR' }] });
  }
});
