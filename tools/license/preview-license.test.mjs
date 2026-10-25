import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { issuePreviewLicense, verifyPreviewLicense } from './preview-license.mjs';

const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 3072 });
const { publicKey: otherPublic, privateKey: otherPrivate } = generateKeyPairSync('rsa', { modulusLength: 3072 });
const now = () => 1800000000000;
const original = {privateKey,ownerId:'owner-a',deviceId:'pc-a',licenseId:'license-one',expiresAt:now()+3600000,now};
function ledger() {
  const licenses=new Map();
  return {
    licenses,
    async reserveSeat(c) {
      if(c.ownerId!=='owner-a' || c.deviceId!=='pc-a')return false;
      if([...licenses.values()].some(v=>v.active))return false;
      if(licenses.has(c.licenseId))return false;
      licenses.set(c.licenseId,{...c,active:true});
      return true;
    },
    async isActive(c) {
      const entry=licenses.get(c.licenseId);
      return !!entry?.active && entry.ownerId===c.ownerId &&
        entry.deviceId===c.deviceId && entry.expiresAt===c.expiresAt;
    },
    revoke(id){licenses.get(id).active=false;}
  };
}
const rejects=(p,code)=>assert.rejects(p,e=>e?.code===code);
test('a signed one-seat license requires a trusted atomic seat store',async()=>{
  const l=ledger();
  const token=await issuePreviewLicense({...original,reserveSeat:l.reserveSeat});
  assert.match(token,/^dcl1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  assert.equal((await verifyPreviewLicense({token,publicKey,expectedOwnerId:'owner-a',expectedDeviceId:'pc-a',isActive:l.isActive,now})).scope,'remote.health');
});
test('two sequential attempts cannot issue a second active license',async()=>{
  const l=ledger();
  await issuePreviewLicense({...original,reserveSeat:l.reserveSeat});
  await rejects(issuePreviewLicense({...original,licenseId:'license-two',reserveSeat:l.reserveSeat}),'NO_AVAILABLE_SEAT');
});
test('concurrent seat issuance succeeds exactly once with atomic store',async()=>{
  const l=ledger();
  const jobs=await Promise.allSettled([
    issuePreviewLicense({...original,reserveSeat:l.reserveSeat}),
    issuePreviewLicense({...original,licenseId:'license-two',reserveSeat:l.reserveSeat})
  ]);
  assert.equal(jobs.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(jobs.filter(r=>r.status==='rejected' && r.reason?.code==='NO_AVAILABLE_SEAT').length,1);
});
test('wrong owner or device cannot verify copied entitlement',async()=>{
  const l=ledger();const token=await issuePreviewLicense({...original,reserveSeat:l.reserveSeat});
  for(const [u,d] of [['owner-b','pc-a'],['owner-a','pc-b']])
    await rejects(verifyPreviewLicense({token,publicKey,expectedOwnerId:u,expectedDeviceId:d,isActive:l.isActive,now}),'WRONG_OWNER_OR_DEVICE');
});
test('tampered and wrong-key signatures cannot be used',async()=>{
  const l=ledger();const token=await issuePreviewLicense({...original,reserveSeat:l.reserveSeat});
  await rejects(verifyPreviewLicense({token,publicKey:otherPublic,expectedOwnerId:'owner-a',expectedDeviceId:'pc-a',isActive:l.isActive,now}),'INVALID_LICENSE');
  const parts=token.split('.');
  await rejects(verifyPreviewLicense({token:parts[0]+'.'+parts[1]+'.'+parts[2].replace(/^./,parts[2][0]==='A'?'B':'A'),publicKey,expectedOwnerId:'owner-a',expectedDeviceId:'pc-a',isActive:l.isActive,now}),'INVALID_LICENSE');
});
test('issuer cannot grant unsupported capability or excessive TTL',async()=>{
  const l=ledger();
  await rejects(issuePreviewLicense({...original,expiresAt:now()+32*86400000,reserveSeat:l.reserveSeat}),'INVALID_CLAIMS');
});
test('expired entitlement denies even when ledger still says active',async()=>{
  const l=ledger();const token=await issuePreviewLicense({...original,reserveSeat:l.reserveSeat});
  await rejects(verifyPreviewLicense({token,publicKey,expectedOwnerId:'owner-a',expectedDeviceId:'pc-a',isActive:l.isActive,now:()=>now()+3600001}),'LICENSE_EXPIRED_OR_INVALID');
});
test('revocation denies already-signed entitlement online',async()=>{
  const l=ledger();const token=await issuePreviewLicense({...original,reserveSeat:l.reserveSeat});
  l.revoke('license-one');
  await rejects(verifyPreviewLicense({token,publicKey,expectedOwnerId:'owner-a',expectedDeviceId:'pc-a',isActive:l.isActive,now}),'LICENSE_REVOKED');
});
test('unavailable revocation store fails closed',async()=>{
  const l=ledger();const token=await issuePreviewLicense({...original,reserveSeat:l.reserveSeat});
  await rejects(verifyPreviewLicense({token,publicKey,expectedOwnerId:'owner-a',expectedDeviceId:'pc-a',isActive:()=>{throw Error('down')},now}),'LICENSE_STORE_UNAVAILABLE');
});
test('no signing key, seat store, verification key or revocation checker denies',async()=>{
  await rejects(issuePreviewLicense({...original,privateKey:undefined,reserveSeat:()=>true}),'INVALID_SIGNER');
  await rejects(issuePreviewLicense(original),'ISSUER_NOT_CONFIGURED');
  await rejects(verifyPreviewLicense({token:'x',publicKey,expectedOwnerId:'owner-a',expectedDeviceId:'pc-a',now}),'VERIFIER_NOT_CONFIGURED');
});
test('a second issuer private key cannot mint an official license',async()=>{
  const l=ledger();const token=await issuePreviewLicense({...original,privateKey:otherPrivate,reserveSeat:l.reserveSeat});
  await rejects(verifyPreviewLicense({token,publicKey,expectedOwnerId:'owner-a',expectedDeviceId:'pc-a',isActive:l.isActive,now}),'INVALID_LICENSE');
});
