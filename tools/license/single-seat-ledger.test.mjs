import test from 'node:test';
import assert from 'node:assert/strict';
import { createSingleSeatLedger } from './single-seat-ledger.mjs';

class AtomicStorage {
  rows=new Map();
  queue=Promise.resolve();
  async get(k){return this.rows.get(k)}
  async put(k,v){this.rows.set(k,structuredClone(v))}
  async transaction(fn) {
    const old=this.queue;let release;
    this.queue=new Promise(r=>release=r);
    await old;
    try{return await fn(this)}finally{release()}
  }
}
function ready() {
  const storage=new AtomicStorage();
  const clock=()=>1000000;
  return {store:createSingleSeatLedger({storage,approvedOwnerId:'owner-1',now:clock}),storage,
    claim:{v:1,scope:'remote.health',ownerId:'owner-1',deviceId:'device-1',
      licenseId:'lic-1',issuedAt:1000000,expiresAt:1050000}};
}
test('no unverified owner or transactional backend is allowed',()=>{
  assert.throws(()=>createSingleSeatLedger(),/Trusted one-seat/);
  assert.throws(()=>createSingleSeatLedger({storage:new AtomicStorage(),approvedOwnerId:''}),/Trusted one-seat/);
});
test('single approved license is accepted once only',async()=>{
  const x=ready();
  assert.equal(await x.store.reserveSeat(x.claim),true);
  assert.equal(await x.store.reserveSeat(x.claim),false);
  assert.equal(await x.store.isActive(x.claim),true);
});
test('second device and second owner cannot use first seat',async()=>{
  const x=ready();await x.store.reserveSeat(x.claim);
  assert.equal(await x.store.reserveSeat({...x.claim,licenseId:'lic-2',deviceId:'device-2'}),false);
  assert.equal(await x.store.reserveSeat({...x.claim,ownerId:'attacker'}),false);
  assert.equal(await x.store.isActive({...x.claim,deviceId:'other-device'}),false);
  assert.equal(await x.store.isActive({...x.claim,licenseId:'other-license'}),false);
});
test('two concurrent reserve attempts cannot both allocate one seat',async()=>{
  const x=ready();
  const pair=await Promise.all([x.store.reserveSeat(x.claim),
    x.store.reserveSeat({...x.claim,licenseId:'lic-2'})]);
  assert.deepEqual(pair.sort(),[false,true]);
});
test('revocation requires trusted admin verifier, not client JSON',async()=>{
  const x=ready();await x.store.reserveSeat(x.claim);
  assert.equal(await x.store.revoke({licenseId:'lic-1'}),false);
  assert.equal(await x.store.revoke({licenseId:'lic-1',verifyAdmin:async()=>false}),false);
  assert.equal(await x.store.isActive(x.claim),true);
  assert.equal(await x.store.revoke({licenseId:'lic-1',verifyAdmin:async()=>true}),true);
  assert.equal(await x.store.isActive(x.claim),false);
});
test('revoked license is not silently replaced by second account',async()=>{
  const x=ready();await x.store.reserveSeat(x.claim);
  await x.store.revoke({licenseId:'lic-1',verifyAdmin:async()=>true});
  assert.equal(await x.store.reserveSeat({...x.claim,licenseId:'lic-2'}),false);
});
test('expired or malformed claim fails closed',async()=>{
  const x=ready();
  assert.equal(await x.store.reserveSeat({...x.claim,expiresAt:1000000}),false);
  assert.equal(await x.store.reserveSeat({...x.claim,ownerId:'other'}),false);
  assert.equal(await x.store.reserveSeat({...x.claim,scope:'desktop.control'}),false);
  assert.equal(await x.store.reserveSeat({}),false);
});
test('store failure never implies an entitlement',async()=>{
  const store=createSingleSeatLedger({
    storage:{get:async()=>{throw Error('db down')},transaction:async()=>{throw Error('db down')}},
    approvedOwnerId:'owner-1',now:()=>1000000
  });
  const claim=ready().claim;
  await assert.rejects(store.reserveSeat(claim),/db down/);
  await assert.rejects(store.isActive(claim),/db down/);
});
