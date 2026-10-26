/**
 * Device-bound, one-time ticket authority. Does NOT itself approve devices or
 * open network ports. Dependencies MUST use durable, atomic backing storage.
 * No MCP tool is allowed to call issue() on behalf of the model.
 */
const utf8 = new TextEncoder();
const MAX_TTL_MS = 60_000;
const MAX_TICKET_CHARS = 2048;
const idOk = x => typeof x === 'string' && /^[a-zA-Z0-9._:-]{1,128}$/.test(x);
const fail = code => { throw new TicketError(code); };
export class TicketError extends Error {
  constructor(code) { super(code); this.name = 'TicketError'; this.code = code; }
}

function base64url(bytes) {
  let text = '';
  for (let i = 0; i < bytes.length; i++) text += String.fromCharCode(bytes[i]);
  return btoa(text).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
}
function parse64url(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)) fail('INVALID_TICKET');
  try {
    const b64 = value.replace(/-/g,'+').replace(/_/g,'/');
    const text = atob(b64.padEnd(Math.ceil(b64.length/4)*4,'='));
    const bytes = Uint8Array.from(text, c => c.charCodeAt(0));
    if (base64url(bytes) !== value) fail('INVALID_TICKET');
    return bytes;
  } catch { fail('INVALID_TICKET'); }
}
const strictPayload = p => p !== null && typeof p === 'object' && !Array.isArray(p) &&
  Object.keys(p).sort().join(',') === 'deviceId,expiresAt,issuedAt,jti,ownerId,v' &&
  p.v === 1 && idOk(p.ownerId) && idOk(p.deviceId) && idOk(p.jti) &&
  Number.isSafeInteger(p.issuedAt) && Number.isSafeInteger(p.expiresAt) &&
  p.expiresAt > p.issuedAt && p.expiresAt-p.issuedAt <= MAX_TTL_MS;

/**
 * secret is >=32 cryptographically random bytes from a secret store.
 * Every ticket needs a separately approved enrollment record.
 * recordIssued/consumeIssued MUST be atomic and strongly consistent; consume
 * must recheck user/device binding and pairing revocation in durable storage.
 */
export function createDeviceTicketAuthority({secret, verifyEnrollment, recordIssued, consumeIssued, now = Date.now, makeId = () => crypto.randomUUID()}={}) {
  if (!(secret instanceof Uint8Array) || secret.length < 32 || secret.length > 128)
    throw new TypeError('Random signing key of 32..128 bytes required');
  if ([verifyEnrollment, recordIssued, consumeIssued].some(f => typeof f !== 'function'))
    throw new TypeError('Trusted durable enrollment and ticket store required');
  if (typeof now !== 'function' || typeof makeId !== 'function') throw new TypeError('Invalid authority dependencies');
  const keyPromise = crypto.subtle.importKey('raw', secret.slice(), {name:'HMAC',hash:'SHA-256'}, false, ['sign','verify']);

  async function issue(enrollmentRef) {
    let enrollment;
    try { enrollment = await verifyEnrollment(enrollmentRef); } catch { fail('ENROLLMENT_DENIED'); }
    if (!enrollment || enrollment.approved !== true || !idOk(enrollment.ownerId) || !idOk(enrollment.deviceId))
      fail('ENROLLMENT_DENIED');
    const issuedAt = now();
    const expiresAt = Math.min(issuedAt+MAX_TTL_MS,enrollment.expiresAt);
    const payload = {v:1,ownerId:enrollment.ownerId,deviceId:enrollment.deviceId,jti:makeId(),issuedAt,expiresAt};
    if (!strictPayload(payload) || expiresAt <= now()) fail('ENROLLMENT_DENIED');
    let stored;
    try { stored = await recordIssued({...payload,enrollmentRef}); } catch { fail('TICKET_STORE_UNAVAILABLE'); }
    if (stored !== true) fail('TICKET_STORE_UNAVAILABLE');
    const body = base64url(utf8.encode(JSON.stringify(payload)));
    const signature = await crypto.subtle.sign('HMAC',await keyPromise, utf8.encode('dc-device-ticket-v1.'+body));
    const token = 'dt1.'+body+'.'+base64url(new Uint8Array(signature));
    if (token.length > MAX_TICKET_CHARS) fail('INVALID_TICKET');
    return token;
  }
  async function verifyDevice(ticket) {
    if (typeof ticket !== 'string' || ticket.length > MAX_TICKET_CHARS) fail('INVALID_TICKET');
    const parts = ticket.split('.');
    if (parts.length!==3 || parts[0]!=='dt1') fail('INVALID_TICKET');
    const body = parts[1];
    const sig = parse64url(parts[2]);
    if (sig.length !== 32) fail('INVALID_TICKET');
    let valid;
    try { valid = await crypto.subtle.verify('HMAC',await keyPromise,sig,utf8.encode('dc-device-ticket-v1.'+body)); }
    catch { fail('INVALID_TICKET'); }
    if (!valid) fail('INVALID_TICKET');
    let payload;
    try { payload = JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(parse64url(body))); }
    catch { fail('INVALID_TICKET'); }
    if (!strictPayload(payload) || now()<payload.issuedAt-5_000 || now() >= payload.expiresAt) fail('TICKET_EXPIRED');
    let accepted;
    try { accepted = await consumeIssued({...payload}); } catch { fail('TICKET_STORE_UNAVAILABLE'); }
    if (accepted !== true) fail('TICKET_USED_OR_REVOKED');
    return Object.freeze({ownerId:payload.ownerId,deviceId:payload.deviceId,expiresAt:payload.expiresAt});
  }
  return Object.freeze({issue,verifyDevice});
}
