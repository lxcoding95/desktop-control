import { verifyPreviewLicense } from '../license/preview-license.mjs';
import { createSingleSeatLedger } from '../license/single-seat-ledger.mjs';

/** Trusted deployment configuration only. Admits the EXISTING signed entitlement
 * into the authoritative one-seat store; never signs/issues/renews a license.
 * Reconfiguration cannot overwrite, reuse or reactivate a revoked seat.
 */
export function createConfiguredPreviewEntitlement({ storage, ownerId, deviceId, token, publicKey, now = Date.now }) {
  const ledger = createSingleSeatLedger({ storage, approvedOwnerId: ownerId, now });
  async function claims(candidateOwner, candidateDevice) {
      if (candidateOwner !== ownerId || candidateDevice !== deviceId) return null;
      try {
        return await verifyPreviewLicense({ token, publicKey, expectedOwnerId: ownerId, expectedDeviceId: deviceId, now,
          isActive: async claim => await ledger.isActive(claim) || await ledger.reserveSeat(claim) });
      } catch { return null; }
  }
  return Object.freeze({
    claims,
    async check(candidateOwner, candidateDevice) { return await claims(candidateOwner, candidateDevice) !== null; }
  });
}
