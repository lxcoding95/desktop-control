import { test } from 'node:test';
import assert from 'node:assert/strict';
import { configuredPreviewOwner, isAllowedPreviewOwner } from './preview-single-owner.mjs';

const enabled = () => ({ PREVIEW_SINGLE_USER: '1', PREVIEW_OWNER_ID: 'owner-a' });

test('single-owner mode defaults OFF with no environment', () => {
  assert.equal(configuredPreviewOwner(), null);
  assert.equal(isAllowedPreviewOwner('owner-a'), false);
  assert.equal(configuredPreviewOwner({}), null);
});
test('unset or changed feature switch rejects even the preview owner', () => {
  for (const v of [undefined, '0', 'true', '2', '']) {
    assert.equal(isAllowedPreviewOwner('owner-a', { ...enabled(), PREVIEW_SINGLE_USER: v }), false);
  }
});
test('rejects unset, blank, malformed or injected configured owner IDs', () => {
  for(const owner of [undefined, '', '../owner-a', 'owner/a', 'a'.repeat(129), 'owner-a&admin=1']) {
    assert.equal(configuredPreviewOwner({ ...enabled(), PREVIEW_OWNER_ID: owner }), null);
    assert.equal(isAllowedPreviewOwner('owner-a', { ...enabled(), PREVIEW_OWNER_ID: owner }), false);
  }
});
test('allows only the exact externally verified preview owner', () => {
  assert.equal(configuredPreviewOwner(enabled()), 'owner-a');
  assert.equal(isAllowedPreviewOwner('owner-a', enabled()), true);
});
test('a second user and any missing or invalid verified identity is denied', () => {
  for(const owner of ['owner-b', '', null, undefined, '../owner-a', 'owner-a '] ) {
    assert.equal(isAllowedPreviewOwner(owner, enabled()), false);
  }
});
test('owner IDs do not grant permissions to files, terminal or desktop', () => {
  const env = enabled();
  assert.equal(isAllowedPreviewOwner('owner-a', env), true);
  assert.equal(Object.hasOwn(env, 'ALLOW_DESKTOP'), false);
  assert.equal(Object.hasOwn(env, 'ALLOW_TERMINAL'), false);
});
