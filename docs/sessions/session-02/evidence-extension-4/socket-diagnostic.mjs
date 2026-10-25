import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {readdir,readlink,readFile} from 'node:fs/promises';
import {createInterface} from 'node:readline';
const root='/workspace/desktop-control';
async function probe(name,args,input){
 const child=spawn(process.execPath,args,{cwd:root,stdio:['pipe','pipe','pipe']});
 const closed=once(child,'close'); let stderr=''; child.stderr.on('data',c=>stderr+=c);
 const lines=createInterface({input:child.stdout})[Symbol.asyncIterator]();
 try{
  child.stdin.write(input+'\n');
  const line=await Promise.race([lines.next(),new Promise((_,reject)=>setTimeout(()=>reject(Error('response timeout')),5000))]);
  const fds=await Promise.all((await readdir(`/proc/${child.pid}/fd`)).map(async fd=>({fd,target:await readlink(`/proc/${child.pid}/fd/${fd}`).catch(e=>String(e.code))})));
  const sockets=fds.filter(x=>x.target.startsWith('socket:['));
  const network={};
  for(const proto of ['tcp','tcp6','udp','udp6','unix']){
   const raw=await readFile(`/proc/${child.pid}/net/${proto}`,'utf8');
   network[proto]=raw.split('\n').filter(row=>sockets.some(s=>row.split(/\s+/).includes(s.target.slice(8,-1))));
  }
  console.log(JSON.stringify({name,pid:child.pid,response:line.value,fds,socketRows:network},null,2));
  assert.equal(sockets.every(s=>['0','1','2'].includes(s.fd)),true,'all observed sockets are inherited standard streams');
  assert.equal(['tcp','tcp6','udp','udp6'].every(p=>network[p].length===0),true,'no TCP/UDP owned sockets at snapshot');
  child.stdin.end(); const [code,signal]=await closed; assert.equal(code,0); console.log(JSON.stringify({name,exitCode:code,signal,stderr}));
 }finally{if(child.exitCode===null) child.kill();}
}
await probe('minimal-node-stdio-control',['-e','process.stdin.pipe(process.stdout)'],'stdio-control');
await probe('production-mcp',['dist/packages/mcp-server/src/index.mjs'],JSON.stringify({jsonrpc:'2.0',id:1,method:'server/discover',params:{_meta:{'io.modelcontextprotocol/protocolVersion':'2026-07-28','io.modelcontextprotocol/clientInfo':{name:'s02-socket-diagnostic',version:'1'},'io.modelcontextprotocol/clientCapabilities':{}}}}));
