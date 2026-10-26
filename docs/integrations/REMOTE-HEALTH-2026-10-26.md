# Remote health integration — 2026-10-26

Owner-authorized continuation, not a new numbered session or a reset of previous
time records. Usage interruptions, including approximately12:51–17:20 local time,
are not verified active work. Local permissions evidence is separately recorded
on PR33 at84747d7 (Windows254/244pass/10skip, Linux254/229pass/25skip, exit0).

## Implemented, independently reviewed slices

GitHub sign-in uses explicit client consent, S256 PKCE on both OAuth legs,
immutable numeric owner mapping, fixed HTTPS endpoints, escaped non-frameable
HTML and browser-bound atomic one-use SQLite-DO transactions. Only remote.health
can be granted. GitHub tokens/profile data are not persisted or exposed to MCP.

Existing RSA3072 health entitlement is verified with WebCrypto RSA-PSS/SHA256,
explicit32-byte salt and authoritative one-seat revocation state. Actual workerd
exposed an incompatibility in Node's RSA-PSS compatibility API; the standard
WebCrypto verifier fixes it without changing trusted issuer or claim checks.
No second real license was issued or existing vault reinitialized.

Fixed-device bootstrap authenticates HMAC requests, timestamps and nonces,
atomically admitting at most8 outstanding tickets/reservations and64 live request
nonces. Revoked/expired pairings are never silently recreated. One-use tickets
are verified before WebSocket allocation; only a public protocol label is echoed.
Tickets travel in the TLS protocol header, never a URL; request/header logging
must remain disabled. Identity, pairing revision and live entitlement are checked
again before accepting a session and every health request/result.

Public ticket bodies are bounded incrementally at Worker edge and DO, with a
one-second deadline; OAuth POST bodies are bounded before SDK parsing. Expired
nonces, tickets and crash reservations are pruned in bounded batches. The final
socket-cap check and allocation contain no intervening await.

## Fresh evidence and limits

Nested pinned dependency installation and audit exit0, zero advisories. Integrated
Windows remote verify passed161 Node tests/0fail/0skip; actual workerd auth6 checks,
actual SQLite DO/WebSocket relay37 checks, HTTP deny5 and WSS deny5. Additional
auth-body/socket-cap changes were followed by affected actual-runtime rechecks.
The Windows integrated log SHA256 is
05390c3adae56ebdb61f44e7052ffa0c01ed5090e100413c7df0118662303573.
Pure ticket/device-store tests passed36/36 on Windows and actual Debian12.
Actual remote workerd Linux integration still requires a fresh run; loopback WS
does not prove hosted TLS, GitHub login, device persistence or ChatGPT access.

Independent read-only review found three resource/admission defects; the fixes
above were retested in actual workerd. The last review requested a final capacity
recheck after an awaited digest; this is now synchronous before allocation.
This is engineering evidence, not formal GitHub APPROVED or public certification.

## Account staging and next gate

The owner confirmed dedicated GitHub OAuth registration and scoped Cloudflare
CLI authorization. Client secret is DPAPI CurrentUser-protected in the existing
local vault and in the Auth Worker secret binding. Wrangler uses the Windows
keyring, not plaintext credentials. Existing trailing vault notes were preserved
inside JSON so secure readers can parse it; entitlement and secrets retained.

Two scripts and an EU OAuth KV namespace exist in the existing Free account,
with workers_dev=false, no routes, login=0/remote=0. Dedicated device keys and the
existing health-only entitlement/public issuer key were uploaded as secret
bindings. No private key was sent to Cloudflare. Personal resource identifiers,
live configurations and logs remain ignored local files.

Before activation: final integrated review/checkpoint, same-source Linux remote
matrix, disabled deployment recheck, real hosted OAuth/negative tests, explicit
single-device admission, actual outbound WSS health, then an actual normal
ChatGPT MCP call. No local file/terminal/browser/desktop forwarding is implemented
by this relay. Installed plugin remains preview.5 and normal ChatGPT exposed zero
tools in the observed test. Autonomous Bridge updater and a new plugin release
are not accepted or activated by this work. Runtime PRs remain draft.

Free-tier quotas may cause denial of availability; no paid upgrade is authorized.
See [Worker limits](https://developers.cloudflare.com/workers/platform/limits/)
and [Durable Object pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/).
Only SQLite DOs are used. Do not interpret a Free allowance as unlimited capacity.
