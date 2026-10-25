import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const directory = path.dirname(fileURLToPath(import.meta.url));
if (process.platform === 'win32') {
  const compiler = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'Microsoft.NET/Framework64/v4.0.30319/csc.exe');
  const source = path.join(directory, 'native/BridgeStore.cs');
  const target = path.join(directory, '.build/bridge-store.exe');
  const digest = file => createHash('sha256').update(readFileSync(file)).digest('hex');
  mkdirSync(path.dirname(target), { recursive: true });
  const sourceHash = digest(source), compilerHash = digest(compiler);
  let valid = false;
  try { const stamp = JSON.parse(readFileSync(target + '.json')); valid = stamp.sourceHash === sourceHash && stamp.compilerHash === compilerHash && stamp.binaryHash === digest(target); } catch { /* rebuild */ }
  if (!valid) execFileSync(compiler, ['/nologo', '/optimize+', '/target:exe', `/out:${target}`, source], { windowsHide: true, timeout: 30000, stdio: 'pipe' });
  writeFileSync(target + '.json', JSON.stringify({ sourceHash, compilerHash, binaryHash: digest(target) }));
}
