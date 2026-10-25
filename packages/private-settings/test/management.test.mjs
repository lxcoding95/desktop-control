import assert from 'node:assert/strict';
import test from 'node:test';
import { readManagementSettings, updateManagementSettings, SETTINGS_CAPABILITY } from '../management.mjs';

test('host management exposes local settings and emergency stop without remote grants', () => {
  assert.deepEqual(SETTINGS_CAPABILITY, { readTool: 'desktop_control.settings_read', updateTool: 'desktop_control.settings_update' });
  const settings = readManagementSettings();
  assert.deepEqual(settings.schema, { type: 'object', properties: {} });
  assert.deepEqual(settings.values, {});
  const tools = settings.layout.flatMap(group => group.items.map(item => item.tool));
  assert.deepEqual(tools, ['desktop_control.management', 'desktop_control.stop_control', 'desktop_control.control_status']);
  assert.equal(tools.some(name => /grant|install|update/.test(name)), false);
  settings.layout[0].items.length = 0;
  assert.equal(readManagementSettings().layout[0].items.length, 3, 'callers cannot mutate later responses');
});

test('action-only management cannot write any permission or update setting', () => {
  assert.deepEqual(updateManagementSettings({ set: {} }), { values: {} });
  for (const invalid of [null, {}, [], { set: [] }, { set: { 'desktop.input': true } }, { set: { autoUpdate: true } }, { set: {}, grant: true }, { set: Object.create({ enabled: true }) }]) {
    assert.throws(() => updateManagementSettings(invalid), /SETTINGS_READ_ONLY/);
  }
});
