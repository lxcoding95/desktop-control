import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { createServer } from './server.mts';
import { createPrivateGrantStore } from './bridge/private-grants.mts';

// Explicit private preview only. Normal production index.mts still denies all.
// No grant can be created, extended or revoked through the MCP surface.
void serveStdio(() => createServer({ grants: createPrivateGrantStore() }));
