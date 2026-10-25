// Pure OpenAI Structured Settings contract. Grants remain native-host-only.
export const SETTINGS_CAPABILITY = Object.freeze({
  readTool: 'desktop_control.settings_read', updateTool: 'desktop_control.settings_update'
});

export function readManagementSettings() {
  return {
    schema: { type: 'object', properties: {} }, values: {},
    layout: [{ kind: 'group', title: 'Desktop Control management', items: [
      { kind: 'tool', tool: 'desktop_control.open_settings', description: 'Open local permissions and versions. Opening never grants access.' },
      { kind: 'tool', tool: 'desktop_control.stop_control', description: 'Stop browser and desktop automation immediately.' },
      { kind: 'tool', tool: 'desktop_control.control_status', description: 'Read installed plugin version and current grant state.' }
    ] }]
  };
}

const plain = value => value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype;
export function updateManagementSettings(input) {
  if (!plain(input) || Object.keys(input).join(',') !== 'set' || !plain(input.set) || Object.keys(input.set).length !== 0)
    throw Error('SETTINGS_READ_ONLY');
  return { values: {} };
}
