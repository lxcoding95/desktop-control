// Trusted local user entry; the same strict CLI is used by the local settings UI.
// No MCP permission mutation or configurable path/principal/TTL is exposed.
try { await import('./packages/mcp-server/scripts/private-grant.mjs'); }
catch { console.error('PRIVATE_POLICY_UNAVAILABLE'); process.exitCode = 2; }
