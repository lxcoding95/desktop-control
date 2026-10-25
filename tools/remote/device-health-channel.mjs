/**
 * Device-side message filter for an ALREADY authenticated outbound channel.
 * No sockets are opened. No OS privileges, MCP tools, files or subprocesses.
 * Bound by caller only after pairing and authenticated TLS connection.
 */
const TOOL = 'desktop_control.remote_health';
const RESPONSE = Object.freeze({ connected: true, scope: 'remote-health-only', desktopAccess: false });
const isRecord = item => item !== null && typeof item === 'object' && !Array.isArray(item);
const validId = item => typeof item === 'string' && /^[a-zA-Z0-9._:-]{1,128}$/.test(item);

export function createDeviceHealthChannel({ send } = {}) {
  if (typeof send !== 'function') throw new TypeError('Bound authenticated channel sender required');
  const seen = new Set();
  let stopped = false;
  return Object.freeze({
    async receive(message) {
      if (stopped || !isRecord(message) || message.type !== 'remote.health.request' ||
          message.tool !== TOOL || !validId(message.id) || !validId(message.nonce) ||
          !isRecord(message.args) || Object.keys(message.args).length !== 0) return false;
      if (Object.keys(message).sort().join(',') !== 'args,id,nonce,tool,type') return false;
      let bytes;
      try { bytes = new TextEncoder().encode(JSON.stringify(message)).byteLength; } catch { return false; }
      if (bytes > 4096 || seen.has(message.nonce)) return false;
      // Bounded replay filter; session must have short lifetime and new channel
      // must be authenticated again. Server also binds pending request IDs.
      if (seen.size >= 256) return false;
      seen.add(message.nonce);
      try {
        await send({ type: 'remote.health.response', id: message.id, nonce: message.nonce, result: { ...RESPONSE } });
        return true;
      } catch { return false; }
    },
    stop() { stopped = true; seen.clear(); }
  });
}
