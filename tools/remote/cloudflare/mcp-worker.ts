/**
 * Cloudflare MCP Resource Server (experimental, default OFF).
 * Uses MIT-licensed official OAuthResourceServer and createMcpHandler.
 * Health-only owner staging requires independently reviewed hosted acceptance.
 * Templates keep workers_dev=false and no routes; private operator configuration
 * is never a public release or permission to forward local OS tools.
 */
import { OAuthResourceServer, type AuthorizationServerBinding } from '@cloudflare/workers-oauth-provider';
import { McpServer } from '@modelcontextprotocol/server';
import { createMcpHandler } from 'agents/mcp/server';
import { z } from 'zod';
import { handleHealthTool } from '../oauth-health-gate.mjs';
import { configuredPreviewOwner, isAllowedPreviewOwner } from '../preview-single-owner.mjs';
import { PROBE_RELAY_SHARD, RemoteHealthRelay } from './remote-relay-do';
import {readBoundedBody} from '../bounded-body.mjs';
export { RemoteHealthRelay };

type IdentityProps = { userId: string };
interface Env {
  AUTH_SERVER: AuthorizationServerBinding<IdentityProps>;
  RESOURCE_URL?: string;
  AUTH_ISSUER?: string;
  ENABLE_REMOTE_HEALTH?: string;
  PREVIEW_SINGLE_USER?: string;
  PREVIEW_OWNER_ID?: string;
  PREVIEW_DEVICE_ID?: string;
  REMOTE_RELAY?: DurableObjectNamespace;
}

const allowedId = /^[a-zA-Z0-9._:-]{1,128}$/;
function validPublicUrl(value: unknown, expectedPath: string): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' &&
      url.hostname.endsWith('.workers.dev') &&
      url.hostname !== '.workers.dev' &&
      url.username === '' && url.password === '' &&
      url.pathname === expectedPath && url.search === '' && url.hash === '';
  } catch { return false; }
}

async function dispatchHealth(env: Env, ownerId: string, deviceId: string, signal?: AbortSignal) {
  // No binding is provided in experimental config, so requests fail closed.
  if (env.ENABLE_REMOTE_HEALTH !== '1' || !env.REMOTE_RELAY)
    throw new Error('Device relay is unavailable');
  // Temporary single-shard health-only prototype: every owner/device is
  // independently authenticated inside the Durable Object. Not scalable for
  // a production multi-user deployment without a reviewed shard strategy.
  const id = env.REMOTE_RELAY.idFromName(PROBE_RELAY_SHARD);
  const stub = env.REMOTE_RELAY.get(id);
  const response = await stub.fetch('https://relay.internal/health', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ownerId, deviceId }),
    signal
  });
  if (!response.ok) throw new Error('Device relay rejected request');
  return await response.json();
}

async function entitled(env: Env, ownerId: string): Promise<boolean> {
  if (!env.REMOTE_RELAY || !allowedId.test(env.PREVIEW_DEVICE_ID ?? '')) return false;
  const stub = env.REMOTE_RELAY.get(env.REMOTE_RELAY.idFromName(PROBE_RELAY_SHARD));
  try {
    const response = await stub.fetch('https://relay.internal/entitlement', { method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ownerId, deviceId: env.PREVIEW_DEVICE_ID }) });
    return response.ok && (await response.json() as { entitled?: unknown }).entitled === true;
  } catch { return false; }
}

function createHealthMcpServer(
  env: Env,
  verified: { clientId?: string; scopes?: string[]; props?: IdentityProps; userId?: string }
) {
  const server = new McpServer({ name: 'desktop-control-remote-health', version: '0.1.0' });
  server.registerTool('desktop_control.remote_health', {
    title: 'Desktop Control remote health',
    description: 'Check a paired Desktop Control device. No files, terminal, browser or mouse access.',
    inputSchema: { deviceId: z.string().regex(allowedId) },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }
  }, async ({ deviceId }, context) => {
    if (!verified.props || verified.props.userId !== verified.userId) {
      return { isError: true, content: [{ type: 'text', text: 'PERMISSION_DENIED' }] };
    }
    const outcome = await handleHealthTool({
      authContext: { props: verified.props },
      authInfo: {
        clientId: verified.clientId,
        scopes: verified.scopes,
        extra: { props: verified.props }
      },
      deviceId,
      signal: context.mcpReq.signal,
      dispatch: ({ ownerId, deviceId, signal }: {
        ownerId: string; deviceId: string; signal?: AbortSignal;
      }) => dispatchHealth(env, ownerId, deviceId, signal)
    });
    // MCP SDK v2 requires a discriminated content block. The JS gate's
    // inferred { type: string } is too wide for CallToolResult.
    // Normalize both outcomes while keeping the exact security-gated payload.
    if (outcome.isError || !outcome.structuredContent) {
      return {
        isError: true,
        content: [{ type: 'text' as const, text: outcome.content[0]?.text ?? 'INTERNAL_ERROR' }]
      };
    }
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(outcome.structuredContent) }],
      structuredContent: outcome.structuredContent
    };
  });
  return server;
}

export default {
  async fetch(request: Request, env: Env, executionCtx: ExecutionContext): Promise<Response> {
    // Device handshake is separate from ChatGPT OAuth. The Durable Object
    // verifies a one-use signed ticket against an approved pairing before
    // accepting ANY remote health operation. Never proxy /health publicly.
    const incoming = new URL(request.url);
    if (incoming.pathname === '/device-ticket') {
      if (env.ENABLE_REMOTE_HEALTH !== '1' || !configuredPreviewOwner(env) || !env.REMOTE_RELAY ||
          incoming.search || request.method !== 'POST' ||
          request.headers.get('content-type') !== 'application/json') {
        return new Response('Device endpoint unavailable', {status:503, headers:{'cache-control':'no-store'}});
      }
      try {
        const body = await readBoundedBody(request);
        const headers = new Headers(request.headers);
        headers.set('content-length',String(new TextEncoder().encode(body).byteLength));
        return env.REMOTE_RELAY.get(env.REMOTE_RELAY.idFromName(PROBE_RELAY_SHARD)).fetch(
          new Request(request.url,{method:'POST',headers,body,signal:request.signal}));
      } catch { return new Response('Invalid device request',{status:400,headers:{'cache-control':'no-store'}}); }
    }
    if (incoming.pathname === '/device') {
      if (env.ENABLE_REMOTE_HEALTH !== '1' || !configuredPreviewOwner(env) || !env.REMOTE_RELAY ||
          incoming.search || incoming.hash || request.method !== 'GET' ||
          request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
        return new Response('Device endpoint unavailable', { status: 503 });
      }
      const id = env.REMOTE_RELAY.idFromName(PROBE_RELAY_SHARD);
      return env.REMOTE_RELAY.get(id).fetch(request);
    }
    if (!validPublicUrl(env.AUTH_ISSUER, '/') || !validPublicUrl(env.RESOURCE_URL, '/mcp') ||
        !env.AUTH_SERVER) {
      return new Response('Service not configured', {
        status: 503, headers: { 'cache-control': 'no-store' }
      });
    }
    // This prevents staging assets from accidentally becoming a public MCP
    // endpoint. A separate, reviewed change is required to enable it.
    if (env.ENABLE_REMOTE_HEALTH !== '1' || !configuredPreviewOwner(env))
      return new Response('Remote disabled', { status: 503 });

    const resourceServer = new OAuthResourceServer<Env, IdentityProps>({
      resourceMetadata: {
        resource: env.RESOURCE_URL,
        authorization_servers: [env.AUTH_ISSUER],
        resource_name: 'Desktop Control Remote Health'
      },
      requiredScopes: ['remote.health'],
      validateToken: boundEnv => boundEnv.AUTH_SERVER.validateToken,
      handler: {
        fetch: async (req, verifiedEnv, ctx) => {
          if (!ctx.auth.scope.includes('remote.health') ||
              typeof ctx.props?.userId !== 'string' ||
              ctx.auth.userId !== ctx.props.userId ||
              !isAllowedPreviewOwner(ctx.auth.userId, verifiedEnv)) {
            return new Response('Forbidden', { status: 403 });
          }
          // Before protocol discovery AND each stateless request, not merely a
          // release-policy checkbox. Relay repeats it for the actual health call.
          if (!await entitled(verifiedEnv, ctx.auth.userId)) return new Response('Entitlement unavailable', {
            status: 403, headers: { 'cache-control': 'no-store' }
          });
          const mcp = createMcpHandler(
            () => createHealthMcpServer(verifiedEnv, {
              clientId: ctx.auth.clientId,
              scopes: ctx.auth.scope,
              userId: ctx.auth.userId,
              props: ctx.props
            })
          );
          return mcp(req, verifiedEnv, executionCtx);
        }
      }
    });
    return resourceServer.fetch(request, env, executionCtx);
  }
};
