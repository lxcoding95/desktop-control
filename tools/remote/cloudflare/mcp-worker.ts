/**
 * Cloudflare MCP Resource Server (experimental, deliberately non-deployable).
 * Uses MIT-licensed official OAuthResourceServer and createMcpHandler.
 * No OAuth provider, no device binding, no working remote connection yet.
 * Config files must keep workers_dev=false and no routes until reviewed.
 */
import { OAuthResourceServer, type AuthorizationServerBinding } from '@cloudflare/workers-oauth-provider';
import { McpServer } from '@modelcontextprotocol/server';
import { createMcpHandler } from 'agents/mcp/server';
import { z } from 'zod';
import { handleHealthTool } from '../oauth-health-gate.mjs';

type IdentityProps = { userId: string };
interface Env {
  AUTH_SERVER: AuthorizationServerBinding<IdentityProps>;
  RESOURCE_URL?: string;
  AUTH_ISSUER?: string;
  ENABLE_REMOTE_HEALTH?: string;
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
  const id = env.REMOTE_RELAY.idFromName('owner:' + ownerId);
  const stub = env.REMOTE_RELAY.get(id);
  const response = await stub.fetch('https://relay.internal/health', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ deviceId }),
    signal
  });
  if (!response.ok) throw new Error('Device relay rejected request');
  return await response.json();
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
    if (!validPublicUrl(env.AUTH_ISSUER, '/') || !validPublicUrl(env.RESOURCE_URL, '/mcp') ||
        !env.AUTH_SERVER) {
      return new Response('Service not configured', {
        status: 503, headers: { 'cache-control': 'no-store' }
      });
    }
    // This prevents staging assets from accidentally becoming a public MCP
    // endpoint. A separate, reviewed change is required to enable it.
    if (env.ENABLE_REMOTE_HEALTH !== '1') return new Response('Remote disabled', { status: 503 });

    const resourceServer = new OAuthResourceServer<Env, IdentityProps>({
      resourceMetadata: {
        resource: env.RESOURCE_URL,
        authorization_servers: [env.AUTH_ISSUER],
        resource_name: 'Desktop Control Remote Health'
      },
      requiredScopes: ['remote.health'],
      validateToken: boundEnv => boundEnv.AUTH_SERVER.validateToken,
      handler: {
        fetch: (req, verifiedEnv, ctx) => {
          if (!ctx.auth.scope.includes('remote.health') ||
              typeof ctx.props?.userId !== 'string' ||
              ctx.auth.userId !== ctx.props.userId) {
            return new Response('Forbidden', { status: 403 });
          }
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
