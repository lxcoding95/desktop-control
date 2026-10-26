// TEST-ONLY ENTRYPOINT: never deploy or import this from a production Worker.
// Administrative fixture routes exist solely inside an isolated loopback test.
import {RemoteHealthRelay} from './remote-relay-do';
type FixtureEnv={REMOTE_RELAY:DurableObjectNamespace<RelayRuntimeFixture>;RELAY_TEST_GUARD?:string;ENABLE_RELAY_FIXTURE?:string;PREVIEW_OWNER_ID?:string;PREVIEW_DEVICE_ID?:string};
export class RelayRuntimeFixture extends RemoteHealthRelay {
  async fetch(request:Request):Promise<Response>{
    const url=new URL(request.url);
    if(url.pathname==='/fixture/body-boundaries'){
      let oversizedCanceled=false,slowCanceled=false;
      const oversized=new ReadableStream<Uint8Array>({start(c){c.enqueue(new Uint8Array(2048));},cancel(){oversizedCanceled=true;}});
      const largeRequest=new Request('https://relay.fixture.internal/device-ticket',{method:'POST',headers:{'content-type':'application/json'},body:oversized});
      const large=await super.fetch(largeRequest);
      const start=performance.now();
      const slow=new ReadableStream<Uint8Array>({cancel(){slowCanceled=true;}});
      const slowRequest=new Request('https://relay.fixture.internal/device-ticket',{method:'POST',headers:{'content-type':'application/json'},body:slow});
      const delayed=await super.fetch(slowRequest);
      return Response.json({large:large.status,slow:delayed.status,elapsedMs:performance.now()-start,oversizedCanceled,slowCanceled,noContentLength:!largeRequest.headers.has('content-length')&&!slowRequest.headers.has('content-length'),tickets:(await this.ctx.storage.list({prefix:'ticket:'})).size,pairings:(await this.ctx.storage.list({prefix:'pairing:'})).size});
    }
    if(url.pathname==='/fixture/license-check')return super.fetch(new Request('https://relay.fixture.internal/entitlement',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({ownerId:this.env.PREVIEW_OWNER_ID,deviceId:this.env.PREVIEW_DEVICE_ID})}));
    if(url.pathname==='/fixture/revoke-pair'){
      const rows=await this.ctx.storage.list<{status:string}>({prefix:'pairing:'});
      for(const[key,value]of rows)await this.ctx.storage.put(key,{...value,status:'revoked'});
      return Response.json({revoked:rows.size});
    }
    if(url.pathname==='/fixture/revoke-seat'){
      const value=await this.ctx.storage.get<Record<string,unknown>>('licenses:preview:seat-1');
      if(!value)return new Response('No fixture seat',{status:409});
      await this.ctx.storage.put('licenses:preview:seat-1',{...value,status:'revoked'});
      return Response.json({revoked:1});
    }
    if(url.pathname==='/fixture/status')return Response.json({sockets:this.ctx.getWebSockets().length,tickets:(await this.ctx.storage.list({prefix:'ticket:'})).size,nonces:(await this.ctx.storage.list({prefix:'device-bootstrap-nonce:'})).size,reservations:(await this.ctx.storage.list({prefix:'device-bootstrap-pending-ticket:'})).size});
    return super.fetch(request);
  }
}
export default {
  async fetch(request:Request,env:FixtureEnv):Promise<Response>{
    const url=new URL(request.url);
    if(env.ENABLE_RELAY_FIXTURE!=='loopback-only'||!['127.0.0.1','localhost'].includes(url.hostname)||!env.RELAY_TEST_GUARD||url.searchParams.get('guard')!==env.RELAY_TEST_GUARD)return new Response('Fixture disabled',{status:503});
    if(url.pathname==='/ready')return new Response('READY');
    const scenario=url.searchParams.get('scenario');
    if(!['pair','seat','body','capacity'].includes(scenario??''))return new Response('Invalid fixture scenario',{status:400});
    const routes:Record<string,string>={'/ticket':'/device-ticket','/device':'/device','/health':'/health','/entitlement':'/entitlement','/fixture/revoke-pair':'/fixture/revoke-pair','/fixture/revoke-seat':'/fixture/revoke-seat','/fixture/status':'/fixture/status','/fixture/license-check':'/fixture/license-check','/fixture/body-boundaries':'/fixture/body-boundaries'};
    const route=routes[url.pathname];if(!route)return new Response('Not found',{status:404});
    const stub=env.REMOTE_RELAY.get(env.REMOTE_RELAY.idFromName('isolated-runtime-fixture-'+scenario));
    return stub.fetch(new Request('https://relay.fixture.internal'+route,request));
  }
};
