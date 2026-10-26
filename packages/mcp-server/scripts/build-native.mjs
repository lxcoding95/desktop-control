import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
if (process.platform === 'win32') {
  const root = fileURLToPath(new URL('../../../', import.meta.url));
  const target = path.join(root, 'dist/native/windows-token.exe');
  mkdirSync(path.dirname(target), { recursive: true });
  const compiler = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'Microsoft.NET/Framework64/v4.0.30319/csc.exe');
  const source = path.join(root, 'packages/mcp-server/native/WindowsToken.cs');
  const digest = file => createHash('sha256').update(readFileSync(file)).digest('hex');
  const sourceHash = digest(source), compilerHash = digest(compiler);
  let current = false;
  try {
    const stamp = JSON.parse(readFileSync(target + '.build.json', 'utf8'));
    current = stamp.sourceHash === sourceHash && stamp.compilerHash === compilerHash && stamp.binaryHash === digest(target);
  } catch { /* Missing or modified artifacts must be rebuilt, never silently trusted. */ }
  if (!current) {
    execFileSync(compiler, ['/nologo', '/optimize+', '/target:exe', `/out:${target}`, source],
      { timeout: 30_000, windowsHide: true, stdio: 'pipe' });
  }
  // A freshly emitted Windows image can have expensive OS startup/inspection. Validate it
  // in build preparation rather than repeatedly rewriting it during test/build phases.
  // Runtime identity still re-queries the current token and retains its fail-closed limit.
  const probe = JSON.parse(execFileSync(target, [String(process.pid)], {
    encoding: 'utf8', timeout: 30_000, maxBuffer: 4096, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']
  }));
  if (probe.pid !== process.pid || typeof probe.sid !== 'string') throw Error('Native identity build probe failed');
  writeFileSync(target + '.build.json', JSON.stringify({ sourceHash, compilerHash, binaryHash: digest(target) }));
}
