# S01 Open-source component review and evidence register

**Reviewed:** 2026-10-22 | **Decision:** foundation only | **Imported external source files:** 0  
**S01 issue:** [#5](https://github.com/lxcoding95/desktop-control/issues/5)

The following are public upstream observations, **not audited/signed releases or tested integrations**. Packages/revisions must be locked and rechecked when introduced. No third-party implementation or asset was copied in S01.

| Candidate | Source and reported license | What it contributes | Decision / concerns |
| --- | --- | --- | --- |
| MCP TypeScript SDK v2 | [Upstream](https://github.com/modelcontextprotocol/typescript-sdk), [server npm package](https://www.npmjs.com/package/@modelcontextprotocol/server); Apache-2.0; server v2.3.1 observed | Maintained MCP 2026-07-28 tools and stdio, typed schemas | **Select** for S02; pin versions/verify dependency tree and real protocol tests |
| MCP Inspector v2 | [Upstream](https://github.com/modelcontextprotocol/inspector), [npm](https://www.npmjs.com/package/@modelcontextprotocol/inspector); v2.12.0 observed | Web/CLI/TUI local protocol tests | **Select** as dev tool only; requires Node >=22.19, secrets may be plaintext without keychain; use dummy fixtures |
| Desktop Commander MCP (local) | [Upstream](https://github.com/wonderwhy-er/DesktopCommanderMCP), [license](https://github.com/wonderwhy-er/DesktopCommanderMCP/blob/main/LICENSE); MIT per source repository | Future file, directory, terminal and process capabilities | **Study later in S03**; never copy remote proprietary service, privileged tools require host-bound policy; retain upstream attribution |
| Playwright + Playwright MCP | [Playwright](https://github.com/microsoft/playwright), [Playwright MCP](https://github.com/microsoft/playwright-mcp), [license](https://github.com/microsoft/playwright-mcp/blob/main/LICENSE); Apache-2.0 for Playwright MCP | Headed persistent browser, accessibility-based actions | **Candidate for S04**; constrain session state/credentials and sensitive actions; avoid exposing unrestricted browser scripting |
| Electron | [Upstream](https://github.com/electron/electron), [MIT](https://github.com/electron/electron/blob/main/LICENSE) | Tray, native window and Chromium shell | **No selection now**; memory/installer and OS integration costs require actual platform spike |
| Tauri v2 | [Upstream](https://github.com/tauri-apps/tauri), MIT/Apache-2.0 by package | Web UI + Rust/native app shell | **No selection now**; Linux WebKit/system dependencies and Windows integration must be tested |
| Native desktop adapters | [Windows UIA](https://learn.microsoft.com/en-us/windows/win32/winauto/entry-uiauto-win32), [XDG portal](https://flatpak.github.io/xdg-desktop-portal/) | Supported platform accessibility and consent | **Later OS-specific adapters**, not cross-platform equivalent to unrestricted mouse control |

## Why no large upstream copy in S01?

The goal of S01 is a minimal **contract** for a safe, working vertical slice in S02, not broad terminal/browser functionality. Copying an existing MCP server wholesale would risk importing broad filesystem/process/browser power before the local permission engine is operational. We adopt the **maintained upstream SDK** as a future dependency, not fork/replicate its transport. Selection of Playwright and Desktop Commander adapters occurs only in sessions allocated for them after module-level provenance and tests.

## Version/license evidence status

- **Observed, not installed:** `@modelcontextprotocol/server@2.3.1` on npm, Apache-2.0; `@modelcontextprotocol/inspector@2.12.0` on npm. These are research observations, not an npm lockfile.
- **Validated in project via GitHub:** no dependency installed, no import, no permission gate code, no Windows/Linux runtime exercised.
- **Required before implementation:** inspect package lock and transitive licenses; check npm engines; exact upstream release/tag/commit provenance; check known security advisories; record attribution and license notices.
- **Policy:** MIT project license does not erase upstream Apache-2.0 notices. Third-party logo/brand assets are not reused.
- **SEC-GATE-001:** do not add GitHub Actions to validate this ADR; no workflow status claimed.

## Relevant protocol distinction

The 2026-07-28 spec supports stdio with per-request version/capability metadata and a new protocol era compared with 2025-11-25's initialize handshake. The current v2 SDK owns version negotiation and can serve legacy clients through its compatibility path. **Do not hard-code a v1 initialize assumption into S02 tests.**

## Remaining research before S03/S04/S05

- Actual Desktop Commander source modules + test files at a pinned SHA, with path canonicalization/race and process cancellation study.
- Chromium persistent-profile encryption/credential handling and origin-specific approval enforcement.
- Windows UIA interactive desktop/UAC; Linux X11/Wayland portal support across at least one real host each.
- Electron/Tauri trial build, packaging, expected bundle size and security isolation in actual environments.
- Browser/desktop permission prompt with local user precedence and black virtual cursor; no independent OS hardware cursor claim.

## Official documentation and project restrictions

- https://modelcontextprotocol.io/specification/2026-07-28
- https://ts.sdk.modelcontextprotocol.io/v2/
- https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/docs/2026-07-28/tools/inspector.mdx
- [Existing reuse policy](../governance/REUSE-LICENSES.md)
- [AI Browser profile](../architecture/AI-BROWSER-PROFILE.md)
- [S01 ADR](../architecture/ADR-0004-MCP-FOUNDATION.md)
