// Trusted local user CLI only; deliberately absent from the MCP tool surface.
import { provisionPrivateGrant } from '../../../dist/packages/mcp-server/src/bridge/private-grants.mjs';
const args = process.argv.slice(2);
if (args.length !== 1 || !['grant', 'revoke', 'status'].includes(args[0])) {
  console.error('Usage: private-grant.mjs grant|revoke|status (grant lasts 15 minutes)');
  process.exitCode = 2;
} else {
  try { console.log(JSON.stringify(provisionPrivateGrant(args[0]))); }
  catch { console.error('PRIVATE_POLICY_UNAVAILABLE'); process.exitCode = 2; }
}
