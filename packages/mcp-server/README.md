# Local MCP server prototype (S02)

**State: experimental source implemented; legacy MCP Inspector integration partially verified on prior Windows checkout; latest GitHub head's modern SDK protocol/build not verified.**  
[Session #6](https://github.com/lxcoding95/desktop-control/issues/6) · [Architecture ADR-0004](../../docs/architecture/ADR-0004-MCP-FOUNDATION.md) · [S02 validation](../../docs/sessions/session-02/VALIDATION.md)

## Purpose and trust boundary

The first MCP stdio process registers one tool, `desktop_control.status`. It does not open a listening TCP port, operate a shell, read arbitrary files, move a desktop cursor, launch a browser or connect to ChatGPT. Its `readOnlyHint` tool annotation is **not** a permission grant.

`createServer()` supplies **no grants** by default. Calling the status tool without an explicit trusted host-side `diagnostics.read` grant returns an `isError` result containing `PERMISSION_DENIED`; the diagnostic adapter must not run. A development-only synthetic grant can be supplied programmatically to `createStatusExecutor()` or `createServer({ grants })` in tests. There is **no production user grant enrollment or approval UI yet**. Do not expose test fixture injection through MCP or command-line flags.

POSIX principal derives from the user ID of the current process (and must not be elevated). On Windows, the current stub **fails closed** until a verified SID-based principal resolver is available. Neither MCP arguments nor text in documents can change the principal or grant store.

## Supported dependency intentions

- Node.js >=22.19.0 for the planned SDK/Inspector workflow.
- `@modelcontextprotocol/server@2.3.1` (official v2 SDK, MCP 2026-07-28).
- `zod@4.6.5` for strict input/structured output.
- TypeScript 5.9.3; MCP Inspector 2.12.0 for later local smoke tests.

Versions are pinned in the committed `package-lock.json` (v3, generated on Windows, 163 package entries). In the **earlier Windows Work checkout**, `npm ci --ignore-scripts` succeeded with 125 packages and `npm audit` reported zero known advisories; no complete license/security certification is claimed. The isolated Linux Chat container still lacks registry DNS; latest GitHub head has not been rebuilt with these dependencies. Do not publish this prototype as a distributable application. Do not publish this prototype as a distributable application.

## Development / actual status

```sh
# From repository root, only in a suitable development environment:
node --version
npm ci --ignore-scripts   # use committed package-lock.json; do not regenerate unreviewed
npm test
npm run typecheck
npm run build
npm run start:mcp
```

The `npm test` script runs the pure policy/executor unit tests against source TypeScript using Node's type-stripping and does not load the MCP SDK. **18 versioned source tests passed on an earlier real Windows checkout, and 20 tests passed in a later prepared Linux source copy** (two newer tests not versioned); neither result verifies the latest full SDK build. Previous Windows `npm ci` and MCP Inspector `initialize`, `tools/list` and denied `tools/call` passed at protocol **2025-11-25**; full `npm run typecheck` and `npm run build` **failed** on test typing (subsequently edited, not fully rerun). Modern 2026-07-28 discovery, clean latest-head build, positive grant and lifecycle checks remain unverified. See [Windows continuation](../../docs/sessions/session-02/CONTINUATION-2026-10-22.md) and [extension checkpoints](../../docs/sessions/session-02/EXTENSION-2026-10-22.md). See [full evidence](../../docs/sessions/session-02/VALIDATION.md).

After the SDK build succeeds, an authorized S02 continuation must verify the 2026-07-28 `server/discover` flow, `tools/list`, denied `tools/call`, strict schema validation, EOF shutdown, and positive tests with a harness-injected scoped grant, using an actual client or MCP Inspector.

**Security:** Production defaults to deny-all; STDOUT reserved strictly for MCP; STDERR contains redacted capability decision entries. SEC-GATE-001 still blocks ordinary GitHub Actions CI. This project does not claim OS sandboxing from a command allowlist.
