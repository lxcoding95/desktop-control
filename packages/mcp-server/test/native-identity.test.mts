import assert from 'node:assert/strict';
import test from 'node:test';
import { localPrincipal } from '../src/bridge/principal.mts';
import { createStatusExecutor } from '../src/bridge/status.mts';
import type { DiagnosticGrant } from '../src/bridge/policy.mts';

test('native process principal gates valid, wrong, missing, expired and revoked host grants', async () => {
  const principal = localPrincipal();
  assert.equal(typeof principal, 'string', 'normal unelevated test host must resolve natively');
  const base: DiagnosticGrant = { principal: principal!, capability: 'diagnostics.read', resource: 'local:desktop-control',
    expiresAt: Date.now() + 60_000, revoked: false };
  for (const [mode, grants] of Object.entries({ valid: [base], missing: [], wrong: [{ ...base, principal: 'wrong-principal' }],
    expired: [{ ...base, expiresAt: 0 }], revoked: [{ ...base, revoked: true }] })) {
    let calls = 0;
    const execute = createStatusExecutor({ grants: { getGrants: () => grants }, adapter: {
      readStatus: () => { calls++; return { service: 'desktop-control', ready: true, api_version: 1 }; }
    } });
    const result = await execute({ principal });
    assert.equal(calls, mode === 'valid' ? 1 : 0);
    assert.equal('isError' in result, mode !== 'valid');
  }
});

test('audit failures remain redacted and cannot permit an unaudited adapter entry', async () => {
  const principal = localPrincipal(); let calls = 0;
  const grant: DiagnosticGrant = { principal: principal!, capability: 'diagnostics.read', resource: 'local:desktop-control',
    expiresAt: Date.now() + 60_000, revoked: false };
  for (const grants of [[], [grant]]) {
    const execute = createStatusExecutor({ grants: { getGrants: () => grants },
      audit: () => { throw Error('S02_PRIVATE_AUDIT_MARKER'); },
      adapter: { readStatus: () => { calls++; return { service: 'desktop-control', ready: true, api_version: 1 }; } } });
    const result = await execute({ principal });
    assert.equal('isError' in result, true);
    assert.equal(calls, 0);
    assert.doesNotMatch(JSON.stringify(result), /PRIVATE_AUDIT_MARKER/);
  }
});
