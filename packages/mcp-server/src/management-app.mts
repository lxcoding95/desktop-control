import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const uri = 'ui://desktop-control/management';
const root = fileURLToPath(new URL(import.meta.url.endsWith('.mts') ? '../../../' : '../../../../', import.meta.url));
const empty = z.strictObject({});

/** Original read-only MCP App. Authority changes remain in the protected host. */
export function registerManagementApp(server: McpServer): void {
  server.registerResource('Desktop Control management', uri, {
    title: 'Desktop Control · Verwaltung', mimeType: 'text/html;profile=mcp-app',
    description: 'Lokaler Status und Sicherheitsaktionen; keine automatische Rechtevergabe.'
  }, async () => {
    let text: string;
    try { text = await readFile(path.join(root, 'packages/private-settings/management.html'), 'utf8'); }
    catch { throw Error('MANAGEMENT_UNAVAILABLE'); }
    if (Buffer.byteLength(text, 'utf8') > 40_000) throw Error('MANAGEMENT_UNAVAILABLE');
    return { contents: [{ uri, mimeType: 'text/html;profile=mcp-app', text, _meta: {
      ui: { csp: { connectDomains: [], resourceDomains: [], frameDomains: [], baseUriDomains: [] }, prefersBorder: true },
      'openai/ui': { preferredDisplayMode: 'fullscreen', availableDisplayModes: ['inline', 'fullscreen'] }
    } }] };
  });
  server.registerTool('desktop_control.management', {
    title: 'Desktop Control verwalten', description: 'Zeigt die Verwaltung direkt in ChatGPT. Öffnen erteilt keine Rechte.',
    inputSchema: empty, outputSchema: z.strictObject({ view: z.literal('management'), grantsChanged: z.literal(false) }),
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    _meta: { ui: { resourceUri: uri, visibility: ['model', 'app'] },
      'openai/ui': { entrypoints: [{ type: 'global' }, { type: 'thread' }] } }
  }, () => ({ content: [{ type: 'text', text: 'Desktop Control Verwaltung: Status prüfen, Steuerung stoppen oder lokale Bestätigung ausdrücklich öffnen.' }],
    structuredContent: { view: 'management', grantsChanged: false } }));
}
