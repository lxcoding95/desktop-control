# Single-owner GitHub sign-in — default OFF

This source implements explicit per-client **remote.health-only** consent before
GitHub sign-in. It does not deploy a service, register an OAuth application, issue
a license, read a vault, pair a device, grant local control or expose local tools.
Authoritative entitlement and device pairing remain independent requirements.

## Configuration contract

All must be separately configured by the host operator; missing/disabled values
return 503 on login routes:

- `ENABLE_GITHUB_LOGIN=1`, `PREVIEW_SINGLE_USER=1`.
- `AUTH_ISSUER`: exact HTTPS `https://<approved-auth-host>.workers.dev/`.
- `MCP_RESOURCE_URL`: exact HTTPS `https://<approved-mcp-host>.workers.dev/mcp`.
- `PREVIEW_OWNER_ID`: existing server-owned principal (no colon, SDK requirement).
- `GITHUB_OWNER_ID`: immutable numeric GitHub user ID, **not login/display name**.
- `GITHUB_CLIENT_ID` and **secret binding** `GITHUB_CLIENT_SECRET`, from a new,
  dedicated owner-approved GitHub OAuth app. No repository/user scopes requested.
- `OAUTH_KV`: SDK-owned OAuth client/grant/token storage.
- `AUTH_LOGIN_STATE`: SQLite Durable Object binding to exported `AuthLoginState`;
  requires a reviewed `new_sqlite_classes` migration before actual deployment.

The GitHub app callback is exactly
`https://<approved-auth-host>.workers.dev/login/github/callback`.
Never put a client secret in Wrangler plain vars or in Git. Never rerun owner
vault bootstrap or license issuance to configure login. The existing health-only
staging license is neither duplicated nor broadened here.

## Security boundaries

1. SDK 1.2.4 `getOAuthApi().parseAuthRequest` verifies the registered client and
   exact redirect. Only HTTPS redirects, S256 PKCE, the configured resource and
   exactly one `remote.health` scope are accepted.
2. An escaped, non-frameable page names the client and redirect hostname.
   A strict-origin POST with a browser-bound random handle must explicitly allow
   health before any GitHub redirect. Denial consumes the handle and does not
   contact GitHub. Client names are explicitly labeled self-asserted.
3. GitHub uses a separate state and S256 PKCE verifier, fixed callback, empty
   scopes and disabled signup prompt. Code/token/profile requests have fixed
   upstream endpoints, disabled redirects, deadlines and response size limits.
   Token/user response data are never logged, persisted, returned in MCP props,
   or displayed. The token exists only in the callback's execution memory.
4. Only the numeric `/user` ID returned by GitHub with that exchanged token can
   select the configured owner. Request arguments cannot supply an identity.
5. Five-minute state/consent records are consumed atomically in a Durable Object
   storage transaction and bound to the SHA-256 of a Secure/HttpOnly/SameSite=Lax
   `__Host-` cookie. The SDK's documented KV helpers use get/delete and explicitly
   do not guarantee simultaneous same-browser one-use; this implementation uses
   a DO transaction to close that replay gap. It otherwise uses the actual SDK
   parsing, consent-description and authorization-completion APIs.
6. The original SDK-validated request is restored server-side. It is never
   reconstructed from form fields. Callback replay cannot mint another code.
   Only `{userId: configuredOwner}` reaches SDK-encrypted grant props.

This is login, not a global logout/revocation implementation. Existing OAuth
grants must still be denied by authoritative entitlement/owner/device checks at
discovery and every remote operation. Disabling login alone does not invalidate
previously issued SDK tokens. No local management tools are added to the relay.

## Verification and remaining gates

`node auth-login.test.mjs`: seven focused tests, including missing configuration,
scope/resource/redirect/PKCE rejection, consent denial, wrong browser, duplicate
parameters, forged identity, wrong GitHub owner, broadened upstream scopes,
expiry, concurrent replay and escaped HTML. These tests inject GitHub responses
and an in-memory atomic-store seam; they do not prove real GitHub sign-in.

`node test-auth-login-runtime.mjs`: actual loopback-only workerd with pinned
Wrangler 4.152.0, actual SDK 1.2.4 and actual SQLite Durable Object. It verifies SDK
client registration/redirect checking, consent-before-upstream, parallel
consent/callback one-use, and real SDK authorization-code issuance/state. GitHub
network responses are **fixtures only**. Temporary configuration/state and its
own Wrangler process tree are cleaned up. The test entrypoint
`auth-login-runtime.test.ts` must never be deployed/imported by production code.

Before activation: independent review; exact-head Windows/Linux verification;
actual GitHub OAuth registration/secret provisioning; authoritative entitlement
acceptance and revocation; approved device pairing; Free-plan account/config and
rate/resource limits; deployed HTTPS OAuth/token flow and a real authenticated
ChatGPT health operation. No public availability or successful hosted login is
claimed by local fixture success.

Primary references: installed provider 1.2.4 `docs/upstream-sign-in.md` and
`docs/consent-page.md`; [GitHub OAuth flow and PKCE](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps).
