// TEST-ONLY ENTRYPOINT. Never import from a deployment Worker or deploy this file.
import {OAuthAuthorizationServer} from '@cloudflare/workers-oauth-provider';
import {createGitHubLogin} from './auth-login.mjs';
export {AuthLoginState} from './auth-worker';
import type {AuthLoginState} from './auth-worker';
interface TestEnv {OAUTH_KV: KVNamespace; AUTH_LOGIN_STATE: DurableObjectNamespace<AuthLoginState>; LOGIN_TEST_FIXTURE?: string}
function check(value: unknown, message: string): asserts value {if (!value) throw Error(message);}
export default {
  async fetch(request: Request, env: TestEnv) {
    const incoming = new URL(request.url);
    if (env.LOGIN_TEST_FIXTURE !== 'loopback-only' || !['127.0.0.1','localhost'].includes(incoming.hostname)) return new Response('Disabled',{status:503});
    try {
      const origin='https://auth-fixture.example.workers.dev', resource='https://mcp-fixture.example.workers.dev/mcp';
      const sdk=new OAuthAuthorizationServer({issuer:origin+'/',resources:[resource],scopesSupported:['remote.health'],clientIdMetadataDocumentEnabled:false});
      const api=sdk.getOAuthApi(env);
      const client=await api.createClient({clientName:'Fixture client',redirectUris:['https://chatgpt.com/connector/oauth/callback'],grantTypes:['authorization_code'],responseTypes:['code'],tokenEndpointAuthMethod:'none'});
      const store={
        put:(key: string,value: Parameters<AuthLoginState['put']>[1])=>env.AUTH_LOGIN_STATE.get(env.AUTH_LOGIN_STATE.idFromName(key)).put(key,value),
        consume:(key: string,hash: string,phase: string)=>env.AUTH_LOGIN_STATE.get(env.AUTH_LOGIN_STATE.idFromName(key)).consume(hash,phase)
      };
      let upstreamCalls=0;
      const handle=createGitHubLogin({env:{...env, ENABLE_GITHUB_LOGIN:'1', PREVIEW_SINGLE_USER:'1', PREVIEW_OWNER_ID:'fixture-owner', GITHUB_OWNER_ID:'12345', GITHUB_CLIENT_ID:'fixture-client', GITHUB_CLIENT_SECRET:'fixture-not-a-real-secret-value', AUTH_ISSUER:origin+'/', MCP_RESOURCE_URL:resource},provider:api,store,
        fetcher:async(input: URL | RequestInfo)=>{const url=String(input);upstreamCalls++;return Response.json(url.endsWith('/access_token')?{access_token:'gho_'+'x'.repeat(30),token_type:'bearer',scope:''}:{id:12345});}});
      const url=new URL(origin+'/authorize');
      for(const [key,value]of Object.entries({response_type:'code',client_id:client.clientId,redirect_uri:'https://chatgpt.com/connector/oauth/callback',scope:'remote.health',state:'fixture-client-state',code_challenge:'a'.repeat(43),code_challenge_method:'S256',resource})) url.searchParams.set(key,value);
      const page=await handle(new Request(url)); check(page.status===200,'Consent page failed');
      const cookie=page.headers.get('set-cookie')!.split(';')[0];
      const consent=(await page.text()).match(/name="consent" value="([A-Za-z0-9_-]+)"/)?.[1]; check(consent,'Missing handle');
      check(upstreamCalls===0,'Upstream called before consent');
      const post=()=>new Request(origin+'/login/consent',{method:'POST',headers:{cookie,origin,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({consent,decision:'allow'})});
      const decisions=await Promise.all([handle(post()),handle(post())]);
      check(decisions.filter(x=>x.status===302).length===1 && decisions.filter(x=>x.status===403).length===1,'DO consent not atomically one-use');
      const github=new URL(decisions.find(x=>x.status===302)!.headers.get('location')!);
      const callback=()=>new Request(origin+'/login/github/callback?state='+github.searchParams.get('state')+'&code=fixture-code',{headers:{cookie}});
      const results=await Promise.all([handle(callback()),handle(callback())]);
      check(results.filter(x=>x.status===302).length===1 && results.filter(x=>x.status===403).length===1,'DO callback not atomically one-use');
      const redirect=new URL(results.find(x=>x.status===302)!.headers.get('location')!);
      check(redirect.origin==='https://chatgpt.com' && redirect.searchParams.get('state')==='fixture-client-state' && redirect.searchParams.get('code'),'SDK did not issue authorization code');
      url.searchParams.set('redirect_uri','https://attacker.test/callback');
      check((await handle(new Request(url))).status===503,'SDK accepted unregistered redirect');
      return Response.json({result:'PASS',runtime:'actual-workerd',sdk:'1.2.4',checks:6,upstream:'fixture-only-no-network',liveLogin:false});
    } catch {return Response.json({result:'FAIL',detail:'Fixture assertion failed; no credentials or auth data logged'},{status:500});}
  }
};
