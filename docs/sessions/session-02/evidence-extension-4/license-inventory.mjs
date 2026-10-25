import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const [root,out]=process.argv.slice(2);fs.mkdirSync(out,{recursive:true});
const lock=JSON.parse(fs.readFileSync(path.join(root,'package-lock.json'),'utf8'));
const entries=[];let notices='';
for(const [key,record] of Object.entries(lock.packages)){
 if(!key.includes('node_modules/')||record.link) continue;
 const dir=path.join(root,key);const manifest=path.join(dir,'package.json');
 if(!fs.existsSync(manifest)){entries.push({path:key,version:record.version,installed:false,optional:!!record.optional,dev:!!record.dev});continue;}
 const pkg=JSON.parse(fs.readFileSync(manifest,'utf8'));const files=[];
 function walk(d,rel='',depth=0){if(depth>5)return;for(const name of fs.readdirSync(d)){
  if(name==='node_modules'||name==='.git')continue;const absolute=path.join(d,name),relative=path.posix.join(rel,name);const stat=fs.lstatSync(absolute);
  if(stat.isDirectory())walk(absolute,relative,depth+1);
  else if(stat.isFile()&&/^(licen[cs]e|notice|copying|copyright|third[-_ ]party[-_ ]notices?)([.\-_ ]|$)/i.test(name)){
   const bytes=fs.readFileSync(absolute);const text=bytes.toString('utf8');
   files.push({path:relative,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,copyrightLines:text.split(/\r?\n/).filter(x=>/copyright|licensed under/i.test(x)).slice(0,12)});
   notices+=`\n\n===== ${pkg.name}@${pkg.version}: ${relative} =====\n${text}`;
  }
 }}walk(dir);
 entries.push({path:key,name:pkg.name,version:pkg.version,lockedVersion:record.version,installed:true,dev:!!record.dev,optional:!!record.optional,license:pkg.license??record.license??null,resolved:record.resolved,integrity:record.integrity,repository:pkg.repository,files});
}
const installed=entries.filter(x=>x.installed);const summary={platform:process.platform,node:process.version,lockSha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'package-lock.json'))).digest('hex'),externalLockEntries:entries.length,installed:installed.length,notInstalled:entries.filter(x=>!x.installed).length,licenseFiles:installed.reduce((s,x)=>s+x.files.length,0),missingLicenseFiles:installed.filter(x=>!x.files.length).map(x=>({name:x.name,version:x.version,path:x.path,dev:x.dev})),runtime:installed.filter(x=>!x.dev).map(x=>({name:x.name,version:x.version,license:x.license,files:x.files.map(f=>f.path)})),redistributionSignoff:false};
fs.writeFileSync(path.join(out,'license-inventory.json'),JSON.stringify({summary,entries},null,2));fs.writeFileSync(path.join(out,'installed-license-notice-texts.txt'),notices);fs.writeFileSync(path.join(out,'license-summary.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify(summary,null,2));
