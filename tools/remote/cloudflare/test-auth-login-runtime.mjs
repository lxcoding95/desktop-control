// Local fixture only. Generated config/state live in a fresh OS temporary folder.
import {mkdtemp, readFile, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn,spawnSync} from 'node:child_process';
import {createServer} from 'node:net';
const dir=dirname(fileURLToPath(import.meta.url));
const port=await new Promise((ok,bad)=>{const s=createServer();s.once('error',bad);s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(e=>e?bad(e):ok(p));});});
const scratch=await mkdtemp(join(tmpdir(),'desktop-control-login-fixture-'));
let child;
try {
  const pkg=JSON.parse(await readFile(join(dir,'node_modules/wrangler/package.json'),'utf8'));
  if(pkg.version!=='4.152.0') throw Error('Pinned Wrangler4.152.0 required');
  const config=join(scratch,'wrangler.json');
  await writeFile(config,JSON.stringify({name:'desktop-control-auth-test-only',main:join(dir,'auth-login-runtime.test.ts'),compatibility_date:'2026-10-26',compatibility_flags:['nodejs_compat'],workers_dev:false,routes:[],vars:{LOGIN_TEST_FIXTURE:'loopback-only'},kv_namespaces:[{binding:'OAUTH_KV',id:'fixture-only-local-kv'}],durable_objects:{bindings:[{name:'AUTH_LOGIN_STATE',class_name:'AuthLoginState'}]},migrations:[{tag:'fixture-v1',new_sqlite_classes:['AuthLoginState']}]}));
  const env={...process.env}; for(const name of Object.keys(env)) if(/^(CF_|CLOUDFLARE_|WRANGLER_|GITHUB_|OAUTH_)|TOKEN|SECRET|PASSWORD/i.test(name)) delete env[name];
  env.CI='true';env.WRANGLER_SEND_METRICS='false';
  child=spawn(process.execPath,[resolve(dir,'node_modules/wrangler/bin/wrangler.js'),'dev','--local','--config',config,'--ip','127.0.0.1','--port',String(port),'--persist-to',join(scratch,'state'),'--log-level','error'],{cwd:scratch,env,windowsHide:true,detached:process.platform!=='win32',stdio:['ignore','pipe','pipe']});
  let diagnostics='';for(const s of [child.stdout,child.stderr])s.on('data',b=>{diagnostics=(diagnostics+b.toString()).slice(-5000);});
  child.once('error',()=>{});
  const start=Date.now();let response;
  while(Date.now()-start<45000){
    if(child.exitCode!==null)throw Error('Fixture runtime exited '+diagnostics);
    try{response=await fetch('http://127.0.0.1:'+port+'/',{signal:AbortSignal.timeout(15000)});break;}catch{await new Promise(r=>setTimeout(r,200));}
  }
  if(!response)throw Error('Fixture did not start '+diagnostics);
  const body=await response.text();
  console.log(body);
  if(response.status!==200 || JSON.parse(body).result!=='PASS')throw Error('Fixture assertions failed '+diagnostics);
  console.log('RESULT=AUTH_LOGIN_ACTUAL_WORKERD_PASS');
}catch(error){console.error(String(error.message).slice(0,5000));process.exitCode=1;}
finally{
  if(child?.pid && child.exitCode===null){
    if(process.platform==='win32')spawnSync('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore',timeout:5000});
    else {try{process.kill(-child.pid,'SIGTERM');}catch{}}
  }
  await rm(scratch,{recursive:true,force:true});
}
