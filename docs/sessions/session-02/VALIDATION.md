# S02 Validation — 2026-10-22

**Scope of proof:** Only a locally prepared source copy of the bridge policy/status code was exercised in a container. The MCP SDK packages were NOT available, so **no successful protocol-level MCP result is claimed**.

## Environment

- Runtime: Linux isolated execution container (not the owner's Windows/Linux desktop).
- UTC sample: 2026-10-22T17:13:27Z.
- Node.js **v22.16.0**; npm **10.9.2**; installed global TypeScript **5.8.3**.
- Target for future supported SDK/Inspector integration: **Node >=22.19.0**. Current container does not satisfy this floor.
- Container cannot resolve GitHub/npm DNS; no registered Codex environment. No Work-mode handoff accepted.
- No permanent account secrets, credentials, admin tasks or network listening used.

## Commands and results observed

```sh
cd /mnt/data/desktop-control-s02
npm test
# TAP: 18 tests, 18 passed, 0 failed; Node --experimental-strip-types.
npm install --package-lock-only --offline --ignore-scripts --no-audit --no-fund
# FAILED: ENOTCACHED: @modelcontextprotocol/inspector metadata not in local npm cache.
tsc --noEmit --project tsconfig.json
# FAILED: TS2688: cannot find type definition file for 'node'.
```

Earlier initial test attempt: 9 policy cases passed, but status test suite failed resolving `./policy.mjs` from raw `.mts` source in Node's strip-types mode. Rewrote source imports to `.mts` plus `rewriteRelativeImportExtensions: true`, then reran both suites: **all 18 cases pass**. The initial failure is not hidden.

## Verified unit cases (18)

1. Default-deny for diagnostics.
2. Exact positive time-limited grant in synthetic test store.
3. Different OS principal denied.
4. Null OS principal denied.
5. Grant expiry at exact deadline denied.
6. Revoked grant denied.
7. Broken/unreadable grant store denied.
8. Wrong resource/capability denied.
9. Infinite/unsafe expiry denied.
10. Denied executor invokes adapter **zero times**.
11. Synthetic explicit grant returns exact bounded structured result.
12. Revocation between calls blocks next execution.
13. Already-aborted signal blocks adapter.
14. Adapter exceptions/wrong shape return redacted `INTERNAL_ERROR`.
15. Non-elevated POSIX principal resolves to expected UID.
16. UID/effective-UID mismatch fails closed.
17. Invalid POSIX identity fails closed.
18. Actual process principal is OS-derived without MCP user input.

**Important limitation:** These results are from a locally prepared copy, not a fresh `git checkout` plus `npm ci` from GitHub. No tested dependency lockfile was generated. Source/test files were separately committed to the GitHub branch via the connected GitHub API. Re-run clean-checkout tests when dependency installation becomes possible before merging as verified executable implementation.

## Unrun acceptance matrix

- S02-T01: **BLOCKED**, npm lock/install and TypeScript build (actual failures described).
- S02-T02: **NOT RUN**, real modern MCP `server/discover` / `tools/list` handshake.
- S02-T03: **PARTIAL** synthetic authorized executor unit test; no SDK protocol call.
- S02-T04: **PARTIAL** negative policy/executor unit tests; no protocol test.
- S02-T05: **NOT RUN**, actual Zod input validation across transport.
- S02-T06: **NOT RUN**, actual stdio traffic/no-socket test (source only includes stdio factory).
- S02-T07: **NOT RUN**, real EOF child shutdown.
- S02-T08: **PARTIAL**, cancelled executor unit; no transport oversize/timeout tests.
- S02-T09: **PARTIAL**, redaction unit; no full protocol logs reviewed.
- S02-T10: **PARTIAL**, exact package version intentions and OSS links present; npm lock and transitive inventory absent.

## Security posture

- Entry uses official `serveStdio`, not manually implemented JSON-RPC; per-request authorization resides immediately before the adapter.
- No production grant bootstrap exists; the packaged server is **deny-all**. Fixture grants only enter a programmatic `createServer({ grants })` injection for tests.
- Windows current local principal resolution fails closed, awaiting SID-based resolver with real Windows tests.
- Merely having a server factory in source does **not** demonstrate successful compilation or protocol operation.
- **SEC-GATE-001** remains open; do not run regular GitHub Actions, introduce unpinned workflows or call CI passing.
- Reviewable PR should remain open/draft until clean npm install, lockfile, exact SDK typecheck, modern Inspector list/call and negative tests run.

## Next reproducible verification in suitable environment

```sh
# Prereq: owner-authorized continuation of S02 with verified remaining budget
node --version                # >=22.19.0 expected
npm install --package-lock-only --ignore-scripts
npm ci --ignore-scripts
npm run typecheck
npm test
npm run build
# Then run Inspector v2 against node dist/packages/mcp-server/src/index.mjs
# and check modern + legacy handshake, denied tools/call, malformed args and EOF.
```

No domain, remote tunnel, public server, tokens, elevated shell access or Desktop/Browser capability added.

## Follow-up verification

At 2026-10-22T17:20Z, the OS principal extraction was split into `src/bridge/principal.mts`, updated to reject UID/effective-UID mismatches, and four additional tests were added. Local Node test runner rerun: **18/18 passed, 0 failed**. No SDK, typecheck or Inspector success is claimed.
