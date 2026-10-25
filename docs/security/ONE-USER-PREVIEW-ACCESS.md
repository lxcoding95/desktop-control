# Single-owner preview: access control, code reuse and release policy

**Status 2026-10-25: partial implementation / not yet accepted.**
Owner instruction: **the preview permits one account only**. No self-registration, second-account invites, paid API, public release or production Cloudflare activation until separately reviewed. Do not change historical development-session ledgers.

## Non-negotiable technical and licensing boundaries

1. This repository is public and currently **MIT licensed**. MIT expressly allows recipients to use, copy, modify and redistribute the code, subject to retaining required copyright/license notices. We **cannot** technically enforce a registration requirement on a modified source fork, or legally forbid its use while retaining the MIT grant. We must not advertise local source-code protection or unbreakable DRM.
2. We **can** require a verified identity to access the **official hosted MCP service**, pair a device or use an **unmodified official preview binary/plugin**. This is server-side authorization and artifact distribution control, distinct from licensing the published source. Attackers may fork and self-host their own copy; they do not thereby gain access to our hosted relay, enrollment records, signing keys or users.
3. If the owner later wants to **prohibit unregistered use of the source itself**, a legal/architecture decision is required: keep some unreleased server code proprietary/source-available under a different license, or change distribution terms for **future eligible code** after assessing contributor and third-party rights. Such usage restrictions are **not OSI Open Source**. No license alteration has been authorized or made.

Primary source: https://opensource.org/osd ; https://opensource.org/faq ; existing [MIT license](../../LICENSE).

## Existing open-source approaches researched (DO NOT blindly copy their code)

| Project and source | Observed approach | Our reuse |
| --- | --- | --- |
| [Open WebUI auth code](https://github.com/open-webui/open-webui/blob/main/backend/open_webui/routers/auths.py), [documentation](https://docs.openwebui.com/reference/env-configuration/) | First administrator is created once, then signup can be disabled; roles may default to pending; OAuth signup is separately controlled. | Pattern: registration closed for preview; no copied code and no imported dependency |
| [Cloudflare Workers OAuth Provider](https://github.com/cloudflare/workers-oauth-provider/tree/main/examples/split-workers), [upstream sign-in](https://github.com/cloudflare/workers-oauth-provider/blob/main/docs/upstream-sign-in.md) | OAuth authorization server issues scoped tokens, resource server validates via internal binding; app must authenticate the user and obtain consent. | Already in the branch; do not implement custom bearer-token cryptography |
| [Desktop Commander local and remote split](https://github.com/desktop-commander/remote-desktop-commander) | Open local code; official hosted remote MCP OAuth service implemented separately, not fully open source. | Architecture pattern only; their hosted relay implementation is not available for reuse |

No new third-party source copied. The official Cloudflare OAuth SDK remains the sole intended MCP token implementation; do not re-use demo hard-coded user identities.

## Implemented in Draft PR #34

- `tools/remote/preview-single-owner.mjs` requires **both** `PREVIEW_SINGLE_USER=1` and a syntactically valid, externally configured `PREVIEW_OWNER_ID`. An absent or malformed setting denies *everyone*, including the intended owner.
- Both the protected `mcp-worker.ts` and internal `remote-relay-do.ts` now enforce **exact identity equality** against the verified token/ticket owner, not public JSON. The Durable Object checks account ownership at WSS admission and /health dispatch, in addition to existing approved pairing, ticket, expiry and revocation controls. *Knowing the owner ID is not sufficient to log in*: the authenticators remain mandatory.
- `tools/remote/setup-preview-owner.ps1` safely initializes a **new or already existing empty** `.ssh/desktop-control.txt`, and refuses to overwrite any nonempty content. It generates a random owner ID, username, high-entropy password, device ID and RSA-PSS license signing key. **Password/private signing key are encrypted with Windows DPAPI CurrentUser**, and the file gets owner-only NTFS ACLs. It prints only non-secret statuses. This local vault is NOT a complete OAuth/cloud account.
- `tools/remote/set-preview-vault-secret.ps1` stores additional Cloudflare, OAuth, SSH and other credentials only via hidden prompt or authorized stdin, DPAPI-encrypted and atomically replaced. Actual Cloudflare tokens must first be issued by Cloudflare; **none exist or were fabricated** by these changes.
- `tools/license/preview-license.mjs` verifies signed, time-limited owner/device entitlements with mandatory authoritative revocation; `single-seat-ledger.mjs` atomically reserves exactly one seat. The optional `tools/license/issue-preview-license.ps1` signs one **local-only staging license**, stores it DPAPI-encrypted in the same vault and refuses a second. **This is NOT yet plugged into the official plugin startup, and not an activated hosted license.**
- The `.gitignore` blocks accidental commit of a copied `desktop-control.txt` and temporary test secret/config names. Use GitHub secret scanning and prevent accidental logs/backups as separate controls.
- `tools/plugin/release-policy.mjs` now adds `preview-single-owner-auth` to the release acceptance receipt requirements, so the official **next** preview cannot be marked READY by this release-policy script without a matching test/review receipt for login enforcement. A receipt is **not** itself authentication and no preview has been released on that basis.
- `tools/remote/preview-single-owner.test.mjs` contains six negative/positive account isolation tests; `npm run test:remote:single-owner` is included in the root `npm run verify`. **Windows results for this newly added suite are pending.**

## Mandatory acceptance BEFORE publishing/installing the next official preview

1. Implement **real login + consent** with an established OAuth/OIDC provider, stable immutable owner subject, strict redirect URI and PKCE validation, anti-CSRF state, explicit per-client consent and disabled self-signup. The previously created random local username/password must not be treated as an OAuth access token; never send it to MCP tools.
2. Activate the allowed **one owner account** through an owner-approved configuration step. Configure `PREVIEW_OWNER_ID` using the stable **verified OAuth subject** (or a server-side secure mapping), not a value sent by a chat model. All other accounts and unrecognized device tickets must be rejected at ingress AND at dispatch. If the chosen identity differs from a pre-generated local ID, map it securely on the server only after verifying both identities.
3. For official local installation, implement a **signed short-lived activation/entitlement** tied to the one allowed account and device, validated in the official startup entrypoint **before any tools are exposed**. Public verification key may ship with the binary; private signing keys NEVER ship in source, plugin package or user instructions. Until this is tested, **no official installer/npx package should be published or declared account-gated**. A determined user who recompiles MIT source can remove the check; signed distribution only protects our official builds.
4. Registration = off by default. Deny unauthenticated tool discovery, stdio/startup, remote /mcp, device pairing and privileged calls; no unauthenticated `remote_health` success. Enforce least privilege, revocation, rates, session expiry, audit redaction, per-device owner binding, no automatic scope elevation and local Esc emergency stop.
5. Test first-user success, second-user failure, logout/revoke, stolen/replayed/expired token rejection, forged owner ID, bypass via direct local stdio path, cross-device reuse and release refusal without a verified login receipt on **real Windows and Linux**. Record exact commit/logs and independent reviews before merge or launch.

### Threat model / concrete limits

| Threat | Enforceable mitigation | Limit |
| --- | --- | --- |
| Stranger tries to use OUR hosted MCP | OAuth audience/scope/subject checks plus owner allowlist on each protected operation | Requires deployed, reviewed identity service; still disabled |
| Second account tries to pair to OUR relay | One-owner allowlist, separately approved pairing record, one-time signed ticket, revocation | Positive real ticketed WSS test pending |
| Stranger downloads OUR official installer | Private distribution and verified, signed account activation; code signing, release manifest verification | Cannot stop a fork/recompile of public MIT source |
| Copy leaks credentials into Git | User-profile ACL, random secret, ignore patterns, scanner, no secrets in public metadata | Ignore rules are defense in depth, not a guarantee against deliberate `git add -f` |
| Someone removes login from forked source | Copyright/license notice preservation, original trademark/brand identity where legally applicable | MIT grants modification and use; source exclusivity requires a different licensing decision |

**Do not conflate successful 5/5 local WSS denial or 5/5 default-off HTTP tests with positive login, source-code access restrictions or release readiness.** No deployment or secret was created by this branch.
