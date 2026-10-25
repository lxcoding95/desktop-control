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
