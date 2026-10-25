/**
 * One-seat preview license ledger. The atomic storage transaction MUST
 * be backed by one Durable Object/SQLite shard or equivalent serializable DB.
 * No admin HTTP route, account creation, secret generation or MCP tool here.
 * The trusted approved owner comes from a separately verified server config.
 */
const id = x => typeof x === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(x);
const obj = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const seatKey = 'licenses:preview:seat-1';

export function createSingleSeatLedger({ storage, approvedOwnerId, now = Date.now } = {}) {
  if (!storage || typeof storage.transaction !== 'function' ||
      typeof storage.get !== 'function' || typeof now !== 'function' ||
      !id(approvedOwnerId)) {
    throw new TypeError('Trusted one-seat storage and verified owner required');
  }
  function matches(a,b) {
    return obj(a) && obj(b) &&
      a.ownerId===b.ownerId && a.deviceId===b.deviceId &&
      a.licenseId===b.licenseId && a.expiresAt===b.expiresAt;
  }
  function eligible(claim) {
    return obj(claim) && claim.v===1 && claim.scope==='remote.health' &&
      claim.ownerId===approvedOwnerId && id(claim.licenseId) &&
      id(claim.deviceId) &&
      Number.isSafeInteger(claim.expiresAt) && claim.expiresAt > now() &&
      Number.isSafeInteger(claim.issuedAt) && claim.issuedAt <= now()+5000;
  }
  return Object.freeze({
    async reserveSeat(claim) {
      if(!eligible(claim)) return false;
      return storage.transaction(async tx => {
        const old = await tx.get(seatKey);
        // Existing/expired seats remain in history until explicitly retired;
        // never reuse a revoked license ID without an authorized admin action.
        if(old) return false;
        await tx.put(seatKey, {
          ownerId: claim.ownerId, deviceId: claim.deviceId,
          licenseId: claim.licenseId, expiresAt: claim.expiresAt,
          status: 'active'
        });
        return true;
      });
    },
    async isActive(claim) {
      if(!eligible(claim)) return false;
      const entry = await storage.get(seatKey);
      return matches(entry,claim) && entry.status==='active';
    },
    async revoke({ licenseId, verifyAdmin } = {}) {
      if (!id(licenseId) || typeof verifyAdmin !== 'function') return false;
      // Admin verifier is a mandatory trusted identity/consent adapter.
      let allowed = false;
      try { allowed = await verifyAdmin(); } catch { return false; }
      if (allowed !== true) return false;
      return storage.transaction(async tx => {
        const entry = await tx.get(seatKey);
        if (!obj(entry) || entry.licenseId!==licenseId || entry.status!=='active')
          return false;
        await tx.put(seatKey, { ...entry, status:'revoked' });
        return true;
      });
    }
  });
}
