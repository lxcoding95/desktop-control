# Local MCP server (S02 feature branch)

**Current state — 2026-10-24:** implementation on `feat/s02-local-mcp-core` / [Draft PR #22](https://github.com/lxcoding95/desktop-control/pull/22), not merged to `main` and not an installable desktop product. At source checkpoint f9a6e6e, Windows and Debian full verification pass27 unit tests, Windows9 protocol pass+2 Linux skips, Linux10 protocol pass+1 Windows skip. Additional audit-failure/native-identity tests and final clean matrix are being completed; these are not independent acceptance. See the [live checkpoint](../../docs/sessions/session-02/SESSION-STATE.md).

## Purpose and authorization

One local stdio tool, `desktop_control.status`, returns only `{service, ready, api_version}`. No filesystem/shell/desktop/browser tools, public listeners or cloud connection. `readOnlyHint` is advisory, never authority.

`createServer()` defaults to **DENY_ALL_GRANTS**. Production start has no grant enrollment API, flags or environment override. A trusted host program can explicitly pass a readonly in-memory grant store; tests do this for the exact local principal. The grant must match `diagnostics.read` / `local:desktop-control`, be unexpired and not revoked. All negative paths must call the adapter zero times. Client text cannot supply identity or permission.

POSIX identity comes from actual process UID/eUID; root0 and differing IDs deny. On Windows the dedicated read-only native helper queries the Node process access token with PROCESS_QUERY_LIMITED_INFORMATION/TOKEN_QUERY, obtaining SID, integrity, elevation, UIAccess and session. Only normal local/domain account SIDs in an unelevated interactive medium-integrity token are supported. Missing helper, query failure, elevated/system/service/low-integrity or unsupported account identity fails closed. No SID appears in tool results/audits. This identifies the server process, not a distinct authenticated MCP client.

The Windows helper is built from repository C# source with the existing Windows .NET Framework compiler during test/build. It has no shell/network/grant functionality and requires no UAC. No binary is committed. Windows without that compiler is not yet a supported build host. See [native identity evidence/design](../../docs/sessions/session-02/NATIVE-IDENTITY.md).

A consent UI, persistent grant enrollment, device pairing, sandboxing and installer belong to later authorized work. S02 tests use explicit host-side fixture grants, not production enrollment. Never ship the fixtures as an enabled production entrypoint.

## Reproduce

Node>=22.19; pinned official MCP SDK server/core2.3.1, Zod4.6.7, TypeScript5.9.3. From root:

```sh
npm ci --ignore-scripts
npm run verify
npm ls --all
npm audit --json
```

Verify runs typed ESLint, full typecheck, source unit tests, build, then real 2026-07-28 stdio protocol tests. Windows compiles the native identity probe locally. Stdout carries protocol bytes only, stderr redacted audit decisions. Root privileges, production grant configuration and network access are not granted by these commands.

## Historical evidence (not current-head claims)

On2026-10-22, early Windows builds had18 units and test-type failures; Inspector2.12 negotiated2025-11-25, not modern discovery. Later extension2 repaired races and passed23 units/9 protocol checks on its dated source. Extension3 Linux at9789a610 passed24 units/8 protocols+1 Windows skip. Extension4 at e7792f1 passed26 units on both systems but Linux failed an overbroad socket assertion; Windows passed9 protocols+1 Linux skip. The then-workspace Zod4.6.5 advisory is fixed in the completion branch by the4.6.7 pin, subject to fresh final audits.

All detailed old results remain in [session records](../../docs/sessions/session-02/SESSION-STATE.md). Old DNS/build failures and synthetic-identity fixtures are historical. Current positive protocol fixtures derive native identity; grants remain test-only. No Qodo or ordinary Actions CI; SEC-GATE-001 and independent review remain binding. S03–S06 not started/not authorized.
