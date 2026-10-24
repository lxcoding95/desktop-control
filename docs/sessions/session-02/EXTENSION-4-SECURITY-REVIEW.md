# S02 extension #4 — maintainer-side security review and remaining gates

**Review date:** 2026-10-24. **Scope:** `lxcoding95/desktop-control` S02 feature branch and Draft PR #22. This is an **author-side technical review**, **not independent human/AI approval**. No clean checkout or real SDK tests were executed in this Chat-mode container; Node v22.16 and npm/DNS unavailable here. The last actual Windows/Linux green build runs were on the **earlier tested source**; do not transfer their green status to commits made after the runs.

## Test/provenance baseline

- Verified 8/8 SHA-256 checksums for owner-supplied `S02-extension3-evidence.zip`, including dated Linux stdout/stderr/exit evidence. The identical Linux log is committed under `docs/sessions/session-02/evidence-extension-3/linux-verify.log`.
- Linux **tested head** `9789a61089f9fcd5de5f9df286a3d438e86ad217`: Debian12/WSL2, Node24.22.1, npm11.19.1, `npm ci` exit0, `npm run verify` exit0, **24/24** unit tests, **8/9** protocol passes with **1 Windows-only skip**. Root/setuid checks there were pure-function negative tests; non-root UID/eUID1000 process identity actually used. Windows native SID not exercised.
- Previous Windows extension #2: `npm run verify` exit0, 23/23 unit and 9/9 modern protocol checks, with synthetic-grant limitations; actual successful processes logged in that extension.
- **Commits AFTER the latest Linux product run, untested as a clean source tree:** audit decision timing [`cb902b49`](https://github.com/lxcoding95/desktop-control/commit/cb902b49d3fd5316a4e247a8139af8704007a35e), new regression tests [`5ab081a0`](https://github.com/lxcoding95/desktop-control/commit/5ab081a0b639a8b5761e7a59f58f195185b4dbf9), Linux /proc socket FD test [`6b9beb7d`](https://github.com/lxcoding95/desktop-control/commit/6b9beb7dbce623579d179549d94492310fc9a55e), and `main` governance integration [`c76e0b5f`](https://github.com/lxcoding95/desktop-control/commit/c76e0b5f0baabdc3d06989fa5c9902a1995bcde4).
- No CI workflows were introduced. [SEC-GATE-001 #1](https://github.com/lxcoding95/desktop-control/issues/1) remains open.

## Source-reviewed security boundaries

| Boundary | Code observation | Verification |
| --- | --- | --- |
| Production policy default | `createServer` injects `DENY_ALL_GRANTS`; no grant enrollment through stdio args/environment | Existing protocol denied-call tests pass on earlier head; current head rerun required |
| OS principal | `localPrincipal` binds to actual `process.getuid/geteuid`; effective UID mismatch and root UID 0 fail closed; Windows returns `null` | Linux non-root integration and pure-function negatives passed; native Windows SID/grants remain unavailable |
| Revocation race | `createStatusExecutor` revalidates immediately before invoking adapter | Earlier red/green Windows regression and Linux 24-unit passes |
| Cancellation/timeout | Pre/in-flight abort, timeout and response sanitization exist; no shell/browser/network listener in production source | Earlier SDK/unit tests only; new head retest required |
| Log reliability **found defect** | Before extension #4 the code called `audit('allow')` before an asynchronous final authorization check, permitting a misleading *allow* audit event if revoked/cancelled before adapter entry | Changed to log `allow` after final validation; `deny`/`cancel` emitted on those deferred failures. Added two targeted regression tests. **Not yet executed** |
| Linux process socket descriptors | Existing Windows-only listener/EOF test was skipped under Linux, so absence of Linux sockets had not been measured | Added Linux-only `/proc/<pid>/fd` socket-descriptor + modern `server/discover` + EOF test. **Not yet executed**; snapshot checks open descriptors, not all historical network operations |
| Identity protocol trust | Host UID represents the *server process*, not an authenticated distinct MCP client; positive fixture overrides identity in a test-only child | Native Windows SID and user-consent/grant authority are absent; **do not represent the S02 prototype as production-authorized computer control** |

## License and supply-chain review

[Versioned lockfile inventory](EXT4-DEPENDENCY-PROVENANCE.md): 248 lockfile records, 245 external registry entries with integrity and npm registry URLs, all third-party lock entries report license metadata. Estimated **four-package runtime closure** (server/core 2.3.1 Apache-2.0, local Zod4.6.5 and peer Zod4.6.7 MIT); Inspector is development-only and has mixed upstream license wording. Development tree has 12 MPL-2.0 Lightning CSS records. Recorded metadata and upstream versioned LICENSE links are not complete installed-package NOTICE/redistribution compliance. Packaging is deferred; no release is authorized.

## Required outstanding acceptance proof

1. In Work's **actual Debian12 Docker** environment: fetch current PR22 head, `npm ci --ignore-scripts`, `npm run verify`; require **all tests** pass, record exact new counts; prove new Linux /proc socket FD test pass. Repeat Windows `npm run verify` for new head, noting Linux-only test skip. Check `git diff --check`, lint and no logged secrets.
2. Securely validate Windows SID/identity and authorized grant boundary with proper Windows OS APIs and a locally permissioned grant source, **or** document a separately owner-approved S02 scope reduction that keeps production **permanently deny-all** with native SID deferred. This review does not authorize reducing acceptance criteria.
3. For native Linux privilege boundaries, obtain appropriately isolated **real root/setuid process** negative evidence if in scope; synthetic `posixPrincipal(0,0)` alone does not establish runtime behavior.
4. Inspect **installed** package LICENSE/NOTICE content, verify exact versions/checksums and true target-ship graph, emit third-party notices inventory/SBOM; get qualified compliance signoff for any redistribution.
5. Obtain **independent semantic/security review of current final head**, resolve findings; CodeRabbit incremental request was made during this extension but **no approval is claimed**.
6. Update PR22/Issue6/checkpoint and repeat final clean checks; only then move from Draft, review protected-main merge eligibility and issue closure. Continue to observe SEC-GATE-001; do not start S03–S06.

**Disposition at this checkpoint:** New source improvements implemented and documented, **validation pending**, **no independent acceptance**, PR22 **Draft/open/unmerged**; no additional product capabilities or public transport added.
