# ADR-0004 — Local MCP Foundation (S01)

**Date:** 2026-10-22  
**Status:** Accepted for S02 implementation scope; **NOT IMPLEMENTED**  
**Owner issue:** [#5](https://github.com/lxcoding95/desktop-control/issues/5)  
**S02 issue:** [#6](https://github.com/lxcoding95/desktop-control/issues/6)  
**Baseline:** `main` e125ccfba8b19655cb08e3e38abc6b3dabd170f9  
**Supersedes:** No product decisions in ADR-0001, ADR-0002 or ADR-0003; this ADR makes the S02 vertical slice concrete.

## Decision

1. **TypeScript on Node.js** for the first local MCP adapter and policy core. Target **Node.js >= 22.19.0**, justified by current Inspector requirements; confirm exact engine ranges on locked dependency installation. Use strict TypeScript, ESM, npm workspaces and a committed npm lockfile once code exists. Electron/Tauri, native bridges and OS-specific layers are postponed until evidence supports a choice.
2. **Official MCP TypeScript SDK v2**: package `@modelcontextprotocol/server` (observed npm v2.3.1 on 2026-10-22, Apache-2.0) and `zod/v4` for tool schemas. The old `@modelcontextprotocol/sdk` v1 is maintained for pre-2026-07-28 protocol era; do not silently mix snippets. Pin exact resolved versions and check advisories/licenses before S02 code or reuse. No SDK code has been copied here.
3. **Protocol target:** MCP **2026-07-28**, SDK v2. No homegrown JSON-RPC transport or legacy handshake. Use official SDK compatibility layer only if an actual client requires legacy behavior and document that compatibility separately. Modern per-request protocol metadata and version negotiation must be exercised in genuine client tests, not assumed from v1 examples.
4. **Transport:** locally launched **stdio only** for S02. No web listener, port forwarding, tunnel, remote gateway, OAuth, published npm package or ChatGPT integration yet. Stdio JSON-RPC protocol messages must be the only content on stdout; diagnostics go to stderr. Respect EOF, cancellation, timeouts and client disconnect; test with the official Inspector.
5. **Small first vertical slice:** `desktop_control.status` diagnostic **read-only** tool, structured response, bounded output, host-side `diagnostics.read` policy check. A denied authorized-tool call must report denial rather than inadvertently execute; negative tests must distinguish policy rejection from unknown-tool response. See [S02 contract](../contracts/S02-LOCAL-MCP-CONTRACT.md).
6. **Modular responsibility boundaries** (logical interfaces first, not premature directories):
   - `mcp-server`: MCP registration, stdio, schema validation, result mapping.
   - `shared`: tool contracts, error categories, non-secret audit events.
   - `bridge`: local identity/context, permission evaluation, cancellation, adapters.
   - `adapters`: diagnostics first, filesystem/terminal/browser/desktop later.
   - `ui`: local approvals/tray/dashboard later; absence of UI cannot be treated as approval.
   - `tests`: unit/negative/integration and actual OS-specific tests later.
7. **Authorization boundary:** The local server's transport does not prove identity; the launcher and OS account are the initial local principal, not untrusted client-supplied identity strings. Evaluate policy at the bridge **immediately before execution**; **deny by default**, do not infer approval from MCP schema, profile name or a model response. Only explicitly local-enrolled permissions count. With no policy provisioning in S02, `desktop_control.status` remains denied by default; tests must explicitly grant `diagnostics.read` in an isolated fixture and revoke it. Do not introduce a private secret or permissive production fallback.
8. **No artificial sandbox claim:** Admin/root, arbitrary shell and browser control cannot be bounded by string allowlists alone. Such operations are not part of S02. Profile LOW/MEDIUM/FULL/CUSTOM is UX permission selection, not OS-enforced isolation by itself.
9. **First developer workflow:** local repository checkout, Node version verification, dependency install with locked versions, unit/negative tests, build/typecheck and `npx @modelcontextprotocol/inspector` stdio tool discovery/call checks. Exact invocations will be added with runnable code. Inspector v2 (observed npm v2.12.0) is a development-only dependency; its secrets store may be plaintext on OS hosts lacking a keychain, so use no real accounts/tokens in initial tests.
10. **SEC-GATE-001 stays active.** Do not add unpinned Actions or enable regular CI. Local test results and commits must be reported separately from unrun Windows/Linux matrix.

## Alternatives considered

| Candidate | Benefits | Costs/risks | S01 outcome |
| --- | --- | --- | --- |
| Node.js + TypeScript MCP SDK v2 | Official current typed SDK, fast local stdio, shared TypeScript schemas, minimal packaging overhead | Node runtime and JS dependencies; local OS integration still distinct | **Selected for S02** |
| Rust-first bridge/MCP | Compiled binaries, system-language ownership model | More integration surface, slower first vertical slice, no demonstrated OS-specific benefit yet | Revisit only if a concrete security/performance need arises |
| TypeScript MCP SDK v1 | Existing examples and deployed compatibility | Protocol-era mismatch with current 2026-07-28 and future migration | Not chosen for new code; compatibility may be tested |
| Electron vs Tauri | Both can ship a visible tray/dashboard shell | Native platform/API and installer support unverified | Defer to S05 compatibility spike |
| Streamable HTTP local listener | Supports out-of-process browser/clients | Origin, CSRF, auth, socket ownership and exposure complexity | Defer beyond S02 |
| Reuse Desktop Commander / Playwright MCP | Mature OSS patterns for later file/process/browser adapters | Licensing, privileged tools, profile/secret boundaries; no safe blanket copy | Source research only, not vendored |

## Security and future integration boundaries

```text
Local MCP client launches stdio child (same OS account)
  -> official MCP v2 transport + schema validation
  -> bridge policy: local principal + capability + resource + active grant
  -> diagnostics adapter only in S02
  -> bounded typed result + redacted audit to stderr
Future (not S02): UI approval and revocation; process/file adapters; visible isolated AI browser;
       interactive OS GUI bridge; protected loopback dashboard; private ChatGPT connector.
```

- Treat tool inputs, filenames, documents and web pages as untrusted. Never interpret content as a grant of authority.
- Refuse and audit denied requests without exposing private path/secret data.
- Track request ID, policy decision, action, elapsed time and sanitized error; no prompts, tokens, passwords, or raw file contents by default.
- Apply output size, input schema, cancellation and timeout policy before privileged adapters.
- Browser remains the separately profiled, **headed** Chromium-based environment specified by ADR-0002; Playwright native actions should not seize the user's OS cursor. Autologin requires exact prior origin/account approval; sensitive account actions require separate confirmation.
- Windows UIA and Linux X11/Wayland capabilities are future OS-test items, not promises.

## Sources verified during S01 (public reference, no code imported)

- MCP 2026-07-28 transport: https://modelcontextprotocol.io/specification/2026-07-28/basic/transports
- MCP stdio framing and cancellation: https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/stdio
- TypeScript SDK v2: https://ts.sdk.modelcontextprotocol.io/v2/
- v2 tool registration: https://ts.sdk.modelcontextprotocol.io/v2/servers/tools.html
- v2 stdio: https://ts.sdk.modelcontextprotocol.io/v2/serving/stdio.html
- npm server package (v2.3.1 observed): https://www.npmjs.com/package/@modelcontextprotocol/server
- Official Inspector (v2.12.0 observed): https://www.npmjs.com/package/@modelcontextprotocol/inspector
- Inspector docs: https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/docs/2026-07-28/tools/inspector.mdx
- Planned optional OSS for later: https://github.com/wonderwhy-er/DesktopCommanderMCP and https://github.com/microsoft/playwright-mcp

**Provenance rule:** Every future directly copied file needs an exact upstream commit SHA, license, attribution and adapted tests. None copied in S01.

## Validation and rollback

This ADR records a design choice, not a built server. GitHub read/checkpoint evidence can be verified; runnable MCP and OS test results are **not available**. Revert the associated PR through a new PR if this architecture proves untenable; do not alter protected `main` directly.
