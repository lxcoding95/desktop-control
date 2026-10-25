// Local host-side Bridge update engine. Not exposed as an MCP tool or activated by import.
import { createHash, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { Buffer } from 'node:buffer';
import { TextDecoder } from 'node:util';
import { verifyPolicy, verifyArtifact, decideAccess, compareVersions } from '../update-policy/index.mjs';
const MAX_ARTIFACT=2*1024*1024, MAX_FILES=64, MAX_TOTAL=1024*1024;
const CONTRACT='desktop-control-bridge-v1';
function fail(code) {throw Error(code);}
function exact(value,keys) {
  if(value === null || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== keys.length || keys.some(k=>!Object.hasOwn(value,k))) fail('INVALID_BRIDGE_ARTIFACT');
}
function sha(bytes) {return createHash('sha256').update(bytes).digest('hex');}
function bundle(bytes,ticket) {
  if(!Buffer.isBuffer(bytes) || bytes.length>MAX_ARTIFACT || !verifyArtifact(bytes,ticket)) fail('BRIDGE_INTEGRITY_FAILED');
  let value;
  try {value=JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(bytes));} catch {fail('INVALID_BRIDGE_ARTIFACT');}
  exact(value,['schema','version','contract','entry','files']);
  if(value.schema!==1 || value.version!==ticket.policy.targetBridge || value.contract!==ticket.policy.contract || value.contract!==CONTRACT || value.entry!=='entry.mjs' || !Array.isArray(value.files) || value.files.length===0 || value.files.length>MAX_FILES) fail('INVALID_BRIDGE_ARTIFACT');
  const seen=new Set(); let total=0;
  const files=value.files.map(file=>{
    exact(file,['path','content']);
    if(typeof file.path!=='string' || file.path.length>220 || file.path.split('/').length>12 || !/^[A-Za-z0-9@][A-Za-z0-9._@-]*(?:\/[A-Za-z0-9@][A-Za-z0-9._@-]*)*$/.test(file.path) || file.path.split('/').some(p=>p==='.' || p==='..' || p.endsWith('.') || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p))) fail('INVALID_BRIDGE_PATH');
    const canonical=file.path.toLowerCase();
    if(seen.has(canonical) || [...seen].some(p=>p.startsWith(canonical+'/') || canonical.startsWith(p+'/'))) fail('INVALID_BRIDGE_PATH');
    seen.add(canonical);
    if(typeof file.content!=='string' || file.content.length>MAX_ARTIFACT || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(file.content)) fail('INVALID_BRIDGE_ARTIFACT');
    const data=Buffer.from(file.content,'base64');
    if(data.toString('base64')!==file.content || (total+=data.length)>MAX_TOTAL) fail('INVALID_BRIDGE_ARTIFACT');
    return {path:file.path,bytes:data};
  });
  if(!seen.has('entry.mjs') || files.find(f=>f.path.toLowerCase()==='entry.mjs').path!=='entry.mjs') fail('INVALID_BRIDGE_ARTIFACT');
  return {...value,files};
}
function empty() {return {schema:1,checkpoint:null,latest:null,active:null,previous:null,journal:null,lastResult:'UNINITIALIZED'};}
function state(store) {
  const value=store.json('state.json',true)??empty();
  exact(value,['schema','checkpoint','latest','active','previous','journal','lastResult']);
  if(value.schema!==1 || !['UNINITIALIZED','ACTIVE','ROLLBACK','REPAIR_ONLY','UPDATING'].includes(value.lastResult)) fail('INVALID_BRIDGE_STATE');
  for(const descriptor of [value.active,value.previous,value.journal?.target].filter(Boolean)) {
    exact(descriptor,['version','digest','directory','envelope']);
    if(!/^[a-f0-9]{64}$/.test(descriptor.digest) || descriptor.directory!=='versions/'+descriptor.digest) fail('INVALID_BRIDGE_STATE');
    compareVersions(descriptor.version,descriptor.version);
  }
  return value;
}
function keys(store) {
  const root=store.json('trust.json'); exact(root,['schema','keys']);
  if(root.schema!==1 || root.keys === null || typeof root.keys!=='object' || Array.isArray(root.keys) || Object.keys(root.keys).length<1 || Object.keys(root.keys).length>4) fail('INVALID_BRIDGE_TRUST');
  return root.keys;
}
function verifyDescriptor(store,descriptor,trust,clock) {
  const ticket=verifyPolicy(descriptor.envelope,trust,{clock});
  const bytes=store.read(descriptor.directory+'/artifact.json');
  if(sha(bytes)!==descriptor.digest || ticket.policy.targetBridge!==descriptor.version) fail('BRIDGE_INTEGRITY_FAILED');
  const parsed=bundle(bytes,ticket);
  for(const file of parsed.files) if(!store.read(descriptor.directory+'/runtime/'+file.path).equals(file.bytes)) fail('BRIDGE_INTEGRITY_FAILED');
  return parsed;
}
async function health(store,descriptor,trust,clock,guard) {
  const value=verifyDescriptor(store,descriptor,trust,clock); guard();
  const nonce=randomBytes(24).toString('hex');
  const directory=store.file(descriptor.directory+'/runtime');
  // Health probes cannot spawn children or write files through Node's permission API.
  // This is a compatibility probe, not a sandbox for malicious signed native code.
  const child=spawn(process.execPath,['--permission','--allow-fs-read='+directory,path.join(directory,'entry.mjs'),'--desktop-control-health',nonce],{
    cwd:directory,windowsHide:true,env:process.platform==='win32'?{SystemRoot:process.env.SystemRoot??'C:\\Windows'}:{},stdio:['ignore','pipe','pipe']
  });
  const result=await new Promise(resolve=>{
    let output='',error='',done=false;
    const finish=code=>{if(done)return;done=true;clearTimeout(timer);resolve({code,output,error});};
    let timedOut=false;
    const timer=setTimeout(()=>{timedOut=true;child.kill('SIGKILL');},4000);
    child.on('error',()=>finish(null));
    child.stdout.on('data',bytes=>{output+=bytes.toString();if(Buffer.byteLength(output)>4096){child.kill();finish(null);}});
    child.stderr.on('data',bytes=>{error+=bytes.toString();if(Buffer.byteLength(error)>8192){child.kill();finish(null);}});
    child.on('close',code=>finish(timedOut?null:code));
  });
  guard();
  if(result.code!==0) fail('BRIDGE_HEALTH_FAILED');
  let response;
  try {response=JSON.parse(result.output.trim());} catch {fail('BRIDGE_HEALTH_FAILED');}
  exact(response,['schema','version','contract','nonce']);
  if(response.schema!==1 || response.version!==value.version || response.contract!==CONTRACT || response.nonce!==nonce) fail('BRIDGE_HEALTH_FAILED');
  verifyDescriptor(store,descriptor,trust,clock); guard();
}
/** Trust enrollment is host-only. Existing roots are never replaced or repaired. */
export function enrollTrust(store,publicKeys) {
  if(store.read('trust.json',true)!==null || store.read('state.json',true)!==null) fail('BRIDGE_ALREADY_ENROLLED');
  if(publicKeys===null || typeof publicKeys!=='object' || Array.isArray(publicKeys) || Object.keys(publicKeys).length!==1) fail('INVALID_BRIDGE_TRUST');
  const [id,pem]=Object.entries(publicKeys)[0];
  if(!/^[A-Za-z0-9_-]{1,64}$/.test(id) || typeof pem!=='string' || !pem.startsWith('-----BEGIN PUBLIC KEY-----') || pem.length>2048) fail('INVALID_BRIDGE_TRUST');
  store.writeJSON('trust.json',{schema:1,keys:publicKeys},{exclusive:true});
}
export class BridgeUpdater {
  constructor(store,{pluginVersion='0.0.1-preview.4',clock=Date.now}={}) {this.store=store;this.pluginVersion=pluginVersion;this.clock=clock;this.closed=false;}
  versions(version) {return {bridgeVersion:version,pluginVersion:this.pluginVersion,platform:process.platform+'-'+process.arch,contract:CONTRACT};}
  async recover(guard=()=>{}) {
    const store=this.store, current=state(store), trust=keys(store);
    if(!current.journal) return current;
    // A crash before commit never turns an unconfirmed target into the active version.
    current.journal=null;
    if(current.active && current.latest) {
      try {
        const latest=verifyPolicy(current.latest,trust,{previous:current.checkpoint,clock:this.clock});
        const decision=decideAccess(latest,this.versions(current.active.version));
        if(decision.state==='REPAIR_ONLY') fail('BRIDGE_REPAIR_ONLY');
        await health(store,current.active,trust,this.clock,guard); current.lastResult='ROLLBACK';
      } catch {current.lastResult='REPAIR_ONLY';}
    } else current.lastResult='REPAIR_ONLY';
    guard(); store.writeJSON('state.json',current); return current;
  }
  async applyPending() {
    return this.store.lock(async guard=>{
      const store=this.store;
      let current=await this.recover(guard); const trust=keys(store);
      const pending=store.json('inbox/policy.json',true);
      if(pending===null) {
        try {
          if(!current.active || current.lastResult==='REPAIR_ONLY') fail('BRIDGE_REPAIR_ONLY');
          const latest=verifyPolicy(current.latest,trust,{previous:current.checkpoint,clock:this.clock});
          if(decideAccess(latest,this.versions(current.active.version)).state==='REPAIR_ONLY') fail('BRIDGE_REPAIR_ONLY');
          verifyDescriptor(store,current.active,trust,this.clock);guard();
          return {state:current.lastResult,version:current.active.version};
        } catch {return {state:'REPAIR_ONLY',version:current.active?.version??null};}
      }
      const ticket=verifyPolicy(pending,trust,{previous:current.checkpoint,clock:this.clock});
      const policy=ticket.policy;
      if(policy.platform!==process.platform+'-'+process.arch || policy.contract!==CONTRACT || !policy.compatiblePlugins.includes(this.pluginVersion)) fail('BRIDGE_INCOMPATIBLE_UPDATE');
      if(current.active && compareVersions(policy.targetBridge,current.active.version)<0) fail('BRIDGE_DOWNGRADE_DENIED');
      if(current.checkpoint?.digest!==ticket.checkpoint.digest) {
        // A valid mandatory policy is authoritative even if delivery of its artifact fails.
        // Do not leave an old READY snapshot behind while waiting for signed target bytes.
        current={...current,checkpoint:ticket.checkpoint,latest:pending,lastResult:'UPDATING'};
        guard();store.writeJSON('state.json',current);
      }
      const bytes=store.read('inbox/'+policy.artifact.name);
      const parsed=bundle(bytes,ticket), digest=sha(bytes);
      if(current.checkpoint?.digest===ticket.checkpoint.digest && ['ROLLBACK','REPAIR_ONLY'].includes(current.lastResult)) {
        return {state:current.lastResult,version:current.active?.version??null,error:'BRIDGE_UPDATE_FAILED'};
      }
      if(current.active?.digest===digest && current.checkpoint?.digest===ticket.checkpoint.digest && !current.journal) {
        const decision=decideAccess(ticket,this.versions(current.active.version));
        if(decision.state==='REPAIR_ONLY') fail('BRIDGE_REPAIR_ONLY');
        verifyDescriptor(store,current.active,trust,this.clock);guard();
        return {state:'ACTIVE',version:current.active.version};
      }
      const target={version:parsed.version,digest,directory:'versions/'+digest,envelope:pending};
      // Persist anti-replay metadata before any target code is executed.
      current={...current,checkpoint:ticket.checkpoint,latest:pending,journal:{phase:'STAGING',target},lastResult:'UPDATING'};
      guard(); store.writeJSON('state.json',current);
      try {
        if(store.read(target.directory+'/artifact.json',true)===null) {
          const parents=new Set();
          for(const file of parsed.files) {const segments=file.path.split('/');for(let i=1;i<segments.length;i++)parents.add(segments.slice(0,i).join('/'));}
          store.requireCapacity(parsed.files.length+parents.size+5);
          store.mkdir(target.directory+'/runtime');
          for(const file of parsed.files) {
            const parent=path.posix.dirname(file.path);
            if(parent!=='.') store.mkdir(target.directory+'/runtime/'+parent);
            guard(); store.write(target.directory+'/runtime/'+file.path,file.bytes,{exclusive:true});
          }
          store.write(target.directory+'/artifact.json',bytes,{exclusive:true});
        }
        current.journal.phase='HEALTH';guard();store.writeJSON('state.json',current);
        await health(store,target,trust,this.clock,guard);
        // One durable pointer update is the commit point; the previous runtime remains retained.
        current={...current,previous:current.active,active:target,journal:null,lastResult:'ACTIVE'};
        guard();store.writeJSON('state.json',current);
        return {state:'ACTIVE',version:target.version};
      } catch {
        current=await this.recover(guard);
        return {state:current.lastResult,version:current.active?.version??null,error:'BRIDGE_UPDATE_FAILED'};
      }
    });
  }
  async status() {
    return this.store.lock(async guard=>{
      const current=await this.recover(guard),trust=keys(this.store);
      if(!current.active || current.lastResult==='REPAIR_ONLY') return {state:'REPAIR_ONLY',version:current.active?.version??null};
      try {
        const ticket=verifyPolicy(current.latest,trust,{previous:current.checkpoint,clock:this.clock});
        const decision=decideAccess(ticket,this.versions(current.active.version));
        if(decision.state==='REPAIR_ONLY') return {state:'REPAIR_ONLY',version:current.active.version};
        verifyDescriptor(this.store,current.active,trust,this.clock);guard();
        return {state:'ACTIVE',version:current.active.version};
      } catch {return {state:'REPAIR_ONLY',version:current.active.version};}
    });
  }
  /** Startup hand-off only; the supervisor must stop a running runtime on a mandatory gate. */
  async resolveActive() {
    return this.store.lock(async guard=>{
      const current=await this.recover(guard),trust=keys(this.store);
      if(!current.active || current.lastResult==='REPAIR_ONLY') fail('BRIDGE_REPAIR_ONLY');
      const ticket=verifyPolicy(current.latest,trust,{previous:current.checkpoint,clock:this.clock});
      if(decideAccess(ticket,this.versions(current.active.version)).state==='REPAIR_ONLY') fail('BRIDGE_REPAIR_ONLY');
      verifyDescriptor(this.store,current.active,trust,this.clock);guard();
      const cwd=this.store.file(current.active.directory+'/runtime');
      return {version:current.active.version,entry:path.join(cwd,'entry.mjs'),cwd};
    });
  }
  /** Autonomous inbox polling; callers must retain and await the returned stop function. */
  watch({intervalMs=5000,onResult=()=>{}}={}) {
    if(!Number.isSafeInteger(intervalMs) || intervalMs<100 || intervalMs>60000 || this.watching) fail('INVALID_BRIDGE_WATCH');
    this.watching=true;let stop=false,timer,resolveSleep,lastResult;
    const loop=(async()=>{while(!stop){let result;try{result=await this.applyPending();}catch{result={state:'REPAIR_ONLY',error:'BRIDGE_UPDATE_REJECTED'};} const serialized=JSON.stringify(result);if(!stop && serialized!==lastResult) {lastResult=serialized;try{onResult(result);}catch{/* callback cannot alter activation */}} if(!stop)await new Promise(resolve=>{resolveSleep=resolve;timer=setTimeout(resolve,intervalMs);});}})();
    return async()=>{stop=true;clearTimeout(timer);resolveSleep?.();await loop;this.watching=false;};
  }
}
