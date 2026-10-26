import test from 'node:test';
import assert from 'node:assert/strict';
import {createGitHubLogin, loginConfig, validHealthAuthRequest, verifiedGitHubOwner} from './auth-login.mjs';


const origin = 'https://auth-test.example.workers.dev';
const resource = 'https://mcp-test.example.workers.dev/mcp';
const config = {ENABLE_GITHUB_LOGIN:'1', PREVIEW_SINGLE_USER:'1', PREVIEW_OWNER_ID:'test-owner', GITHUB_OWNER_ID:'12345', GITHUB_CLIENT_ID:'test-client', GITHUB_CLIENT_SECRET:'fixture-only-secret-not-a-real-key', AUTH_ISSUER:origin+'/', MCP_RESOURCE_URL:resource, AUTH_LOGIN_STATE:{}};
const auth = {responseType:'code', clientId:'client', redirectUri:'https://chatgpt.com/connector/oauth/callback', scope:['remote.health'], state:'client-state', codeChallenge:'a'.repeat(43), codeChallengeMethod:'S256', resource};
function fixture(overrides = {}) {
  const values = new Map(); const completions = []; const upstream = []; let clock = Date.now();
  const store = {
    async put(key, value) {assert.equal(values.has(key),false); values.set(key, structuredClone(value));},
    async consume(key, browserHash, phase, now) {const v=values.get(key); if (!v || v.browserHash!==browserHash || v.phase!==phase || v.expiresAt<=now) return null; values.delete(key); return structuredClone(v);}
  };
  const provider = overrides.provider ?? {async parseAuthRequest(){return structuredClone(overrides.auth ?? auth);}, async describeConsent(){return {clientName:'<script>unsafe</script>'};}, async completeAuthorization(value){completions.push(value); return {redirectTo:auth.redirectUri+'?code=test-code'};}};
  const fetcher = async (url, options) => {upstream.push({url,options}); if(url.endsWith('/access_token')) return Response.json(overrides.token ?? {access_token:'gho_'+'x'.repeat(30), token_type:'bearer', scope:''}); return Response.json(overrides.profile ?? {id:12345, login:'ignored-mutable-name'});};
  const handle = createGitHubLogin({env:{...config,...overrides.env},provider,store,fetcher,now:()=>clock});
  return {handle,values,completions,upstream,advance:()=>{clock+=300001;}};
}
async function consent(f) {
  const page = await f.handle(new Request(origin+'/authorize'));
  assert.equal(page.status,200); const html=await page.text();
  const token=html.match(/name="consent" value="([A-Za-z0-9_-]+)"/)[1];
  const cookie=page.headers.get('set-cookie').split(';')[0];
  return {html,cookie,token};
}
function post(c, decision='allow', headers={}) {return new Request(origin+'/login/consent',{method:'POST',headers:{cookie:c.cookie,origin,'content-type':'application/x-www-form-urlencoded',...headers},body:new URLSearchParams({consent:c.token,decision})});}
async function callback(f,c) {
  const redir=await f.handle(post(c)); assert.equal(redir.status,302);
  const github=new URL(redir.headers.get('location'));
  return {github, request:new Request(origin+'/login/github/callback?state='+github.searchParams.get('state')+'&code=fixture-code',{headers:{cookie:c.cookie}})};
}
test('missing configuration and disabled login fail closed without upstream traffic',async()=>{
  for(const key of Object.keys(config)) {const f=fixture({env:{[key]:undefined}}); assert.equal((await f.handle(new Request(origin+'/authorize'))).status,503); assert.equal(f.upstream.length,0);}
  for(const bad of ['http://auth-test.example.workers.dev/','https://evil.test/','https://user@auth-test.example.workers.dev/','https://auth-test.example.workers.dev/?x=1','https://auth-test.example.workers.dev:444/']) assert.equal(loginConfig({...config,AUTH_ISSUER:bad}),null);
});
test('scope, resource, redirect and downstream PKCE are constrained',()=>{
  assert.equal(validHealthAuthRequest(auth,resource),true);
  for(const patch of [{scope:['terminal.exec']},{scope:['remote.health','remote.health']},{resource:undefined},{resource:'https://evil.test'},{redirectUri:'http://chatgpt.com/cb'},{redirectUri:'https://user:pass@chatgpt.com/cb'},{redirectUri:'https://chatgpt.com/cb#x'},{codeChallengeMethod:'plain'},{codeChallenge:undefined}]) assert.equal(validHealthAuthRequest({...auth,...patch},resource),false);
  assert.equal(verifiedGitHubOwner({id:12345,login:'other'},'12345'),true);
  for(const p of [{id:'12345'},{id:12346},{id:0},{id:9007199254740992},{login:'12345'},null]) assert.equal(verifiedGitHubOwner(p,'12345'),false);
});
test('consent precedes upstream, HTML is escaped and browser-bound denial consumes handle',async()=>{
  const f=fixture(); const c=await consent(f); assert.equal(f.upstream.length,0);
  assert.match(c.html,/&lt;script&gt;/); assert.doesNotMatch(c.html,/<script>/); assert.match(c.html,/chatgpt.com/);
  assert.equal((await f.handle(post(c,'allow',{origin:'https://evil.test'}))).status,403);
  assert.equal((await f.handle(post(c,'allow',{cookie:'__Host-dc-login='+'b'.repeat(43)}))).status,403);
  assert.equal((await f.handle(post(c,'deny'))).status,403);
  assert.equal((await f.handle(post(c))).status,403); assert.equal(f.completions.length,0); assert.equal(f.upstream.length,0);
});
test('verified owner reaches SDK completion only once after explicit consent and PKCE exchange',async()=>{
  const f=fixture(); const c=await consent(f); const cb=await callback(f,c);
  assert.equal(cb.github.origin,'https://github.com'); assert.equal(cb.github.searchParams.get('scope'),''); assert.equal(cb.github.searchParams.get('allow_signup'),'false'); assert.equal(cb.github.searchParams.get('code_challenge_method'),'S256');
  assert.equal((await f.handle(cb.request)).status,302); assert.equal(f.completions.length,1);
  assert.deepEqual(f.completions[0].props,{userId:'test-owner'}); assert.deepEqual(f.completions[0].scope,['remote.health']);
  assert.equal(f.upstream.length,2); const verifier=f.upstream[0].options.body.get('code_verifier');
  assert.equal(Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))).toString('base64url'), cb.github.searchParams.get('code_challenge'));
  assert.equal((await f.handle(cb.request)).status,403); assert.equal(f.completions.length,1);
});
test('wrong owner, forged identity, broadened GitHub scope and expired state never authorize',async()=>{
  for(const overrides of [{profile:{id:54321,login:'12345'}},{profile:{id:'12345'}},{token:{access_token:'gho_'+'x'.repeat(30),token_type:'bearer',scope:'repo'}}]) {
    const f=fixture(overrides), c=await consent(f), cb=await callback(f,c); assert.equal((await f.handle(cb.request)).status,403); assert.equal(f.completions.length,0);
  }
  const f=fixture(), c=await consent(f), cb=await callback(f,c); f.advance(); assert.equal((await f.handle(cb.request)).status,403); assert.equal(f.upstream.length,0);
});
test('callback requires matching browser, unique state/code and accepts no request identity',async()=>{
  const f=fixture(), c=await consent(f), cb=await callback(f,c);
  for(const req of [new Request(cb.request.url),new Request(cb.request.url,{headers:{cookie:'__Host-dc-login='+'b'.repeat(43)}}),new Request(cb.request.url+'&state='+'a'.repeat(43),{headers:{cookie:c.cookie}}),new Request(cb.request.url+'&ownerId=test-owner',{headers:{cookie:c.cookie}})]) assert.equal((await f.handle(req)).status,403);
  assert.equal(f.upstream.length,0); assert.equal(f.completions.length,0);
  assert.equal((await f.handle(cb.request)).status,302);
});
test('concurrent callback replay succeeds at most once and duplicate/oversized forms fail closed',async()=>{
  const f=fixture(), c=await consent(f), cb=await callback(f,c);
  const responses=await Promise.all([f.handle(cb.request.clone()),f.handle(cb.request.clone())]); assert.deepEqual(responses.map(r=>r.status).sort(),[302,403]); assert.equal(f.completions.length,1);
  const other=fixture(), d=await consent(other);
  const duplicate=new Request(origin+'/login/consent',{method:'POST',headers:{cookie:d.cookie,origin,'content-type':'application/x-www-form-urlencoded'},body:`consent=${d.token}&decision=allow&decision=deny`});
  assert.equal((await other.handle(duplicate)).status,403);
  const oversized=new Request(origin+'/login/consent',{method:'POST',headers:{cookie:d.cookie,origin,'content-type':'application/x-www-form-urlencoded'},body:'x'.repeat(300)});
  assert.equal((await other.handle(oversized)).status,503); assert.equal(other.upstream.length,0);
});
