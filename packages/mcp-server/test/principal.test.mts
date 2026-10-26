import assert from 'node:assert/strict';
import test from 'node:test';
import { localPrincipal, posixPrincipal, windowsPrincipal } from '../src/bridge/principal.mts';
import { execFileSync } from 'node:child_process';

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
  if (process.platform === 'win32') {
    const nativeSid = execFileSync('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', '[Security.Principal.WindowsIdentity]::GetCurrent().User.Value'], { encoding: 'utf8', windowsHide: true }).trim();
    assert.equal(p === `windows:${nativeSid}`, true, 'native SID matches WindowsIdentity; never log SID');
  } else if (typeof process.getuid === 'function' && typeof process.geteuid === 'function' && process.getuid() === process.geteuid() && process.getuid() > 0)
    assert.equal(p, `posix:${process.getuid()}`);
  else assert.equal(p, null);
});

test('Windows token parser denies elevation, service, malformed and mismatched identity', () => {
  const token = { pid: 123, sid: 'S-1-5-21-1-2-3-1001', elevated: false, uiAccess: false, integrity: 8192, session: 1 };
  assert.equal(windowsPrincipal(token, 123), `windows:${token.sid}`);
  for (const change of [{ elevated: true }, { uiAccess: true }, { integrity: 12288 }, { integrity: 4096 },
    { sid: 'S-1-5-18' }, { sid: 'not-a-sid' }, { session: 0 }, { pid: 456 }])
    assert.equal(windowsPrincipal({ ...token, ...change }, 123), null);
  assert.equal(windowsPrincipal(null, 123), null);
});
