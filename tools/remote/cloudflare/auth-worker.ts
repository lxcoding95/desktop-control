/**
 * Cloudflare OAuth Authorization Server (experimental, default DENY).
 * Based on MIT-licensed cloudflare/workers-oauth-provider split-workers example.
 *
 * No user login or consent handler is installed. Never replace the 503 handler
 * with a hard-coded user ID or an unverified request-supplied user ID.
 */
import { OAuthAuthorizationServer } from '@cloudflare/workers-oauth-provider';
import { WorkerEntrypoint } from 'cloudflare:workers';

interface Env {
  OAUTH_KV: KVNamespace;
  AUTH_ISSUER?: string;
  MCP_RESOURCE_URL?: string;
}

function validWorkerUrl(value: unknown, path: string): value is string {
  if (typeof value !== 'string') return false;
  try {
    const u = new URL(value);
    return u.protocol === 'https:' &&
      u.hostname.endsWith('.workers.dev') && u.hostname !== '.workers.dev' &&
      u.username === '' && u.password === '' &&
      u.search === '' && u.hash === '' && u.pathname === path;
  } catch { return false; }
}

function makeAuthorizationServer(env: Env) {
  if (!validWorkerUrl(env.AUTH_ISSUER, '/') || !validWorkerUrl(env.MCP_RESOURCE_URL, '/mcp'))
    return null;
  return new OAuthAuthorizationServer<Env>({
    issuer: env.AUTH_ISSUER,
    resources: [env.MCP_RESOURCE_URL],
    scopesSupported: ['remote.health'],
    clientIdMetadataDocumentEnabled: false,
    clientRegistrationEndpoint: '/oauth/register'
  });
}

export default class DesktopControlAuthServer extends WorkerEntrypoint<Env> {
  fetch(request: Request): Promise<Response> | Response {
    const provider = makeAuthorizationServer(this.env);
    if (!provider || !this.env.OAUTH_KV) return new Response('Not configured', { status: 503 });
    const url = new URL(request.url);
    if (url.pathname === '/authorize') {
      // No demo identity, no auto-consent, no forged user input.
      return new Response('Verified sign-in and consent are not configured', {
        status: 503, headers: { 'cache-control': 'no-store' }
      });
    }
    return provider.fetch(request, this.env, this.ctx);
  }

  validateToken(resource: string, token: string) {
    const provider = makeAuthorizationServer(this.env);
    if (!provider || !this.env.OAUTH_KV) throw new Error('Auth provider unavailable');
    return provider.validateToken(resource, token, this.env);
  }
}
