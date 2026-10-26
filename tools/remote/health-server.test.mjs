import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { handleMessage } from './health-server.mjs';

const request = (method, params = {}, id = 1) => ({jsonrpc:'2.0', id, method, params});
test('initialization accepts supported protocol and exposes only tools capability', () => {
  const r = handleMessage(request('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: {name:'test',version:'1'} }));
  assert.equal(r.result.protocolVersion, '2025-11-25');
  assert.deepEqual(r.result.capabilities, {tools:{}});
});
test('tool list contains exactly one harmless remote tool', () => {
  const {result} = handleMessage(request('tools/list'));
  assert.deepEqual(result.tools.map(x=>x.name), ['desktop_control.remote_health']);
  assert.equal(result.tools[0].annotations.readOnlyHint, true);
});
test('real health result is nonidentifying and explicitly lacks desktop access', () => {
  const {result} = handleMessage(request('tools/call',{name:'desktop_control.remote_health',arguments:{}}));
  assert.deepEqual(result.structuredContent,{connected:true,scope:'remote-health-only',desktopAccess:false});
});
test('denies all privileged desktop and file tools', () => {
  for(const name of ['desktop_control.desktop_click','desktop_control.terminal_run','desktop_control.files_read','desktop_control.control_status']) {
    assert.equal(handleMessage(request('tools/call',{name,arguments:{}})).error.code,-32602);
  }
});
test('rejects unexpected argument fields', () => {
  assert.equal(handleMessage(request('tools/call',{name:'desktop_control.remote_health',arguments:{grant:true}})).error.code,-32602);
});
test('does not respond to notifications', () => {
  assert.equal(handleMessage({jsonrpc:'2.0',method:'notifications/initialized'}),null);
});
test('rejects malformed MCP messages', () => {
  assert.equal(handleMessage(null).error.code,-32600);
  assert.equal(handleMessage(request('tools/call',{name:'desktop_control.remote_health',arguments:[] })).error.code,-32602);
});
test('real child process exchanges newline MCP messages over stdio', async () => {
  const child = spawn(process.execPath,[fileURLToPath(new URL('./health-server.mjs',import.meta.url))],{stdio:['pipe','pipe','pipe']});
  const responses=[];
  const reader=createInterface({input:child.stdout});
  const completion = new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{child.kill();reject(new Error('timeout'));},2500);
    reader.on('line',line=>{
      responses.push(JSON.parse(line));
      if(responses.length===3){clearTimeout(timer);child.stdin.end();resolve();}
    });
    child.on('error',reject);
    child.on('close',()=>{ if(responses.length<3) {clearTimeout(timer); reject(new Error('early exit'));} });
  });
  child.stdin.write(JSON.stringify(request('initialize',{protocolVersion:'2025-11-25'},1))+'\n');
  child.stdin.write(JSON.stringify(request('tools/list',{},2))+'\n');
  child.stdin.write(JSON.stringify(request('tools/call',{name:'desktop_control.remote_health',arguments:{}},3))+'\n');
  await completion;
  await new Promise((resolve,reject)=>{
    if(child.exitCode !== null) return resolve();
    child.once('close',code=>code===0?resolve():reject(new Error('exit '+code)));
  });
  assert.equal(responses[0].result.serverInfo.name,'desktop-control-remote-probe');
  assert.equal(responses[1].result.tools.length,1);
  assert.equal(responses[2].result.structuredContent.desktopAccess,false);
  assert.equal(child.exitCode,0);
});
