// Run locally as the actual OS user, outside MCP. No path/principal/TTL arguments.
import { provisionPrivateGrant } from './dist/packages/mcp-server/src/bridge/private-grants.mjs';
const [action, ...extra] = process.argv.slice(2);
if (extra.length || !['grant', 'revoke', 'status'].includes(action)) {
  console.error('Usage: node grant.mjs grant|revoke|status (grant lasts 15 minutes)');
  process.exitCode = 2;
} else {
  try { console.log(JSON.stringify(provisionPrivateGrant(action))); }
  catch { console.error('PRIVATE_POLICY_UNAVAILABLE'); process.exitCode = 2; }
}
