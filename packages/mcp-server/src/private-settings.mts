import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL(import.meta.url.endsWith('.mts') ? '../../../' : '../../../../', import.meta.url));
const empty = z.strictObject({});
const readResult = z.strictObject({
  schema: z.strictObject({ type: z.literal('object'), properties: empty }), values: empty,
  layout: z.array(z.strictObject({ kind: z.literal('group'), title: z.string().max(120),
    items: z.array(z.strictObject({ kind: z.literal('tool'), tool: z.enum([
      'desktop_control.management', 'desktop_control.stop_control', 'desktop_control.control_status'
    ]), description: z.string().max(240) })).length(3)
  })).length(1)
});
const updateResult = z.strictObject({ values: empty });
interface ManagementModule { readManagementSettings(): unknown; updateManagementSettings(input: { set: Record<string, never> }): unknown; }

/** Native host settings actions never create a grant or accept arbitrary configuration. */
export function registerPrivateSettings(server: McpServer): void {
  server.server.registerCapabilities({ extensions: { 'openai/settings': {
    readTool: 'desktop_control.settings_read', updateTool: 'desktop_control.settings_update'
  } } });
  const load = () => import(pathToFileURL(path.join(root, 'packages/private-settings/management.mjs')).href) as Promise<ManagementModule>;
  server.registerTool('desktop_control.settings_read', {
    title: 'Desktop Control management', description: 'Read safe management actions; permissions can only be granted in the local host window.',
    inputSchema: empty, outputSchema: readResult, annotations: { readOnlyHint: true }
  }, async () => {
    try { const result = readResult.parse((await load()).readManagementSettings()); return { content: [], structuredContent: result }; }
    catch { return { isError: true, content: [{ type: 'text', text: 'SETTINGS_UNAVAILABLE' }] }; }
  });
  server.registerTool('desktop_control.settings_update', {
    title: 'Desktop Control settings', description: 'Compatibility endpoint for action-only settings. Permission and configuration changes are rejected.',
    inputSchema: z.strictObject({ set: empty }), outputSchema: updateResult, annotations: { readOnlyHint: true }
  }, async args => {
    try { const result = updateResult.parse((await load()).updateManagementSettings(args)); return { content: [], structuredContent: result }; }
    catch { return { isError: true, content: [{ type: 'text', text: 'SETTINGS_UNAVAILABLE' }] }; }
  });
}
