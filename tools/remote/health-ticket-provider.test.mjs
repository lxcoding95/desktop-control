import test from 'node:test';
import assert from 'node:assert/strict';
import {createHealthTicketProvider} from './health-ticket-provider.mjs';

const endpoint='https://relay.example.workers.dev/device-ticket';
const expectedHost='relay.example.workers.dev';
const requestSecret=new Uint8Array(32).fill(17);
const ticket='dt1.'+Buffer.from('{}').toString('base64url')+'.'+'a'.repeat(43);
const config={endpoint,expectedHost,ownerId:'fixture-owner',deviceId:'fixture-device',requestSecret};
const response=()=>Response.json({scope:'remote.health',ticket});
const denied=promise=>assert.rejects(promise,error=>error.message==='HEALTH_TICKET_UNAVAILABLE');

test('trusted provider posts an actual signed bootstrap request without redirect following', async()=>{
  let calls=0;
  const provider=createHealthTicketProvider({...config,fetchImpl:async(url,options)=>{
    calls++;assert.equal(url,endpoint);assert.equal(options.method,'POST');assert.equal(options.redirect,'error');
    assert.equal(options.headers['content-type'],'application/json');assert.ok(options.signal instanceof AbortSignal);
    const body=JSON.parse(options.body);
    assert.deepEqual(Object.keys(body).sort(),['nonce','signature','timestamp','v']);assert.equal(body.v,1);
    assert.ok(Math.abs(Date.now()-body.timestamp)<1000);
    const key=await crypto.subtle.importKey('raw',requestSecret,{name:'HMAC',hash:'SHA-256'},false,['verify']);
    const signed=JSON.stringify(['desktop-control-device-bootstrap-v1','POST','/device-ticket',config.ownerId,config.deviceId,body.timestamp,body.nonce]);
    assert.equal(await crypto.subtle.verify('HMAC',key,Buffer.from(body.signature,'base64url'),new TextEncoder().encode(signed)),true);
    return response();
  }});
  assert.equal(await provider(),ticket);assert.equal(calls,1);
});
test('endpoint is exactly pinned HTTPS workers.dev and rejects normalization tricks',()=>{
  for(const patch of [{endpoint:'http://relay.example.workers.dev/device-ticket'},{endpoint:endpoint+'?'},{endpoint:endpoint+'#'},{endpoint:endpoint+'/'},{endpoint:endpoint.replace('https://','https://user@')},{endpoint:endpoint.replace('.dev/','.dev:443/')},{endpoint:endpoint.replace('/device-ticket','/foo/../device-ticket')},{expectedHost:'evil.example'},{expectedHost:'RELAY.example.workers.dev'},{endpoint:'https://evil.workers.dev/device-ticket'}])
    assert.throws(()=>createHealthTicketProvider({...config,...patch,fetchImpl:()=>{throw Error('must not fetch');}}),error=>error.message==='INVALID_HEALTH_TICKET_CONFIG');
});
test('redirects and unsuccessful status cannot provide a ticket',async()=>{
  for(const result of [new Response(null,{status:302,headers:{location:'https://attacker.test'}}),new Response(null,{status:403}),new Response(null,{status:201}),Object.defineProperty(response(),'redirected',{value:true})]) {
    await denied(createHealthTicketProvider({...config,fetchImpl:async()=>result})());
  }
});
test('exact response schema and bounded opaque ticket syntax are required',async()=>{
  for(const value of [{scope:'terminal.exec',ticket},{scope:'remote.health',ticket,ownerId:'other'},{scope:'remote.health',ticket:'dt1.a.b'},{scope:'remote.health',ticket:'x'.repeat(2049)},{scope:'remote.health'},null,[]])
    await denied(createHealthTicketProvider({...config,fetchImpl:async()=>Response.json(value)})());
});
test('oversized streamed body cancels immediately instead of waiting for completion',async()=>{
  let cancelled=0;
  const body=new ReadableStream({start(c){c.enqueue(new Uint8Array(4097));},cancel(){cancelled++;}});
  await denied(createHealthTicketProvider({...config,fetchImpl:async()=>new Response(body)})());
  assert.equal(cancelled,1);
});
test('slow body times out and cancellation never blocks on hostile cancel promise',async()=>{
  let cancelled=0;
  const body=new ReadableStream({cancel(){cancelled++;return new Promise(()=>{});}});
  const start=Date.now();
  await denied(createHealthTicketProvider({...config,fetchImpl:async()=>new Response(body)})());
  assert.equal(cancelled,1);assert.ok(Date.now()-start<2500);
});
test('errors contain no transport, token or secret material',async()=>{
  await denied(createHealthTicketProvider({...config,fetchImpl:async()=>{throw Error('fixture-secret-token');}})());
  await denied(createHealthTicketProvider({...config,fetchImpl:async()=>new Response('fixture-secret-token')})());
});
