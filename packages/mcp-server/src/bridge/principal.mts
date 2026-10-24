import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/** Accept only unelevated medium-integrity interactive account tokens. Never MCP input. */
export function windowsPrincipal(value: unknown, pid: number): string | null {
  if (value === null || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  return v.pid === pid && typeof v.sid === 'string' && /^S-1-5-21-\d+-\d+-\d+-\d+$/.test(v.sid) &&
    v.elevated === false && v.uiAccess === false && v.integrity === 0x2000 &&
    Number.isSafeInteger(v.session) && (v.session as number) > 0 ? `windows:${v.sid}` : null;
}

/** Host-derived process identity, not authentication of a distinct MCP client. */
/** Never confer a grant to a root/setuid process, even in explicit test injection. */
export function posixPrincipal(uid: number, effectiveUid: number): string | null {
  return Number.isSafeInteger(uid) && uid > 0 && Number.isSafeInteger(effectiveUid) &&
    uid === effectiveUid ? `posix:${uid}` : null;
}

export function localPrincipal(): string | null {
  try {
    if (process.platform === 'win32') {
      const root = new URL(import.meta.url.endsWith('.mts') ? '../../../../' : '../../../../../', import.meta.url);
      const helper = fileURLToPath(new URL('dist/native/windows-token.exe', root));
      const output = execFileSync(helper, [String(process.pid)], {
        encoding: 'utf8', timeout: 2_000, maxBuffer: 4096, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']
      });
      return windowsPrincipal(JSON.parse(output) as unknown, process.pid);
    }
    if (typeof process.getuid !== 'function' || typeof process.geteuid !== 'function') {
      return null;
    }
    return posixPrincipal(process.getuid(), process.geteuid());
  } catch { return null; }
}
