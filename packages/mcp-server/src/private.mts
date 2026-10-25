import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { createPrivateServer } from './private-server.mts';

// Explicit private preview only. Normal production index.mts still denies all.
// No grant can be created, extended or revoked through the MCP surface.
void serveStdio(() => createPrivateServer());
