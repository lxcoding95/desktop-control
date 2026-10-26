// Actual loopback workerd+SQLite DO+WebSocket test. ALL keys/licenses are ephemeral
// fixture material; no personal vault, account, credential or hosted API is used.
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn,spawnSync} from 'node:child_process';
import {createServer} from 'node:net';
import {generateKeyPairSync,randomBytes,randomUUID} from 'node:crypto';
import {issuePreviewLicense} from '../../license/preview-license.mjs';
import {createDeviceTicketRequestProvider} from '../configured-device-ticket.mjs';
const dir=dirname(fileURLToPath(import.meta.url));
const ownerId='runtime-fixture-owner',deviceId='runtime-fixture-device';
const requestSecret=randomBytes(32),ticketSecret=randomBytes(32),guard=randomBytes(32).toString('base64url');
const provider=createDeviceTicketRequestProvider({ownerId,deviceId,requestSecret});
const scratch=await mkdtemp(join(tmpdir(),'desktop-control-relay-fixture-'));
const port=await new Promise((ok,bad)=>{const s=createServer();s.once('error',bad);s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(e=>e?bad(e):ok(p));});});
let child;const sockets=new Set();let checks=0;
const endpoint=(path,scenario='pair')=>`http://127.0.0.1:${port}${path}?guard=${guard}&scenario=${scenario}`;
const get=(path,scenario)=>fetch(endpoint(path,scenario),{signal:AbortSignal.timeout(10000)});
const post=(path,body,scenario)=>fetch(endpoint(path,scenario),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(10000)});
async function openDevice(ticket,scenario='pair'){
  const ws=new WebSocket(endpoint('/device',scenario).replace('http:','ws:'),ticket?['desktop-control-health',ticket]:undefined);sockets.add(ws);
  let readyResolve,closedResolve;
  const ready=new Promise(r=>{readyResolve=r;}),closed=new Promise(r=>{closedResolve=r;});
  const timer=setTimeout(()=>{readyResolve(false);try{ws.close();}catch{}},7000);
  ws.addEventListener('message',event=>{
    const frame=JSON.parse(event.data);
    if(frame.type==='remote.device.ready'){clearTimeout(timer);readyResolve(true);}
    if(frame.type==='remote.health.request')ws.send(JSON.stringify({type:'remote.health.response',id:frame.id,nonce:frame.nonce,result:{connected:true,scope:'remote-health-only',desktopAccess:false}}));
  });
  ws.addEventListener('close',event=>{clearTimeout(timer);sockets.delete(ws);readyResolve(false);closedResolve(event.code);});
  ws.addEventListener('error',()=>{clearTimeout(timer);readyResolve(false);});
  ws.addEventListener('open',()=>ws.send(JSON.stringify({type:'remote.device.authenticate',deviceId,ticket,challenge:randomUUID()})));
  return {ws,ready,closed};
}
async function untilNoSockets(scenario){for(let n=0;n<25;n++){const response=await get('/fixture/status',scenario);if((await response.json()).sockets===0)return;await new Promise(r=>setTimeout(r,100));}throw Error('Fixture socket cleanup failed');}
try{
  const pkg=JSON.parse(await readFile(join(dir,'node_modules/wrangler/package.json'),'utf8'));assert.equal(pkg.version,'4.152.0');
  const{privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:3072});
  const token=await issuePreviewLicense({privateKey,ownerId,deviceId,licenseId:'fixture-license-'+randomUUID(),expiresAt:Date.now()+600000,reserveSeat:async()=>true});
  const config=join(scratch,'wrangler.json');
  await writeFile(config,JSON.stringify({name:'desktop-control-relay-test-only',main:join(dir,'relay-runtime.test.ts'),compatibility_date:'2026-10-26',compatibility_flags:['nodejs_compat'],workers_dev:false,routes:[],vars:{ENABLE_RELAY_FIXTURE:'loopback-only',RELAY_TEST_GUARD:guard,ENABLE_REMOTE_HEALTH:'1',PREVIEW_SINGLE_USER:'1',PREVIEW_OWNER_ID:ownerId,PREVIEW_DEVICE_ID:deviceId,PREVIEW_LICENSE_TOKEN:token,PREVIEW_LICENSE_ISSUER_KEY:publicKey.export({type:'spki',format:'pem'}),DEVICE_BOOTSTRAP_HMAC_KEY:requestSecret.toString('base64url'),DEVICE_TICKET_HMAC_KEY:ticketSecret.toString('base64url'),APPROVE_INITIAL_DEVICE_PAIRING:'1'},durable_objects:{bindings:[{name:'REMOTE_RELAY',class_name:'RelayRuntimeFixture'}]},migrations:[{tag:'fixture-v1',new_sqlite_classes:['RelayRuntimeFixture']}]}));
  const env={...process.env};for(const name of Object.keys(env))if(/^(CF_|CLOUDFLARE_|WRANGLER_|GITHUB_|OAUTH_)|TOKEN|SECRET|PASSWORD/i.test(name))delete env[name];env.CI='true';env.WRANGLER_SEND_METRICS='false';
  child=spawn(process.execPath,[resolve(dir,'node_modules/wrangler/bin/wrangler.js'),'dev','--local','--config',config,'--ip','127.0.0.1','--port',String(port),'--persist-to',join(scratch,'state'),'--log-level','error'],{cwd:scratch,env,windowsHide:true,detached:process.platform!=='win32',stdio:['ignore','pipe','pipe']});
  let diagnostics='';for(const s of[child.stdout,child.stderr])s.on('data',b=>{diagnostics=(diagnostics+b.toString()).slice(-2000);});child.once('error',()=>{});
  const start=Date.now();let available=false;while(Date.now()-start<45000){if(child.exitCode!==null)throw Error('Local fixture process exited');try{const r=await get('/ready');if(r.status===200){available=true;break;}}catch{}await new Promise(r=>setTimeout(r,200));}assert.ok(available,'Local fixture unavailable');
  for(const scenario of['pair','seat']){
    const licenseCheck=await(await get('/fixture/license-check',scenario)).json();assert.equal(licenseCheck.entitled,true,'Fixture license verification denied');
    const signed=await provider.createRequest();
    const tickets=await Promise.all([post('/ticket',signed,scenario),post('/ticket',signed,scenario)]);
    assert.deepEqual(tickets.map(r=>r.status).sort(),[200,403]);checks++;
    const ticket=(await tickets.find(r=>r.status===200).json()).ticket;assert.equal(typeof ticket,'string');checks++;
    let device=await openDevice(ticket,scenario);assert.equal(await device.ready,true);checks++;
    const health=await post('/health',{ownerId,deviceId},scenario);assert.equal(health.status,200);assert.deepEqual(await health.json(),{connected:true,scope:'remote-health-only',desktopAccess:false});checks++;
    const copied=await openDevice(ticket,scenario);assert.equal(await copied.ready,false);assert.equal(await copied.closed,1006);checks++;
    const unauthorized=await openDevice(undefined,scenario);assert.equal(await unauthorized.ready,false);assert.equal(await unauthorized.closed,1006);
    assert.equal((await(await get('/fixture/status',scenario)).json()).sockets,1);checks++;
    assert.equal((await post('/entitlement',{ownerId:'wrong-owner',deviceId},scenario)).status,403);checks++;
    device.ws.close(1000,'fixture EOF');
    assert.equal(await Promise.race([device.closed,new Promise(r=>setTimeout(()=>r('timeout'),5000))]),1000);await untilNoSockets(scenario);checks++;
    const reconnectTicket=await post('/ticket',await provider.createRequest(),scenario);assert.equal(reconnectTicket.status,200);
    device=await openDevice((await reconnectTicket.json()).ticket,scenario);assert.equal(await device.ready,true);checks++;
    assert.equal((await post('/health',{ownerId,deviceId},scenario)).status,200);checks++;
    const revoke=await get(scenario==='pair'?'/fixture/revoke-pair':'/fixture/revoke-seat',scenario);assert.equal(revoke.status,200);
    assert.notEqual((await post('/health',{ownerId,deviceId},scenario)).status,200);checks++;
    assert.equal((await post('/ticket',await provider.createRequest(),scenario)).status,403);checks++;
    const close=await Promise.race([device.closed,new Promise(r=>setTimeout(()=>r('timeout'),5000))]);assert.equal(close,1008);checks++;
    await untilNoSockets(scenario);checks++;
  }
  const bodies=await(await get('/fixture/body-boundaries','body')).json();
  assert.equal(bodies.large,403);assert.equal(bodies.slow,403);checks++;
  assert.equal(bodies.noContentLength,true);assert.equal(bodies.oversizedCanceled,true);assert.equal(bodies.slowCanceled,true);checks++;
  assert.ok(bodies.elapsedMs>=900&&bodies.elapsedMs<2000,'Body deadline not enforced');checks++;
  assert.equal(bodies.tickets,0);assert.equal(bodies.pairings,0);checks++;
  assert.equal((await(await get('/fixture/license-check','capacity')).json()).entitled,true);
  const capacityRequests=await Promise.all(Array.from({length:20},()=>provider.createRequest()));
  const capacityResults=await Promise.all(capacityRequests.map(r=>post('/ticket',r,'capacity')));
  assert.equal(capacityResults.filter(r=>r.status===200).length,8);assert.equal(capacityResults.filter(r=>r.status===403).length,12);checks++;
  const full=await(await get('/fixture/status','capacity')).json();assert.equal(full.tickets,8);assert.equal(full.reservations,0);assert.equal(full.nonces,8);checks++;
  const admitted=await openDevice((await capacityResults.find(r=>r.status===200).json()).ticket,'capacity');assert.equal(await admitted.ready,true);checks++;
  assert.equal((await post('/ticket',await provider.createRequest(),'capacity')).status,200);checks++;
  admitted.ws.close(1000,'fixture capacity EOF');assert.equal(await admitted.closed,1000);await untilNoSockets('capacity');checks++;
  console.log(JSON.stringify({result:'PASS',checks,runtime:'actual-workerd',transport:'actual-loopback-WebSocket',tls:'NOT_TESTED',license:'ephemeral-fixture-only',liveAccount:false}));
  console.log('RESULT=RELAY_ACTUAL_WORKERD_PASS');
}catch(error){console.error('RESULT=RELAY_ACTUAL_WORKERD_FAIL');console.error(String(error.message).replaceAll(guard,'[fixture-guard]').slice(0,1000));process.exitCode=1;}
finally{
  for(const ws of sockets)try{ws.close();}catch{}
  if(child?.pid&&child.exitCode===null){if(process.platform==='win32')spawnSync('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore',timeout:5000});else try{process.kill(-child.pid,'SIGTERM');}catch{}}
  await rm(scratch,{recursive:true,force:true});requestSecret.fill(0);ticketSecret.fill(0);
}
