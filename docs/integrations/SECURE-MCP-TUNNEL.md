# Secure MCP Tunnel integration — experimental, OFF

Scope: **transport smoke-test only**. No real remote desktop access, no public server, no grant migration, and no automatic update.

## Decision

The existing Windows `preview.5` local stdio MCP server has been tested with 34 tools. Normal ChatGPT cloud chats cannot directly execute its local stdio transport. For remote access, **reuse the OpenAI open-source Secure MCP Tunnel client** rather than building a homegrown public relay or copying Desktop Commander's separately hosted Supabase device service.

Upstream sources:
- https://github.com/openai/tunnel-client
- https://github.com/openai/tunnel-client/blob/master/docs/onboarding.md
- https://github.com/openai/tunnel-client/blob/master/docs/configuration.md
- https://developers.openai.com/api/docs/guides/secure-mcp-tunnels
- https://github.com/wonderwhy-er/DesktopCommanderMCP/tree/main/src/remote-device (MIT reference; not copied)

The official tunnel-client supports a **local stdio MCP child** via `--mcp-command`, plus outbound HTTPS to an authenticated OpenAI-hosted MCP tunnel endpoint. No inbound firewall port or private self-hosted domain is required.

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
