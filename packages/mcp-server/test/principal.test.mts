import assert from 'node:assert/strict';
import test from 'node:test';
import { localPrincipal, posixPrincipal } from '../src/bridge/principal.mts';

test('same unprivileged POSIX uid yields matching principal', () => assert.equal(posixPrincipal(1000, 1000), 'posix:1000'));
test('setuid/effective UID mismatch fails closed', () => assert.equal(posixPrincipal(1000, 0), null));
test('privileged root identity fails closed even when both IDs match', () => {
  assert.equal(posixPrincipal(0, 0), null);
  assert.equal(posixPrincipal(0, 1000), null);
});
test('invalid POSIX identity fails closed', () => {
  assert.equal(posixPrincipal(-1, -1), null);
  assert.equal(posixPrincipal(NaN, NaN), null);
  assert.equal(posixPrincipal(1.3, 1.3), null);
});
test('real process principal is derived without request text', () => {
  const p = localPrincipal();
  if (typeof process.getuid === 'function' && typeof process.geteuid === 'function' && process.getuid() === process.geteuid() && process.getuid() > 0)
    assert.equal(p, `posix:${process.getuid()}`);
  else assert.equal(p, null);
});
