// Trusted local user CLI only; deliberately absent from the MCP tool surface.
import { Buffer } from 'node:buffer';
import { provisionPrivateGrant, provisionPrivateWorkspace, provisionPrivateControl } from '../../../dist/packages/mcp-server/src/bridge/private-grants.mjs';
const args = process.argv.slice(2);
if (args.length !== 1 || !['grant', 'revoke', 'status', 'workspace-grant', 'workspace-revoke', 'workspace-status', 'control-grant', 'control-revoke', 'control-status'].includes(args[0])) {
  console.error('Usage: private-grant.mjs grant|revoke|status|workspace-grant|workspace-revoke|workspace-status|control-grant|control-revoke|control-status (grants last 15 minutes)');
  process.exitCode = 2;
} else {
  try {
    let result;
    if (args[0] === 'control-grant') {
      let input = '';
      process.stdin.setEncoding('utf8');
      for await (const chunk of process.stdin) { input += chunk; if (Buffer.byteLength(input) > 16_384) throw Error('LIMIT'); }
      const options = JSON.parse(input);
      if (!options || typeof options !== 'object' || Array.isArray(options) || Object.keys(options).sort().join(',') !== 'allowedOrigins,capabilities') throw Error('INVALID');
      result = provisionPrivateControl('grant', options.capabilities, options.allowedOrigins);
    } else if (args[0].startsWith('control-')) result = provisionPrivateControl(args[0].slice('control-'.length));
    else result = args[0].startsWith('workspace-') ? provisionPrivateWorkspace(args[0].slice('workspace-'.length)) : provisionPrivateGrant(args[0]);
    console.log(JSON.stringify(result));
  }
  catch { console.error('PRIVATE_POLICY_UNAVAILABLE'); process.exitCode = 2; }
}
