/**
 * Portable protocol validation for the experimental remote health-only relay.
 * No network I/O, secrets, permissions, account approval or OS operations.
 */
const pattern = /^[A-Za-z0-9._:-]{1,128}$/;
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const sameKeys = (obj, keys) => Object.keys(obj).sort().join(',') === keys;
const validId = value => typeof value === 'string' && pattern.test(value);
const STATUS = Object.freeze({ connected: true, scope: 'remote-health-only', desktopAccess: false });

export function parseDeviceAuthenticate(frame) {
  if (!isRecord(frame) || !sameKeys(frame, 'challenge,deviceId,ticket,type') ||
      frame.type !== 'remote.device.authenticate' ||
      !validId(frame.deviceId) || !validId(frame.challenge) ||
      typeof frame.ticket !== 'string' || frame.ticket.length < 32 ||
      frame.ticket.length > 2048 || !/^[A-Za-z0-9._-]+$/.test(frame.ticket)) return null;
  return { deviceId: frame.deviceId, challenge: frame.challenge, ticket: frame.ticket };
}

export function parseHealthResponse(frame) {
  if (!isRecord(frame) || !sameKeys(frame, 'id,nonce,result,type') ||
      frame.type !== 'remote.health.response' ||
      !validId(frame.id) || !validId(frame.nonce) || !isRecord(frame.result) ||
      !sameKeys(frame.result, 'connected,desktopAccess,scope') ||
      frame.result.connected !== true ||
      frame.result.desktopAccess !== false ||
      frame.result.scope !== 'remote-health-only') return null;
  return { id: frame.id, nonce: frame.nonce, result: { ...STATUS } };
}

export function parseAuthorizedDeviceLookup(body) {
  // The ownerId is trusted ONLY when supplied by the protected MCP Worker
  // using a private Durable Object binding, never by a public URL/JSON endpoint.
  if (!isRecord(body) || !sameKeys(body, 'deviceId,ownerId') ||
      !validId(body.ownerId) || !validId(body.deviceId)) return null;
  return { ownerId: body.ownerId, deviceId: body.deviceId };
}
