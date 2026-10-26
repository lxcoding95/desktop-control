/**
 * TypeScript contract for durable-ticket-store.mjs.
 * Cloudflare's DurableObjectStorage.transaction(...) meets this contract;
 * the consumer must keep issue+consume atomic within a single owner shard.
 */
import type {
  ApprovedDevicePairing,
  DevicePairingRef,
  DeviceTicketClaims,
  DeviceTicketRecord
} from './device-ticket.mjs';

export interface DeviceTicketTransaction {
  get<T = unknown>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<boolean>;
}
export interface DeviceTicketDurableStorage {
  get<T = unknown>(key: string): Promise<T | undefined>;
  transaction<T>(
    callback: (transaction: DeviceTicketTransaction) => Promise<T>
  ): Promise<T>;
}
export interface DurableTicketStore {
  verifyEnrollment(ref: DevicePairingRef): Promise<ApprovedDevicePairing | null>;
  recordIssued(ticket: DeviceTicketRecord): Promise<boolean>;
  consumeIssued(ticket: DeviceTicketClaims): Promise<boolean>;
}
export declare function createDurableTicketStore(
  options: {
    storage: DeviceTicketDurableStorage;
    now?: () => number;
  }
): Readonly<DurableTicketStore>;
