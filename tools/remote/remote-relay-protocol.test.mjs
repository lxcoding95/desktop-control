import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseDeviceAuthenticate, parseHealthResponse, parseAuthorizedDeviceLookup
} from './remote-relay-protocol.mjs';

const auth = () => ({ type: 'remote.device.authenticate', deviceId: 'pc-1',
  challenge: 'nonce-1', ticket: 't'.repeat(72) });
const health = () => ({ type: 'remote.health.response', id: 'req-1', nonce: 'nonce-2',
  result: { connected: true, scope: 'remote-health-only', desktopAccess: false } });

test('accepts only approved wire-shape device-auth frames', () => {
  assert.deepEqual(parseDeviceAuthenticate(auth()),{
    deviceId:'pc-1',challenge:'nonce-1',ticket:'t'.repeat(72)
  });
});
test('rejects device-auth frames with injected methods or privileges', () => {
  for(const x of [null,[],{}, {...auth(),tool:'desktop_control.terminal_run'},
      {...auth(),command:'powershell'}, {...auth(),type:'remote.device.ready'}]) {
    assert.equal(parseDeviceAuthenticate(x),null);
  }
});
test('rejects invalid, blank and overlong ticket strings', () => {
  for(const x of ['', 'x', 'x'.repeat(2050), 'a'.repeat(64)+'?param=1', 'Bearer '+ 'x'.repeat(64)]) {
    assert.equal(parseDeviceAuthenticate({...auth(),ticket:x}),null);
  }
});
test('rejects injection in device and challenge identifiers', () => {
  for(const x of ['/../../pc','', 'a'.repeat(129),'?token=secret','name/other']) {
    assert.equal(parseDeviceAuthenticate({...auth(),deviceId:x}),null);
    assert.equal(parseDeviceAuthenticate({...auth(),challenge:x}),null);
  }
});
test('accepts precisely the health-only response', () => {
  assert.deepEqual(parseHealthResponse(health()),health());
});
test('rejects extra device-response data and privileged scope', () => {
  for(const result of [
    {...health().result,hostName:'private'},
    {...health().result,desktopAccess:true},
    {...health().result,scope:'desktop.all'},
    {connected:false,scope:'remote-health-only',desktopAccess:false},
    {connected:true,desktopAccess:false}
  ]) {
    assert.equal(parseHealthResponse({...health(),result}),null);
  }
});
test('rejects mismatched messages, missing request ids and nonce', () => {
  for(const x of [null,{}, {...health(),id:''},{...health(),nonce:'!'},
    {...health(),type:'remote.health.request'}, {...health(),injected:'x'}]) {
    assert.equal(parseHealthResponse(x),null);
  }
});
test('accepts well-formed internal user/device lookup without privileges', () => {
  assert.deepEqual(parseAuthorizedDeviceLookup({ownerId:'account-1',deviceId:'pc-1'}),
    {ownerId:'account-1',deviceId:'pc-1'});
});
test('rejects malformed and extra-field internal lookups', () => {
  for(const x of [null,[],{}, {ownerId:'x',deviceId:'x',admin:true},
    {ownerId:'x',deviceId:'../other'}, {ownerId:'other/account',deviceId:'pc'}]) {
    assert.equal(parseAuthorizedDeviceLookup(x),null);
  }
});
test('return values do not preserve extra untrusted references', () => {
  const a=auth(),b=health(),c={ownerId:'a',deviceId:'b'};
  const x=parseDeviceAuthenticate(a),y=parseHealthResponse(b),z=parseAuthorizedDeviceLookup(c);
  a.deviceId='changed';b.result.scope='changed';c.deviceId='changed';
  assert.equal(x.deviceId,'pc-1');assert.equal(y.result.scope,'remote-health-only');assert.equal(z.deviceId,'b');
});
