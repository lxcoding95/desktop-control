import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign, createHash } from 'node:crypto';
import { symlinkSync, chmodSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import { createTestStore, reopenTestStore } from './store.mjs';
import { BridgeUpdater, enrollTrust } from './runtime.mjs';
const CONTRACT='desktop-control-bridge-v1';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function fixture(t) {
  const {store,cleanup}=createTestStore(); t.after(cleanup);
  const {publicKey,privateKey}=generateKeyPairSync('ed25519');
  enrollTrust(store,{local:publicKey.export({type:'spki',format:'pem'})});
  let now=Date.now();
  const engine=new BridgeUpdater(store,{clock:()=>now});
  const publish=(version,sequence,{bad=false,mandatory=false,files=null,key=privateKey,expiresAt=null}={})=>{
    const entry=bad?'process.exit(23);':`console.log(JSON.stringify({schema:1,version:${JSON.stringify(version)},contract:${JSON.stringify(CONTRACT)},nonce:process.argv[3]}));`;
    const bytes=Buffer.from(JSON.stringify({schema:1,version,contract:CONTRACT,entry:'entry.mjs',files:files??[{path:'entry.mjs',content:Buffer.from(entry).toString('base64')}]}));
    const policy={schema:1,sequence,issuedAt:new Date(now-1000).toISOString(),expiresAt:expiresAt??new Date(now+3600000).toISOString(),platform:process.platform+'-'+process.arch,minBridge:'0.0.0',targetBridge:version,compatiblePlugins:['0.0.1-preview.4'],contract:CONTRACT,mandatory,artifact:{name:'runtime-'+sequence+'.json',sha256:hash(bytes),size:bytes.length}};
    const payload=Buffer.from(JSON.stringify(policy));
    const envelope={format:'dc-update-policy-v1',keyId:'local',payload:payload.toString('base64url'),signature:sign(null,payload,key).toString('base64url')};
    store.write(policy.artifact.name,bytes); // publisher retains a separate source; inbox is the consumer.
    store.write('inbox/'+policy.artifact.name,bytes);
    store.writeJSON('inbox/policy.json',envelope);
    return {envelope,bytes,policy};
  };
  return {store,engine,publish,setNow:value=>{now=value;},getNow:()=>now};
}
test('real fresh child health, two signed updates and failed third rollback survive a fresh engine',async t=>{
  const {store,engine,publish}=fixture(t);
  publish('1.0.0',1);assert.deepEqual(await engine.applyPending(),{state:'ACTIVE',version:'1.0.0'});
  publish('1.0.1',2);assert.deepEqual(await engine.applyPending(),{state:'ACTIVE',version:'1.0.1'});
  publish('1.0.2',3,{bad:true});assert.deepEqual(await engine.applyPending(),{state:'ROLLBACK',version:'1.0.1',error:'BRIDGE_UPDATE_FAILED'});
  assert.equal(store.json('state.json').checkpoint.sequence,3);
  assert.deepEqual(await new BridgeUpdater(store).status(),{state:'ACTIVE',version:'1.0.1'});
  assert.equal((await engine.applyPending()).state,'ROLLBACK');
  publish('1.0.3',4);assert.deepEqual(await engine.applyPending(),{state:'ACTIVE',version:'1.0.3'});
});
test('autonomous watch consumes a later inbox release without a caller invoking apply',async t=>{
  const {engine,publish}=fixture(t);publish('2.0.0',1);
  let result, resolve, resolveFirst;
  const ready=new Promise(r=>{resolve=r;});
  const firstReady=new Promise(r=>{resolveFirst=r;});
  const stop=engine.watch({intervalMs:100,onResult:value=>{if(value.version==='2.0.0')resolveFirst();if(value.version==='2.0.1'){result=value;resolve();}}});
  t.after(stop);
  await Promise.race([firstReady,new Promise((_,reject)=>{const timer=setTimeout(()=>reject(Error('first watch update timed out')),15000);timer.unref();})]);
  publish('2.0.1',2);
  await Promise.race([ready,new Promise((_,reject)=>{const timer=setTimeout(()=>reject(Error('second watch update timed out')),15000);timer.unref();})]);
  assert.deepEqual(result,{state:'ACTIVE',version:'2.0.1'});await stop();
});
test('tampered artifact and foreign signer execute no target and leave original active',async t=>{
  const {store,engine,publish}=fixture(t);publish('1.0.0',1);await engine.applyPending();
  const update=publish('1.0.1',2);store.write('inbox/'+update.policy.artifact.name,Buffer.from('tampered'));
  await assert.rejects(engine.applyPending(),/BRIDGE_INTEGRITY_FAILED/);
  assert.deepEqual(await engine.status(),{state:'ACTIVE',version:'1.0.0'});
  const foreign=generateKeyPairSync('ed25519');publish('1.0.1',2,{key:foreign.privateKey});
  await assert.rejects(engine.applyPending(),/INVALID_SIGNATURE/);
});
test('anti-replay state, same-sequence equivocation and downgrade fail closed',async t=>{
  const {engine,publish}=fixture(t);publish('1.0.1',2);await engine.applyPending();
  publish('1.0.0',1);await assert.rejects(engine.applyPending(),/REPLAY_OR_EQUIVOCATION/);
  publish('1.0.2',2);await assert.rejects(engine.applyPending(),/REPLAY_OR_EQUIVOCATION/);
  publish('1.0.0',3);await assert.rejects(engine.applyPending(),/BRIDGE_DOWNGRADE_DENIED/);
});
test('expiry and clock rollback never report active access',async t=>{
  const {engine,publish,setNow,getNow}=fixture(t);const now=getNow();publish('1.0.0',1);await engine.applyPending();
  setNow(now-10000);assert.equal((await engine.status()).state,'REPAIR_ONLY');
  setNow(now+3600001);assert.equal((await engine.status()).state,'REPAIR_ONLY');
});
test('missing inbox cannot make an expired installed policy appear active',async t=>{
  const {store,engine,publish,setNow,getNow}=fixture(t);const now=getNow();
  publish('1.0.0',1);await engine.applyPending();unlinkFixture(store.file('inbox/policy.json'));
  assert.equal((await engine.applyPending()).state,'ACTIVE');
  setNow(now+3600001);assert.equal((await engine.applyPending()).state,'REPAIR_ONLY');
});
test('mandatory target health failure retains files but blocks old runtime access',async t=>{
  const {engine,publish}=fixture(t);publish('1.0.0',1);await engine.applyPending();
  publish('1.0.1',2,{bad:true,mandatory:true});assert.equal((await engine.applyPending()).state,'REPAIR_ONLY');
  assert.equal((await engine.status()).state,'REPAIR_ONLY');
});
test('signed mandatory metadata blocks the old runtime even when target bytes are missing or tampered',async t=>{
  const {store,engine,publish}=fixture(t);publish('1.0.0',1);await engine.applyPending();
  const update=publish('1.0.1',2,{mandatory:true});unlinkFixture(store.file('inbox/'+update.policy.artifact.name));
  await assert.rejects(engine.applyPending());
  assert.equal((await engine.status()).state,'REPAIR_ONLY');
  await assert.rejects(engine.resolveActive(),/BRIDGE_REPAIR_ONLY/);
  store.write('inbox/'+update.policy.artifact.name,Buffer.from('tampered'));
  await assert.rejects(engine.applyPending());
  assert.equal((await engine.status()).state,'REPAIR_ONLY');
  store.write('inbox/'+update.policy.artifact.name,update.bytes);
  assert.equal((await engine.applyPending()).version,'1.0.1');
});
test('durable interrupted transaction rechecks actual old process and never commits unverified target',async t=>{
  const {store,engine,publish}=fixture(t);publish('1.0.0',1);await engine.applyPending();
  const previous=store.json('state.json');
  store.writeJSON('state.json',{...previous,journal:{phase:'HEALTH',target:previous.active},lastResult:'UPDATING'});
  const fresh=new BridgeUpdater(store);
  assert.equal((await fresh.status()).state,'ACTIVE');
  assert.equal(store.json('state.json').journal,null);
  assert.equal(store.json('state.json').lastResult,'ROLLBACK');
});
test('actual kernel lock excludes a second updater and releases after owner scope',async t=>{
  const {store}=fixture(t);
  const second=reopenTestStore(store.root);
  await store.lock(async()=>{await assert.rejects(second.lock(async()=>{}),/BRIDGE_UPDATE_BUSY/);});
  await store.lock(async guard=>{guard();});
});
test('trust enrollment never overwrites an existing root',t=>{
  const {store}=fixture(t);
  assert.throws(()=>enrollTrust(store,{attacker:'-----BEGIN PUBLIC KEY-----\ninvalid'}),/BRIDGE_ALREADY_ENROLLED/);
});
test('signed traversal and case-alias bundle entries fail before staging',async t=>{
  const {engine,publish}=fixture(t);
  publish('1.0.0',1,{files:[{path:'../escape.mjs',content:''}]});await assert.rejects(engine.applyPending(),/INVALID_BRIDGE_PATH/);
  publish('1.0.0',2,{files:[{path:'entry.mjs',content:''},{path:'ENTRY.mjs',content:''}]});await assert.rejects(engine.applyPending(),/INVALID_BRIDGE_PATH/);
});
test('installed runtime modification fails integrity recheck',async t=>{
  const {store,engine,publish}=fixture(t);publish('1.0.0',1);await engine.applyPending();
  const active=store.json('state.json').active;
  store.write(active.directory+'/runtime/entry.mjs',Buffer.from('console.log("bad")'));
  assert.equal((await engine.status()).state,'REPAIR_ONLY');
});
test('Node health child cannot spawn a subprocess',async t=>{
  const {engine,publish}=fixture(t);
  const code="import {spawnSync} from 'node:child_process';spawnSync(process.execPath,['-e','process.exit(0)']);";
  publish('1.0.0',1,{files:[{path:'entry.mjs',content:Buffer.from(code).toString('base64')}]});
  assert.equal((await engine.applyPending()).state,'REPAIR_ONLY');
});
test('health requires the nonce, clean EOF and a bounded process lifetime',async t=>{
  const {engine,publish}=fixture(t);
  const response="JSON.stringify({schema:1,version:'1.0.0',contract:'desktop-control-bridge-v1',nonce:process.argv[3]})";
  const cases=[
    `console.log(${response});setInterval(()=>{},1000);`,
    `console.log(${response});console.log('extra');`,
    "console.log(JSON.stringify({schema:1,version:'1.0.0',contract:'desktop-control-bridge-v1',nonce:'wrong'}));"
  ];
  for(let i=0;i<cases.length;i++) {
    publish('1.0.0',i+1,{files:[{path:'entry.mjs',content:Buffer.from(cases[i]).toString('base64')}]});
    const started=Date.now();assert.equal((await engine.applyPending()).state,'REPAIR_ONLY');
    assert.ok(Date.now()-started<15000,'health child deadline must remain bounded');
  }
});
test('store rejects a symlink and POSIX world-readable store file', {skip:process.platform==='win32'?'Windows symlink privilege not assumed':false},t=>{
  const {store}=fixture(t);const location=store.file('linked');
  symlinkSync('/etc/passwd',location);assert.throws(()=>store.check(),/BRIDGE_STORE_DENIED/);
  // Remove only the explicitly created fixture link to allow trusted cleanup.
  unlinkFixture(location);store.write('file.json',Buffer.from('{}'));chmodSync(store.file('file.json'),0o644);
  assert.throws(()=>store.check(),/BRIDGE_STORE_DENIED/);chmodSync(location.replace(/linked$/,'file.json'),0o600);
});
import { unlinkSync as unlinkFixture } from 'node:fs';
