# Configured single-device ticket bootstrap (health only)

Source/test slice; no deployment, credentials, vault edits, licensing issuance,
device process, pairing or ticket has been provisioned on an actual user's host.

## Trusted integration contract

`createConfiguredDeviceTicket` receives trusted deployment configuration:
`ownerId`, `deviceId`, dedicated random 32-byte `requestSecret`, a **different**
random 32-byte `ticketSecret`, `storage`, `approveInitialPairing` (default false),
and `checkEntitlement(ownerId, deviceId)`. That callback must return freshly
verified existing `remote.health` claims including actual `expiresAt`, or null.
Use `createConfiguredPreviewEntitlement(...).claims`, not decoded/unverified
payloads and not a boolean permission. No signing/issuance capability exists.

The external route must accept **only** bounded JSON POST `/device-ticket` with
exact fields `{v:1,timestamp,nonce,signature}`. No caller-supplied owner, device,
license, scope, permission or configuration is accepted. Enforce disabled/default
OFF, HTTPS, body bounds, method, no query/fragment and redacted errors in the
hosting Worker. Responses containing tickets require `Cache-Control: no-store`.
Never log request signatures, bootstrap secrets, tickets or raw bodies. This is
not an MCP tool and must not be advertised to models.

The trusted local connector creates requests via
`createDeviceTicketRequestProvider({ownerId,deviceId,requestSecret}).createRequest()`.
It uses actual cryptographic random 32-byte nonces and WebCrypto HMAC-SHA256.
There is no network, persistence or reconnection in this helper. The fixed
signed message is UTF-8 JSON of:

```text
["desktop-control-device-bootstrap-v1","POST","/device-ticket",ownerId,deviceId,timestamp,nonce]
```

Timestamp is epoch milliseconds; nonce and signature are unpadded base64url.
Signature is canonical and exactly 32 bytes. Verification uses WebCrypto
`subtle.verify`, not an application string comparison. Requests older than
60 seconds or more than 5 seconds ahead are refused, including after awaited
signature/entitlement checks.

## Atomic state and revocation

Use the same strongly consistent SQLite Durable Object storage as the existing
ticket authority. A storage transaction atomically consumes the request nonce
and admits a first pairing. Consumed rows:
`device-bootstrap-nonce:<nonce>` with `{expiresAt: timestamp + 60001}`. The host
alarm must prune **only expired** rows, in bounded batches. Never clear live
rows to make space; fail closed on storage/capacity errors. Alarm cleanup is an
integration requirement, not implemented by this pure module.

First pairing is created only when `approveInitialPairing === true` and valid
existing verified entitlement claims match the configured owner/device. Pairing
expiry is the existing licence expiry and revision uses real `randomUUID`.
Existing revoked, expired, malformed or mismatched records cannot be revived or
overwritten. Approved expiry is never extended by a later entitlement; a licence
shorter than the stored pairing is refused pending separately reviewed handling.

Existing `createDeviceTicketAuthority` issues actual signed single-use tickets
with at most 60-second expiry, additionally bounded by the pairing/licence expiry.
It rechecks pairing at issuance and at atomic ticket consumption. A failed
issuance does not make the bootstrap nonce replayable.

Entitlement verification and ticket issuance are not one cross-service atomic
transaction. Therefore the relay MUST independently verify authoritative licence
and pairing state again before accepting a device session and on every remote
health request/result. A ticket never grants filesystem/terminal/browser/desktop
access and must not bypass those live checks. Revocation or expiry must deny
operations even if a ticket was issued immediately before that change.

## Evidence scope

Eight focused Node tests exercise actual WebCrypto signatures and the existing
ticket authority, generated ephemeral keys, strict input/identity binding,
concurrent/restart replay, time windows, absent/revoked/expired entitlement,
explicit initial approval, no pairing revival/extension and actual ticket
revocation/one-use. Store concurrency is a serialized transactional test adapter;
real Durable Object route/concurrency and authenticated outbound WSS remain
separate integration gates. No fake entropy or production key is injected.
