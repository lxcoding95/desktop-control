/**
 * Durable Objects adapter for HMAC-signed, one-use device tickets.
 *
 * Storage contains authoritative pairing records written ONLY by a trusted,
 * separately authenticated human approval flow (not implemented here).
 * This module cannot approve a device or create new user identities.
 *
 * Cloudflare DurableObjectStorage.transaction() provides the required atomicity.
 * Do not replace transaction() with independent get/delete operations.
 */
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const validId = value => typeof value === 'string' &&
  /^[a-zA-Z0-9._:-]{1,128}$/.test(value);
const validTimestamp = value => Number.isSafeInteger(value) && value > 0;

function approvedPairing(row, ownerId, deviceId, now) {
  return isRecord(row) && row.status === 'approved' &&
    row.ownerId === ownerId && row.deviceId === deviceId &&
    validId(row.revision) && validTimestamp(row.expiresAt) &&
    row.expiresAt > now;
}

const pairingKey = (ownerId, deviceId) => 'pairing:' + ownerId + ':' + deviceId;
const ticketKey = jti => 'ticket:' + jti;

export function createDurableTicketStore({ storage, now = Date.now } = {}) {
  if (!storage || typeof storage.get !== 'function' ||
      typeof storage.transaction !== 'function' || typeof now !== 'function') {
    throw new TypeError('Trusted transactional Durable Object storage required');
  }
  return Object.freeze({
    async verifyEnrollment(enrollmentRef) {
      if (!isRecord(enrollmentRef) || !validId(enrollmentRef.ownerId) ||
          !validId(enrollmentRef.deviceId) ||
          Object.keys(enrollmentRef).sort().join(',') !== 'deviceId,ownerId') return null;
      const { ownerId, deviceId } = enrollmentRef;
      const pairing = await storage.get(pairingKey(ownerId, deviceId));
      if (!approvedPairing(pairing, ownerId, deviceId, now())) return null;
      return { approved: true, ownerId, deviceId, expiresAt: pairing.expiresAt };
    },

    async recordIssued(ticket) {
      if (!isRecord(ticket) || !validId(ticket.ownerId) || !validId(ticket.deviceId) ||
          !validId(ticket.jti) || !validTimestamp(ticket.expiresAt) ||
          !validTimestamp(ticket.issuedAt) ||
          ticket.expiresAt <= now() || ticket.issuedAt > now() + 5000 ||
          !isRecord(ticket.enrollmentRef) ||
          ticket.enrollmentRef.ownerId !== ticket.ownerId ||
          ticket.enrollmentRef.deviceId !== ticket.deviceId) return false;

      return storage.transaction(async tx => {
        const key = pairingKey(ticket.ownerId, ticket.deviceId);
        const pair = await tx.get(key);
        if (!approvedPairing(pair, ticket.ownerId, ticket.deviceId, now()) ||
            ticket.expiresAt > pair.expiresAt) return false;

        const id = ticketKey(ticket.jti);
        if (await tx.get(id)) return false;
        await tx.put(id, {
          ownerId: ticket.ownerId, deviceId: ticket.deviceId, jti: ticket.jti,
          issuedAt: ticket.issuedAt, expiresAt: ticket.expiresAt,
          pairingRevision: pair.revision
        });
        return true;
      });
    },

    async consumeIssued(ticket) {
      if (!isRecord(ticket) || !validId(ticket.ownerId) || !validId(ticket.deviceId) ||
          !validId(ticket.jti) || !validTimestamp(ticket.expiresAt) ||
          !validTimestamp(ticket.issuedAt) || ticket.expiresAt <= now()) return false;

      return storage.transaction(async tx => {
        const [pair, issued] = await Promise.all([
          tx.get(pairingKey(ticket.ownerId, ticket.deviceId)),
          tx.get(ticketKey(ticket.jti))
        ]);
        if (!approvedPairing(pair, ticket.ownerId, ticket.deviceId, now()) ||
            !isRecord(issued) ||
            issued.pairingRevision !== pair.revision ||
            issued.ownerId !== ticket.ownerId ||
            issued.deviceId !== ticket.deviceId ||
            issued.jti !== ticket.jti ||
            issued.issuedAt !== ticket.issuedAt ||
            issued.expiresAt !== ticket.expiresAt ||
            issued.expiresAt > pair.expiresAt) return false;

        await tx.delete(ticketKey(ticket.jti));
        return true;
      });
    }
  });
}
