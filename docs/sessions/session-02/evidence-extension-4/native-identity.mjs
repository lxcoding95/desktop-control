import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
const root=process.argv[2];
const {localPrincipal}=await import(pathToFileURL(path.join(root,'dist/packages/mcp-server/src/bridge/principal.mjs')));
const {createStatusExecutor}=await import(pathToFileURL(path.join(root,'dist/packages/mcp-server/src/bridge/status.mjs')));
const uid=process.getuid?.(),euid=process.geteuid?.(),principal=localPrincipal();
const expected=process.platform==='linux'&&uid>0&&uid===euid?`posix:${uid}`:null;
assert.equal(principal,expected);
let calls=0;
const grants={getGrants:()=>[{principal:principal??'posix:0',capability:'diagnostics.read',resource:'local:desktop-control',expiresAt:Date.now()+60000,revoked:false}]};
const exec=createStatusExecutor({grants,adapter:{readStatus:()=>{calls++;return {service:'desktop-control',ready:true,api_version:1}}}});
const result=await exec({principal});
if(principal===null){assert.equal(result.isError,true);assert.equal(result.content[0].text,'PERMISSION_DENIED');assert.equal(calls,0);}
else{assert.equal(result.isError,undefined);assert.equal(calls,1);}
console.log(JSON.stringify({platform:process.platform,node:process.version,uid,euid,principalKind:principal===null?'null-fail-closed':'native-posix',adapterCalls:calls,resultCode:result.isError?result.content[0].text:'SUCCESS',windowsSIDImplemented:false},null,2));
