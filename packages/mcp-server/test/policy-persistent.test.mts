import test from 'node:test';
import assert from 'node:assert/strict';
import { isAuthorized, STATUS_CAPABILITY, STATUS_RESOURCE } from '../src/bridge/policy.mts';
import type { AuthorizationRequest, DiagnosticGrant } from '../src/bridge/policy.mts';
const now = 1_700_000_000_000;
const request: AuthorizationRequest = { principal: 'posix:1000', capability: STATUS_CAPABILITY, resource: STATUS_RESOURCE };
const base = { ...request, revoked: false };
const authorize = (value: unknown, at = now) => isAuthorized(request, { getGrants: () => [value as DiagnosticGrant] }, at);

test('explicit host persistent diagnostic grant survives time passage and remains revocable', () => {
  const value = { ...base, lifetime: { kind: 'until-revoked' } };
  assert.equal(authorize(value, now + 365 * 86400000), true);
  assert.equal(authorize({ ...value, revoked: true }), false);
  assert.equal(authorize({ ...value, principal: 'posix:999' }), false);
});
test('persistent diagnostics reject implicit, mixed and malformed lifetimes', () => {
  for (const value of [base, { ...base, expiresAt: Infinity },
    { ...base, lifetime: {} }, { ...base, lifetime: { kind: 'forever' } },
    { ...base, lifetime: { kind: 'until-revoked', extra: true } },
    { ...base, lifetime: { kind: 'until-revoked' }, expiresAt: now + 1000 },
    { ...base, lifetime: Object.create({ kind: 'until-revoked' }) as unknown }]) assert.equal(authorize(value), false);
});
test('legacy timed diagnostic grants retain their original deadline', () => {
  const value = { ...base, expiresAt: now + 1000 };
  assert.equal(authorize(value), true);
  assert.equal(authorize(value, now + 1000), false);
});
