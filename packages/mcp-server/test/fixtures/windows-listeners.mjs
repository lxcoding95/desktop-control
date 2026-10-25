import { execFileSync } from 'node:child_process';

// Query failures must never masquerade as a successful zero-listener result.
export function listenerQuery(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) throw Error('Invalid process ID');
  return `$ErrorActionPreference='Stop'; try { $tcp=@(Get-NetTCPConnection -State Listen -ErrorAction Stop | Where-Object OwningProcess -eq ${pid}); $udp=@(Get-NetUDPEndpoint -ErrorAction Stop | Where-Object OwningProcess -eq ${pid}); Write-Output ($tcp.Count+$udp.Count) } catch { [Console]::Error.WriteLine('LISTENER_QUERY_FAILED'); exit 2 }`;
}

export function windowsListenerCount(pid) {
  const result = execFileSync('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', listenerQuery(pid)],
    { windowsHide: true, encoding: 'utf8', timeout: 30000, maxBuffer: 4096, stdio: ['ignore', 'pipe', 'pipe'] });
  if (!/^\d+\s*$/.test(result)) throw Error('Invalid listener query result');
  return Number(result.trim());
}
