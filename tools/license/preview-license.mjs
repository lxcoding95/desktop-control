/**
 * Desktop Control official preview entitlement (Node 22+; zero dependencies).
 * RSA-PSS-SHA256 signed, 30-day maximum leases, one health-only capability.
 * No login/issuance route here. Issuer MUST authenticate the admin and use
 * atomic durable reserveSeat. Verifier MUST check live revocation in isActive.
 * Public MIT forks can remove client-side verification; this controls only
 * trusted official distribution and our server, not use of public source.
 */
import {
  createPrivateKey, createPublicKey, sign, verify,
  constants as cryptoConstants
} from 'node:crypto';

const DAY = 86_400_000;
const MAX_TTL = 30 * DAY;
const idOk = v => typeof v === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(v);
const obj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const keysExactly = (v, names) => Object.keys(v).sort().join(',') === names;
const b64 = bytes => Buffer.from(bytes).toString('base64url');
const fail = code => { throw new EntitlementError(code); };

export class EntitlementError extends Error {
  constructor(code) { super(code); this.code = code; this.name = 'EntitlementError'; }
}
function parseB64(part) {
  if (typeof part !== 'string' || !/^[A-Za-z0-9_-]{1,4096}$/.test(part)) fail('INVALID_LICENSE');
  let decoded;
  try { decoded = Buffer.from(part, 'base64url'); }
  catch { fail('INVALID_LICENSE'); }
  if (b64(decoded) !== part) fail('INVALID_LICENSE');
  return decoded;
}
function validateClaims(p, now) {
  return obj(p) &&
    keysExactly(p, 'deviceId,expiresAt,issuedAt,licenseId,ownerId,scope,v') &&
    p.v === 1 && p.scope === 'remote.health' &&
    idOk(p.ownerId) && idOk(p.deviceId) && idOk(p.licenseId) &&
    Number.isSafeInteger(p.issuedAt) && Number.isSafeInteger(p.expiresAt) &&
    p.expiresAt > p.issuedAt && p.expiresAt - p.issuedAt <= MAX_TTL &&
    now >= p.issuedAt - 5_000 && now < p.expiresAt;
}
function rsaOptions(key) {
  return {
    key,
    padding: cryptoConstants.RSA_PKCS1_PSS_PADDING,
    saltLength: cryptoConstants.RSA_PSS_SALTLEN_DIGEST
  };
}
const serialized = claim => Buffer.from(JSON.stringify(claim), 'utf8');
const message = body => Buffer.from('desktop-control-preview-license-v1.' + body);

/**
 * The issuer must be a trusted account-admin process. reserveSeat MUST atomically
 * refuse a 2nd active entitlement and confirm the exact approved owner/device.
 * Never expose this function or signing key through an MCP tool.
 */
export async function issuePreviewLicense({
  privateKey, ownerId, deviceId, licenseId, expiresAt,
  reserveSeat, now = Date.now
} = {}) {
  if (typeof reserveSeat !== 'function' || typeof now !== 'function') fail('ISSUER_NOT_CONFIGURED');
  const issuedAt = now();
  const claims = { v: 1, licenseId, ownerId, deviceId, issuedAt, expiresAt, scope: 'remote.health' };
  if (!validateClaims(claims, issuedAt)) fail('INVALID_CLAIMS');
  let signingKey;
  try {
    signingKey = createPrivateKey(privateKey);
    if (signingKey.asymmetricKeyType !== 'rsa' ||
        (signingKey.asymmetricKeyDetails?.modulusLength ?? 0) < 3072) fail('INVALID_SIGNER');
  } catch { fail('INVALID_SIGNER'); }
  const body = b64(serialized(claims));
  let signature;
  try { signature = sign('sha256', message(body), rsaOptions(signingKey)); }
  catch { fail('INVALID_SIGNER'); }
  // Sign first but do not publish a token until durable atomic admission.
  let granted;
  try { granted = await reserveSeat(Object.freeze({...claims})); }
  catch { fail('SEAT_STORE_UNAVAILABLE'); }
  if (granted !== true) fail('NO_AVAILABLE_SEAT');
  return 'dcl1.' + body + '.' + b64(signature);
}

/**
 * The public key MUST be trusted/pinned by the official distribution,
 * never supplied by the license or an untrusted MCP request.
 * isActive MUST check durable, authoritative revocation/seat state.
 */
export async function verifyPreviewLicense({
  token, publicKey, expectedOwnerId, expectedDeviceId,
  isActive, now = Date.now
} = {}) {
  if (typeof isActive !== 'function' || typeof now !== 'function') fail('VERIFIER_NOT_CONFIGURED');
  if (!idOk(expectedOwnerId) || !idOk(expectedDeviceId)) fail('INVALID_CONTEXT');
  if (typeof token !== 'string' || token.length > 8192) fail('INVALID_LICENSE');
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== 'dcl1') fail('INVALID_LICENSE');
  const body = parts[1], sig = parseB64(parts[2]);
  const decoded = parseB64(body);
  let claim;
  try { claim = JSON.parse(new TextDecoder('utf-8', {fatal:true}).decode(decoded)); }
  catch { fail('INVALID_LICENSE'); }
  if (!validateClaims(claim, now())) fail('LICENSE_EXPIRED_OR_INVALID');
  if (claim.ownerId !== expectedOwnerId || claim.deviceId !== expectedDeviceId)
    fail('WRONG_OWNER_OR_DEVICE');
  let verified = false;
  try {
    const key = createPublicKey(publicKey);
    if (key.asymmetricKeyType !== 'rsa' ||
        (key.asymmetricKeyDetails?.modulusLength ?? 0) < 3072) fail('INVALID_LICENSE');
    verified = verify('sha256', message(body), rsaOptions(key), sig);
  } catch { fail('INVALID_LICENSE'); }
  if (!verified) fail('INVALID_LICENSE');
  let active;
  try { active = await isActive(Object.freeze({...claim})); }
  catch { fail('LICENSE_STORE_UNAVAILABLE'); }
  if (active !== true) fail('LICENSE_REVOKED');
  return Object.freeze({...claim});
}
