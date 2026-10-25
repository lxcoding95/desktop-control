// Isolated test fixture. Do not package or use as a production entrypoint.
const { createServer } = await import(new URL('../../../../dist/packages/mcp-server/src/server.mjs', import.meta.url));
const { localPrincipal } = await import(new URL('../../../../dist/packages/mcp-server/src/bridge/principal.mjs', import.meta.url));
import { serveStdio } from '@modelcontextprotocol/server/stdio';
// Native process identity; grants are test-only and never enrolled through MCP.
const principal = localPrincipal();
const mode = process.argv[2];
let calls = 0;
const grant = { principal: principal ?? 'unavailable', capability: 'diagnostics.read', resource: 'local:desktop-control', expiresAt: Date.now() + 60_000, revoked: mode === 'revoked' };
if (mode === 'expired') grant.expiresAt = 0;
const grants = { getGrants: () => mode === 'denied' ? [] : [grant] };
const adapter = { readStatus: () => {
  calls++;
  process.stderr.write(`S02_ADAPTER_CALL:${calls}\n`);
  if (mode === 'pending') return new Promise(() => {});
  if (mode === 'error') throw Error('S02_TEST_PRIVATE_MARKER');
  return { service: 'desktop-control', ready: true, api_version: 1, extra: 'S02_TEST_PRIVATE_MARKER' };
} };
void serveStdio(() => createServer({ grants, adapter }));
