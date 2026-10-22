import assert from 'node:assert/strict';
import test from 'node:test';
import { DENY_ALL_GRANTS, isAuthorized, STATUS_CAPABILITY, STATUS_RESOURCE } from '../src/bridge/policy.mts';
import type { ReadonlyGrantStore } from '../src/bridge/policy.mts';

const now = 1_700_000_000_000;
const request = { principal: 'posix:1000', capability: STATUS_CAPABILITY, resource: STATUS_RESOURCE };
const grant = { ...request, expiresAt: now + 5000, revoked: false };
const store = (g: readonly (typeof grant)[]): ReadonlyGrantStore => ({ getGrants: () => g });

test('deny by default', () => assert.equal(isAuthorized(request, DENY_ALL_GRANTS, now), false));
test('valid exact, unexpired grant permits read', () => assert.equal(isAuthorized(request, store([grant]), now), true));
test('different OS principal is denied', () => assert.equal(isAuthorized({ ...request, principal: 'posix:999' }, store([grant]), now), false));
test('null principal is denied', () => assert.equal(isAuthorized({ ...request, principal: null }, store([grant]), now), false));
test('grant expires exactly at deadline', () => assert.equal(isAuthorized(request, store([grant]), now + 5000), false));
test('revocation denies', () => assert.equal(isAuthorized(request, store([{...grant, revoked: true}]), now), false));
test('missing grant store or invalid grants fail closed', () => {
  assert.equal(isAuthorized(request, { getGrants: () => { throw Error('unavailable'); } }, now), false);
  assert.equal(isAuthorized(request, { getGrants: () => null as unknown as typeof grant[] }, now), false);
});
test('wrong resource/capability denies', () => {
  assert.equal(isAuthorized({ ...request, resource: 'other' as typeof STATUS_RESOURCE }, store([grant]), now), false);
  assert.equal(isAuthorized({ ...request, capability: 'shell.execute' as typeof STATUS_CAPABILITY }, store([grant]), now), false);
});
test('untrusted expiry values fail closed', () => assert.equal(isAuthorized(request, store([{...grant, expiresAt: Number.POSITIVE_INFINITY}]), now), false));
