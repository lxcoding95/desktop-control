import { constants, closeSync, fstatSync, fsyncSync, lstatSync, mkdirSync, mkdtempSync, openSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { userInfo } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { Buffer } from 'node:buffer';
const helper = fileURLToPath(new URL('.build/bridge-store.exe', import.meta.url));
const MAX_FILE = 24 * 1024 * 1024;
const fail = () => { throw Error('BRIDGE_STORE_DENIED'); };
function identity() {
  if (process.platform !== 'win32' && (process.getuid?.() <= 0 || process.getuid?.() !== process.geteuid?.())) fail();
  if (!['win32','linux'].includes(process.platform)) fail();
}
function posix(pathname, directory) {
  const stat = lstatSync(pathname);
  if (stat.isSymbolicLink() || stat.uid !== process.geteuid() || (stat.mode & 0o077) !== 0 || (directory ? !stat.isDirectory() : !stat.isFile() || stat.nlink !== 1)) fail();
  return stat;
}
function parents(root) {
  for (let parent = path.dirname(root); ; parent = path.dirname(parent)) {
    const s = lstatSync(parent);
    if (!s.isDirectory() || s.isSymbolicLink() || (s.uid !== 0 && s.uid !== process.geteuid()) || (s.mode & 0o022) !== 0) fail();
    if (path.dirname(parent) === parent) return;
  }
}
function relative(name) {
  if (typeof name !== 'string' || name.length > 240 || !/^[a-zA-Z0-9@][a-zA-Z0-9._@-]*(?:\/[a-zA-Z0-9@][a-zA-Z0-9._@-]*)*$/.test(name) || name.split('/').some(p => p === '.' || p === '..' || p.endsWith('.') || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p))) fail();
  return name;
}
class Store {
  constructor(root, test) { this.root=root; this.test=test; this.locked=false; }
  native(mode) { execFileSync(helper,[mode,this.root],{timeout:10000,maxBuffer:1024,windowsHide:true,stdio:['ignore','pipe','pipe']}); }
  prepare() {
    identity();
    if (process.platform === 'win32') this.native('prepare');
    else {
      const parent=path.dirname(this.root);
      if(!this.test) {
        parents(parent);
        try { mkdirSync(parent,{mode:0o700}); } catch(e) { if(e.code !== 'EEXIST') throw e; }
        posix(parent,true);
      }
      parents(this.root);
      try { mkdirSync(this.root,{mode:0o700}); } catch(e) { if(e.code !== 'EEXIST') throw e; }
      this.check();
    }
    for(const name of ['versions','inbox']) this.mkdir(name);
    return this;
  }
  check() {
    identity();
    if(process.platform === 'win32') this.native('check');
    else {
      parents(this.root); posix(this.root,true);
      let count=0;
      const walk=directory => { for(const item of readdir(directory)) { if(++count > 20000) fail(); const full=path.join(directory,item); const s=lstatSync(full); posix(full,s.isDirectory()); if(s.isDirectory()) walk(full); } };
      walk(this.root);
    }
  }
  file(name) { relative(name); this.check(); return path.join(this.root,...name.split('/')); }
  mkdir(name) {
    const full=this.file(name); let cursor=this.root;
    for(const component of name.split('/')) { cursor=path.join(cursor,component); try { mkdirSync(cursor,{mode:0o700}); } catch(e) { if(e.code !== 'EEXIST') throw e; } }
    this.check(); return full;
  }
  read(name, optional=false) {
    const full=this.file(name); let fd;
    try { fd=openSync(full,constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0)); }
    catch(e) { if(optional && e.code === 'ENOENT') return null; throw e; }
    try {
      const stat=fstatSync(fd);
      if(!stat.isFile() || stat.nlink !== 1 || stat.size > MAX_FILE) fail();
      return readFileSync(fd);
    } finally { closeSync(fd); }
  }
  json(name,optional=false) { const bytes=this.read(name,optional); return bytes === null ? null : JSON.parse(bytes.toString('utf8')); }
  write(name,bytes,{exclusive=false}={}) {
    if(typeof bytes === 'string') bytes=Buffer.from(bytes);
    if(!Buffer.isBuffer(bytes) || bytes.length > MAX_FILE) fail();
    const full=this.file(name), temporary=path.join(path.dirname(full),'.write-'+randomUUID());
    const target=exclusive ? full : temporary;
    const fd=openSync(target,constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,0o600);
    try { writeFileSync(fd,bytes); fsyncSync(fd); } finally { closeSync(fd); }
    if(!exclusive) renameSync(temporary,full);
    this.check();
    if(process.platform !== 'win32') { const parent=openSync(path.dirname(full),constants.O_RDONLY); try { fsyncSync(parent); } finally {closeSync(parent);} }
  }
  writeJSON(name,value,options) { this.write(name,JSON.stringify(value)+'\n',options); }
  requireCapacity(additional) {
    if(!Number.isSafeInteger(additional) || additional<0 || additional>1000) fail();
    this.check();let count=0;
    const walk=directory=>{for(const name of readdir(directory)){if(++count+additional>18000)throw Error('BRIDGE_STORAGE_FULL');const full=path.join(directory,name);if(lstatSync(full).isDirectory())walk(full);}};
    walk(this.root);
  }
  async lock(action) {
    this.check(); if(this.locked) throw Error('BRIDGE_UPDATE_BUSY');
    // Kernel-held lifetime lock: the helper releases it when the owner pipe closes.
    let child;
    if(process.platform === 'win32') child=spawn(helper,['lock',this.root],{windowsHide:true,stdio:['pipe','pipe','pipe']});
    else {
      const full=this.file('lock');
      try { const fd=openSync(full,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL,0o600); closeSync(fd); } catch(e) {if(e.code !== 'EEXIST') throw e;}
      posix(full,false);
      child=spawn('/usr/bin/flock',['--exclusive','--nonblock',full,'/bin/sh','-c','printf "LOCKED\\n"; cat >/dev/null'],{stdio:['pipe','pipe','pipe']});
    }
    let alive=true;
    child.once('exit',()=>{alive=false;});
    await new Promise((resolve,reject)=> {
      const timer=setTimeout(()=>{child.kill();reject(Error('BRIDGE_UPDATE_BUSY'));},5000);
      let output='';
      child.once('error',()=>{clearTimeout(timer);reject(Error('BRIDGE_UPDATE_BUSY'));});
      child.once('exit',()=>{clearTimeout(timer);reject(Error('BRIDGE_UPDATE_BUSY'));});
      child.stdout.on('data',bytes=>{output+=bytes.toString(); if(output === 'LOCKED\n' || output === 'LOCKED\r\n') {clearTimeout(timer);resolve();} else if(output.length > 32) {clearTimeout(timer);child.kill();reject(Error('BRIDGE_UPDATE_BUSY'));}});
    });
    this.locked=true;
    const guard=()=>{if(!alive || child.exitCode !== null || child.killed) throw Error('BRIDGE_UPDATE_LOCK_LOST');};
    try { guard(); const result=await action(guard); guard(); return result; }
    finally { this.locked=false; child.stdin.end(); await new Promise(resolve=>{ if(child.exitCode !== null) return resolve(); const timer=setTimeout(()=>{child.kill();resolve();},2000); child.once('exit',()=>{clearTimeout(timer);resolve();}); }); }
  }
}
// Fixed production path; never supplied through MCP, environment variables or a tool argument.
export function openStore() { return new Store(path.join(userInfo().homedir,'.desktop-control-private','bridge'),false).prepare(); }
export function createTestStore() {
  identity();
  const root=mkdtempSync(path.join(userInfo().homedir,'DesktopControl-bridge-test-'));
  const store=new Store(root,true).prepare();
  return {store, cleanup() { if(!store.test || path.dirname(root)!==userInfo().homedir || !/^DesktopControl-bridge-test-[A-Za-z0-9]+$/.test(path.basename(root))) fail(); store.check(); rmSync(root,{recursive:true}); }};
}
/** Restricted fixture reattachment, never an arbitrary production root override. */
export function reopenTestStore(root) {
  identity();
  if(typeof root!=='string' || path.resolve(root)!==root || path.dirname(root)!==userInfo().homedir || !/^DesktopControl-bridge-test-[A-Za-z0-9]+$/.test(path.basename(root))) fail();
  return new Store(root,true).prepare();
}
// Expose no arbitrary production-store constructor.
import { readdirSync as readdir } from 'node:fs';
