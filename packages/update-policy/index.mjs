// Desktop Control M03 update-policy prototype. Pure decisions only: NO install/network/I/O.
import { createHash, createPublicKey, timingSafeEqual, verify as verifySignature } from 'node:crypto';

export const RECOVERY_TOOLS = Object.freeze(['desktop_control.version', 'desktop_control.doctor', 'desktop_control.update', 'desktop_control.revoke', 'desktop_control.logout', 'desktop_control.emergency_stop']);
const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
const SHA = /^[a-f0-9]{64}$/;
const KEY_ID = /^[a-zA-Z0-9_-]{1,64}$/;
const PLATFORMS = new Set(['win32-x64', 'win32-arm64', 'linux-x64', 'linux-arm64']);
const MAX_METADATA = 16 * 1024;
function fail(code) { throw new Error(code); }
function isObject(o) { return o !== null && typeof o === 'object' && !Array.isArray(o); }
function exactKeys(value, required, optional = []) {
  if (!isObject(value) || required.some(k => !Object.hasOwn(value, k)) || Object.keys(value).some(k => !required.includes(k) && !optional.includes(k))) fail('INVALID_FIELDS');
}
function decodeBase64Url(value, maxBytes) {
  if (typeof value !== 'string' || value.length === 0 || value.length > Math.ceil(maxBytes * 4 / 3) + 4 || !/^[A-Za-z0-9_-]+$/.test(value)) fail('INVALID_ENCODING');
  const bytes = Buffer.from(value, 'base64url');
  if (bytes.length > maxBytes || bytes.toString('base64url') !== value) fail('INVALID_ENCODING');
  return bytes;
}
function versionParts(v) {
  if (typeof v !== 'string' || v.length > 100) fail('INVALID_VERSION');
  const m = VERSION.exec(v);
  if (!m) fail('INVALID_VERSION');
  const nums = m.slice(1, 4).map(Number);
  if (nums.some(n => !Number.isSafeInteger(n))) fail('INVALID_VERSION');
  return { nums, pre: m[4] ?? null };
}
export function compareVersions(a, b) {
  const x = versionParts(a), y = versionParts(b);
  for (let i = 0; i < 3; i++) if (x.nums[i] !== y.nums[i]) return Math.sign(x.nums[i] - y.nums[i]);
  if (x.pre === y.pre) return 0;
  if (x.pre === null) return 1;
  if (y.pre === null) return -1;
  const aa = x.pre.split('.'), bb = y.pre.split('.');
  for (let i = 0; i < Math.min(aa.length, bb.length); i++) {
    if (aa[i] === bb[i]) continue;
    const an = /^\d+$/.test(aa[i]), bn = /^\d+$/.test(bb[i]);
    if (an && bn) {
      const ai = BigInt(aa[i]), bi = BigInt(bb[i]);
      return ai < bi ? -1 : 1;
    }
    if (an !== bn) return an ? -1 : 1;
    return aa[i] < bb[i] ? -1 : 1;
  }
  return Math.sign(aa.length - bb.length);
}
function parseTimestamp(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(s)) fail('INVALID_TIME');
  const n = Date.parse(s);
  if (!Number.isFinite(n) || new Date(n).toISOString().slice(0, 19) !== s.slice(0, 19)) fail('INVALID_TIME');
  return n;
}
function validatePolicy(p) {
  exactKeys(p, ['schema', 'sequence', 'issuedAt', 'expiresAt', 'platform', 'minBridge', 'targetBridge', 'compatiblePlugins', 'mandatory', 'artifact']);
  if (p.schema !== 1 || !Number.isSafeInteger(p.sequence) || p.sequence < 1 || !PLATFORMS.has(p.platform) || typeof p.mandatory !== 'boolean') fail('INVALID_POLICY');
  versionParts(p.minBridge);
  versionParts(p.targetBridge);
  if (compareVersions(p.targetBridge, p.minBridge) < 0) fail('INVALID_POLICY');
  if (!Array.isArray(p.compatiblePlugins) || p.compatiblePlugins.length < 1 || p.compatiblePlugins.length > 20 || new Set(p.compatiblePlugins).size !== p.compatiblePlugins.length) fail('INVALID_POLICY');
  for (const v of p.compatiblePlugins) versionParts(v);
  exactKeys(p.artifact, ['name', 'sha256', 'size']);
  if (typeof p.artifact.name !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,100}$/.test(p.artifact.name) || p.artifact.name.includes('..') || !SHA.test(p.artifact.sha256) || !Number.isSafeInteger(p.artifact.size) || p.artifact.size < 1 || p.artifact.size > 512 * 1024 * 1024) fail('INVALID_ARTIFACT');
  const issued = parseTimestamp(p.issuedAt), expires = parseTimestamp(p.expiresAt);
  if (issued >= expires || expires - issued > 31 * 86400000) fail('INVALID_TIME');
  return { issued, expires };
}

/** Trust anchors are supplied by the protected launcher, never by the manifest. */
export function verifyPolicy(envelope, trustedKeys, { previous = null, now = Date.now() } = {}) {
  exactKeys(envelope, ['format', 'keyId', 'payload', 'signature']);
  if (envelope.format !== 'dc-update-policy-v1' || !KEY_ID.test(envelope.keyId)) fail('INVALID_ENVELOPE');
  if (!isObject(trustedKeys) || !Object.hasOwn(trustedKeys, envelope.keyId)) fail('UNKNOWN_SIGNER');
  const payloadBytes = decodeBase64Url(envelope.payload, MAX_METADATA);
  const signature = decodeBase64Url(envelope.signature, 64);
  if (signature.length !== 64) fail('INVALID_SIGNATURE');
  let key;
  try { key = createPublicKey(trustedKeys[envelope.keyId]); } catch { fail('INVALID_TRUST_ROOT'); }
  if (key.asymmetricKeyType !== 'ed25519' || !verifySignature(null, payloadBytes, key, signature)) fail('INVALID_SIGNATURE');
  let policy;
  try { policy = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(payloadBytes)); }
  catch { fail('INVALID_PAYLOAD'); }
  const { issued, expires } = validatePolicy(policy);
  if (!Number.isSafeInteger(now) || now < 0) fail('INVALID_TIME');
  if (issued > now + 5 * 60000 || expires <= now) fail('EXPIRED_OR_FUTURE_POLICY');
  const digest = createHash('sha256').update(payloadBytes).digest('hex');
  if (previous !== null) {
    exactKeys(previous, ['sequence', 'digest', 'trustedTime']);
    if (!Number.isSafeInteger(previous.sequence) || !SHA.test(previous.digest) || !Number.isSafeInteger(previous.trustedTime) || now < previous.trustedTime) fail('INVALID_CHECKPOINT');
    if (policy.sequence < previous.sequence || (policy.sequence === previous.sequence && digest !== previous.digest)) fail('REPLAY_OR_EQUIVOCATION');
  }
  return { policy, checkpoint: { sequence: policy.sequence, digest, trustedTime: now } };
}

export function verifyArtifact(bytes, artifact) {
  if (!Buffer.isBuffer(bytes)) fail('INVALID_ARTIFACT');
  exactKeys(artifact, ['name', 'sha256', 'size']);
  if (!SHA.test(artifact.sha256) || bytes.length !== artifact.size) return false;
  const got = createHash('sha256').update(bytes).digest();
  return timingSafeEqual(got, Buffer.from(artifact.sha256, 'hex'));
}

export function decideAccess(policy, { bridgeVersion, pluginVersion, platform }) {
  validatePolicy(policy);
  versionParts(bridgeVersion); versionParts(pluginVersion);
  if (policy.platform !== platform) return { state: 'REPAIR_ONLY', reason: 'PLATFORM_MISMATCH', allowed: RECOVERY_TOOLS };
  if (!policy.compatiblePlugins.includes(pluginVersion)) return { state: 'REPAIR_ONLY', reason: 'PLUGIN_UPDATE_REQUIRED', allowed: RECOVERY_TOOLS };
  if (compareVersions(bridgeVersion, policy.targetBridge) > 0) return { state: 'REPAIR_ONLY', reason: 'UNEXPECTED_BRIDGE_VERSION', allowed: RECOVERY_TOOLS };
  const needsUpdate = compareVersions(bridgeVersion, policy.targetBridge) < 0;
  if (compareVersions(bridgeVersion, policy.minBridge) < 0 || (needsUpdate && policy.mandatory)) return { state: 'REPAIR_ONLY', reason: 'MANDATORY_UPDATE', allowed: RECOVERY_TOOLS };
  if (needsUpdate) return { state: 'UPDATE_AVAILABLE', reason: 'OPTIONAL_UPDATE', allowed: null };
  return { state: 'READY', reason: 'CURRENT', allowed: null };
}

/** Pure release-train planning; never uploads, publishes, installs, or increments remote counters. */
export function planBatch({ currentVersion, changes, windowOpen = false, releaseNow = false }) {
  const current = versionParts(currentVersion);
  if (current.pre !== null) fail('UNSUPPORTED_PRERELEASE_TRAIN');
  if (!Array.isArray(changes) || changes.length > 1000) fail('INVALID_CHANGES');
  const approved = new Map();
  for (const c of changes) {
    exactKeys(c, ['commit', 'contract', 'approved', 'verified', 'critical']);
    if (typeof c.commit !== 'string' || !/^[a-f0-9]{40}$/.test(c.commit) || typeof c.contract !== 'string' || !/^[a-zA-Z0-9._-]{1,64}$/.test(c.contract) || !['approved','verified','critical'].every(k => typeof c[k] === 'boolean')) fail('INVALID_CHANGE');
    if (c.approved && c.verified) {
      const prior = approved.get(c.commit);
      if (prior && (prior.contract !== c.contract || prior.critical !== c.critical)) fail('CONFLICTING_CHANGE');
      approved.set(c.commit, c);
    }
  }
  if (!approved.size) return { state: 'NO_CHANGE' };
  const values = [...approved.values()];
  if (new Set(values.map(c => c.contract)).size !== 1) return { state: 'INCOMPATIBLE_BATCH' };
  const critical = values.some(c => c.critical);
  if (!critical && !releaseNow && !windowOpen) return { state: 'QUEUED', count: values.length };
  const [major, minor, patch] = current.nums;
  if (patch === Number.MAX_SAFE_INTEGER) fail('VERSION_OVERFLOW');
  return { state: 'CANDIDATE', version: major + '.' + minor + '.' + (patch + 1), contract: values[0].contract, commits: values.map(c => c.commit).sort(), reason: critical ? 'CRITICAL' : releaseNow ? 'RELEASE_NOW' : 'BATCH_WINDOW' };
}
