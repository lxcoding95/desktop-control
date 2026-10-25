import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDeviceTicketAuthority } from './device-ticket.mjs';
import { createDurableTicketStore } from './durable-ticket-store.mjs';

class FakeDurableStorage {
  constructor() { this.rows = new Map(); this.queue = Promise.resolve(); }
  async get(key) { return this.rows.get(key); }
  async put(key, value) { this.rows.set(key, structuredClone(value)); }
  async delete(key) { return this.rows.delete(key); }
  async transaction(fn) {
    const prev = this.queue;
    let release;
    this.queue = new Promise(resolve => { release = resolve; });
    await prev;
    try { return await fn(this); } finally { release(); }
  }
}
const pairing = (ownerId='alice',deviceId='laptop') => ({
  ownerId, deviceId, status:'approved', revision:'consent-1', expiresAt:90_000
});
function harness() {
  const storage = new FakeDurableStorage();
  let clock = 1000, seq = 0;
  const store = createDurableTicketStore({ storage, now:()=>clock });
  const authority = createDeviceTicketAuthority({
    secret:new Uint8Array(32).fill(47),now:()=>clock,makeId:()=> 'ticket-' + ++seq,
    ...store
  });
  return {
    storage,store,authority,
    ref:{ownerId:'alice',deviceId:'laptop'},
    approve:()=>storage.put('pairing:alice:laptop',pairing()),
    revoke:()=>storage.delete('pairing:alice:laptop'),
    rotate:()=>storage.put('pairing:alice:laptop',{...pairing(),revision:'consent-2'}),
    advance:ms=>clock+=ms
  };
}
async function denies(p,code){ await assert.rejects(p,e=>e?.code===code); }

test('requires transactional storage and never provides a device approve API',()=>{
  assert.throws(()=>createDurableTicketStore(),/Trusted transactional/);
  const store=harness().store;
  assert.equal(Object.hasOwn(store,'approveDevice'),false);
  assert.equal(Object.hasOwn(store,'approve'),false);
});
test('an unauthorised pairing is never eligible for a ticket',async()=>{
  const x=harness();
  assert.equal(await x.store.verifyEnrollment(x.ref),null);
  await denies(x.authority.issue(x.ref),'ENROLLMENT_DENIED');
});
test('approved paired device produces one valid 60-second ticket',async()=>{
  const x=harness();await x.approve();
  const ticket=await x.authority.issue(x.ref);
  assert.deepEqual(await x.authority.verifyDevice(ticket),{
    ownerId:'alice',deviceId:'laptop',expiresAt:61_000
  });
  await denies(x.authority.verifyDevice(ticket),'TICKET_USED_OR_REVOKED');
});
test('another account or device cannot obtain the approved pairing',async()=>{
  const x=harness();await x.approve();
  for(const ref of [{ownerId:'bob',deviceId:'laptop'},{ownerId:'alice',deviceId:'other'}]) {
    assert.equal(await x.store.verifyEnrollment(ref),null);
    await denies(x.authority.issue(ref),'ENROLLMENT_DENIED');
  }
});
test('pairing revocation invalidates issued but unused tickets',async()=>{
  const x=harness();await x.approve();
  const ticket=await x.authority.issue(x.ref);
  await x.revoke();
  await denies(x.authority.verifyDevice(ticket),'TICKET_USED_OR_REVOKED');
});
test('new consent revision invalidates all tickets from previous revision',async()=>{
  const x=harness();await x.approve();
  const ticket=await x.authority.issue(x.ref);
  await x.rotate();
  await denies(x.authority.verifyDevice(ticket),'TICKET_USED_OR_REVOKED');
});
test('two racing ticket consumers cannot succeed twice',async()=>{
  const x=harness();await x.approve();
  const ticket=await x.authority.issue(x.ref);
  const results=await Promise.allSettled([x.authority.verifyDevice(ticket),x.authority.verifyDevice(ticket)]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(results.filter(r=>r.status==='rejected'&&r.reason.code==='TICKET_USED_OR_REVOKED').length,1);
});
test('storage disallows duplicate ticket identifiers',async()=>{
  const x=harness();await x.approve();
  const p={...x.ref,jti:'token-1',issuedAt:1000,expiresAt:60_000,enrollmentRef:x.ref};
  assert.equal(await x.store.recordIssued(p),true);
  assert.equal(await x.store.recordIssued(p),false);
});
test('invalid identifiers, forged enrollment and malformed tickets fail closed',async()=>{
  const x=harness();await x.approve();
  assert.equal(await x.store.verifyEnrollment({ownerId:'alice/../bob',deviceId:'laptop'}),null);
  assert.equal(await x.store.verifyEnrollment({...x.ref,approved:true}),null);
  assert.equal(await x.store.recordIssued({ownerId:'alice',deviceId:'laptop',jti:'x',issuedAt:1000,expiresAt:61_000,enrollmentRef:{ownerId:'bob',deviceId:'laptop'}}),false);
  assert.equal(await x.store.consumeIssued({ownerId:'alice',deviceId:'laptop',jti:'unknown',issuedAt:1000,expiresAt:61_000}),false);
});
test('replaced pairing status deny new issued tickets',async()=>{
  const x=harness();await x.approve();
  await x.storage.put('pairing:alice:laptop',{...pairing(),status:'pending'});
  await denies(x.authority.issue(x.ref),'ENROLLMENT_DENIED');
});
test('expired pairing denies issuance',async()=>{
  const x=harness();await x.approve();x.advance(90_001);
  await denies(x.authority.issue(x.ref),'ENROLLMENT_DENIED');
});
test('storage errors are never treated as permission grants',async()=>{
  const x=harness();
  const broken=createDurableTicketStore({storage:{
    get:async()=>{throw Error('database unavailable')},
    transaction:async()=>{throw Error('database unavailable')}
  },now:()=>1000});
  await assert.rejects(broken.verifyEnrollment(x.ref),/database unavailable/);
  await assert.rejects(broken.recordIssued({ownerId:'alice',deviceId:'laptop',jti:'token-1',issuedAt:1000,expiresAt:5000,enrollmentRef:x.ref}),/database unavailable/);
});
