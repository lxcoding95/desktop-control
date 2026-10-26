#!/usr/bin/env node
/**
 * Desktop Control remote transport smoke-test server.
 * Exposes ZERO local desktop/filesystem/browser functionality.
 * Used only to prove a remote MCP tunnel reaches this host.
 * No network listeners, tokens, environment values or host details are exposed.
 */
import { createInterface } from 'node:readline';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const TOOL = 'desktop_control.remote_health';
const MAX_LINE = 65_536;
const PROTOCOLS = new Set(['2024-11-05', '2025-03-26', '2025-06-18', '2025-11-25', '2026-07-28']);
const write = data => process.stdout.write(JSON.stringify(data) + '\n');
const error = (id, code, message) => ({ jsonrpc: '2.0', id, error: { code, message } });
const success = (id, result) => ({ jsonrpc: '2.0', id, result });
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const validId = id => typeof id === 'string' || (typeof id === 'number' && Number.isSafeInteger(id));
const isNotification = msg => !Object.hasOwn(msg, 'id');

export function handleMessage(msg) {
  if (!isRecord(msg) || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
    return error(null, -32600, 'Invalid request');
  }
  if (isNotification(msg)) return null;
  if (!validId(msg.id)) return error(null, -32600, 'Invalid request');
  const id = msg.id;
  switch (msg.method) {
    case 'initialize': {
      const p = msg.params;
      if (!isRecord(p) || typeof p.protocolVersion !== 'string') {
        return error(id, -32602, 'Invalid params');
      }
      // The server supports only explicitly reviewed protocol versions.
      const protocolVersion = PROTOCOLS.has(p.protocolVersion) ? p.protocolVersion : '2025-11-25';
      return success(id, { protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'desktop-control-remote-probe', version: '0.1.0' } });
    }
    case 'ping':
      return success(id, {});
    case 'tools/list':
      return success(id, { tools: [{
        name: TOOL,
        title: 'Desktop Control remote connectivity',
        description: 'Proves only that the authenticated MCP tunnel reaches this local test process. No PC access or permissions are provided.',
        inputSchema: { type: 'object', additionalProperties: false, properties: {} },
        annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }
      }] });
    case 'tools/call': {
      const p = msg.params;
      if (!isRecord(p) || p.name !== TOOL) return error(id, -32602, 'Tool not available');
      if (p.arguments !== undefined && (!isRecord(p.arguments) || Object.keys(p.arguments).length !== 0)) {
        return error(id, -32602, 'Invalid params');
      }
      const result = { connected: true, scope: 'remote-health-only', desktopAccess: false };
      return success(id, { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result });
    }
    default:
      return error(id, -32601, 'Method not found');
  }
}

export function run(input = process.stdin) {
  const lines = createInterface({ input, crlfDelay: Infinity });
  lines.on('line', line => {
    if (Buffer.byteLength(line, 'utf8') > MAX_LINE) {
      write(error(null, -32600, 'Request too large'));
      return;
    }
    try {
      const response = handleMessage(JSON.parse(line));
      if (response) write(response);
    } catch {
      write(error(null, -32700, 'Parse error'));
    }
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) run();
