import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { createServer } from './server.mts';

// No executable local grant provisioning yet: default-deny protects every tool call.
// stdout is owned entirely by the official MCP transport. Logs go to stderr only.
void serveStdio(() => createServer());
