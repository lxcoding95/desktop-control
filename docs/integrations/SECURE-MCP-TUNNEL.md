# Remote MCP transport — experimental, default OFF (free-tier only)

Scope: **transport smoke-test only**. No real remote desktop access, no public deployment, no grants, and no automatic update.

## Decision — updated 2026-10-25 after owner cost constraint

**Do not require an OpenAI Platform API key, paid tunnel, domain purchase, or subscription.** The previously investigated `openai/tunnel-client` is a reference only, not the selected deployment path. No tunnel-client installation or keys are necessary for the current local tests.

Desktop Commander demonstrates the relevant architecture: a local MIT-licensed device agent paired through OAuth Device Authorization / PKCE to a separately hosted Remote MCP server. Its documented free hosted tier allows 10,000 tool calls per month for *Desktop Commander itself*, not third-party Desktop Control devices. The hosted server's implementation is proprietary; do not assume it can be reused, pointed at our tools, or copied.

Verified upstream:
- https://github.com/wonderwhy-er/DesktopCommanderMCP/tree/main/src/remote-device (local MIT code)
- https://github.com/wonderwhy-er/DesktopCommanderMCP/blob/main/src/remote-device/README.md
- https://github.com/desktop-commander/remote-desktop-commander (public manifests/docs; hosted relay source unavailable)
- https://desktopcommander.app/pricing/

**Preferred candidate for a zero-billed prototype (not deployed):** Cloudflare Workers **Free**, its included `.workers.dev` HTTPS hostname, plus **SQLite-backed Durable Objects** for authenticated device sessions/coordination. Current Free quotas are enforced with errors rather than automatic paid overages; confirm account selection and current terms before deployment. This still requires the owner's explicit creation of a free Cloudflare account and authorization of publishing an HTTPS endpoint. Never enable a paid plan, paid add-on, billing upgrade or automatic overage. GitHub OAuth is an option for human sign-in (not a ChatGPT/OpenAI API key) but requires its own registered OAuth application and strict account/device binding.

Relevant reusable OSS:
- https://github.com/cloudflare/agents/tree/main/examples/mcp-server (MCP Streamable HTTP)
- https://github.com/cloudflare/agents/tree/main/examples/mcp-worker-authenticated (authenticated MCP)
- https://github.com/cloudflare/agents/blob/main/docs/agents/securing-mcp-servers.md (OAuth security)
- https://developers.cloudflare.com/durable-objects/platform/pricing/ (Free-plan limits)

Required components before any remote device tools: HTTPS Streamable HTTP connector for ChatGPT, OAuth 2.1 with PKCE, separate device pairing, outbound authenticated WebSocket/device connection, explicit account/device routing, request IDs and bounded timeouts, replay protection, audit, revoke, fail-closed local capabilities, and an immediate emergency stop. The single-tool health-only probe remains the first end-to-end test. Never publish or forward the production `preview.5/start.mjs` with 34 tools merely because a transport connects.

OpenAI Platform tunnels were evaluated but rejected for the project's zero-paid-service constraint. The remaining sections cover only the selected free-tier candidate and local tests.

## First slice: read-only connection probe

`tools/remote/health-server.mjs` is a separate stdio MCP process exposing **only** `desktop_control.remote_health`. Its static response has `connected: true`, `scope: remote-health-only`, and `desktopAccess: false`. It performs no filesystem, terminal, browser, device or permission operation and does not inspect tokens or local user information. The tool list excludes the existing 34 privileged tools. All other tool calls are rejected.

This proves transport only, **not remote identity or remote desktop authorization**.

### Local test

```powershell
node --test tools/remote/health-server.test.mjs
```

Linux sandbox Node 22.16.0: 8/8 tests passed. Owner-provided clean Windows PowerShell output on 2026-10-25: 8/8 tests passed, exit 0. This is local stdio evidence only; remote ChatGPT end-to-end remains untested.

## Operator-only free-tier remote test (NOT performed)

Before any public endpoint: the owner must explicitly select a **Cloudflare Workers Free** account. Verify current plan shows **Free** without adding any paid subscription, credit-card commitment, overage or paid add-on. Using the included `.workers.dev` hostname needs no domain purchase. A free-tier project is still internet-facing and requires comprehensive security review before even deploying the one-tool test.

1. Develop the relay independently: authenticated OAuth 2.1 Streamable HTTP endpoint for ChatGPT and one outgoing authenticated Windows device connection; bind both to the same approved account/device; fail closed. Do not reuse the Desktop Commander hosted endpoint.
2. Validate OAuth, device pairing, token revocation, replay/CSRF/SSRF defenses, expiry, rate limits, request deadlines and per-user isolation locally with positive and negative tests. No model tool can issue its own local grants.
3. Once security checks and free-plan eligibility pass, deploy ONLY the static `desktop_control.remote_health` probe to the approved Free account. ChatGPT must see just this tool, returning `desktopAccess: false`.
4. Test account/device disconnect, revoked authorization, device offline, and different-account denial. Then consider a separate reviewed remote permissions model for the existing local tool implementations.
5. A Free provider may change its limits or suspend exhausted requests; **free-tier eligibility is not a guarantee of permanent availability**. Treat limit exhaustion as unavailable rather than silently upgrading.

**No OpenAI Platform API key, no OpenAI Platform tunnel, no paid services, no auto-created cloud accounts, and no public exposure are authorized by the current implementation.** An OAuth client registration and ordinary free-host account authentication may eventually be necessary; keep their private credentials exclusively in supported secret stores, never in the repository, shell history or conversation. There is currently no live ChatGPT remote endpoint.

## Future full-tool gates — NOT IMPLEMENTED

Do **not** point the tunnel at `preview.5/start.mjs` yet. The local policy in preview.5 identifies the local Windows principal; it does **not** independently verify the remote ChatGPT identity. Real remote tool access requires authenticated per-device and per-user identity bound to local policy, user-verifiable pairing, per-capability and per-origin grants, cancellation and replay safety, bounded outputs and concurrency, audit without secrets, immediate revoke/Not-Aus, and fresh confirmation of critical account/system actions. Deny remote input or shell actions by default; never share the original local grant merely because the tunnel is authenticated.

Existing plugin `preview.5`, local MCP registration, Docker profiles and rollback package remain untouched. Protected `main` must not be merged until code review, Windows/Linux tests, supply-chain/security verification and the relevant release gates pass.

## MCP Inspector — local automated checks

The project's existing, exactly pinned `@modelcontextprotocol/inspector@2.12.0` development dependency is reused. No dynamic `@latest`, added service or public listener is required for CLI checks. Upstream: https://github.com/modelcontextprotocol/inspector and https://modelcontextprotocol.io/docs/2026-07-28/tools/inspector/cli . Its upstream LICENSE contains MIT/Apache-2.0 transition notices: preserve the third-party inventory and do not copy its sources into this project.

On a **clean, ordinary-user** checkout after `npm ci --ignore-scripts`:

```powershell
npm run test:remote
npm run inspect:remote
npm run inspect:remote:health
```

`test:remote` is included in the repository `npm run verify` sequence. The two Inspector scripts start a fresh, standalone **health-only** server for each invocation, using `npx --no-install`, so npm cannot silently fetch an unreviewed latest Inspector. `inspect:remote` uses strict schema validation; `inspect:remote:health` calls only the harmless connectivity tool. Both require an installed local `node_modules`. They do **not** connect to ChatGPT or prove remote authentication. Exact Inspector CLI exit codes must be checked; failed checks are not approvals.

The Inspector's graphical Web UI is intentionally **not** started automatically. Its proxy/admin token and local HTTP endpoints must be restricted to loopback. Never open Inspector proxy ports to the LAN or internet, never paste tokens in chat/logs, and never point unattended Inspector smoke checks at the production 34-tool server. Browser/TUI inspection may be started manually for debugging with explicit local permission.

If tunnel-client becomes available and operator authorizes a tunnel, run its separate health/doctor checks, then use Inspector only where transport and authentication support it. A successful local MCP Inspector result cannot make a cloud ChatGPT session accept a local STDIO server.


## Account-bound relay core — implemented locally, NOT publicly deployed

The dependency-free `tools/remote/relay-core.mjs` is an **in-memory transport policy core**, not an OAuth provider, Cloudflare Worker, Durable Object, or public MCP handler. It can be instantiated only with explicit `verifyClient` and `verifyDevice` callbacks. Those callbacks MUST be implemented against validated OAuth access tokens and a durable, individually paired device-ticket store before this core can be used in a remotely accessible service; accepting client-provided owner IDs as verified identities would be a critical vulnerability.

The API `attachDevice({ticket,send})` binds one locally approved device connection to its owner, and `callHealth({credential,deviceId,signal})` forwards **only** `desktop_control.remote_health`. Owner isolation, hardcoded allowed tool, strict empty arguments, expiry, per-request nonce, response correlation to the original session, replay rejection, strict/size-limited response parsing, maximum four in-flight requests, bounded five-second timeouts, cancellation and live connection replacement/revoke are implemented. `revokeDevice` requires `devices.revoke` authorization and only interrupts live sessions: **durable credential/ticket revocation is not implemented** and must be enforced by the backing authorization service. Authentication adapters and tests contain no real tokens or external calls.

```powershell
npm run test:remote:relay
```

Test evidence: Node.js 22.16.0 Linux sandbox: **16/16 pass** for authentication adapter enforcement, device/account isolation, unallowed tools, expired credentials, nonce/replay, untrusted responses, limits, disconnect/replace, scope-gated revoke, abort and timeout. Windows results are **pending**. The suite is wired to `npm run verify` on the PR branch; no assertion of full verify or CI success.

**Remaining blockers before a working ChatGPT cloud connection:** approved Free hosting account and deployment permission; upstream OAuth library and a stable user sign-in; an OAuth-approved device enrollment flow with local user interaction, proof of possession and durable revocation; authenticator/transport adapters for Cloudflare Workers/Durable Objects; an outbound Windows device channel; an HTTPS MCP Streamable HTTP route compatible with the 2026-07-28 protocol; user-facing ChatGPT custom MCP connection and end-to-end tests. The latest MCP transport spec requires header/body method metadata parity and Origin restrictions: https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2026-07-28/basic/transports/streamable-http.mdx . Prefer Cloudflare's current `createMcpHandler` and `OAuthProvider` implementations over custom token issuance or inventing the latest MCP transport: https://developers.cloudflare.com/agents/model-context-protocol/guides/remote-mcp-server/ .

A successful local test is not proof of public internet exposure, ChatGPT connection, or remote permissions. `main`, the installed `preview.5`, and the Windows app remain unchanged. **No development session ledger was advanced.**


## Device-side health filter — implemented locally, not a network client

The new `tools/remote/device-health-channel.mjs` is a deny-by-default **message filter** for a future independently authenticated outbound TLS device WebSocket. It DOES NOT open a socket, log in, register a device, expose a local Windows process, or invoke the 34 privileged local MCP tools. Only a strict `remote.health.request` with no arguments and a bounded ID/nonce yields the static `remote.health.response`. Replay within the device session, unexpected fields/tools, oversized payloads and stopped sessions fail closed.

```powershell
npm run test:remote:device
npm run test:remote:integration
```

The second command tests the relay and device together with **mock** identity verifiers and a simulated in-memory channel: Node.js 22.16.0 sandbox **24/24 tests passed** (16 relay + 8 device, including one request/response integration). Windows run is still pending. This is explicitly **NOT** real OAuth, TLS, a WebSocket connection, a Cloudflare deployment, or a ChatGPT cloud end-to-end result.

Implementation boundary: The authenticated Cloudflare Streamable HTTP MCP endpoint, production OAuth provider, persistent device pairing/revocation and real outbound Windows WebSocket client are still missing. Do not publish the mock verifiers from test files as a production authentication mechanism. The only acceptable public test may return the static `remote-health-only` result after real account/device auth. Existing local permissions remain entirely separate.


## Cryptographic single-use device tickets — implemented, NOT wired to cloud

`tools/remote/device-ticket.mjs` is a provider-independent HMAC-SHA256 device ticket authority built on WebCrypto (Node.js and Cloudflare Workers-compatible). No extra runtime packages. A ticket can only be **issued after** a trusted `verifyEnrollment` callback finds a separately approved owner/device enrollment. The HMAC key MUST be at least 32 unpredictable bytes provided through a non-repository secrets system; it is not stored or emitted by the module. Signed tokens are valid for at most **60 seconds**.

A successful `verifyDevice` requires authentic MAC, strict structured claims (owner/device/expiry/jti), current expiry, and an **atomic one-time** `consumeIssued` callback that confirms the registered owner/device binding and current pairing/revocation status. The trusted `recordIssued`, `verifyEnrollment`, and `consumeIssued` adapters are mandatory, fail closed on errors, and cannot be faked by values supplied by a model or remote client. This module contains no account creation, OAuth, remote WebSocket, or permission grant. A real database implementation must use transactions/consistent per-device Durable Object storage and restrict issuance to an explicit real-user-approved pairing flow.

Run the pinned test on a working checkout:

```powershell
npm run test:remote:ticket
```

**Evidence**: Node v22.16.0 Linux sandbox: 12/12 tests passed for HMAC signature, tampering, short/long/malformed tickets, missing approval, expiry, one-time use/concurrent double consume, cross-secret denial, revoke and storage errors. Windows ordinary-user test performed by the owner on 2026-10-25 at commit `416f9ef686c6c12f20661fde597f500f9e0b63c3`: **12/12 PASS, 0 failures, `TEST_EXIT=0`**. Existing `preview.5` local permission store and 34 privileged MCP tools are not connected to the remote ticket authority. No cloud endpoint is deployed.

### Next controlled implementation step

Connect `verifyEnrollment` / issued-ticket store / atomic consume callbacks to a reviewed SQLite-backed Durable Object, using Cloudflare's official `OAuthProvider` and `createMcpHandler` for the actual public Streamable HTTP MCP endpoint. The local Windows process must obtain the ticket through an approved user-interactive device flow, then initiate an outbound authenticated `wss://` connection. Verify owner/client scopes at both ingress and dispatch; never trust user-supplied ownerIds in JSON. If a Free-tier account and authenticated endpoint cannot be verified, remain default-off.

Current upstream: https://github.com/cloudflare/agents/blob/main/docs/agents/mcp-servers.md (SDK v2 stateless handler), https://github.com/cloudflare/agents/blob/main/docs/agents/securing-mcp-servers.md (OAuthProvider), https://developers.cloudflare.com/durable-objects/best-practices/websockets/ (hibernating WebSockets), and https://developers.cloudflare.com/workers/platform/limits/ (Free quotas).


## Split-Worker HTTPS MCP candidate — implemented as default-off source (2026-10-25)

New files under `tools/remote/cloudflare/` implement the **current October 2026** Cloudflare OAuth split architecture from MIT upstream, rather than its obsolete demo static identity flow:
- `auth-worker.ts`: `OAuthAuthorizationServer`, but **/authorize explicitly denies** all enrollment until a reviewed interactive account sign-in exists. Never trust client-provided account/user claims or provision a demo identity.
- `mcp-worker.ts`: `OAuthResourceServer` validates a bearer token via Service Binding, and `createMcpHandler` from `agents/mcp/server` provides stateless Streamable HTTP for the **only** exposed remote health tool. It validates owner matching and `remote.health` scope, returning `DEVICE_UNAVAILABLE` until the actual paired relay backend is ready.
- `oauth-health-gate.mjs`: strict authenticated owner/device authorization and bounded, non-identifying tool result, backed by `oauth-health-gate.test.mjs` negative cases.
- Exactly version-pinned dependencies in an isolated `cloudflare/package.json`, independent of local plugin `preview.5`. The `wrangler.*.example.jsonc` templates disable `workers_dev`, have **no routes** and do not bind a real Durable Object.

Tests: `npm run test:remote:oauth-gate` added to the root `verify` command; **Windows/Linux execution and Workers typecheck are pending** as of this commit. Current package has no lockfile and has not passed a supply-chain audit; no Cloudflare account/deployment is connected. Compilation, OAuth provider integration, HTTP Inspector and ChatGPT end-to-end still require independent verification. See [cloudflare/README.md](../../tools/remote/cloudflare/README.md).

Next: Windows gate tests and isolated npm typecheck, then implement free-tier SQLite Durable Object durable pairing + live outbound device WebSocket, add real user authentication/consent without hardcoded identities. Do not enable Worker URL or `ENABLE_REMOTE_HEALTH` before the relevant gates. There is **no live remote ChatGPT connection yet**.

## Durable ticket storage adapter — current implementation, unverified on Windows

`tools/remote/durable-ticket-store.mjs` now provides transactional callbacks for the existing signed device-ticket authority. It reads **only** previously approved, unexpired pairing records, refuses to issue tickets against absent/pending/revoked pairings, and uses an atomic Durable Object `storage.transaction()` for recording and consuming tickets. The ticket record is bound to owner, device, expiration and pairing **revision**. Revocation or rotation before consumption invalidates an issued ticket; concurrent reuse cannot succeed if the backing transaction is actually atomic.

`tools/remote/durable-ticket-store.test.mjs` exercises 12 positive and negative cases, including missing approval, cross-account separation, one-time consumption, concurrent double-claim, stale consent revision and storage failure. The script `npm run test:remote:durable` has been registered in `npm run verify`. **This new test suite has not yet been executed on the owner's Windows system and the full verify pipeline has not been run.** The in-memory transactional fake is test-only; production requires a real SQLite-backed Durable Object.

The adapter **cannot create or approve** pairings. A separate human-verified login/consent flow must supply persistent approval records; do not accept a model/client-provided `ownerId` as proof of authorization. There is no deployed OAuth endpoint or live WebSocket channel. Code stays default-off pending security review and actual Windows compilation and tests.


## Outbound WSS device-side transport — implemented as a standalone health-only prototype

The new `tools/remote/outbound-device-client.mjs` creates a **client-side WebSocket** (using Node 22+ native WebSocket) only after an injected, user-approval-backed `ticketProvider` returns a one-use ticket. This provider is a mandatory external trust dependency and is **not implemented or automatically invoked** by a public tool. It opens no listening port, never persists or logs the ticket, and sends the ticket only in a **WSS message**, not in the URL or shell command arguments.

The endpoint is pinned to a separately trusted exact `*.workers.dev` hostname, `wss:` scheme and `/device` path; query strings, embedded credentials, mismatched hosts and nonstandard ports are rejected. The client expects an explicit server-ready acknowledgment with its per-session challenge and pinned device ID before accepting any remote health requests. It uses the existing default-deny `createDeviceHealthChannel` filter; there is no terminal, filesystem, browser, mouse or general MCP tool forwarding. Unknown commands terminate the channel. Timeouts, connect errors, operator stop, replayed health nonces and attempted one-time-ticket reuse are handled without automatic reconnect.

```powershell
npm run test:remote:outbound
```

**Sandbox evidence:** Node v22.16.0: 15/15 mock WebSocket transport tests passed. The exact GitHub module's git blob hash matches the tested local module; the GitHub test file must also be verified on the owner's Windows checkout. No real TLS handshake to a remote Cloudflare Worker, ticket exchange, device proof-of-possession, server-side WSS upgrade handler, or ChatGPT integration has occurred. Do not consider a reflected server challenge a substitute for trustworthy TLS plus server-side ticket validation.

**Blocking production integration:** the server-side Durable Object WebSocket endpoint must authenticate the one-use device ticket in the context of an approved user/device pairing, bind the established socket to the correct owner, device and revocation state, and persist safe session attachments across hibernation. The user-facing consent/login and OAuth-protected MCP endpoint remain disabled. Current Cloudflare guidance prefers `DurableObjectState.acceptWebSocket` with hibernation: https://developers.cloudflare.com/durable-objects/best-practices/websockets/ . The owner's 34-tool local MCP plugin remains completely separate.

## Server-side WSS Durable Object relay — experimental and NOT deployed

New `tools/remote/cloudflare/remote-relay-do.ts` implements a Cloudflare Durable Object using the documented **hibernating WebSocket API** (`DurableObjectState.acceptWebSocket`, `serializeAttachment`, `deserializeAttachment`, `webSocketMessage`, `webSocketClose` and alarms). `mcp-worker.ts` now contains an opt-in external `/device` WebSocket upgrade route and routes protected MCP health requests by **internal Durable Object binding** to `/health`. The public Worker must never proxy `/health` directly. The same fixed `remote-health-probe-v1` shard is used for both paths; this is **an intentionally limited, single-shard test design**, not suitable for unattended production multi-user scale. Limits: max eight sockets, four concurrent health requests per device and bounded reply deadlines.

The first WSS message must carry the short-lived, HMAC-signed **one-use** ticket already issued for a separately approved owner/device pairing; a valid WebSocket upgrade alone never grants any tool permission. The ticket is atomically consumed, the pairing/consent revision is checked, the socket is bound to owner and device in its non-secret hibernation attachment, and the client challenge must match the acknowledgment. The connection lifetime follows the approved **pairing expiry**, not the already-consumed 60-second admission ticket. Revocation/expiry are checked again at dispatch and receipt; duplicate device sessions replace prior ones. The only possible tool request is the static `desktop_control.remote_health`, which returns `desktopAccess:false`. A device token cannot grant itself approval or OAuth scopes.

Portable `tools/remote/remote-relay-protocol.mjs` contains strict validators for authentication, the health reply and internal owner/device lookup. Ten negative and positive regression tests are in `remote-relay-protocol.test.mjs`; registered via `npm run test:remote:protocol` in `npm run verify`.

**Status:** source committed to PR #34. This new server and its protocol tests have **NOT** yet passed Windows TypeScript compilation or a live Worker runtime test. No actual TLS/WebSocket connection is established, no Cloudflare account or Worker is deployed, no user is enrolled, and no existing local PC tool is remotely exposed. Even after TypeScript passes, Cloudflare Miniflare/workerd integration, OAuth 2.1, explicit human sign-in/consent, real Durable Object storage transactions, WSS pairing and ChatGPT end-to-end negative tests remain mandatory. The OAuth authorization Worker intentionally rejects `/authorize` (HTTP 503). The supplied Wrangler templates have `workers_dev=false`, no public routes, remote health disabled, and **no Durable Object binding**; enabling these requires a separate reviewed change and user-approved Free-plan cloud account. Do not put HMAC keys in GitHub, ChatGPT, command history or logs. No paid service, domain or OpenAI API key is authorized.

Current upstream source: https://developers.cloudflare.com/durable-objects/best-practices/websockets/ and https://developers.cloudflare.com/durable-objects/examples/websocket-hibernation-server/ .

## Owner decision: single-user preview and official-package activation gate

The owner requires **exactly one authenticated preview account**, without open registration. `tools/remote/preview-single-owner.mjs` now fail-closes unless `PREVIEW_SINGLE_USER=1` and a strict `PREVIEW_OWNER_ID` are configured *outside Git*. Both the protected MCP Worker and the internal WebSocket Durable Object check their independently verified token/ticket subject against this one owner, not public JSON. Unknown or second accounts cannot pair or dispatch even if they submit otherwise well-shaped requests. The preview owner configuration **is not a password** and MUST NOT replace OAuth or a verified device ticket.

The next official plugin distribution is explicitly blocked by the added `preview-single-owner-auth` acceptance requirement in `tools/plugin/release-policy.mjs` until an independently verified login/activation process exists. For the local Windows owner, `tools/remote/setup-preview-owner.ps1` can provision a private credentials file with random login values and restrictive Windows ACL (owner must execute it; no credentials are generated by GitHub). **Provisioning is not enrollment.** The current `preview.5` installed plugin is NOT retroactively protected by this new remote-branch code.

See [single-owner security and OSS source-code/licensing limits](../security/ONE-USER-PREVIEW-ACCESS.md). Under the existing MIT license, third parties can legally copy, modify and self-host public source. Server-side identity verification can restrict the **official service**, signed official builds and official accounts; it cannot prevent source forks from removing checks. No licensing change was made. Linux account provisioning will need a separate least-privilege implementation before Linux preview release.

Owner's last Windows runtime evidence: exact `1dc65eccaa9a13bfea00dd9b186d146bbb5280ff`, all five negative WSS admissions passed, `RESULT=WORKER_LOCAL_WSS_DENY_PASSED`. New one-user policies and runtime integrations must be retested on Windows. There is no valid-user positive enrollment, login, installation activation or cloud deployment yet.
