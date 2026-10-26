import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createOutboundHealthClient, validateWssEndpoint } from './outbound-device-client.mjs';

const host = 'desktop-control-example.workers.dev';
const endpoint = 'wss://' + host + '/device';
const token = 't'.repeat(72);
class Socket {
  static sockets=[];
  handlers=new Map();
  messages=[];
  closed=false;
  constructor(url,protocols){ this.url=url;this.protocols=protocols;Socket.sockets.push(this); }
  addEventListener(name,fn){const a=this.handlers.get(name)||[];a.push(fn);this.handlers.set(name,a)}
  emit(name,data){for(const fn of (this.handlers.get(name)||[])) fn(data === undefined ? {} : {data:typeof data==='string'?data:JSON.stringify(data)});}
  send(data){if(this.closed) throw Error('socket closed'); this.messages.push(JSON.parse(data));}
  close(){this.closed=true;}
}
function client(overrides={}) {
  return createOutboundHealthClient({endpoint,expectedHost:host,deviceId:'pc-1',ticketProvider:async()=>token,
    WebSocketCtor:Socket,makeChallenge:()=> 'challenge-1',connectTimeoutMs:100, ...overrides});
}
function ready(s,overrides={}){s.emit('message',{type:'remote.device.ready',deviceId:'pc-1',challenge:'challenge-1',...overrides});}
const last=()=>Socket.sockets.at(-1);
async function expectCode(p,code){await assert.rejects(p,e=>e?.code===code);}

test('rejects insecure or redirected/mismatched endpoints',()=>{
  for(const [url,h] of [["ws://" + host + "/device",host],["wss://evil.workers.dev/device",host],
    ["wss://" + host + "/device?token=secret",host],["wss://" + host + "/device#x",host],
    ["wss://name:pw@" + host + "/device",host],["wss://" + host + ":8443/device",host],
    ["wss://" + host + "/mcp",host],[endpoint,'evil.workers.dev.example.org']]){
    assert.throws(()=>validateWssEndpoint(url,h));
  }
});
test('valid pinned WSS endpoint never includes a ticket',()=>{
  assert.equal(validateWssEndpoint(endpoint,host),endpoint);
  assert.ok(!endpoint.includes(token));
});
test('device admission sends ticket only in protocol header and keeps public selected protocol separate',async()=>{
  const c=client();const pending=c.connect();await new Promise(resolve=>setImmediate(resolve));
  const socket=last();assert.equal(socket.url,endpoint);
  assert.deepEqual(socket.protocols,['desktop-control-health',token]);
  socket.emit('open');ready(socket);await pending;c.stop();
});
test('fails closed when ticket was not locally approved',async()=>{
  const c=client({ticketProvider:async()=>{throw Error('private')}});
  await expectCode(c.connect(),'TICKET_UNAVAILABLE');
  assert.equal(c.getState(),'stopped');
});
test('never attempts socket for malformed ticket',async()=>{
  const n=Socket.sockets.length;
  const c=client({ticketProvider:async()=> 'secret&in-query'});
  await expectCode(c.connect(),'INVALID_TICKET');
  assert.equal(Socket.sockets.length,n);
});
test('authentication frame is sent only after WSS opens, never in URL',async()=>{
  const c=client();const p=c.connect();
  await new Promise(resolve=>setImmediate(resolve));const s=last();
  assert.equal(s.messages.length,0);
  assert.equal(s.url,endpoint);
  s.emit('open');
  assert.deepEqual(s.messages[0],{type:'remote.device.authenticate',ticket:token,deviceId:'pc-1',challenge:'challenge-1'});
  ready(s);await p;
  c.stop();
});
test('valid authenticated ready permits read-only health request',async()=>{
  const c=client();const p=c.connect();await new Promise(resolve=>setImmediate(resolve));const s=last();
  s.emit('open');ready(s);assert.deepEqual(await p,{connected:true,scope:'remote-health-only',desktopAccess:false});
  s.emit('message',{type:'remote.health.request',tool:'desktop_control.remote_health',id:'req-1',nonce:'nonce-1',args:{}});
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(s.messages.at(-1),{type:'remote.health.response',id:'req-1',nonce:'nonce-1',result:{connected:true,scope:'remote-health-only',desktopAccess:false}});
  c.stop();
});
test('wrong ready nonce or device id never authenticates',async()=>{
  for(const variant of [{challenge:'other'},{deviceId:'pc-2'},{extra:'x'}]){
    const c=client();const p=c.connect();await new Promise(resolve=>setImmediate(resolve));const s=last();s.emit('open');ready(s,variant);
    await expectCode(p,'UNAUTHORIZED');assert.equal(s.closed,true);
  }
});
test('never runs desktop or file commands',async()=>{
  const c=client();const p=c.connect();await new Promise(resolve=>setImmediate(resolve));const s=last();s.emit('open');ready(s);await p;
  const n=s.messages.length;
  s.emit('message',{type:'remote.health.request',tool:'desktop_control.terminal_run',id:'x-1',nonce:'nonce-1',args:{}});
  await new Promise(resolve=>setImmediate(resolve));assert.equal(s.messages.length,n);c.stop();
});
test('unknown message aborts channel and fails closed',async()=>{
  const c=client();const p=c.connect();await new Promise(resolve=>setImmediate(resolve));const s=last();s.emit('open');ready(s);await p;
  s.emit('message',{type:'desktop.execute',command:'whoami'});
  assert.equal(c.getState(),'stopped');assert.equal(s.closed,true);
});
test('duplicate health nonce never generates two replies',async()=>{
  const c=client();const p=c.connect();await new Promise(resolve=>setImmediate(resolve));const s=last();s.emit('open');ready(s);await p;
  const request={type:'remote.health.request',tool:'desktop_control.remote_health',id:'x-1',nonce:'once',args:{}};
  s.emit('message',request);s.emit('message',request);
  await new Promise(resolve=>setImmediate(resolve));assert.equal(s.messages.filter(x=>x.type==='remote.health.response').length,1);c.stop();
});
test('failed socket to server rejects on timeout',async()=>{
  const c=client({connectTimeoutMs:15});const p=c.connect();await expectCode(p,'TIMEOUT');assert.equal(c.getState(),'stopped');
});
test('websocket error rejects pending authentication without leaking token',async()=>{
  const c=client();const p=c.connect();await new Promise(resolve=>setImmediate(resolve));last().emit('error');await expectCode(p,'CONNECTION_FAILED');
});
test('operator stop closes socket and prevents late tool reply',async()=>{
  const c=client();const p=c.connect();await new Promise(resolve=>setImmediate(resolve));const s=last();s.emit('open');ready(s);await p;c.stop();
  s.emit('message',{type:'remote.health.request',tool:'desktop_control.remote_health',id:'x-1',nonce:'once',args:{}});
  assert.equal(c.getState(),'stopped');assert.equal(s.messages.filter(x=>x.type==='remote.health.response').length,0);
});
test('cannot start a second socket using the same one-time ticket',async()=>{
  const c=client();const p=c.connect();await new Promise(resolve=>setImmediate(resolve));const s=last();s.emit('open');ready(s);await p;
  await expectCode(c.connect(),'ALREADY_STARTED');c.stop();
});
test('stop during authentication rejects promptly and does not wait for timeout',async()=>{
  const c=client({connectTimeoutMs:1000});const p=c.connect();await new Promise(resolve=>setImmediate(resolve));const s=last();s.emit('open');
  c.stop();await expectCode(p,'STOPPED');assert.equal(s.closed,true);
});
