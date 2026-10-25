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

export const PROBE_RELAY_SHARD = 'remote-health-probe-v1';

type Env = {
  DEVICE_TICKET_HMAC_KEY?: string;
  ENABLE_REMOTE_HEALTH?: string;
};
type PendingAttachment = { phase: 'pending'; until: number };
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
    return { phase: 'pending', until: a.until as number };
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

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    const key = secretBytes(env.DEVICE_TICKET_HMAC_KEY);
    if (key) {
      const store = createDurableTicketStore({ storage: ctx.storage });
      this.authority = createDeviceTicketAuthority({ secret: key, ...store });
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
    return this.env.ENABLE_REMOTE_HEALTH === '1' && this.authority !== null;
  }

  async fetch(request: Request): Promise<Response> {
    if (!this.enabled()) return reject(503, 'Remote disabled');
    const path = new URL(request.url).pathname;
    if (path === '/device') return this.upgrade(request);
    if (path === '/health') return this.health(request);
    return reject(404, 'Not found');
  }

  private async upgrade(request: Request): Promise<Response> {
    if (request.method !== 'GET' ||
        request.headers.get('Upgrade')?.toLowerCase() !== 'websocket')
      return reject(426, 'WebSocket required');
    if (this.ctx.getWebSockets().length >= MAX_SOCKETS) return reject(429, 'Capacity exceeded');
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ phase: 'pending', until: Date.now() + 5_000 } satisfies PendingAttachment);
    await this.ctx.storage.setAlarm(Date.now() + 5_500);
    return new Response(null, { status: 101, webSocket: client });
  }

  private async isPaired(a: ReadyAttachment): Promise<boolean> {
    if (a.until <= Date.now()) return false;
    const p = await this.ctx.storage.get('pairing:' + a.ownerId + ':' + a.deviceId);
    return paired(p, a);
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
    if (Date.now() > state.until || !exact(frame, 'challenge,deviceId,ticket,type') ||
        frame.type !== 'remote.device.authenticate' || !validId(frame.deviceId) ||
        !validId(frame.challenge) || typeof frame.ticket !== 'string' ||
        frame.ticket.length > 2048 || !this.authority) {
      this.close(ws); return;
    }
    let verified: {ownerId: string;deviceId: string;expiresAt: number};
    try { verified = await this.authority.verifyDevice(frame.ticket); }
    catch { this.close(ws); return; }
    if (verified.deviceId !== frame.deviceId) { this.close(ws); return; }
    const pair = await this.ctx.storage.get(
      'pairing:' + verified.ownerId + ':' + verified.deviceId
    );
    if (!record(pair) || !validId(pair.revision)) { this.close(ws); return; }
    const authenticated: ReadyAttachment = {
      phase: 'ready', ownerId: verified.ownerId, deviceId: verified.deviceId,
      pairingRevision: pair.revision, until: pair.expiresAt as number
    };
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
      type: 'remote.device.ready', deviceId: verified.deviceId, challenge: frame.challenge
    }));
  }

  private async receiveHealth(ws: WebSocket, frame: Record<string, unknown>, state: ReadyAttachment) {
    if (!await this.isPaired(state)) { this.close(ws); return; }
    if (!exact(frame, 'id,nonce,result,type') ||
        frame.type !== 'remote.health.response' ||
        !validId(frame.id) || !validId(frame.nonce) || !record(frame.result)) {
      this.close(ws); return;
    }
    const result = frame.result;
    if (!exact(result, 'connected,desktopAccess,scope') ||
        result.connected !== true || result.desktopAccess !== false ||
        result.scope !== 'remote-health-only') {
      this.close(ws); return;
    }
    const entry = this.pending.get(frame.id);
    if (!entry || entry.ws !== ws || entry.nonce !== frame.nonce) {
      // Unknown, stale and replayed responses are never accepted.
      return;
    }
    this.pending.delete(frame.id);
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
      const raw = await request.text();
      if (raw.length > 1024) return reject(413, 'Request too large');
      body = JSON.parse(raw);
    } catch { return reject(400, 'Invalid request'); }
    if (!record(body) || !exact(body, 'deviceId,ownerId') ||
        !validId(body.ownerId) || !validId(body.deviceId))
      return reject(400, 'Invalid request');
    let ws: WebSocket | undefined;
    for (const sock of this.ctx.getWebSockets()) {
      const a = attachment(sock);
      if (a?.phase === 'ready' && a.ownerId === body.ownerId && a.deviceId === body.deviceId) {
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
    for (const ws of this.ctx.getWebSockets()) {
      const a = attachment(ws);
      if (!a || a.until <= Date.now()) this.close(ws);
    }
    // Revalidation of ready sessions is essential to expire revoked pairings
    // even if no user requests arrive. Free-plan idle cost is a consideration.
    if (this.ctx.getWebSockets().length)
      await this.ctx.storage.setAlarm(Date.now() + 30_000);
  }

  webSocketClose(ws: WebSocket) { this.close(ws, 1000); }
  webSocketError(ws: WebSocket) { this.close(ws); }
}
