# Remote MCP transport — experimental, default OFF (free-tier only)

Scope: **transport smoke-test only**. No real remote desktop access, no public deployment, no grants, and no automatic update.

## Decision — updated 2026-10-25 after owner cost constraint

**Do not require an OpenAI Platform API key, paid tunnel, domain purchase, or subscription.** The previously investigated \`openai/tunnel-client\` is a reference only, not the selected deployment path. No tunnel-client installation or keys are necessary for the current local tests.

Desktop Commander demonstrates the relevant architecture: a local MIT-licensed device agent paired through OAuth Device Authorization / PKCE to a separately hosted Remote MCP server. Its documented free hosted tier allows 10,000 tool calls per month for *Desktop Commander itself*, not third-party Desktop Control devices. The hosted server's implementation is proprietary; do not assume it can be reused, pointed at our tools, or copied.

Verified upstream:
- https://github.com/wonderwhy-er/DesktopCommanderMCP/tree/main/src/remote-device (local MIT code)
- https://github.com/wonderwhy-er/DesktopCommanderMCP/blob/main/src/remote-device/README.md
- https://github.com/desktop-commander/remote-desktop-commander (public manifests/docs; hosted relay source unavailable)
- https://desktopcommander.app/pricing/

**Preferred candidate for a zero-billed prototype (not deployed):** Cloudflare Workers **Free**, its included \`.workers.dev\` HTTPS hostname, plus **SQLite-backed Durable Objects** for authenticated device sessions/coordination. Current Free quotas are enforced with errors rather than automatic paid overages; confirm account selection and current terms before deployment. This still requires the owner's explicit creation of a free Cloudflare account and authorization of publishing an HTTPS endpoint. Never enable a paid plan, paid add-on, billing upgrade or automatic overage. GitHub OAuth is an option for human sign-in (not a ChatGPT/OpenAI API key) but requires its own registered OAuth application and strict account/device binding.

Relevant reusable OSS:
- https://github.com/cloudflare/agents/tree/main/examples/mcp-server (MCP Streamable HTTP)
- https://github.com/cloudflare/agents/tree/main/examples/mcp-worker-authenticated (authenticated MCP)
- https://github.com/cloudflare/agents/blob/main/docs/agents/securing-mcp-servers.md (OAuth security)
- https://developers.cloudflare.com/durable-objects/platform/pricing/ (Free-plan limits)

Required components before any remote device tools: HTTPS Streamable HTTP connector for ChatGPT, OAuth 2.1 with PKCE, separate device pairing, outbound authenticated WebSocket/device connection, explicit account/device routing, request IDs and bounded timeouts, replay protection, audit, revoke, fail-closed local capabilities, and an immediate emergency stop. The single-tool health-only probe remains the first end-to-end test. Never publish or forward the production \`preview.5/start.mjs\` with 34 tools merely because a transport connects.

Original official OpenAI tunnel-client exploration remains documented below solely as an **unselected alternative** and must not be interpreted as deployment authorization.

## First slice: read-only connection probe

`tools/remote/health-server.mjs` is a separate stdio MCP process exposing **only** `desktop_control.remote_health`. Its static response has `connected: true`, `scope: remote-health-only`, and `desktopAccess: false`. It performs no filesystem, terminal, browser, device or permission operation and does not inspect tokens or local user information. The tool list excludes the existing 34 privileged tools. All other tool calls are rejected.

This proves transport only, **not remote identity or remote desktop authorization**.

### Local test

```powershell
node --test tools/remote/health-server.test.mjs
```

The first independent Linux sandbox run passed 8/8 tests on Node 22.16.0. Run again in the actual Windows checkout before reporting Windows acceptance.

## Operator-only tunnel test (not performed)

Before proceeding, confirm (1) the current ChatGPT account/workspace supports custom remote MCP plugins and intended actions, (2) the OpenAI Platform organization has Tunnels Read/Manage or Read/Use as applicable, and (3) no unapproved paid service is activated. Create an authorized tunnel and a minimal **runtime** API key through:

https://platform.openai.com/settings/organization/tunnels

Download a verified Windows binary from the supported release linked there or https://github.com/openai/tunnel-client/releases . Never paste an API key into chat, GitHub, logs, shell command history or an argument; use an OS credential store or a local masked input and process-only environment. Do not run a downloaded binary until its publisher and checksum/signature have been checked. A tunnel ID is not the runtime key.

The first binding MUST target **only**:

```text
node C:\Code\webprojekte\desktop-control\tools\remote\health-server.mjs
```

With a supported `tunnel-client` executable, validate Windows command quoting locally using:

```text
tunnel-client help quickstart
tunnel-client init --sample sample_mcp_stdio_local --profile desktop-control-probe --tunnel-id <YOUR_ID> --mcp-command "<WINDOWS_NODE_AND_HEALTH_SERVER>"
tunnel-client doctor --profile desktop-control-probe --explain
tunnel-client run --profile desktop-control-probe
```

Do not treat these example commands as executed or validated on Windows. Keep exactly **one active tunnel-client instance per stdio tunnel ID**. The local `/healthz`, `/readyz`, `/health/mcp` and `/ui` endpoints are operator checks, not permission proofs. Configure ChatGPT Plugins → Add custom MCP server → Tunnel only after tunnel health and account eligibility are verified.

### Required remote acceptance

A real normal ChatGPT chat must discover precisely one `desktop_control.remote_health` tool, call it successfully, show `desktopAccess: false`, and find no files, terminal, browser or input tools. Also test tunnel disconnect/reconnect, cross-account denial and key revocation. No claim of completed remote ChatGPT integration before those tests.

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
