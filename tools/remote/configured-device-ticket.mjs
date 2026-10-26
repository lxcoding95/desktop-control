import {createDeviceTicketAuthority} from './device-ticket.mjs';
import {createDurableTicketStore} from './durable-ticket-store.mjs';

const text = new TextEncoder();
const validId = value => typeof value === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(value);
const validTime = value => Number.isSafeInteger(value) && value > 0;
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const b64 = bytes => btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
function decodeSignature(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(value)) return null;
  try {
    const decoded = Uint8Array.from(atob(value.replaceAll('-','+').replaceAll('_','/')+'='), c=>c.charCodeAt(0));
    return decoded.length === 32 && b64(decoded) === value ? decoded : null;
  } catch {return null;}
}
function signingKey(secret) {
  if (!(secret instanceof Uint8Array) || secret.length !== 32) throw TypeError('Dedicated 32-byte bootstrap key required');
  return crypto.subtle.importKey('raw',secret.slice(),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);
}
const message = (ownerId,deviceId,timestamp,nonce) => text.encode(JSON.stringify(['desktop-control-device-bootstrap-v1','POST','/device-ticket',ownerId,deviceId,timestamp,nonce]));
export class ConfiguredDeviceTicketError extends Error {
  constructor(code) {super(code);this.name='ConfiguredDeviceTicketError';this.code=code;}
}
const fail = code => {throw new ConfiguredDeviceTicketError(code);};
const RESERVATION_PREFIX='device-bootstrap-pending-ticket:';
// Bound work even with legacy/corrupt oversized stores. Prune at most 64 expired
// rows per prefix; a full scan page fails closed and the caller may retry later.
async function liveRows(tx,prefix,current) {
  const rows=await tx.list({prefix,limit:65});
  if(!(rows instanceof Map))return null;
  let count=0,pruned=0;
  for(const[key,row]of rows){
    if(!record(row)||!validTime(row.expiresAt))return null;
    if(row.expiresAt<=current){if(pruned<64){await tx.delete(key);pruned++;}}
    else count++;
  }
  return rows.size>=65?null:count;
}

/** Trusted LOCAL connector configuration. No network, key persistence or reconnect.
 * Identity/configuration must never originate from a remote MCP tool argument.
 */
export function createDeviceTicketRequestProvider({ownerId,deviceId,requestSecret,now=Date.now}={}) {
  if (!validId(ownerId) || !validId(deviceId) || typeof now !== 'function') throw TypeError('Invalid trusted device configuration');
  const key=signingKey(requestSecret);
  return Object.freeze({async createRequest() {
    const timestamp=now();if(!validTime(timestamp))fail('INVALID_CLOCK');
    const nonce=b64(crypto.getRandomValues(new Uint8Array(32)));
    const signature=b64(new Uint8Array(await crypto.subtle.sign('HMAC',await key,message(ownerId,deviceId,timestamp,nonce))));
    return Object.freeze({v:1,timestamp,nonce,signature});
  }});
}

/** Single deployment-configured device, health only. storage.transaction MUST be
 * strongly consistent/atomic. checkEntitlement returns freshly VERIFIED existing
 * claims, never a body-supplied license or an unverified decoded JWT payload.
 * No issuer, renewal, replacement or pairing-revival operation exists here.
 */
export function createConfiguredDeviceTicket({storage,ownerId,deviceId,requestSecret,ticketSecret,approveInitialPairing=false,checkEntitlement,now=Date.now}={}) {
  if (!storage || typeof storage.get !== 'function' || typeof storage.list !== 'function' || typeof storage.transaction !== 'function' ||
      !validId(ownerId) || !validId(deviceId) || typeof approveInitialPairing !== 'boolean' ||
      typeof checkEntitlement !== 'function' || typeof now !== 'function') throw TypeError('Trusted device bootstrap configuration required');
  if (!(ticketSecret instanceof Uint8Array) || ticketSecret.length !== 32 ||
      (requestSecret instanceof Uint8Array && requestSecret.length===ticketSecret.length && requestSecret.every((byte,i)=>byte===ticketSecret[i]))) throw TypeError('Separate 32-byte ticket and bootstrap keys required');
  const key=signingKey(requestSecret);
  const retainedTicketSecret=ticketSecret.slice();
  const store=createDurableTicketStore({storage,now});
  const pairingKey='pairing:'+ownerId+':'+deviceId;
  return Object.freeze({async issue(request) {
    if (!record(request) || Object.keys(request).sort().join(',') !== 'nonce,signature,timestamp,v' || request.v!==1 ||
        !validTime(request.timestamp) || typeof request.nonce !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(request.nonce)) fail('INVALID_REQUEST');
    const signature=decodeSignature(request.signature), current=now();
    if (!validTime(current) || current-request.timestamp>60_000 || request.timestamp-current>5_000 || !signature) fail('INVALID_REQUEST');
    let authenticated=false;
    try {authenticated=await crypto.subtle.verify('HMAC',await key,signature,message(ownerId,deviceId,request.timestamp,request.nonce));} catch {}
    if(!authenticated)fail('AUTHENTICATION_DENIED');
    let claims;
    try {claims=await checkEntitlement(ownerId,deviceId);} catch {fail('ENTITLEMENT_DENIED');}
    if (!record(claims) || claims.scope!=='remote.health' || claims.ownerId!==ownerId || claims.deviceId!==deviceId ||
        !validTime(claims.expiresAt) || claims.expiresAt<=now()) fail('ENTITLEMENT_DENIED');
    const reservationId=crypto.randomUUID(),reservationKey=RESERVATION_PREFIX+reservationId;
    const admitted=await storage.transaction(async tx=>{
      // Recheck age after signature/entitlement awaits; stalled requests do not
      // retain their original admission window indefinitely.
      const admissionNow=now();
      if (!validTime(admissionNow) || admissionNow-request.timestamp>60_000 || request.timestamp-admissionNow>5_000 || claims.expiresAt<=admissionNow) return 'INVALID_REQUEST';
      const nonceKey='device-bootstrap-nonce:'+request.nonce;
      if(await tx.get(nonceKey))return 'REQUEST_REPLAYED';
      const nonces=await liveRows(tx,'device-bootstrap-nonce:',admissionNow);
      const tickets=await liveRows(tx,'ticket:',admissionNow);
      const reservations=await liveRows(tx,RESERVATION_PREFIX,admissionNow);
      if(nonces===null||tickets===null||reservations===null||nonces>=64||tickets+reservations>=8)return 'CAPACITY_DENIED';
      const pair=await tx.get(pairingKey);
      if (pair !== undefined && pair !== null) {
        if (!record(pair) || pair.status!=='approved' || pair.ownerId!==ownerId || pair.deviceId!==deviceId ||
            !validId(pair.revision) || !validTime(pair.expiresAt) || pair.expiresAt<=admissionNow || pair.expiresAt>claims.expiresAt) return 'PAIRING_DENIED';
      } else {
        if (!approveInitialPairing)return 'PAIRING_DENIED';
        await tx.put(pairingKey,{status:'approved',ownerId,deviceId,revision:crypto.randomUUID(),expiresAt:claims.expiresAt});
      }
      // Retain consumed nonce until at least its last possible request window.
      // Hosting integration must prune only expired rows, never clear live rows.
      await tx.put(nonceKey,{expiresAt:request.timestamp+60_001});
      await tx.put(reservationKey,{ownerId,deviceId,expiresAt:Math.min(admissionNow+60_000,claims.expiresAt)});
      return 'OK';
    });
    if(admitted!=='OK')fail(admitted);
    // Existing ticket authority rechecks pairing atomically at issuance and
    // consumption. A failed issuance never makes a consumed request replayable.
    // Reservation->ticket conversion MUST be one transaction. Independent
    // admission then ordinary recordIssued would permit parallel oversubscription.
    const authority=createDeviceTicketAuthority({secret:retainedTicketSecret,now,makeId:()=>reservationId,
      consumeIssued:store.consumeIssued,
      verifyEnrollment:async ref=>{
        const enrollment=await store.verifyEnrollment(ref),reservation=await storage.get(reservationKey);
        if(!enrollment||!record(reservation)||reservation.expiresAt<=now())return null;
        return {...enrollment,expiresAt:Math.min(enrollment.expiresAt,reservation.expiresAt)};
      },
      recordIssued:async ticket=>storage.transaction(async tx=>{
        const reservation=await tx.get(reservationKey),pair=await tx.get(pairingKey),current=now();
        if(!record(reservation)||reservation.ownerId!==ownerId||reservation.deviceId!==deviceId||reservation.expiresAt<=current||
            !record(pair)||pair.status!=='approved'||pair.ownerId!==ownerId||pair.deviceId!==deviceId||!validId(pair.revision)||pair.expiresAt<=current||
            ticket.ownerId!==ownerId||ticket.deviceId!==deviceId||ticket.jti!==reservationId||!validTime(ticket.issuedAt)||!validTime(ticket.expiresAt)||
            ticket.issuedAt>current+5000||ticket.expiresAt<=current||ticket.expiresAt>reservation.expiresAt||ticket.expiresAt>pair.expiresAt||await tx.get('ticket:'+reservationId))return false;
        await tx.put('ticket:'+reservationId,{ownerId,deviceId,jti:reservationId,issuedAt:ticket.issuedAt,expiresAt:ticket.expiresAt,pairingRevision:pair.revision});
        await tx.delete(reservationKey);
        return true;
      })
    });
    try{
      const ticket=await authority.issue({ownerId,deviceId});
      return Object.freeze({ticket,scope:'remote.health'});
    }finally{
      await storage.transaction(async tx=>{await tx.delete(reservationKey);});
    }
  }});
}
