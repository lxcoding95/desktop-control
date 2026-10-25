# Desktop Control — one-seat Preview Licensing (NOT ACTIVATED)

2026-10-25 decision: precisely ONE official preview license, no public signup, no second user and no paid APIs or services. Multi-seat capacity may be added after separate owner approval; number and pricing remain undecided. Existing MIT source grant is unchanged.

## Implemented on Draft PR #34

* tools/license/preview-license.mjs: RSA-PSS-SHA256 signed, bounded health-only license tied to owner, device and expiry; verification requires a pre-trusted public key plus a mandatory authoritative revocation-store callback. No license key may authorize filesystem/terminal/desktop.
* tools/license/single-seat-ledger.mjs: one-seat transactional ledger adapter. Refuses parallel allocation, another owner/device, implicit reuse of a revoked seat, and unauthenticated revocation. Requires a real atomic database in production.
* tools/remote/setup-preview-owner.ps1: Windows-only provisioning. Handles an EXISTING EMPTY .ssh/desktop-control.txt without erasing nonempty files. Generates cryptographically random local username/password/owner/device ID and RSA-3072 private signing key. Private values are DPAPI-CurrentUser encrypted inside the requested .txt JSON vault, with restricted file ACL and no secret output. This does NOT enroll OAuth or Cloudflare.
* tools/remote/set-preview-vault-secret.ps1: add or rotate secrets named cloudflare.*, oauth.*, ssh.*, license.* or integration.* interactively, or via trusted local stdin after explicit approval. No plaintext CLI secret arguments, no Git commits of secrets. Updates the same DPAPI vault atomically. Explicit -Rotate is required for replacing an existing secret.
* tools/license/issue-preview-license.ps1: local staging license issuance into the same vault, signed using the DPAPI-protected RSA private key, exactly one 7-day health-only entitlement. Token is encrypted; never logged. This local entitlement is NOT yet accepted by a live server or installed plugin.
* Remote Cloudflare Worker and Durable Object additionally enforce the independently verified preview owner; root release-policy requires independent preview-single-owner-auth evidence before declaring the NEXT official preview ready. The already installed preview.5 is NOT retroactively gated.

New tests: npm run test:license:preview ; npm run test:license:seats ; npm run test:remote:single-owner. These must be run on Windows and Linux. PowerShell and hosted E2E remain untested.

## Essential security boundaries

The DPAPI vault is an owner-local credential inventory, not a global licensing server. A user who controls source and their machine can change any local gate. The server must independently check signed entitlements, enrollment, immutable owner identity, revocation and active-seat count. All issuer signing keys remain outside redistributed plugin packages. A read-only public verification key can be bundled only after verifying the correct issuer trust anchor.

Before the official plugin may be called account-gated: connect an established OAuth login/consent implementation, refuse signup after the first owner, implement a trusted issuer and real transactional seat backend, validate the entitlement before MCP tool discovery and every operation (including direct stdio/CLI), test offline/owner/device/revocation bypasses, and independently review installer/source/package distribution. No publicly reachable endpoint or deployment exists yet. A generated local username/password does NOT log into Cloudflare or ChatGPT.

Once the owner has obtained real Cloudflare API credentials through verified official account setup, store them in the local protected vault, then provision to Cloudflare using secret bindings, never plain Wrangler vars. See https://developers.cloudflare.com/workers/configuration/secrets/ . No credentials can be fabricated in source code.

## Free/open-source research

- Ory Hydra: Apache-2.0 open-source OAuth2/OIDC (https://github.com/ory/hydra); needs additional user login management and self-hosting; unnecessary weight for 1 user.
- Open WebUI: shuts registration after initial administrator (https://github.com/open-webui/open-webui/blob/main/backend/open_webui/routers/auths.py); design pattern only, no code copied.
- Cloudflare Workers OAuth Provider: existing OAuth token/resource split (https://github.com/cloudflare/workers-oauth-provider/tree/main/examples/split-workers); preferred existing integration.
- Keygen CE: free to self-host but current Fair Core License, not current unrestricted OSI Open Source (https://github.com/keygen-sh/keygen-api); NOT adopted.
- ZITADEL: self-hostable mainly AGPL-3.0 identity provider (https://github.com/zitadel/zitadel); optional later multi-user research, not imported.

## Copyright limit (important)

MIT grants recipients the right to copy, modify and run the publicly distributed source with the required notices. Authentication protects OUR official service, identities, pairing records, issuer keys, signed official packages and branding; it CANNOT prevent a developer from modifying and self-hosting a public MIT fork. Preventing use of published source would require separately approved future licensing/distribution choices and assessment of contributor rights, not fake DRM. No license change or paid service authorized.

All changes remain unmerged on Draft PR #34, with no hosted deployment, no creation of Cloudflare accounts, no secret file changes from GitHub, and no historic development session advancement.
