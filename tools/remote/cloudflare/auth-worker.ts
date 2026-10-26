/**
 * Cloudflare OAuth Authorization Server (experimental, default DENY).
 * Based on MIT-licensed cloudflare/workers-oauth-provider split-workers example.
 *
 * Login is default OFF. When separately configured, only a verified immutable
 * GitHub owner ID maps to the server-owned preview principal, after consent.
 */
import { OAuthAuthorizationServer } from '@cloudflare/workers-oauth-provider';
import { WorkerEntrypoint, DurableObject } from 'cloudflare:workers';
import { createGitHubLogin, loginConfig } from './auth-login.mjs';
import {readBoundedBody} from '../bounded-body.mjs';

type LoginTransaction = {phase: 'github' | 'consent'; browserHash: string; expiresAt: number; auth: unknown; verifier?: string};
/** Internal binding only; no HTTP handler or public provisioning route. */
export class AuthLoginState extends DurableObject {
  async put(key: string, value: LoginTransaction) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(key) || !/^[a-f0-9]{64}$/.test(value.browserHash) ||
        !['github','consent'].includes(value.phase) || !Number.isSafeInteger(value.expiresAt) ||
        value.expiresAt <= Date.now() || value.expiresAt > Date.now() + 300_000 ||
        JSON.stringify(value).length > 16_384) throw Error('Invalid login transaction');
    await this.ctx.storage.transaction(async tx => {
      if (await tx.get('transaction')) throw Error('Duplicate login transaction');
      await tx.put('transaction', value);
      await tx.setAlarm(value.expiresAt);
    });
  }
  async consume(browserHash: string, phase: string) {
    return await this.ctx.storage.transaction(async tx => {
      const value = await tx.get<LoginTransaction>('transaction');
      if (!value || value.expiresAt <= Date.now() || value.browserHash !== browserHash || value.phase !== phase) return null;
      await tx.delete('transaction');
      await tx.deleteAlarm();
      return value;
    });
  }
  async alarm() { await this.ctx.storage.deleteAll(); }
}

interface Env {
  OAUTH_KV: KVNamespace;
  AUTH_ISSUER?: string;
  MCP_RESOURCE_URL?: string;
  ENABLE_GITHUB_LOGIN?: string;
  PREVIEW_SINGLE_USER?: string;
  PREVIEW_OWNER_ID?: string;
  GITHUB_OWNER_ID?: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  AUTH_LOGIN_STATE?: DurableObjectNamespace<AuthLoginState>;
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
  async fetch(request: Request): Promise<Response> {
    const provider = makeAuthorizationServer(this.env);
    if (!provider || !this.env.OAUTH_KV) return new Response('Not configured', { status: 503 });
    // Bound external registration/token/consent POST bodies before handing
    // them to the OAuth SDK. Missing Content-Length never disables the bound.
    if (request.method === 'POST') {
      try {
        const body=await readBoundedBody(request,{maxBytes:16384,timeoutMs:1000});
        const headers=new Headers(request.headers);
        headers.set('content-length',String(new TextEncoder().encode(body).byteLength));
        request=new Request(request.url,{method:'POST',headers,body,signal:request.signal});
      } catch { return new Response('Invalid request',{status:400,headers:{'cache-control':'no-store'}}); }
    }
    const url = new URL(request.url);
    if (url.pathname === '/authorize' || url.pathname.startsWith('/login/')) {
      if (!loginConfig(this.env) || !this.env.AUTH_LOGIN_STATE) return new Response('Login disabled', {status:503, headers:{'cache-control':'no-store'}});
      const namespace = this.env.AUTH_LOGIN_STATE;
      const store = {
        put: (key: string, value: LoginTransaction) => namespace.get(namespace.idFromName(key)).put(key, value),
        consume: (key: string, browserHash: string, phase: string) => namespace.get(namespace.idFromName(key)).consume(browserHash, phase)
      };
      return createGitHubLogin({env:this.env, provider:provider.getOAuthApi(this.env), store})(request);
    }
    return provider.fetch(request, this.env, this.ctx);
  }

  validateToken(resource: string, token: string) {
    const provider = makeAuthorizationServer(this.env);
    if (!provider || !this.env.OAUTH_KV) throw new Error('Auth provider unavailable');
    return provider.validateToken(resource, token, this.env);
  }
}
