# Sources, evidence, license boundaries and reading plan

**Checked:** 2026-10-21. This is a research bibliography, not proof that linked code has been imported or tested. Before using packages, re-open their current docs, release notes, sources and license. Keep commit-SHA provenance in integration PRs.

## Primary user materials

1. \`Projektbeschreibung.txt\`: "Computer Worker" concept, user-selectable LOW/MEDIUM/FULL/CUSTOM scopes, files/shell/UI/system/network, controlled development from prototype to 1.0; product name later fixed as **Desktop Control**.
2. User-provided Desktop Commander tools inventory (29 tool names). Full coverage mapping: [DESKTOP-COMMANDER-COVERAGE.md](DESKTOP-COMMANDER-COVERAGE.md).
3. Explicit project decisions in this conversation (scope, GitHub rights, free open source, Windows/Linux, no separate AI agent, no domain/account until tested, six sessions).
4. Live repository / issues / PRs: https://github.com/lxcoding95/desktop-control and [PROJECT-STATE.json](../governance/PROJECT-STATE.json). Screenshots are provisional until GitHub API corroborates settings.

## Plugin packaging and public release — authoritative OpenAI docs

- [Build plugins: portable package / manifest / MCP configuration](https://developers.openai.com/plugins/build/plugins) — root \`plugin.json\`, optional \`mcp.json\` and \`skills/\`; root portable schema; local marketplace distinct from public directory.
- [Build MCP server / tool and skills requirements](https://developers.openai.com/plugins/build/mcp-server).
- [Submit plugin ZIP and remote MCP integration](https://developers.openai.com/plugins/deploy/submission) — public HTTPS MCP server, scan/test/review, identity verification, package updates vs server updates.
- [Desktop-only plugin submission limitations](https://developers.openai.com/plugins/deploy/desktop-only) — eligibility/allowlisting and local stdio requirements. **Do not assume an arbitrary local ZIP gives ChatGPT web access to the host computer.**
- [MCP spec (versioned)](https://modelcontextprotocol.io/specification/2025-11-25) and [transport section](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports); [authorization section](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization).
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk) and [SDK server docs](https://ts.sdk.modelcontextprotocol.io/server) — verify specific package release before choosing version.

**Important implementation caution:** MCP spec drafts can change session semantics. Pin a supported stable protocol version and test the advertised client's behavior; do not rely on draft changes or stale blog posts without checking.

## Desktop Commander: reference, reuse boundaries

- [Original open-source DesktopCommanderMCP](https://github.com/wonderwhy-er/DesktopCommanderMCP) — MIT, source for local file/terminal operations.
- [Package manifest](https://github.com/wonderwhy-er/DesktopCommanderMCP/blob/main/package.json) — package \`@wonderwhy-er/desktop-commander\`; version changes often.
- [Remote CLI source](https://github.com/wonderwhy-er/DesktopCommanderMCP/blob/main/src/npm-scripts/remote.ts) — \`npx @wonderwhy-er/desktop-commander@latest remote\`, status/report/logout flows.
- [Remote device onboarding and authorization](https://github.com/wonderwhy-er/DesktopCommanderMCP/blob/main/src/remote-device/README.md) — OAuth device authorization, browser pairing, local vs server revocation, troubleshooting.
- [Upstream release guide](https://github.com/wonderwhy-er/DesktopCommanderMCP/blob/main/PUBLISH.md) — workflow and trusted npm publishing ideas, NOT ready-made configuration.
- [Separate Remote Desktop Commander repo license](https://github.com/desktop-commander/remote-desktop-commander/blob/main/LICENSE) — **PROPRIETARY**, reference docs/manifests/assets only within its expressly stated limits. Do not copy or relicense the remote service.
- [Desktop Commander website](https://desktopcommander.app/) — competitor experience reference only; do not imitate branding, logos, or proprietary text.

## Other implementation candidates

- [Munim Computer Use](https://github.com/munimtechnologies/munim-computer-use) — investigate Apache-2.0 license, desktop accessibility integration and platform tests; record upstream commit and required notices before reuse.
- [MCP Desktop Control](https://github.com/rcoscali/mcp-desktop-control) — architecture comparison; confirm presence/license of actual source before copying.
- [Playwright docs](https://playwright.dev/docs/intro) — E2E and browser automation on Windows/Linux; validate runtime/runner and headed-mode requirements.
- [Windows UI Automation](https://learn.microsoft.com/en-us/windows/win32/winauto/entry-uiauto-win32) — native UI model.
- [AT-SPI accessibility](https://docs.gtk.org/atspi2/) and [XDG Desktop Portal](https://flatpak.github.io/xdg-desktop-portal/) — Linux desktop and Wayland capability constraints.
- [OWASP ASVS](https://owasp.org/www-project-application-security-verification-standard/) and [OWASP Cheat Sheet Series](https://cheatsheetseries.owasp.org/) — assess authentication, logs, threat model and API security.

## GitHub governance and CI official docs

- [Repository rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets) — free public repo coverage, PR/squash/branch enforcement.
- [GitHub Actions secure use](https://docs.github.com/en/actions/reference/security/secure-use) — full SHA pinning or stronger workflow lockfile controls; permission minimization, unsafe event contexts.
- [GitHub Projects quickstart](https://docs.github.com/en/issues/planning-and-tracking-with-projects/learning-about-projects/quickstart-for-projects) — fields/status/custom views.
- [GitHub Project automation](https://docs.github.com/en/issues/planning-and-tracking-with-projects/automating-your-project) — built-in workflows/API and free plan verification.
- [Adding issues to Projects](https://docs.github.com/en/issues/planning-and-tracking-with-projects/managing-items-in-your-project/adding-items-to-your-project).
- [CodeQL default setup](https://docs.github.com/en/code-security/how-tos/find-and-fix-code-vulnerabilities/configure-code-scanning/configure-code-scanning) — public repository support; analysis only after supported language exists.
- [GitHub CLI authentication](https://docs.github.com/en/github-cli/github-cli/authenticating-with-github-cli) — interactive login; **never transmit personal tokens via chat**.
- [GitHub authentication](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/about-authentication-to-github) — GitHub App is preferable to overprivileged long-lived PATs.

## Before copying external code

1. Inspect file LICENSE, dependency tree, copyright and provenance at a *specific commit*.
2. Check that the actual module is open source (local MIT does **not** make a separate remote server open source).
3. Prefer library/API-level integration; add LICENSE and NOTICE copies when legally required.
4. Re-run original and adapted tests; add permission-abuse/cancellation/path-race tests.
5. Document source/revision/modifications and security decisions in the PR.
6. Avoid brand, website design, visual assets or developer identity imitation. Present work transparently as one owner plus any real contributors.
