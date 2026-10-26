/**
 * Desktop Control — remote health-only relay core (NOT an HTTP server).
 *
 * Trust adapters MUST verify OAuth access and approved device tickets.
 * No adapters => no relay. This code issues no credentials or permissions.
 * Keep each live relay scoped to the corresponding authenticated Durable Object.
 */
const HEALTH_TOOL = 'desktop_control.remote_health';
const MAX_RESPONSE_BYTES = 4096;
const MAX_INFLIGHT_PER_DEVICE = 4;
const TIMEOUT_MS = 5000;

export class RemoteAccessError extends Error {
  constructor(code) {
    super(code);
    this.name = 'RemoteAccessError';
    this.code = code;
  }
}

const deny = code => { throw new RemoteAccessError(code); };
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const validId = value => typeof value === 'string' && value.length > 0 && value.length <= 128 && /^[a-zA-Z0-9._:-]+$/.test(value);
const validGrant = (grant, now) => isRecord(grant) && validId(grant.ownerId) &&
  Number.isSafeInteger(grant.expiresAt) && grant.expiresAt > now;
const healthStatus = Object.freeze({ connected: true, scope: 'remote-health-only', desktopAccess: false });

export function createRemoteRelay({ verifyClient, verifyDevice, now = Date.now, makeId = () => crypto.randomUUID(), timeoutMs = TIMEOUT_MS } = {}) {
  if (typeof verifyClient !== 'function' || typeof verifyDevice !== 'function') {
    throw new TypeError('Trusted OAuth and device verifiers are required');
  }
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 10_000) {
    throw new RangeError('Invalid bounded request timeout');
  }
  const sessions = new Map();
  const pending = new Map();
  const keyFor = (ownerId, deviceId) => ownerId + '\u0000' + deviceId;

  const dropSession = (key, session, errorCode) => {
    if (sessions.get(key) !== session) return;
    sessions.delete(key);
    for (const entry of [...pending.values()]) {
      if (entry.session === session) entry.reject(new RemoteAccessError(errorCode));
    }
  };

  const authorizeClient = async (credential, expectedScope) => {
    let grant;
    try { grant = await verifyClient(credential); } catch { deny('UNAUTHORIZED'); }
    if (!validGrant(grant, now()) || !Array.isArray(grant.scopes) ||
        !grant.scopes.includes(expectedScope)) deny('UNAUTHORIZED');
    return grant;
  };

  async function attachDevice({ ticket, send }) {
    if (typeof send !== 'function') deny('INVALID_DEVICE');
    let grant;
    try { grant = await verifyDevice(ticket); } catch { deny('INVALID_DEVICE'); }
    if (!validGrant(grant, now()) || !validId(grant.deviceId)) deny('INVALID_DEVICE');
    const key = keyFor(grant.ownerId, grant.deviceId);
    const existing = sessions.get(key);
    if (existing) dropSession(key, existing, 'DEVICE_REPLACED');
    const session = { ...grant, send, key, nonce: makeId() };
    sessions.set(key, session);
    let closed = false;
    return Object.freeze({
      receive(message) {
        if (closed || sessions.get(key) !== session) return false;
        if (now() >= session.expiresAt) {
          dropSession(key, session, 'DEVICE_EXPIRED');
          return false;
        }
        if (!isRecord(message) || message.type !== 'remote.health.response' ||
            typeof message.id !== 'string' || message.id.length > 128 ||
            !isRecord(message.result)) return false;
        try {
          if (new TextEncoder().encode(JSON.stringify(message)).byteLength > MAX_RESPONSE_BYTES) return false;
        } catch { return false; }
        const entry = pending.get(message.id);
        if (!entry || entry.session !== session) return false;
        if (message.nonce !== entry.nonce) return false;
        const answer = message.result;
        if (answer.connected !== true || answer.scope !== 'remote-health-only' || answer.desktopAccess !== false ||
            Object.keys(answer).sort().join(',') !== 'connected,desktopAccess,scope') {
          entry.reject(new RemoteAccessError('BAD_DEVICE_RESPONSE'));
          return false;
        }
        entry.resolve({ ...healthStatus });
        return true;
      },
      disconnect() {
        if (closed) return;
        closed = true;
        dropSession(key, session, 'DEVICE_OFFLINE');
      }
    });
  }

  async function callHealth({ credential, deviceId, tool = HEALTH_TOOL, args = {}, signal } = {}) {
    if (signal?.aborted) deny('CANCELLED');
    if (tool !== HEALTH_TOOL || !isRecord(args) || Object.keys(args).length !== 0) deny('TOOL_NOT_ALLOWED');
    if (!validId(deviceId)) deny('INVALID_DEVICE');
    const grant = await authorizeClient(credential, 'remote.health');
    if (signal?.aborted) deny('CANCELLED');
    const key = keyFor(grant.ownerId, deviceId);
    const session = sessions.get(key);
    if (!session) deny('DEVICE_OFFLINE');
    if (now() >= session.expiresAt) {
      dropSession(key, session, 'DEVICE_EXPIRED');
      deny('DEVICE_EXPIRED');
    }
    let inflight = 0;
    for (const entry of pending.values()) if (entry.session === session) inflight++;
    if (inflight >= MAX_INFLIGHT_PER_DEVICE) deny('BUSY');
    const id = makeId();
    if (!validId(id) || pending.has(id)) deny('INTERNAL_ERROR');
    const nonce = makeId();
    if (!validId(nonce)) deny('INTERNAL_ERROR');
    return await new Promise((resolve, reject) => {
      let settled = false;
      let timer;
      const finish = (error, result) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        signal?.removeEventListener('abort', cancelled);
        pending.delete(id);
        if (error) reject(error);
        else resolve(result);
      };
      const cancelled = () => finish(new RemoteAccessError('CANCELLED'));
      const entry = { session, nonce, resolve: result => finish(null, result), reject: error => finish(error) };
      pending.set(id, entry);
      timer = setTimeout(() => finish(new RemoteAccessError('TIMEOUT')), timeoutMs);
      signal?.addEventListener('abort', cancelled, { once: true });
      if (signal?.aborted) { cancelled(); return; }
      try {
        Promise.resolve(session.send({ type: 'remote.health.request', id, nonce, tool: HEALTH_TOOL, args: {} }))
          .catch(() => entry.reject(new RemoteAccessError('DEVICE_OFFLINE')));
      } catch { entry.reject(new RemoteAccessError('DEVICE_OFFLINE')); }
    });
  }

  async function revokeDevice({ credential, deviceId } = {}) {
    if (!validId(deviceId)) deny('INVALID_DEVICE');
    const grant = await authorizeClient(credential, 'devices.revoke');
    const key = keyFor(grant.ownerId, deviceId);
    const session = sessions.get(key);
    if (session) dropSession(key, session, 'DEVICE_REVOKED');
    return Boolean(session);
  }

  return Object.freeze({ attachDevice, callHealth, revokeDevice });
}
