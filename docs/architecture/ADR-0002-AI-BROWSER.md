# ADR-0002: Dedicated persistent AI browser with virtual cursor

- **Status:** Proposed; owner requirements chosen, architecture not implementation-approved.
- **Date:** 2026-10-22
- **Related:** [AI Browser Profile specification](AI-BROWSER-PROFILE.md), [issue #14](https://github.com/lxcoding95/desktop-control/issues/14).

## Context

Owner needs a full browser experience with distinct history, passwords, bookmarks, downloads and sign-in state, while their regular browser is untouched. The black AI cursor is shown only during mouse actions. Browser-native automation should continue independent of the human's white system pointer. Shared desktop actions require controlled takeover. ChatGPT remains the AI planner; no embedded second AI agent.

## Decision (proposed)

Launch a **separate, persistent, visible Chromium-based browser profile** using Playwright where practical, with a dedicated locked data directory. Use semantic locators/accessibility for actions, draw an ephemeral black virtual cursor for visibility, and never inject shared OS inputs in "independent browser" mode. Native history/bookmarks/cookies are reused, but password-save behavior and browser service differences are **not assumed** from Playwright persistence alone. Credentials require tested OS-backed storage and human-controlled consent; generic raw script/DevTools/cookie/password extraction tools are not exposed by default.

## Alternatives evaluated

1. Shared Chrome user profile: rejected due to privacy, focus conflicts and modern remote-debugging restrictions.
2. Stateless test browser per task: rejected for history/password persistence goal (still useful for private mode/tests).
3. Custom Electron browser engine/UI: possible but larger maintenance surface and poor value versus maintained Chromium engine.
4. Dedicated OS user session/VM: more isolation and true separate desktop pointer, but more operational complexity; optional future HIGH-security mode.

## Consequences

Need profile lifecycle, backup/erase/import/export, OS keystore compatibility, browser update cadence, download persistence, UI activity indicators, credential redaction and host-side authorization; Windows/Linux support must be tested by platform and channel. Isolated profiles do **not** enforce OS-level security boundaries. Browser login sessions confer indirect account access even when raw passwords are hidden.

## Resolved user decisions (2026-10-22)

1. **Routine automatic login is allowed only for locally preapproved exact websites/accounts** using the AI browser's existing signed-in session or secure opt-in saved credentials. Grant requires expiration/revocation, cannot be inherited by unapproved origins, redirects or other accounts.
2. **Sensitive account actions always require an independent confirmation**, including payments, sending messages, account/security/password changes, sensitive uploads, data exports and destructive actions. An authenticated browser does not imply action authorization. Human-controlled 2FA/passkeys are not bypassed.
3. **Always-visible headed browser window:** no hidden/headless background browser as a product mode; not forced always-on-top or allowed to steal the user's focus. If a visible window cannot be maintained, suspend and report; normal browser-native actions may continue without sharing the white OS cursor.
4. **Implementation not validated:** Test Windows/Linux browser channel, password vault, policy enforcement, exact-origin redirects, prompt-injection, visibility/focus and revocation; see the acceptance matrix in [AI-BROWSER-PROFILE](AI-BROWSER-PROFILE.md).

These are owner requirements, not implemented features.

No software or workflow is implemented and all quality criteria remain open.
