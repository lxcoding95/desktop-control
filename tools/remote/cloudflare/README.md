# Desktop Control — Cloudflare Free prototype (NOT LIVE)

**Deployment blocked/default OFF.** The directory contains a real SDK-based, stateless Streamable HTTP MCP Worker and a separate OAuth Authorization Worker. It does **not** contain a verified user sign-in, deployed relay, paired device, or working chat connection. The local Windows `preview.5` plugin remains unchanged.

## Upstream chosen (MIT)

- `agents@0.30.1` → `createMcpHandler()` from `agents/mcp/server`, supporting stateless 2025 and 2026 MCP transports. We do not implement the evolving HTTP wire protocol manually.
- `@modelcontextprotocol/server@2.3.1` → official MCP `McpServer`.
- `@cloudflare/workers-oauth-provider@1.2.4` → the **split** `OAuthAuthorizationServer` and `OAuthResourceServer`, the current architecture as of October 2026.
- `wrangler@4.145.0` → local Worker emulator/build. No `deploy` npm script.
- No copied Desktop Commander proprietary relay or custom token parser.

Official examples:
- https://github.com/cloudflare/workers-oauth-provider/tree/main/examples/split-workers
- https://github.com/cloudflare/agents/tree/main/examples/mcp-worker-authenticated
- https://developers.cloudflare.com/changelog/post/2026-10-01-workers-oauth-provider-1x/
- https://developers.cloudflare.com/agents/model-context-protocol/apis/handler-api/

## Boundaries

`auth-worker.ts`: OAuth authorization/discovery component, **`/authorize` always returns HTTP 503** until a secure, user-interactive identity/consent flow is implemented. No static demo user, implicit signup, model-granted OAuth consent or endpoint for revealing secrets.

`mcp-worker.ts`: uses the official resource-server token-validation service binding. Requires approved `remote.health` scope and a stable owner matching the provider's signed grant props. Advertises only `desktop_control.remote_health`. Delegates via `REMOTE_RELAY` Durable Object *only if* `ENABLE_REMOTE_HEALTH=1`; this binding is deliberately absent in the provided configuration. Missing backend returns `DEVICE_UNAVAILABLE`, not a fabricated success.

`../oauth-health-gate.mjs`: additional strict request-time checks; derives owner solely from the verified OAuth contexts (never MCP args), validates device alias, bounds/redacts response and rejects privilege escalation, forged owners, missing scopes, canceled requests and extra result fields.

`wrangler.auth.example.jsonc` / `wrangler.mcp.example.jsonc`: templates have `workers_dev=false`, no routes and health disabled. Template URLs and the OAuth KV namespace ID must be replaced by authorized values. **Do not deploy these templates or set `ENABLE_REMOTE_HEALTH` before full security acceptance.**

## Local verification (ordinary Windows user)

The zero-dependency gate tests are included in the root repository's `npm run verify`:

```powershell
npm run test:remote:oauth-gate
```

To check Worker compilation in isolation, after reviewing dependency versions and licensing:

```powershell
cd C:\Code\webprojekte\desktop-control\tools\remote\cloudflare
npm install --ignore-scripts
npm run typecheck
```

This will install dependencies *locally* and create `package-lock.json`. Until the lockfile/SBOM/license-audit and this typecheck have been independently reviewed, the Worker is **UNVERIFIED**. Do not run Wrangler deploy or use a cloud account. `npm run test:gate` is available in the isolated package.

## Missing for an actual ChatGPT Remote connection

- Secure sign-in/consent (e.g. GitHub OAuth user sign-in with CSRF/session binding and allowlist), stable owner identification, secret storage and logout/revocation.
- Cloudflare Workers **Free** account eligibility / no paid upgrade / no purchased domain; owner-only account action.
- SQLite Durable Object storing approved pairing records and atomically consuming one-time device tickets; TTL, signed proof-of-possession and credential revocation.
- Authenticated outbound Windows `wss://` device connector with reconnection, heartbeat, bounded reply handling and Not-Aus; no inbound firewall port.
- Versioned, authenticated DO request routing and a real end-to-end MCP Inspector + normal ChatGPT Chat test; remote health only.
- Later, entirely separate per-device and per-capability local authorization for filesystem/terminal/browser/desktop. **Do not attach `preview.5/start.mjs` to this relay**.

An SDK HTTP wrapper and successfully compiling code do not prove security, identity or remote availability. This prototype is intentionally non-public.
