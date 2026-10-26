// GitHub public-profile sign-in for ONE configured owner. No credential logging,
// licensing, registration, tool dispatch or account management takes place here.
const TTL = 5 * 60 * 1000;
const COOKIE = '__Host-dc-login';
const tokenPattern = /^[A-Za-z0-9_-]{43}$/;
const idPattern = /^[A-Za-z0-9._:-]{1,128}$/;
const htmlEscape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fail = (status = 403) => new Response('Sign-in unavailable or not authorized', {status, headers: securityHeaders()});
function securityHeaders() {
  return {'cache-control':'no-store', 'content-security-policy':"default-src 'none'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'", 'referrer-policy':'no-referrer', 'x-content-type-options':'nosniff', 'x-frame-options':'DENY'};
}
function cookie(value, clear = false) {
  return `${COOKIE}=${clear ? '' : value}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${clear ? 0 : 300}`;
}
function browserCookie(request) {
  const found = (request.headers.get('cookie') ?? '').split(';').map(x => x.trim()).filter(x => x.startsWith(COOKIE + '='));
  return found.length === 1 && tokenPattern.test(found[0].slice(COOKIE.length + 1)) ? found[0].slice(COOKIE.length + 1) : null;
}
function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
}
async function digest(value) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map(x => x.toString(16).padStart(2,'0')).join('');
}
export function loginConfig(env) {
  if (env.ENABLE_GITHUB_LOGIN !== '1' || env.PREVIEW_SINGLE_USER !== '1' ||
      !idPattern.test(env.PREVIEW_OWNER_ID ?? '') || env.PREVIEW_OWNER_ID.includes(':') || !/^[1-9][0-9]{0,19}$/.test(env.GITHUB_OWNER_ID ?? '') ||
      !/^[A-Za-z0-9._-]{1,128}$/.test(env.GITHUB_CLIENT_ID ?? '') ||
      typeof env.GITHUB_CLIENT_SECRET !== 'string' || env.GITHUB_CLIENT_SECRET.length < 20 || env.GITHUB_CLIENT_SECRET.length > 512 ||
      !env.AUTH_LOGIN_STATE) return null;
  try {
    const issuer = new URL(env.AUTH_ISSUER);
    const resource = new URL(env.MCP_RESOURCE_URL);
    if (resource.protocol !== 'https:' || !/^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.workers\.dev$/.test(resource.hostname) || resource.username || resource.password || resource.port || resource.pathname !== '/mcp' || resource.search || resource.hash) return null;
    if (issuer.protocol !== 'https:' || !/^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.workers\.dev$/.test(issuer.hostname) ||
        issuer.port || issuer.username || issuer.password || issuer.pathname !== '/' || issuer.search || issuer.hash) return null;
    return {origin:issuer.origin, callback:issuer.origin + '/login/github/callback', ownerId:env.PREVIEW_OWNER_ID,
      githubOwnerId:env.GITHUB_OWNER_ID, clientId:env.GITHUB_CLIENT_ID, clientSecret:env.GITHUB_CLIENT_SECRET};
  } catch { return null; }
}
export function verifiedGitHubOwner(profile, expected) {
  // Names/logins are mutable and are deliberately not accepted as authority.
  return profile !== null && typeof profile === 'object' && Number.isSafeInteger(profile.id) && profile.id > 0 && String(profile.id) === expected;
}
export function validHealthAuthRequest(auth, resource) {
  if (!auth || typeof auth !== 'object' || !Array.isArray(auth.scope) || auth.scope.length !== 1 || auth.scope[0] !== 'remote.health') return false;
  if (auth.responseType !== 'code' || auth.codeChallengeMethod !== 'S256' || !tokenPattern.test(auth.codeChallenge ?? '')) return false;
  try {
    const url = new URL(auth.redirectUri);
    if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.port || url.hostname === 'localhost') return false;
    // The SDK separately validates this exact redirect against the registered client.
    return typeof auth.clientId === 'string' && auth.clientId.length > 0 && auth.clientId.length <= 512 &&
      auth.resource === resource;
  } catch { return false; }
}
async function boundedText(response, limit) {
  if (!response.ok || !response.body) throw Error('UPSTREAM_REJECTED');
  const reader = response.body.getReader(); let length = 0; const chunks = [];
  try { while (true) { const part = await reader.read(); if (part.done) break; length += part.value.length; if (length > limit) throw Error('UPSTREAM_OVERSIZE'); chunks.push(part.value); } }
  finally { await reader.cancel().catch(() => {}); }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const part of chunks) {bytes.set(part, offset); offset += part.length;}
  return new TextDecoder('utf-8', {fatal:true}).decode(bytes);
}
async function boundedJson(response, limit) { return JSON.parse(await boundedText(response, limit)); }
async function challenge(verifier) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  return btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
}
/** store.put/consume MUST be atomic, browser-hash-bound, one-use and TTL checked. */
export function createGitHubLogin({env, provider, store, fetcher = fetch, now = Date.now}) {
  return async function handle(request) {
    const config = loginConfig(env);
    if (!config) return fail(503);
    const url = new URL(request.url);
    if (url.origin !== config.origin) return fail();
    try {
      if (url.pathname === '/authorize' && request.method === 'GET') {
        const auth = await provider.parseAuthRequest(request);
        if (!validHealthAuthRequest(auth, env.MCP_RESOURCE_URL)) return fail();
        const details = await provider.describeConsent(auth);
        const browser = randomToken(), consent = randomToken();
        await store.put(consent, {phase:'consent', browserHash:await digest(browser), expiresAt:now()+TTL, auth});
        // Consent MUST precede the upstream redirect (confused-deputy boundary).
        const html = `<!doctype html><html lang="en"><meta charset="utf-8"><title>Desktop Control permission</title><h1>Allow remote health?</h1><p>This permits only checking whether your paired device is connected. No files, terminal, browser, mouse or keyboard access.</p><p>Client: ${htmlEscape(details.clientName)}. Client names are self-asserted.</p><p>Access returns to: ${htmlEscape(new URL(auth.redirectUri).hostname)}.</p><p>You will next sign in to GitHub to verify the single approved owner.</p><form method="post" action="/login/consent"><input type="hidden" name="consent" value="${consent}"><button name="decision" value="allow">Allow health only</button><button name="decision" value="deny">Deny</button></form></html>`;
        return new Response(html, {headers:{...securityHeaders(), 'content-type':'text/html;charset=utf-8', 'set-cookie':cookie(browser)}});
      }
      if (url.pathname === '/login/github/callback' && request.method === 'GET') {
        if ([...url.searchParams.keys()].some(k => !['state','code','error','error_description','error_uri'].includes(k)) || url.searchParams.getAll('state').length !== 1 || url.searchParams.getAll('code').length !== 1 || url.searchParams.has('error')) return fail();
        const state = url.searchParams.get('state'), code = url.searchParams.get('code'), browser = browserCookie(request);
        if (!tokenPattern.test(state ?? '') || !browser || !/^[A-Za-z0-9_-]{1,256}$/.test(code ?? '')) return fail();
        const transaction = await store.consume(state, await digest(browser), 'github', now());
        if (!transaction) return fail();
        const token = await boundedJson(await fetcher('https://github.com/login/oauth/access_token', {
          method:'POST', redirect:'error', signal:AbortSignal.timeout(10000), headers:{accept:'application/json', 'content-type':'application/x-www-form-urlencoded'},
          body:new URLSearchParams({client_id:config.clientId, client_secret:config.clientSecret, code, redirect_uri:config.callback, code_verifier:transaction.verifier})
        }), 8192);
        if (typeof token.access_token !== 'string' || !/^[A-Za-z0-9_]{20,512}$/.test(token.access_token) || token.token_type?.toLowerCase() !== 'bearer' || (token.scope !== undefined && token.scope !== '')) return fail();
        const profile = await boundedJson(await fetcher('https://api.github.com/user', {
          redirect:'error', signal:AbortSignal.timeout(10000), headers:{authorization:'Bearer '+token.access_token, accept:'application/vnd.github+json', 'user-agent':'Desktop-Control-Owner-Login', 'x-github-api-version':'2022-11-28'}
        }), 32768);
        if (!verifiedGitHubOwner(profile, config.githubOwnerId)) return fail();
        if (!validHealthAuthRequest(transaction.auth, env.MCP_RESOURCE_URL)) return fail();
        const result = await provider.completeAuthorization({request:transaction.auth, userId:config.ownerId, metadata:{}, scope:['remote.health'], props:{userId:config.ownerId}});
        return new Response(null, {status:302, headers:{...securityHeaders(), location:result.redirectTo, 'set-cookie':cookie('',true)}});
      }
      if (url.pathname === '/login/consent' && request.method === 'POST') {
        if (url.search || request.headers.get('origin') !== config.origin || request.headers.get('content-type')?.split(';')[0] !== 'application/x-www-form-urlencoded') return fail();
        const browser = browserCookie(request); if (!browser) return fail();
        const raw = await boundedText(new Response(request.body), 256);
        const form = new URLSearchParams(raw);
        if ([...form.keys()].sort().join(',') !== 'consent,decision') return fail();
        const consent = form.get('consent'), decision = form.get('decision');
        if (!tokenPattern.test(consent ?? '') || !['allow','deny'].includes(decision ?? '')) return fail();
        const transaction = await store.consume(consent, await digest(browser), 'consent', now());
        if (!transaction) return fail();
        if (decision === 'deny') return new Response('Permission denied', {status:403, headers:{...securityHeaders(), 'set-cookie':cookie('',true)}});
        if (!validHealthAuthRequest(transaction.auth, env.MCP_RESOURCE_URL)) return fail();
        const state = randomToken(), verifier = randomToken();
        await store.put(state, {phase:'github', browserHash:await digest(browser), expiresAt:now()+TTL, auth:transaction.auth, verifier});
        const github = new URL('https://github.com/login/oauth/authorize');
        github.searchParams.set('client_id', config.clientId); github.searchParams.set('redirect_uri', config.callback); github.searchParams.set('state', state);
        github.searchParams.set('scope', ''); github.searchParams.set('allow_signup', 'false');
        github.searchParams.set('code_challenge', await challenge(verifier)); github.searchParams.set('code_challenge_method','S256');
        return new Response(null, {status:302, headers:{...securityHeaders(), location:github.href}});
      }
      return fail(405);
    } catch { return fail(503); }
  };
}
