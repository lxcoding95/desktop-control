import test from 'node:test';
import assert from 'node:assert/strict';
import { validateTerminalRequest } from '../terminal.mjs';
test('terminal protocol accepts only bounded fixed container executables', () => {
  assert.deepEqual(validateTerminalRequest({ op: 'terminal', argv: ['node', '-e', 'process.exit(0)'] }), { executable: '/usr/local/bin/node', args: ['-e', 'process.exit(0)'] });
  for (const request of [null, [], { op: 'terminal', argv: ['/bin/sh'] }, { op: 'terminal', argv: ['node'], cwd: '/' },
    { op: 'terminal', argv: ['node', '\0'] }, { op: 'terminal', argv: ['node', 'x'.repeat(32769)] }, { op: 'terminal', argv: ['sh', ...Array(64).fill('x')] }])
    assert.throws(() => validateTerminalRequest(request), /INVALID_INPUT/);
});
