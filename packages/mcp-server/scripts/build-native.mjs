import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
if (process.platform === 'win32') {
  const root = fileURLToPath(new URL('../../../', import.meta.url));
  const target = path.join(root, 'dist/native/windows-token.exe');
  mkdirSync(path.dirname(target), { recursive: true });
  const compiler = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'Microsoft.NET/Framework64/v4.0.30319/csc.exe');
  execFileSync(compiler, ['/nologo', '/optimize+', '/target:exe', `/out:${target}`,
    path.join(root, 'packages/mcp-server/native/WindowsToken.cs')], { timeout: 30_000, windowsHide: true, stdio: 'pipe' });
}
