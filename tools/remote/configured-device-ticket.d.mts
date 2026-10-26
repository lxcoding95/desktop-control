import type {DeviceTicketTransaction} from './durable-ticket-store.mjs';
export interface DeviceBootstrapTransaction extends DeviceTicketTransaction {
  list<T=unknown>(options:{prefix:string;limit:number}):Promise<Map<string,T>>;
}
export interface DeviceBootstrapStorage {
  get<T=unknown>(key:string):Promise<T|undefined>;
  list<T=unknown>(options:{prefix:string;limit:number}):Promise<Map<string,T>>;
  transaction<T>(callback:(tx:DeviceBootstrapTransaction)=>Promise<T>):Promise<T>;
}
export interface HealthClaims {ownerId:string;deviceId:string;scope:'remote.health';expiresAt:number}
export interface DeviceBootstrapRequest {v:1;timestamp:number;nonce:string;signature:string}
export declare class ConfiguredDeviceTicketError extends Error {readonly code:string;constructor(code:string)}
export declare function createDeviceTicketRequestProvider(options:{ownerId:string;deviceId:string;requestSecret:Uint8Array;now?:()=>number}):Readonly<{
  createRequest():Promise<Readonly<DeviceBootstrapRequest>>;
}>;
export declare function createConfiguredDeviceTicket(options:{
  storage:DeviceBootstrapStorage;ownerId:string;deviceId:string;
  requestSecret:Uint8Array;ticketSecret:Uint8Array;approveInitialPairing?:boolean;
  checkEntitlement:(ownerId:string,deviceId:string)=>Promise<HealthClaims|null>;now?:()=>number;
}):Readonly<{issue(request:unknown):Promise<Readonly<{ticket:string;scope:'remote.health'}>>}>;
