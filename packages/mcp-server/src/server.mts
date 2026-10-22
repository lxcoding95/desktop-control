import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { createStatusExecutor, staticStatusAdapter } from './bridge/status.mts';
import { DENY_ALL_GRANTS } from './bridge/policy.mts';
import type { ReadonlyGrantStore } from './bridge/policy.mts';
import type { StatusAdapter } from './bridge/status.mts';

/** Local authority derives from the OS process, never MCP-supplied caller IDs. */
export function localPrincipal(): string | null {
  try {
    if (typeof process.getuid === 'function') {
      const uid = process.getuid();
      return Number.isSafeInteger(uid) && uid >= 0 ? `posix:${uid}` : null;
    }
    // Windows requires an independently checked SID-based local principal resolver.
    // Until that exists, fail closed rather than assume a username is unique enough.
    return null;
  } catch { return null; }
}

/** Production defaults to DENY ALL; fixture stores must be passed explicitly in tests. */
export function createServer(deps: { grants?: ReadonlyGrantStore; adapter?: StatusAdapter } = {}): McpServer {
  const server = new McpServer({ name: 'desktop-control', version: '0.0.1' });
  const execute = createStatusExecutor({
    grants: deps.grants ?? DENY_ALL_GRANTS,
    adapter: deps.adapter ?? staticStatusAdapter,
    audit: decision => console.error(JSON.stringify({ event: 'capability_check', capability: 'diagnostics.read', decision }))
  });
  server.registerTool('desktop_control.status', {
    title: 'Desktop Control status',
    description: 'Minimal, non-identifying diagnostic status; requires an explicit local diagnostics.read grant.',
    annotations: { readOnlyHint: true },
    inputSchema: z.strictObject({}),
    outputSchema: z.strictObject({
      service: z.literal('desktop-control'),
      ready: z.literal(true),
      api_version: z.literal(1)
    })
  }, async (_args, ctx) => execute({ principal: localPrincipal(), signal: ctx.mcpReq.signal }));
  return server;
}
