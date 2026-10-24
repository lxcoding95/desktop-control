// Trusted local user CLI only; deliberately absent from the MCP tool surface.
import { provisionPrivateGrant, provisionPrivateWorkspace } from '../../../dist/packages/mcp-server/src/bridge/private-grants.mjs';
const args = process.argv.slice(2);
if (args.length !== 1 || !['grant', 'revoke', 'status', 'workspace-grant', 'workspace-revoke', 'workspace-status'].includes(args[0])) {
  console.error('Usage: private-grant.mjs grant|revoke|status|workspace-grant|workspace-revoke|workspace-status (grants last 15 minutes)');
  process.exitCode = 2;
} else {
  try { console.log(JSON.stringify(args[0].startsWith('workspace-') ? provisionPrivateWorkspace(args[0].slice('workspace-'.length)) : provisionPrivateGrant(args[0]))); }
  catch { console.error('PRIVATE_POLICY_UNAVAILABLE'); process.exitCode = 2; }
}
