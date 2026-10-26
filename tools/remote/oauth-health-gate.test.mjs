import { test } from 'node:test';
import assert from 'node:assert/strict';
import { forwardAuthorizedHealth, handleHealthTool } from './oauth-health-gate.mjs';
const good = { connected: true, scope: 'remote-health-only', desktopAccess: false };
const authContext = { props: { userId: 'account-1' } };
const authInfo = {
  clientId: 'chatgpt-registered-client',
  scopes: ['remote.health'],
  extra: { props: { userId: 'account-1' } }
};
const access = overrides => ({ authContext, authInfo, deviceId: 'laptop-1',
  dispatch: async () => good, ...overrides });
async function errorCode(input, code) {
  await assert.rejects(forwardAuthorizedHealth(input), e => e?.code === code);
}
test('forwards one health command with owner exclusively from verified identity', async () => {
  const sent = [];
  const response = await forwardAuthorizedHealth(access({ dispatch: async x => {
    sent.push(x); return good;
  } }));
  assert.deepEqual(response, good);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].ownerId, 'account-1');
  assert.equal(sent[0].deviceId, 'laptop-1');
});
test('missing provider identity is denied with no dispatch', async () => {
  for (const input of [null, {}, {props:{}}, {props:{userId:'not allowed'}}]) {
    await errorCode(access({authContext:input}),'PERMISSION_DENIED');
  }
});
test('missing standard provider token metadata is denied', async () => {
  for (const item of [null, {}, { clientId:'c',scopes:['remote.health'] }]) {
    await errorCode(access({authInfo:item}),'PERMISSION_DENIED');
  }
});
test('mismatched auth context and provider token subject is denied', async () => {
  await errorCode(access({authInfo:{...authInfo,extra:{props:{userId:'account-2'}}}}),'PERMISSION_DENIED');
});
test('missing scope or OAuth client ID is denied', async () => {
  await errorCode(access({authInfo:{...authInfo,scopes:[]}}),'PERMISSION_DENIED');
  await errorCode(access({authInfo:{...authInfo,clientId:''}}),'PERMISSION_DENIED');
});
test('external device and identity injection is rejected', async () => {
  await errorCode(access({deviceId:'../../other-device'}),'INVALID_DEVICE');
  await errorCode(access({deviceId:''}),'INVALID_DEVICE');
  await errorCode(access({authContext:{props:{userId:'user/../../'}}}),'PERMISSION_DENIED');
});
test('missing device dispatcher stays unavailable', async () => {
  await errorCode(access({dispatch:undefined}),'DEVICE_UNAVAILABLE');
});
test('offline dispatch exceptions are redacted', async () => {
  const result = await handleHealthTool(access({dispatch:async()=>{throw Error('secret internal host path')}}));
  assert.deepEqual(result,{isError:true,content:[{type:'text',text:'DEVICE_UNAVAILABLE'}]});
});
test('untrusted device response with extra keys cannot leak to model', async () => {
  await errorCode(access({dispatch:async()=>({...good,username:'secret'})}),'BAD_DEVICE_RESPONSE');
});
test('rejects response granting desktop access', async () => {
  await errorCode(access({dispatch:async()=>({...good,desktopAccess:true})}),'BAD_DEVICE_RESPONSE');
});
test('requires health-only scope status', async () => {
  await errorCode(access({dispatch:async()=>({...good,scope:'desktop-full'})}),'BAD_DEVICE_RESPONSE');
});
test('abort before forwarding prevents device dispatch', async () => {
  const controller=new AbortController();controller.abort();
  let sent=false;
  await errorCode(access({signal:controller.signal,dispatch:async()=>{sent=true;return good}}),'CANCELLED');
  assert.equal(sent,false);
});
test('abort during request cannot return late success', async () => {
  const controller=new AbortController();
  await errorCode(access({signal:controller.signal,dispatch:async()=>{controller.abort();return good}}),'CANCELLED');
});
test('handles successful health result without exposing credentials or owner', async () => {
  const result=await handleHealthTool(access());
  assert.deepEqual(result.structuredContent,good);
  assert.deepEqual(Object.keys(result.structuredContent).sort(),['connected','desktopAccess','scope']);
  assert.ok(!JSON.stringify(result).includes('account-1'));
});
