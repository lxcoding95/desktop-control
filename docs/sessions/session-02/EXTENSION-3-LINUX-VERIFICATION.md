# S02 extension 3 — Linux verification and interrupted-run closure

Published 2026-10-24. This is documentation-only recovery of the 2026-10-22 run, not a new development session or a renewed budget.

## Provenance and timing

- Previously charged extension-3 time: 402 of 2100 seconds; owner-authorized remainder: 1698 seconds.
- Actual resumption recorded on host: 2026-10-22T20:06:40.8216927Z.
- Hard deadline: 2026-10-22T20:34:58.8216927Z.
- Last completed product-check log: 2026-10-22T20:07:36Z. This is NOT a verified pause or end of all work: source inspection and review dispatch followed.
- Chat was interrupted before checkpoint publication. On recovery 2026-10-24T17:00:32Z, the deadline had elapsed. No reliable pause timestamp or exact active-time total exists for the interruption.
- Exact active time and recoverable remainder: **UNVERIFIED**. Conservatively usable remainder: **0 seconds**, capped charged allowance 2100/2100 seconds (402 prior + 1698 reserved resumed window). This does not claim 2100 seconds of measured active work or two days of development. Do not infer or silently restore unused time.
- No product tests, source changes, new session, or continued development performed on October 24; only evidence recovery and authorized GitHub checkpoint publication.

## Tested target and environment

Branch feat/s02-local-mcp-core. Initial pause head 590439f1bd05bcc545489029e2da7bdb3042673a was fast-forwarded to **9789a61089f9fcd5de5f9df286a3d438e86ad217**, matching GitHub and Issue #6's environment handoff. The advancement contained environment/state documentation only. Clean tree before and after checks.

Container desktop-control-linux-env-20261022, Debian 12, x86_64, actual Linux kernel 6.18.54.1-microsoft-standard-WSL2. Node **24.22.1**, npm **11.19.1**, actual uid/euid **1000**. On October 24 the Docker engine was stopped/unavailable; it was not restarted for new tests. These are dated execution results, not a claim that the container is currently running.

## Real results

Full raw [command log](evidence-extension-3/linux-verify.log) and [runner](evidence-extension-3/run-linux-verification.sh).

| Command | Exit | Result |
| --- | ---: | --- |
| git fetch origin | 0 | Remote synchronized |
| git pull --ff-only | 0 | Up to date after initial fast-forward |
| git status --short --branch | 0 | Clean before/after |
| git rev-parse HEAD / git ls-remote | 0 / 0 | Matching 9789a610 head |
| uname -a / node --version / npm --version / id | 0 each | Linux/versions/uid above |
| npm ci --ignore-scripts | 0 | 210 installed, 212 audited; zero reported advisories |
| npm run verify | 0 | Typed lint, complete typecheck, unit tests, build, protocol tests |

The verify script uses && between stages; every stage succeeded. Separate numeric stage exit markers were not recorded, so their success is established by execution of the following stage and the final exit 0, not invented independent command receipts.

- Unit tests: **24 tests, 24 pass, 0 fail, 0 cancelled, 0 skipped, 0 todo**.
- Protocol tests: **9 tests, 8 pass, 0 fail, 0 cancelled, 1 skipped, 0 todo**.
- Explicit skipped test: `production built entry on Windows: malformed input, no TCP listener and EOF`; guarded for win32. No Linux no-listener result can be inferred from this skip.

## What the evidence establishes

- Actual non-root POSIX localPrincipal derivation under uid/euid1000 passes.
- Root and setuid mismatch refusal pass as pure-function negative cases. No actual root/setuid OS-process integration test was executed; keep that distinction explicit.
- Missing/expired/revoked grants deny; denied adapter call count remains zero. Revocation between calls and before deferred entry pass.
- Pre-entry and in-flight cancellation and timeout/redaction pass in unit tests; actual SDK wire cancellation and subsequent liveness pass.
- Modern 2026-07-28 stdio discovery, strict arguments, default denial, unknown tool, EOF, and oversized unterminated input termination pass.
- Positive/expired/revoked/error stdio fixture uses a **synthetic POSIX identity** in an isolated child; not a native identity-authentication or Windows SID proof.

## Open gates and review limits

Native Windows SID authority remains unimplemented/fail-closed. Linux malformed-input/no-TCP-listener coverage and real root/setuid OS integration remain unverified. Complete license/notice/redistribution review remains open. Two read-only review subtasks were dispatched (semantic/security and license inventory), but no completed review result or artifact survived this run; neither is a passed gate. Robin was absent from origin/main; it was not installed or invoked. Existing static checks and historical bot checks are not independent semantic approval.

PR #22 stays **Draft/open/unmerged** and Issue #6 stays open. No Qodo, no CI activation, no merge, no paid services or other repositories changed. SEC-GATE-001 remains binding; S03–S06 not started and locked.

Next action: obtain an explicit owner budget decision before any further S02 development; then refresh exact HEAD and finish the open native-platform, licensing and independent-review gates. Do not restart a 25/35-minute interval automatically.
