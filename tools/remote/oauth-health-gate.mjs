/**
 * Fail-closed OAuth scope and owner boundary for the remote health-only MCP tool.
 * This module DOES NOT authenticate HTTP callers. Both contexts MUST come from
 * the official OAuthProvider-protected Cloudflare MCP handler, never request JSON.
 */
const allowedId = x => typeof x === 'string' && /^[a-zA-Z0-9._:-]{1,128}$/.test(x);
const record = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const expectedKeys = 'connected,desktopAccess,scope';
const okStatus = value => record(value) &&
  Object.keys(value).sort().join(',') === expectedKeys &&
  value.connected === true && value.desktopAccess === false &&
  value.scope === 'remote-health-only';

export class GatewayDenied extends Error {
  constructor(code) { super(code); this.name = 'GatewayDenied'; this.code = code; }
}
const deny = code => { throw new GatewayDenied(code); };

export async function forwardAuthorizedHealth({
  authContext, authInfo, deviceId, dispatch, signal
} = {}) {
  if (signal?.aborted) deny('CANCELLED');
  // Require identity from BOTH provider-backed paths; any absence or mismatch
  // is a hard reject. No claims from the MCP tool args are used as identity.
  const a = authContext?.props?.userId;
  const b = authInfo?.extra?.props?.userId;
  if (!allowedId(a) || !allowedId(b) || a !== b ||
      !Array.isArray(authInfo?.scopes) ||
      !authInfo.scopes.includes('remote.health') ||
      !allowedId(authInfo.clientId)) deny('PERMISSION_DENIED');
  if (!allowedId(deviceId)) deny('INVALID_DEVICE');
  if (typeof dispatch !== 'function') deny('DEVICE_UNAVAILABLE');
  if (signal?.aborted) deny('CANCELLED');
  let result;
  try {
    result = await dispatch({ ownerId: a, deviceId, signal });
  } catch { deny(signal?.aborted ? 'CANCELLED' : 'DEVICE_UNAVAILABLE'); }
  if (signal?.aborted) deny('CANCELLED');
  if (!okStatus(result)) deny('BAD_DEVICE_RESPONSE');
  return { connected: true, scope: 'remote-health-only', desktopAccess: false };
}

/** Return a bounded MCP error rather than leaking remote transport exception details. */
export async function handleHealthTool(input) {
  try {
    const status = await forwardAuthorizedHealth(input);
    return {
      content: [{ type: 'text', text: JSON.stringify(status) }],
      structuredContent: status
    };
  } catch (error) {
    const safe = error instanceof GatewayDenied ? error.code : 'INTERNAL_ERROR';
    return { isError: true, content: [{ type: 'text', text: safe }] };
  }
}
