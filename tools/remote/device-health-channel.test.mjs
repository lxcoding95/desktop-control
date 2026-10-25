import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDeviceHealthChannel } from './device-health-channel.mjs';
import { createRemoteRelay } from './relay-core.mjs';
const sample = (id='id-1',nonce='nonce-1') => ({type:'remote.health.request', id, nonce, tool:'desktop_control.remote_health', args:{}});
test('requires an authenticated channel adapter, never opens a socket',()=>{
 assert.throws(()=>createDeviceHealthChannel(),/authenticated channel/);
});
test('only health-only response with no desktop access',async()=>{
 const sent=[];const h=createDeviceHealthChannel({send:async x=>sent.push(x)});
 assert.equal(await h.receive(sample()),true);
 assert.deepEqual(sent,[{type:'remote.health.response',id:'id-1',nonce:'nonce-1',result:{connected:true,scope:'remote-health-only',desktopAccess:false}}]);
});
test('no file terminal or desktop command accepted',async()=>{
 const sent=[];const h=createDeviceHealthChannel({send:x=>sent.push(x)});
 for(const cmd of ['desktop_control.files_read','desktop_control.terminal_run','desktop_control.desktop_click']){
   assert.equal(await h.receive({...sample(),tool:cmd}),false);
 }
 assert.equal(sent.length,0);
});
test('malformed and oversized remote requests rejected',async()=>{
 const sent=[];const h=createDeviceHealthChannel({send:x=>sent.push(x)});
 for(const x of [null, [], {}, {...sample(),id:''},{...sample(),nonce:'!'}, {...sample(),args:{root:'C:/'}},{...sample(),injected:'stuff'}, {...sample(), id:'x'.repeat(6000)}]){
  assert.equal(await h.receive(x),false);
 }
 assert.equal(sent.length,0);
});
test('same nonce never executes twice within session',async()=>{
 const sent=[];const h=createDeviceHealthChannel({send:x=>sent.push(x)});
 assert.equal(await h.receive(sample()),true);
 assert.equal(await h.receive(sample('id-2')),false);
 assert.equal(sent.length,1);
});
test('stop prevents further replies',async()=>{
 const sent=[];const h=createDeviceHealthChannel({send:x=>sent.push(x)});
 h.stop(); assert.equal(await h.receive(sample()),false);assert.equal(sent.length,0);
});
test('channel transport failures are contained',async()=>{
 const h=createDeviceHealthChannel({send:async()=>{throw new Error('offline')}});
 assert.equal(await h.receive(sample()),false);
});
test('relay and local device health filter complete mock authenticated roundtrip',async()=>{
 let inbound;const relay=createRemoteRelay({
  verifyClient:async token=>token==='oauth-valid'?{ownerId:'user-x',scopes:['remote.health'],expiresAt:Date.now()+10000}:null,
  verifyDevice:async ticket=>ticket==='device-valid'?{ownerId:'user-x',deviceId:'pc-x',expiresAt:Date.now()+10000}:null,
  timeoutMs:1000
 });
 const channel=createDeviceHealthChannel({send:message=>inbound.receive(message)});
 inbound=await relay.attachDevice({ticket:'device-valid',send:message=>channel.receive(message)});
 assert.deepEqual(await relay.callHealth({credential:'oauth-valid',deviceId:'pc-x'}),{connected:true,scope:'remote-health-only',desktopAccess:false});
 inbound.disconnect();channel.stop();
});
