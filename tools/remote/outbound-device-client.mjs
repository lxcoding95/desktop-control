/**
 * Outbound Windows/Linux device-side WSS transport, health-only prototype.
 * This code does not issue credentials, approve device pairing, execute OS
 * commands, or open a listener. No automatic reconnect or token persistence.
 * A genuine server MUST authenticate the one-use ticket and bind it to the
 * expected device before sending remote.device.ready.
 */
import { createDeviceHealthChannel } from './device-health-channel.mjs';

const validId = x => typeof x === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(x);
const isRecord = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const MAX_FRAME = 4096;

export class OutboundDeviceError extends Error {
  constructor(code) { super(code); this.code = code; this.name = 'OutboundDeviceError'; }
}
const fail = code => { throw new OutboundDeviceError(code); };

/** URL must be separately supplied via locally trusted configuration. */
export function validateWssEndpoint(endpoint, expectedHost) {
  if (typeof expectedHost !== 'string' ||
      !/^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.workers\.dev$/i.test(expectedHost)) {
    fail('INVALID_HOST');
  }
  let u;
  try { u = new URL(endpoint); } catch { fail('INVALID_URL'); }
  if (u.protocol !== 'wss:' || u.hostname !== expectedHost.toLowerCase() ||
      u.username || u.password || u.port || u.search || u.hash || u.pathname !== '/device') {
    fail('INVALID_URL');
  }
  return u.href;
}

export function createOutboundHealthClient({
  endpoint, expectedHost, deviceId, ticketProvider,
  WebSocketCtor = globalThis.WebSocket,
  makeChallenge = () => crypto.randomUUID(),
  connectTimeoutMs = 5000
} = {}) {
  const url = validateWssEndpoint(endpoint, expectedHost);
  if (!validId(deviceId) || typeof ticketProvider !== 'function' ||
      typeof WebSocketCtor !== 'function' ||
      typeof makeChallenge !== 'function' ||
      !Number.isSafeInteger(connectTimeoutMs) || connectTimeoutMs < 1 || connectTimeoutMs > 10000) {
    fail('INVALID_CONFIG');
  }
  let socket;
  let state = 'idle';
  let localChannel;
  let connectPromise;
  let cancelConnect;
  const closeSocket = () => { try { socket?.close(1000, 'stopped'); } catch {} };
  const stop = () => {
    if (state === 'stopped') return;
    state = 'stopped';
    localChannel?.stop();
    closeSocket();
    cancelConnect?.(new OutboundDeviceError('STOPPED'));
  };

  async function connect() {
    if (state !== 'idle') fail('ALREADY_STARTED');
    state = 'pairing';
    let ticket;
    try { ticket = await ticketProvider(); } catch { state = 'stopped'; fail('TICKET_UNAVAILABLE'); }
    if (state === 'stopped') fail('STOPPED');
    if (typeof ticket !== 'string' || ticket.length < 32 || ticket.length > 2048 ||
        !/^[A-Za-z0-9._-]+$/.test(ticket)) { state = 'stopped'; fail('INVALID_TICKET'); }
    const challenge = makeChallenge();
    if (!validId(challenge)) { state = 'stopped'; fail('INVALID_CHALLENGE'); }
    state = 'connecting';
    try { socket = new WebSocketCtor(url, ['desktop-control-health', ticket]); }
    catch { state = 'stopped'; fail('CONNECTION_FAILED'); }

    connectPromise = new Promise((resolve, reject) => {
      let settled = false;
      let timer;
      const failConnection = code => {
        localChannel?.stop();
        state = 'stopped';
        closeSocket();
        finish(new OutboundDeviceError(code));
      };
      const finish = error => {
        if (settled) return;
        settled = true;
        cancelConnect = undefined;
        clearTimeout(timer);
        if (error) reject(error);
        else resolve({connected:true,scope:'remote-health-only',desktopAccess:false});
      };
      cancelConnect = finish;
      timer = setTimeout(() => failConnection('TIMEOUT'), connectTimeoutMs);
      socket.addEventListener('open', () => {
        if (state !== 'connecting') return;
        state = 'authenticating';
        try {
          socket.send(JSON.stringify({type:'remote.device.authenticate', ticket, deviceId, challenge}));
        } catch { failConnection('CONNECTION_FAILED'); }
        // No intentional ticket reuse or persistence after first transmit.
        ticket = undefined;
      });
      socket.addEventListener('message', event => {
        if (state !== 'authenticating' && state !== 'ready') return;
        if (typeof event.data !== 'string' ||
            new TextEncoder().encode(event.data).length > MAX_FRAME) {
          failConnection('INVALID_MESSAGE'); return;
        }
        let frame;
        try { frame = JSON.parse(event.data); } catch { failConnection('INVALID_MESSAGE'); return; }
        if (!isRecord(frame)) { failConnection('INVALID_MESSAGE'); return; }
        if (state === 'authenticating') {
          if (frame.type !== 'remote.device.ready' || frame.challenge !== challenge ||
              frame.deviceId !== deviceId || Object.keys(frame).sort().join(',') !== 'challenge,deviceId,type') {
            failConnection('UNAUTHORIZED'); return;
          }
          localChannel = createDeviceHealthChannel({send: message => {
            if (state !== 'ready') throw new Error('Disconnected');
            socket.send(JSON.stringify(message));
          }});
          state = 'ready';
          finish();
          return;
        }
        if (frame.type === 'remote.health.request') {
          void Promise.resolve(localChannel.receive(frame)).catch(() => {
            failConnection('INVALID_MESSAGE');
          });
          return;
        }
        // Unexpected commands must never become desktop/terminal operations.
        failConnection('TOOL_NOT_ALLOWED');
      });
      socket.addEventListener('error', () => {
        if (state !== 'stopped') failConnection('CONNECTION_FAILED');
      });
      socket.addEventListener('close', () => {
        localChannel?.stop();
        if (state === 'stopped') return;
        state = 'stopped';
        finish(new OutboundDeviceError('CONNECTION_CLOSED'));
      });
    });
    return connectPromise;
  }
  return Object.freeze({connect,stop,getState:()=>state});
}
