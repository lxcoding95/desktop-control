# ADR-0003 — Local-first Desktop App, CLI and MCP Transport

**Status:** **ACCEPTED — OPTION 1 LOCAL-FIRST** | **Date:** 2026-10-22 | **Product code:** none | **Development sessions:** 0/6.
**Tracking:** [#17](https://github.com/lxcoding95/desktop-control/issues/17), [Deployment plan](DELIVERY-LOCAL-FIRST.md), [ADR-0001](ADR-0001.md).

## Context

The owner has neither domain nor public infrastructure today. The product goal combines an installable ChatGPT/MCP plugin, a full interactive local Windows/Linux computer-control bridge, a separate visible AI browser, a tray/dashboard and an expert `npx` route, while remaining initially free and open-source.

A website in a cloud browser cannot directly execute privileged local Windows/Linux tools without a local companion or an approved local executor. A terminal-only interface is not ideal for ordinary users. Remote ChatGPT web connections need a supported network connection; modern OpenAI docs support a private Secure MCP Tunnel subject to account/organization/workspace authorization, but public plugin submission requires a stable public HTTPS service.

## Accepted owner decision — 2026-10-22

1. Build **one local desktop-hosted execution core**, initially via a tiny TypeScript/Node MCP server and a local browser/permission integration, later packaged as an OS app with tray.
2. Keep the initial **local dashboard bound only to localhost** and the browser profile separate and visible; no public site for the local MVP.
3. Support local **stdio MCP** as the baseline and a localhost HTTP adapter after safety checks. Use **official Secure MCP Tunnel as optional bridge to ChatGPT web** only if access, cost and security are verified. No permanent public gateway at this phase.
4. Provide developer/advanced CLI via version-pinned npm/`npx` package, but final novice UX is graphical installer + settings, with CLI optional.
5. Reserve centrally hosted HTTPS MCP, OAuth, registration, published website/domain and multi-device relay for a later, separately authorized, costed and secured stage.
6. Keep existing GitHub safety gates, especially SHA-pinned GitHub Actions before regular CI.

The owner selected **Option 1 — Local-first**: first build and verify the local MCP core with a local MCP client or MCP Inspector; connect ChatGPT afterwards. Target delivery is an installable Windows/Linux app with tray, dashboard and its own visible AI browser. A version-pinned npx entry point is an additional developer/expert route. No domain, public server or paid cloud infrastructure in the first phase. This decision does not authorize a development session.

## Considered alternatives

| Alternative | Benefit | Downside | Decision |
| --- | --- | --- | --- |
| Public website only | Easy UI updates | Cannot by itself execute local OS actions; remote auth/hosting overhead | Reject as entire product |
| Pure `npx` CLI | Rapid prototype and developer convenience | Node prerequisite, awkward for average users, poor local consent visibility | Developer/Expert mode |
| Local native/Electron/Tauri app only | Best usability for desktop | Packaging/platform variance; ChatGPT web connection not automatic | Main product |
| Central hosted gateway from day one | Web ChatGPT compatibility | Domain, cost, OAuth, multi-user infrastructure before validating local tools | Defer |
| Local app + private Secure MCP Tunnel | No public port/domain for private tests | Eligibility/Platform account and key management, no public marketplace submission | Conditional test path |
| Local app + direct public dev tunnel | Simple temporary URL | High risk if powerful desktop MCP exposed; auth misconfig potential | Only isolated read-only security-reviewed tests |

## Unresolved technical gates

- Owner priority confirmed: local MCP proof first; ChatGPT connection afterwards.
- Test OpenAI workspace/platform tunnel availability, costs and secrets hygiene without collecting API keys in conversation.
- Select Electron vs Tauri app shell only after a small OS/platform/library compatibility spike.
- Verify MCP TypeScript SDK v2 package versions; do not rely on stale snippets from older plugins docs.
- Validate install/uninstall on Windows/Linux and loopback CSRF/auth handling before declaring a working app.
- Public distribution of local desktop-only plugins is partner-allowlisted; no public-plugin promise before OpenAI submission eligibility.

## No implementation permission

This ADR is research-only. **Session 1 has not started** and no runtime, CLI, installer, paid platform instance, public server or domain has been created.
