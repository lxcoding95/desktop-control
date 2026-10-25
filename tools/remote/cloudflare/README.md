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


## Local workerd runtime smoke (default-deny; not yet executed)

The additional `wrangler.mcp.local-smoke.jsonc` is **only a local test fixture**: it binds an isolated SQLite-backed Durable Object so the actual production Worker bundle can be started, but explicitly sets `ENABLE_REMOTE_HEALTH=0`, no OAuth service binding, no secrets, `workers_dev=false` and no public routes. **Do not deploy the fixture.**

`smoke-local.mjs` uses the already installed, pinned `wrangler@4.145.0` CLI to launch `wrangler dev --local` on **127.0.0.1 only**, with its temporary state under the OS temporary directory. It does **not** accept any other bind address, and removes inherited Cloudflare/Wrangler credential environment variables. The script terminates its own spawned process tree and clears the scratch state. It makes five local HTTP requests and requires exact status/body denial for unauthenticated `/device`, `/device?ticket=...`, `/mcp`, `/health`, and `/oauth/token`. The expected completion marker is `RESULT=WORKER_LOCAL_DENY_PASSED`.

After the reviewed packages are already installed in the isolated `tools/remote/cloudflare` working copy:

```powershell
npm run typecheck
npm run test:local:deny
```

The new local test is deliberately **not** part of the root `npm run verify` since that root workflow does not install or pin the isolated Worker project's dependency lock yet. Do not run `wrangler dev --remote` or `wrangler deploy`: those contact cloud infrastructure and are not authorized by this smoke test.

**Security warning:** Cloudflare notes Miniflare/workerd local development is **not a hardened sandbox**. Test only project code already reviewed and controlled; do not run untrusted Worker scripts on a sensitive desktop, and use an isolated virtual environment for stronger containment. Source: https://developers.cloudflare.com/workers/testing/ .

Local smoke acceptance is only evidence that a disabled Worker starts and denies untrusted requests. It does not prove genuine OAuth issuance, pairing, WSS ticket consumption, Cloudflare hosted availability or successful ChatGPT connectivity. Those remain separate blockers and cannot be declared complete.


### Windows workerd compatibility-date finding (2026-10-25)

Owner ran the original localhost smoke fixture at commit `bd9b45bb1789715377d561ca99c3ee116a863807`. The smoke **failed before it could start or run HTTP assertions**: the pinned `wrangler@4.145.0` local `workerd` reported its maximum supported compatibility date as `2026-10-07`, but the fixture requested `2026-10-25`. This does **not** indicate an OAuth or application-level failure; no smoke cases were executed. The fixture-only `wrangler.mcp.local-smoke.jsonc` now uses `2026-10-07`, exactly the reported local-runtime limit. All deployable Worker templates are left unchanged and remain default disabled.

This local compatibility-date override tests the behavior of an **older runtime configuration** only. Cloudflare compatibility dates control API and behavior changes, so a passing local smoke test cannot certify a future production configuration dated `2026-10-25`. Before any deployment, validate separately against the then-current supported `workerd` release and intended production compatibility date; do not silently backdate production settings. See https://developers.cloudflare.com/workers/configuration/compatibility-dates/ . **Retest of the changed fixture is pending.**
