/** Host-derived principal. This is a prototype OS identity, not transport authentication. */
export function posixPrincipal(uid: number, effectiveUid: number): string | null {
  return Number.isSafeInteger(uid) && uid >= 0 && Number.isSafeInteger(effectiveUid) &&
    uid === effectiveUid ? `posix:${uid}` : null;
}

export function localPrincipal(): string | null {
  try {
    if (typeof process.getuid !== 'function' || typeof process.geteuid !== 'function') {
      // Windows SID mapping needs a platform integration/test. Fail closed.
      return null;
    }
    return posixPrincipal(process.getuid(), process.geteuid());
  } catch { return null; }
}
