/**
 * Public TypeScript contract for the runtime-validated device-ticket.mjs.
 * This is a declaration only: it introduces no new token or runtime behavior.
 *
 * The authority can issue tickets ONLY using a previously approved pairing.
 * Stored ticket claims are checked again atomically on verification.
 */
export interface DevicePairingRef {
  ownerId: string;
  deviceId: string;
}
export interface ApprovedDevicePairing extends DevicePairingRef {
  approved: true;
  expiresAt: number;
}
export interface DeviceTicketClaims extends DevicePairingRef {
  v: 1;
  jti: string;
  issuedAt: number;
  expiresAt: number;
}
export interface DeviceTicketRecord extends DeviceTicketClaims {
  enrollmentRef: DevicePairingRef;
}
export interface DeviceTicketAuthorityOptions {
  /** Cryptographically random 32–128 byte secret, stored outside source control. */
  secret: Uint8Array;
  /** Externally verified and explicitly approved, not supplied by an MCP model. */
  verifyEnrollment(ref: DevicePairingRef): Promise<ApprovedDevicePairing | null>;
  /** Must be backed by strongly consistent, atomic durable storage. */
  recordIssued(record: DeviceTicketRecord): Promise<boolean>;
  /** Must atomically consume and revalidate pairing and revocation state. */
  consumeIssued(claims: DeviceTicketClaims): Promise<boolean>;
  now?: () => number;
  makeId?: () => string;
}
export interface VerifiedDeviceTicket extends DevicePairingRef {
  expiresAt: number;
}
export interface DeviceTicketAuthority {
  issue(ref: DevicePairingRef): Promise<string>;
  verifyDevice(ticket: string): Promise<Readonly<VerifiedDeviceTicket>>;
}
export declare class TicketError extends Error {
  readonly code: string;
  constructor(code: string);
}
export declare function createDeviceTicketAuthority(
  options: DeviceTicketAuthorityOptions
): Readonly<DeviceTicketAuthority>;
