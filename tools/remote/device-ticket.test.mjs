import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDeviceTicketAuthority } from './device-ticket.mjs';
const enrollment={ ownerId:'user-1',deviceId:'windows-1',approved:true,expiresAt:100_000 };
function setup({secret = new Uint8Array(32).fill(17), now:starting = 1000, approved = true, recordFailure=false,consumeFailure=false}={}) {
 let clock=starting;
 const tokens=new Map();
 let id=0;
 const authority=createDeviceTicketAuthority({secret,now:()=>clock,makeId:()=> 'ticket-' + ++id,
  verifyEnrollment:async ref=>ref==='approved'?{...enrollment,approved}:null,
  recordIssued:async payload=> {if(recordFailure) throw Error('db down');tokens.set(payload.jti,payload);return true},
  consumeIssued:async payload=>{
    if(consumeFailure) throw Error('db down');
    const stored=tokens.get(payload.jti);
    if(!stored || stored.ownerId!==payload.ownerId||stored.deviceId!==payload.deviceId||stored.expiresAt!==payload.expiresAt)return false;
    tokens.delete(payload.jti);return true;
  }});
 return {authority, advance:n=>clock+=n, revoke:()=>tokens.clear()};
}
const code=(p,expected)=>assert.rejects(p,e=>e?.code===expected);
test('rejects missing/short signature keys and missing trusted stores',()=>{
 assert.throws(()=>createDeviceTicketAuthority(),/Random signing/);
 assert.throws(()=>createDeviceTicketAuthority({secret:new Uint8Array(31)}),/Random signing/);
 assert.throws(()=>createDeviceTicketAuthority({secret:new Uint8Array(32)}),/Trusted durable/);
});
test('issues one-time, approved and signed device-bound ticket',async()=>{
 const x=setup();const t=await x.authority.issue('approved');assert.match(t,/^dt1\./);
 assert.deepEqual(await x.authority.verifyDevice(t),{ownerId:'user-1',deviceId:'windows-1',expiresAt:61_000});
 await code(x.authority.verifyDevice(t),'TICKET_USED_OR_REVOKED');
});
test('rejects unapproved enrollment and nonexistent reference',async()=>{
 await code(setup({approved:false}).authority.issue('approved'),'ENROLLMENT_DENIED');
 await code(setup().authority.issue('unknown'),'ENROLLMENT_DENIED');
});
test('denies tampered payload and signature',async()=>{
 const x=setup();const t=await x.authority.issue('approved');const parts=t.split('.');
 await code(x.authority.verifyDevice(parts[0]+'.'+parts[1]+'x.'+parts[2]),'INVALID_TICKET');
 await code(x.authority.verifyDevice(parts[0]+'.'+parts[1]+'.'+parts[2].slice(0,-2)+'ab'),'INVALID_TICKET');
});
test('rejects tickets signed under another authority',async()=>{
 const x=setup();const y=setup({secret:new Uint8Array(32).fill(99)});
 const t=await x.authority.issue('approved');await code(y.authority.verifyDevice(t),'INVALID_TICKET');
});
test('expires and rejects stale device tickets',async()=>{
 const x=setup();const t=await x.authority.issue('approved');x.advance(60_001);
 await code(x.authority.verifyDevice(t),'TICKET_EXPIRED');
});
test('revoked enrollment store cannot validate a ticket',async()=>{
 const x=setup();const t=await x.authority.issue('approved');x.revoke();
 await code(x.authority.verifyDevice(t),'TICKET_USED_OR_REVOKED');
});
test('rejects malformed, oversized, missing and manipulated tickets',async()=>{
 const x=setup();
 for(const t of ['',null,'dt1..','dt1.xxx.yyy','xx1.YWJj.YWJj','dt1.'+'z'.repeat(2100)+'.xyz'])
  await code(x.authority.verifyDevice(t),'INVALID_TICKET');
});
test('issuance never silently bypasses failed durable storage',async()=>{
 await code(setup({recordFailure:true}).authority.issue('approved'),'TICKET_STORE_UNAVAILABLE');
});
test('verification never silently bypasses unavailable durable storage',async()=>{
 const x=setup({consumeFailure:true});const t=await x.authority.issue('approved');
 await code(x.authority.verifyDevice(t),'TICKET_STORE_UNAVAILABLE');
});
test('two simultaneous verification calls cannot reuse same issued record',async()=>{
 const x=setup();const t=await x.authority.issue('approved');
 const results=await Promise.allSettled([x.authority.verifyDevice(t),x.authority.verifyDevice(t)]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 assert.equal(results.filter(r=>r.status==='rejected'&&r.reason.code==='TICKET_USED_OR_REVOKED').length,1);
});
test('cannot issue ticket from already expired enrollment',async()=>{
 const x=setup({now:200_000});await code(x.authority.issue('approved'),'ENROLLMENT_DENIED');
});
