import test from 'node:test';
import assert from 'node:assert/strict';
import { validBrowserAccessLifetime } from '../controller.mjs';
test('browser accepts only explicit persistent lifetime or a current timed grant', () => {
  const now = 1700000000000;
  assert.equal(validBrowserAccessLifetime({ lifetime: { kind: 'until-revoked' } }, now), true);
  assert.equal(validBrowserAccessLifetime({ expiresAt: now + 1 }, now), true);
  assert.equal(validBrowserAccessLifetime({ expiresAt: now }, now), false);
  for (const value of [{}, { expiresAt: Infinity }, { lifetime: undefined, expiresAt: now + 1 },
    { lifetime: { kind: 'until-revoked' }, expiresAt: now + 1 },
    { lifetime: { kind: 'until-revoked', approved: true } },
    { lifetime: Object.create({ kind: 'until-revoked' }) }]) assert.equal(validBrowserAccessLifetime(value, now), false);
});
