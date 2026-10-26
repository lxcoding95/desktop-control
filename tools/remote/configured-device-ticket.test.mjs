import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {createConfiguredDeviceTicket,createDeviceTicketRequestProvider} from './configured-device-ticket.mjs';
import {createDeviceTicketAuthority} from './device-ticket.mjs';
import {createDurableTicketStore} from './durable-ticket-store.mjs';

function fixture(options={}) {
  let time=Date.now(), active=true;
  const requestSecret=new Uint8Array(randomBytes(32)),ticketSecret=new Uint8Array(randomBytes(32));
  const ownerId='fixture-owner',deviceId='fixture-device',rows=new Map();
  const claims={scope:'remote.health',ownerId,deviceId,expiresAt:time+3600000};
  let queue=Promise.resolve();
  const get=async key=>structuredClone(rows.get(key));
  const listFrom=(map,{prefix,limit})=>new Map([...map].filter(([k])=>k.startsWith(prefix)).sort(([a],[b])=>a.localeCompare(b)).slice(0,limit).map(([k,v])=>[k,structuredClone(v)]));
  const storage={get,async list(options){return listFrom(rows,options);},transaction(fn){const run=queue.then(async()=>{
    // Snapshot+commit implements rollback and serialized transactions in this
    // isolated seam. Production must use real Durable Object transactions.
    const snapshot=new Map([...rows].map(([k,v])=>[k,structuredClone(v)]));
    const tx={async get(k){await Promise.resolve();return structuredClone(snapshot.get(k));},async list(options){return listFrom(snapshot,options);},async put(k,v){snapshot.set(k,structuredClone(v));},async delete(k){snapshot.delete(k);}};
    const result=await fn(tx);rows.clear();for(const[k,v]of snapshot)rows.set(k,v);return result;
  });queue=run.catch(()=>{});return run;}};
  const now=()=>time;
  const config={storage,ownerId,deviceId,requestSecret,ticketSecret,approveInitialPairing:true,checkEntitlement:async()=>active?structuredClone(claims):null,now,...options};
  const endpoint=createConfiguredDeviceTicket(config);
  const provider=createDeviceTicketRequestProvider({ownerId,deviceId,requestSecret,now});
  const authority=createDeviceTicketAuthority({secret:ticketSecret,...createDurableTicketStore({storage,now}),now});
  return {endpoint,provider,authority,rows,claims,config,advance:delta=>{time+=delta;},revokeLicense:()=>{active=false;},pairKey:'pairing:'+ownerId+':'+deviceId};
}
const denied=async(promise,code)=>assert.rejects(promise,e=>e.code===code);
test('configured existing device gets actual signed one-use ticket bounded by existing health entitlement',async()=>{
  const f=fixture();f.claims.expiresAt=Date.now()+30000;
  const request=await f.provider.createRequest(); const response=await f.endpoint.issue(request);
  assert.equal(response.scope,'remote.health');assert.ok(response.ticket.startsWith('dt1.'));
  const verified=await f.authority.verifyDevice(response.ticket);
  assert.equal(verified.ownerId,f.config.ownerId);assert.equal(verified.deviceId,f.config.deviceId);
  assert.equal(verified.expiresAt,f.claims.expiresAt);assert.equal(f.rows.get(f.pairKey).expiresAt,f.claims.expiresAt);
  await assert.rejects(f.authority.verifyDevice(response.ticket),e=>e.code==='TICKET_USED_OR_REVOKED');
});
test('forged signatures, wrong key/device and request-supplied owner/capabilities never create pairing',async()=>{
  const f=fixture(), valid=await f.provider.createRequest();
  for(const bad of [{...valid,signature:'a'.repeat(43)},{...valid,ownerId:f.config.ownerId},{...valid,scope:'terminal.exec'},{...valid,v:2},{...valid,signature:valid.signature+'x'}]) await assert.rejects(f.endpoint.issue(bad));
  const wrong=createDeviceTicketRequestProvider({ownerId:f.config.ownerId,deviceId:'other-device',requestSecret:f.config.requestSecret});
  await denied(f.endpoint.issue(await wrong.createRequest()),'AUTHENTICATION_DENIED');
  const wrongKey=createDeviceTicketRequestProvider({ownerId:f.config.ownerId,deviceId:f.config.deviceId,requestSecret:new Uint8Array(randomBytes(32))});
  await denied(f.endpoint.issue(await wrongKey.createRequest()),'AUTHENTICATION_DENIED');
  assert.equal(f.rows.size,0);
});
test('request replay is rejected across fresh authorities and concurrent requests admit once',async()=>{
  const f=fixture(), request=await f.provider.createRequest();
  const result=await Promise.allSettled([f.endpoint.issue(request),f.endpoint.issue(request)]);
  assert.equal(result.filter(x=>x.status==='fulfilled').length,1);
  assert.equal(result.filter(x=>x.status==='rejected'&&x.reason.code==='REQUEST_REPLAYED').length,1);
  await denied(createConfiguredDeviceTicket(f.config).issue(request),'REQUEST_REPLAYED');
  assert.equal([...f.rows.keys()].filter(k=>k.startsWith('ticket:')).length,1);
});
test('timestamp window, expired entitlement and entitlement failure deny without writes',async()=>{
  const old=fixture(), request=await old.provider.createRequest();old.advance(60001);
  await denied(old.endpoint.issue(request),'INVALID_REQUEST');assert.equal(old.rows.size,0);
  const future=fixture(), ahead=await future.provider.createRequest();future.advance(-5001);
  await denied(future.endpoint.issue(ahead),'INVALID_REQUEST');assert.equal(future.rows.size,0);
  const expired=fixture();expired.claims.expiresAt=expired.config.now()-1;
  await denied(expired.endpoint.issue(await expired.provider.createRequest()),'ENTITLEMENT_DENIED');
  const revoked=fixture();revoked.revokeLicense();await denied(revoked.endpoint.issue(await revoked.provider.createRequest()),'ENTITLEMENT_DENIED');
  for(const claims of [true,{scope:'terminal.exec',ownerId:'fixture-owner',deviceId:'fixture-device',expiresAt:Date.now()+99999},{scope:'remote.health',ownerId:'other',deviceId:'fixture-device',expiresAt:Date.now()+99999}]) {
    const f=fixture({checkEntitlement:async()=>claims});await denied(f.endpoint.issue(await f.provider.createRequest()),'ENTITLEMENT_DENIED');assert.equal(f.rows.size,0);
  }
});
test('initial approval defaults false and revoked/expired pairing is never recreated or extended',async()=>{
  const noApproval=fixture({approveInitialPairing:false});await denied(noApproval.endpoint.issue(await noApproval.provider.createRequest()),'PAIRING_DENIED');assert.equal(noApproval.rows.size,0);
  const f=fixture();await f.endpoint.issue(await f.provider.createRequest());
  const original=structuredClone(f.rows.get(f.pairKey));
  f.rows.set(f.pairKey,{...original,status:'revoked'});
  await denied(createConfiguredDeviceTicket(f.config).issue(await f.provider.createRequest()),'PAIRING_DENIED');assert.equal(f.rows.get(f.pairKey).status,'revoked');
  f.rows.set(f.pairKey,{...original,expiresAt:f.config.now()-1});
  await denied(f.endpoint.issue(await f.provider.createRequest()),'PAIRING_DENIED');
  f.rows.set(f.pairKey,original);f.claims.expiresAt+=3600000;
  await f.endpoint.issue(await f.provider.createRequest());assert.deepEqual(f.rows.get(f.pairKey),original);
  f.claims.expiresAt=original.expiresAt-1000;
  await denied(f.endpoint.issue(await f.provider.createRequest()),'PAIRING_DENIED');assert.deepEqual(f.rows.get(f.pairKey),original);
});
test('revocation between admission and use denies actual signed ticket',async()=>{
  const f=fixture(), response=await f.endpoint.issue(await f.provider.createRequest());
  f.rows.get(f.pairKey).status='revoked';
  await assert.rejects(f.authority.verifyDevice(response.ticket),e=>e.code==='TICKET_USED_OR_REVOKED');
  f.revokeLicense();await denied(f.endpoint.issue(await f.provider.createRequest()),'ENTITLEMENT_DENIED');
});
test('distinct request nonces use real crypto and expiry during awaited entitlement fails closed',async()=>{
  const f=fixture();const requests=await Promise.all(Array.from({length:20},()=>f.provider.createRequest()));
  assert.equal(new Set(requests.map(x=>x.nonce)).size,20);
  const delayed=createConfiguredDeviceTicket({...f.config,checkEntitlement:async()=>{f.advance(60001);return f.claims;}});
  await denied(delayed.issue(requests[0]),'INVALID_REQUEST');assert.equal(f.rows.size,0);
});
test('configuration refuses shared/short keys, implicit approval and unusable stores',()=>{
  const f=fixture();
  for(const patch of [{requestSecret:new Uint8Array(1)},{ticketSecret:f.config.requestSecret},{ticketSecret:new Uint8Array(31)},{approveInitialPairing:'true'},{storage:{}},{checkEntitlement:undefined}]) assert.throws(()=>createConfiguredDeviceTicket({...f.config,...patch}));
});
test('atomic reservations cap parallel unconsumed tickets at eight across restart and preserve live rows',async()=>{
  const f=fixture();const requests=await Promise.all(Array.from({length:20},()=>f.provider.createRequest()));
  const results=await Promise.allSettled(requests.map(r=>f.endpoint.issue(r)));
  const accepted=results.filter(r=>r.status==='fulfilled');assert.equal(accepted.length,8);
  assert.equal(results.filter(r=>r.status==='rejected'&&r.reason.code==='CAPACITY_DENIED').length,12);
  assert.equal([...f.rows.keys()].filter(k=>k.startsWith('ticket:')).length,8);
  assert.equal([...f.rows.keys()].filter(k=>k.startsWith('device-bootstrap-pending-ticket:')).length,0);
  const before=structuredClone(f.rows);
  await denied(createConfiguredDeviceTicket(f.config).issue(await f.provider.createRequest()),'CAPACITY_DENIED');
  assert.deepEqual(f.rows,before);
  await f.authority.verifyDevice(accepted[0].value.ticket);
  await f.endpoint.issue(await f.provider.createRequest());
  assert.equal([...f.rows.keys()].filter(k=>k.startsWith('ticket:')).length,8);
});
test('64 live authenticated request nonces bound growth even after ticket consumption and recover after expiry',async()=>{
  const f=fixture();for(let n=0;n<64;n++){const response=await f.endpoint.issue(await f.provider.createRequest());await f.authority.verifyDevice(response.ticket);}
  const live=new Map([...f.rows].filter(([k])=>k.startsWith('device-bootstrap-nonce:')));assert.equal(live.size,64);
  await denied(createConfiguredDeviceTicket(f.config).issue(await f.provider.createRequest()),'CAPACITY_DENIED');
  for(const[key,row]of live)assert.deepEqual(f.rows.get(key),row);
  f.advance(60002);
  await createConfiguredDeviceTicket(f.config).issue(await f.provider.createRequest());
  assert.equal([...f.rows.keys()].filter(k=>k.startsWith('device-bootstrap-nonce:')).length,1);
});
test('expired tickets and crash reservations are pruned in bounded batches without deleting live rows',async()=>{
  const f=fixture();
  for(let n=0;n<8;n++)f.rows.set('device-bootstrap-pending-ticket:crash-'+n,{ownerId:f.config.ownerId,deviceId:f.config.deviceId,expiresAt:f.config.now()+60000});
  await denied(f.endpoint.issue(await f.provider.createRequest()),'CAPACITY_DENIED');
  assert.equal([...f.rows.keys()].filter(k=>k.startsWith('device-bootstrap-pending-ticket:')).length,8);
  f.advance(60001);await f.endpoint.issue(await f.provider.createRequest());
  assert.equal([...f.rows.keys()].filter(k=>k.startsWith('device-bootstrap-pending-ticket:')).length,0);
  const live=new Map([...f.rows].filter(([k])=>k.startsWith('ticket:')));
  for(let n=0;n<100;n++)f.rows.set('ticket:expired-'+String(n).padStart(3,'0'),{expiresAt:f.config.now()-1});
  await denied(f.endpoint.issue(await f.provider.createRequest()),'CAPACITY_DENIED');
  assert.equal([...f.rows.keys()].filter(k=>k.startsWith('ticket:expired-')).length,36);
  for(const[key,row]of live)assert.deepEqual(f.rows.get(key),row);
  await f.endpoint.issue(await f.provider.createRequest());
  assert.equal([...f.rows.keys()].filter(k=>k.startsWith('ticket:expired-')).length,0);
  for(const[key,row]of live)assert.deepEqual(f.rows.get(key),row);
});
test('malformed capacity records fail closed instead of evicting unrecognized or live state',async()=>{
  const f=fixture();f.rows.set('ticket:malformed',{expiresAt:Infinity});const before=structuredClone(f.rows);
  await denied(f.endpoint.issue(await f.provider.createRequest()),'CAPACITY_DENIED');assert.deepEqual(f.rows,before);
});
