/**
 * Experimental single-shard Durable Object relay for REMOTE HEALTH ONLY.
 * NOT a deployment-ready multi-user service.
 * This class can only receive /health requests from the internal Worker DO
 * binding; the externally routed Worker must expose /device ONLY.
 *
 * Adapted from Cloudflare's MIT-licensed Hibernation WebSocket example.
 * Pairings must be independently approved by a trusted human sign-in flow.
 */
import { DurableObject } from 'cloudflare:workers';
import { createDeviceTicketAuthority } from '../device-ticket.mjs';
import { createDurableTicketStore } from '../durable-ticket-store.mjs';
import { configuredPreviewOwner, isAllowedPreviewOwner } from '../preview-single-owner.mjs';
import { parseDeviceAuthenticate, parseHealthResponse, parseAuthorizedDeviceLookup } from '../remote-relay-protocol.mjs';
import { createConfiguredPreviewEntitlement } from '../configured-entitlement.mjs';
import { createConfiguredDeviceTicket } from '../configured-device-ticket.mjs';
import {readBoundedBody} from '../bounded-body.mjs';

export const PROBE_RELAY_SHARD = 'remote-health-probe-v1';

type Env = {
  DEVICE_TICKET_HMAC_KEY?: string;
  DEVICE_BOOTSTRAP_HMAC_KEY?: string;
  APPROVE_INITIAL_DEVICE_PAIRING?: string;
  ENABLE_REMOTE_HEALTH?: string;
  PREVIEW_SINGLE_USER?: string;
  PREVIEW_OWNER_ID?: string;
  PREVIEW_DEVICE_ID?: string;
  PREVIEW_LICENSE_TOKEN?: string;
  PREVIEW_LICENSE_ISSUER_KEY?: string;
};
type PendingAttachment = { phase: 'pending'; until: number; admitted: ReadyAttachment; ticketHash: string };
type ReadyAttachment = {
  phase: 'ready'; ownerId: string; deviceId: string;
  pairingRevision: string; until: number;
};
type Attachment = PendingAttachment | ReadyAttachment;
type PendingHealth = {
  ws: WebSocket; nonce: string;
  settle: (result?: unknown) => void;
  timeout: ReturnType<typeof setTimeout>;
};
const idPattern = /^[A-Za-z0-9._:-]{1,128}$/;
const validId = (v: unknown): v is string => typeof v === 'string' && idPattern.test(v);
const record = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);
const exact = (o: Record<string, unknown>, keys: string) =>
  Object.keys(o).sort().join(',') === keys;
const healthStatus = { connected: true, scope: 'remote-health-only', desktopAccess: false } as const;
const KEY_BYTES = 32;
const MAX_FRAME_BYTES = 4096;
const MAX_SOCKETS = 8;
const MAX_INFLIGHT = 4;

function secretBytes(value?: string): Uint8Array | null {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(value)) return null;
  try {
    const raw = atob(value.replace(/-/g, '+').replace(/_/g, '/') + '=');
    if (raw.length !== KEY_BYTES) return null;
    return Uint8Array.from(raw, c => c.charCodeAt(0));
  } catch { return null; }
}
function reject(status: number, message: string) {
  return new Response(message, {
    status,
    headers: { 'cache-control': 'no-store', 'content-type': 'text/plain;charset=utf-8' }
  });
}
function attachment(ws: WebSocket): Attachment | null {
  const a: unknown = ws.deserializeAttachment();
  if (!record(a)) return null;
  if (a.phase === 'pending' && Number.isSafeInteger(a.until)) {
    const admitted = a.admitted;
    if (!record(admitted) || admitted.phase !== 'ready' || !validId(admitted.ownerId) ||
        !validId(admitted.deviceId) || !validId(admitted.pairingRevision) || !Number.isSafeInteger(admitted.until) ||
        typeof a.ticketHash !== 'string' || !/^[a-f0-9]{64}$/.test(a.ticketHash)) return null;
    return {phase:'pending',until:a.until as number,admitted:admitted as ReadyAttachment,ticketHash:a.ticketHash};
  }
  if (a.phase === 'ready' && validId(a.ownerId) && validId(a.deviceId) &&
      validId(a.pairingRevision) && Number.isSafeInteger(a.until)) {
    return {
      phase: 'ready', ownerId: a.ownerId, deviceId: a.deviceId,
      pairingRevision: a.pairingRevision, until: a.until as number
    };
  }
  return null;
}
const paired = (p: unknown, a: ReadyAttachment) =>
  record(p) && p.status === 'approved' && p.ownerId === a.ownerId &&
  p.deviceId === a.deviceId && p.revision === a.pairingRevision &&
  Number.isSafeInteger(p.expiresAt) && (p.expiresAt as number) > Date.now();

export class RemoteHealthRelay extends DurableObject<Env> {
  private pending = new Map<string, PendingHealth>();
  private authority: ReturnType<typeof createDeviceTicketAuthority> | null = null;
  private entitlement: ReturnType<typeof createConfiguredPreviewEntitlement> | null = null;
  private bootstrap: ReturnType<typeof createConfiguredDeviceTicket> | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    if (configuredPreviewOwner(env) && validId(env.PREVIEW_DEVICE_ID) &&
        env.PREVIEW_LICENSE_TOKEN && env.PREVIEW_LICENSE_ISSUER_KEY) {
      this.entitlement = createConfiguredPreviewEntitlement({ storage: ctx.storage,
        ownerId: env.PREVIEW_OWNER_ID, deviceId: env.PREVIEW_DEVICE_ID,
        token: env.PREVIEW_LICENSE_TOKEN, publicKey: env.PREVIEW_LICENSE_ISSUER_KEY });
    }
    const key = secretBytes(env.DEVICE_TICKET_HMAC_KEY);
    if (key) {
      const store = createDurableTicketStore({ storage: ctx.storage });
      this.authority = createDeviceTicketAuthority({ secret: key, ...store });
      const requestKey = secretBytes(env.DEVICE_BOOTSTRAP_HMAC_KEY);
      if (requestKey && this.entitlement && validId(env.PREVIEW_OWNER_ID) && validId(env.PREVIEW_DEVICE_ID)) {
        try {
          this.bootstrap = createConfiguredDeviceTicket({ storage: ctx.storage,
            ownerId: env.PREVIEW_OWNER_ID, deviceId: env.PREVIEW_DEVICE_ID,
            requestSecret: requestKey, ticketSecret: key,
            approveInitialPairing: env.APPROVE_INITIAL_DEVICE_PAIRING === '1',
            checkEntitlement: (owner: string, device: string) => this.entitlement!.claims(owner, device) });
        } finally { requestKey.fill(0); }
      }
      key.fill(0);
    }
    // On hibernation, only safe owner/device/revision metadata are restored by
    // deserializeAttachment. No raw credentials or expired pending calls persist.
    for (const ws of ctx.getWebSockets()) {
      const a = attachment(ws);
      if (!a || a.until <= Date.now()) {
        try { ws.close(1008, 'Expired'); } catch {}
      }
    }
  }

  private enabled() {
    return this.env.ENABLE_REMOTE_HEALTH === '1' && this.authority !== null &&
      configuredPreviewOwner(this.env) !== null;
  }

  async fetch(request: Request): Promise<Response> {
    if (!this.enabled()) return reject(503, 'Remote disabled');
    const path = new URL(request.url).pathname;
    if (path === '/device') return this.upgrade(request);
    if (path === '/device-ticket') {
      if (!this.bootstrap || request.method !== 'POST' ||
          request.headers.get('content-type') !== 'application/json') return reject(403, 'Not permitted');
      if (Number(request.headers.get('content-length') ?? '0') > 1024) return reject(413, 'Request too large');
      try {
        const raw = await readBoundedBody(request);
        const result = await this.bootstrap.issue(JSON.parse(raw));
        await this.scheduleAlarm(Date.now() + 65_001);
        return Response.json(result, {headers:{'cache-control':'no-store'}});
      } catch { return reject(403, 'Not permitted'); }
    }
    if (path === '/health') return this.health(request);
    if (path === '/entitlement') {
      if (request.method !== 'POST') return reject(405, 'Method not allowed');
      // No identity is accepted from the MCP client here: the Worker passes the
      // verified OAuth subject and the deployment-bound single device.
      let body: unknown;
      try { body = await request.json(); } catch { return reject(400, 'Invalid request'); }
      const value = parseAuthorizedDeviceLookup(body);
      if (!value || !await this.entitled(value.ownerId, value.deviceId)) return reject(403, 'Not permitted');
      return Response.json({ entitled: true }, { headers: { 'cache-control': 'no-store' } });
    }
    return reject(404, 'Not found');
  }

  private async upgrade(request: Request): Promise<Response> {
    if (request.method !== 'GET' ||
        request.headers.get('Upgrade')?.toLowerCase() !== 'websocket')
      return reject(426, 'WebSocket required');
    // Authenticate before allocating any WebSocket slot. The one-use ticket is
    // sent in a TLS-protected protocol header, never a URL or reflected protocol.
    const protocols = (request.headers.get('Sec-WebSocket-Protocol') ?? '').split(',').map(x => x.trim());
    if (protocols.length !== 2 || protocols[0] !== 'desktop-control-health' ||
        !/^dt1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(protocols[1]) || protocols[1].length > 2048 || !this.authority)
      return reject(403, 'Not permitted');
    let admitted: ReadyAttachment;
    try {
      const verified = await this.authority.verifyDevice(protocols[1]);
      const pairing = await this.ctx.storage.get<{revision:string;expiresAt:number}>('pairing:'+verified.ownerId+':'+verified.deviceId);
      if (!pairing || !validId(pairing.revision)) return reject(403,'Not permitted');
      admitted = {phase:'ready',ownerId:verified.ownerId,deviceId:verified.deviceId,
        pairingRevision:pairing.revision,until:pairing.expiresAt};
      if (!await this.isPaired(admitted)) return reject(403,'Not permitted');
    } catch { return reject(403,'Not permitted'); }
    if (this.ctx.getWebSockets().length >= MAX_SOCKETS) return reject(429, 'Capacity exceeded');
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(protocols[1])));
    const ticketHash = [...digest].map(x=>x.toString(16).padStart(2,'0')).join('');
    // No await between this final capacity check and slot allocation.
    if (this.ctx.getWebSockets().length >= MAX_SOCKETS) return reject(429, 'Capacity exceeded');
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ phase: 'pending', until: Date.now() + 5_000, admitted, ticketHash } satisfies PendingAttachment);
    await this.scheduleAlarm(Date.now() + 5_000);
    return new Response(null, { status: 101, webSocket: client, headers:{'Sec-WebSocket-Protocol':'desktop-control-health'} });
  }

  private async isPaired(a: ReadyAttachment): Promise<boolean> {
    if (a.until <= Date.now() || !isAllowedPreviewOwner(a.ownerId, this.env)) return false;
    if (!await this.entitled(a.ownerId, a.deviceId)) return false;
    const p = await this.ctx.storage.get('pairing:' + a.ownerId + ':' + a.deviceId);
    return paired(p, a);
  }
  private async entitled(ownerId: string, deviceId: string): Promise<boolean> {
    return this.entitlement !== null && await this.entitlement.check(ownerId, deviceId);
  }

  private close(ws: WebSocket, code = 1008) {
    for (const [id, call] of this.pending) {
      if (call.ws === ws) {
        call.settle();
        this.pending.delete(id);
      }
    }
    try { ws.close(code, 'Not authorized'); } catch {}
  }

  private async authenticate(ws: WebSocket, frame: Record<string, unknown>, state: PendingAttachment) {
    const auth = parseDeviceAuthenticate(frame);
    if (Date.now() > state.until || !auth || !this.authority) {
      this.close(ws); return;
    }
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(auth.ticket)));
    const ticketHash = [...digest].map(x=>x.toString(16).padStart(2,'0')).join('');
    const authenticated = state.admitted;
    if (ticketHash !== state.ticketHash || authenticated.deviceId !== auth.deviceId) { this.close(ws); return; }
    if (!await this.isPaired(authenticated)) { this.close(ws); return; }
    for (const other of this.ctx.getWebSockets()) {
      if (other === ws) continue;
      const a = attachment(other);
      if (a?.phase === 'ready' && a.ownerId === authenticated.ownerId &&
          a.deviceId === authenticated.deviceId) this.close(other);
    }
    // The 60-second ticket is only for initial authentication. Once
    // consumed, the WSS session is bounded by approved pairing expiry
    // and checked for revocation on each privileged (health-only) event.
    ws.serializeAttachment(authenticated);
    ws.send(JSON.stringify({
      type: 'remote.device.ready', deviceId: authenticated.deviceId, challenge: auth.challenge
    }));
  }

  private async receiveHealth(ws: WebSocket, frame: Record<string, unknown>, state: ReadyAttachment) {
    if (!await this.isPaired(state)) { this.close(ws); return; }
    const validated = parseHealthResponse(frame);
    if (!validated) { this.close(ws); return; }
    const entry = this.pending.get(validated.id);
    if (!entry || entry.ws !== ws || entry.nonce !== validated.nonce) {
      // Unknown, stale and replayed responses are never accepted.
      return;
    }
    this.pending.delete(validated.id);
    entry.settle({ ...healthStatus });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (!this.enabled() || typeof message !== 'string' ||
        new TextEncoder().encode(message).byteLength > MAX_FRAME_BYTES) {
      this.close(ws); return;
    }
    let frame: unknown;
    try { frame = JSON.parse(message); } catch { this.close(ws); return; }
    if (!record(frame)) { this.close(ws); return; }
    const state = attachment(ws);
    if (state?.phase === 'pending') await this.authenticate(ws, frame, state);
    else if (state?.phase === 'ready') await this.receiveHealth(ws, frame, state);
    else this.close(ws);
  }

  private async health(request: Request): Promise<Response> {
    // ONLY callable through the internal Durable Object service binding.
    // The externally exposed Worker routes /mcp through OAuth and /device to
    // upgrade; it MUST NEVER proxy arbitrary /health requests.
    if (request.method !== 'POST' ||
        request.headers.get('content-type') !== 'application/json')
      return reject(405, 'Method not allowed');
    if (Number(request.headers.get('content-length') ?? '0') > 1024)
      return reject(413, 'Request too large');
    let body: unknown;
    try {
      const raw = await readBoundedBody(request);
      body = JSON.parse(raw);
    } catch { return reject(400, 'Invalid request'); }
    const lookup = parseAuthorizedDeviceLookup(body);
    if (!lookup) return reject(400, 'Invalid request');
    if (!isAllowedPreviewOwner(lookup.ownerId, this.env)) return reject(403, 'Not permitted');
    let ws: WebSocket | undefined;
    for (const sock of this.ctx.getWebSockets()) {
      const a = attachment(sock);
      if (a?.phase === 'ready' && a.ownerId === lookup.ownerId && a.deviceId === lookup.deviceId) {
        if (await this.isPaired(a)) { ws = sock; break; }
        this.close(sock);
      }
    }
    if (!ws) return reject(404, 'Device offline');
    const count = [...this.pending.values()].filter(x => x.ws === ws).length;
    if (count >= MAX_INFLIGHT) return reject(429, 'Busy');
    const id = crypto.randomUUID();
    const nonce = crypto.randomUUID();
    const answer = await new Promise<unknown>(resolve => {
      let settled = false;
      const settle = (result?: unknown) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        this.pending.delete(id);
        resolve(result);
      };
      const timeout = setTimeout(() => settle(), 4_000);
      this.pending.set(id, { ws: ws!, nonce, settle, timeout });
      try {
        ws!.send(JSON.stringify({
          type: 'remote.health.request', id, nonce,
          tool: 'desktop_control.remote_health', args: {}
        }));
      } catch { settle(); }
    });
    if (!answer) return reject(504, 'Device unavailable');
    return Response.json(answer, { headers: { 'cache-control': 'no-store' } });
  }

  async alarm(): Promise<void> {
    let next = Number.POSITIVE_INFINITY;
    for (const ws of this.ctx.getWebSockets()) {
      const a = attachment(ws);
      if (!a || a.until <= Date.now() || (a.phase === 'ready' && !await this.isPaired(a))) {
        this.close(ws);
      } else {
        next = Math.min(next, a.until);
      }
    }
    // Every health event revalidates durable revocation; idle sockets also
    // revalidate here. Never postpone an earlier pending-handshake deadline.
    // Bounded cleanup only after the full replay admission window. Never remove
    // live nonces or authoritative pairing/license rows.
    const nonces = await this.ctx.storage.list<{expiresAt:number}>({prefix:'device-bootstrap-nonce:', limit:256});
    for (const [key, value] of nonces) {
      if (Number.isSafeInteger(value?.expiresAt) && value.expiresAt <= Date.now()) await this.ctx.storage.delete(key);
      else next = Math.min(next, Date.now() + 30_000);
    }
    if (nonces.size === 256) next = Math.min(next, Date.now() + 30_000);
    const tickets = await this.ctx.storage.list<{expiresAt:number}>({prefix:'ticket:',limit:256});
    for (const [key,value] of tickets) {
      if (Number.isSafeInteger(value?.expiresAt) && value.expiresAt <= Date.now()) await this.ctx.storage.delete(key);
      else next = Math.min(next, Date.now()+30_000);
    }
    if (tickets.size === 256) next = Math.min(next,Date.now()+30_000);
    const reservations = await this.ctx.storage.list<{expiresAt:number}>({prefix:'device-bootstrap-pending-ticket:',limit:256});
    for (const [key,value] of reservations) {
      if (Number.isSafeInteger(value?.expiresAt) && value.expiresAt <= Date.now()) await this.ctx.storage.delete(key);
      else next = Math.min(next,Date.now()+30_000);
    }
    if (reservations.size === 256) next = Math.min(next,Date.now()+30_000);
    if (Number.isFinite(next)) await this.scheduleAlarm(Math.min(next, Date.now() + 30_000));
  }

  private async scheduleAlarm(deadline: number) {
    const previous = await this.ctx.storage.getAlarm();
    if (previous === null || previous > deadline) await this.ctx.storage.setAlarm(deadline);
  }

  webSocketClose(ws: WebSocket) { this.close(ws, 1000); }
  webSocketError(ws: WebSocket) { this.close(ws); }
}
