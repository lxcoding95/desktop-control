# S02 extension 4 — Windows and Linux acceptance verification

Tested commit: **e7792f1c782f28e0be4154e43ed596456022b409**, matching GitHub, Handoff, and both clean checkouts after git fetch + git pull --ff-only. Executed 2026-10-24. Scope: remaining S02 acceptance checks only; no production, test, dependency or workflow source modified.

**Verdict: acceptance remains BLOCKED.** Windows verify passes; Linux verify fails the new overly broad socket-descriptor assertion. npm audit now reports a high-severity runtime dependency advisory. Independent CodeRabbit result is pending, not approved. PR22 stays Draft/open/unmerged; S03–S06 locked; SEC-GATE-001 remains binding.

## Environment and commands

| Check | Windows 11 Pro x64 10.0.26300 | Debian12 x64, WSL2 kernel6.18.54.1 |
| --- | --- | --- |
| Node / npm | 24.21.0 / 12.2.0 | 24.22.1 / 11.19.1 |
| git fetch, pull --ff-only, HEAD/status | exit0 each, clean/e7792f1 | exit0 each, clean/e7792f1 |
| npm ci --ignore-scripts | exit0,210 added/212 audited | exit0,210 added/212 audited |
| npm run verify | **exit0** | **exit1** |
| typed ESLint / complete typecheck / build | pass | pass |
| unit tests | **26 pass/0 fail/0 skip/0 cancelled/0 todo** | **26 pass/0 fail/0 skip/0 cancelled/0 todo** |
| protocol tests (10 total per OS) | **9 pass/0 fail/1 skip/0 cancelled/0 todo** | **8 pass/1 fail/1 skip/0 cancelled/0 todo** |
| npm audit --json | **exit1**,1 high | **exit1**,1 high |

Stage exit markers were recorded for top-level commands. Inner lint/typecheck/test/build success follows the verify script's && chain; independent numeric exit receipts were not fabricated. Linux failure is in test:protocol after a successful build. Windows protocol skip: Linux /proc socket test. Linux skip: Windows malformed-input/no-TCP-listener/EOF test. Exact names, durations and stack trace: [Linux log](evidence-extension-4/linux-verify.log), [Windows log](evidence-extension-4/windows-verify.log).

Both new unit regressions pass on both systems: `revocation before deferred entry records deny, never false allow` and `cancellation before deferred entry records cancel, never false allow`.

## Linux socket-test failure diagnosis

The new `protocol-linux.test.mjs` asserts zero **all-kind** socket descriptors after discovery. It fails with three descriptors. Independent observation of a minimal Node child stdio echo control and of the built production MCP child shows exactly fd0,fd1,fd2 as connected unnamed Unix sockets. Their inode numbers match /proc/<pid>/net/unix, with **no owned TCP/TCP6/UDP/UDP6 entries** at the snapshot. Both children shut down with exit0 on EOF. See [diagnostic log](evidence-extension-4/socket-diagnostic.log) and diagnostic script.

This is a confirmed **test-oracle defect**, not evidence of an HTTP listener. Node's pipe-mode child stdio uses Unix sockets on this runtime. No product/test change was made in this verification-only task, and the failing suite was not relabeled green. Required follow-up: make the listener test distinguish inherited stdio Unix socketpairs from network/socket endpoints, retain failure on unexpected network sockets, and demonstrate the detector against a deliberately listening test child. Snapshot evidence does not rule out historical transient sockets.

## Native identity and authorization

- Native Linux uid/euid1000: localPrincipal returns posix:1000; a test-only in-memory exact grant permits one adapter call; exit0. This does not provision a production user-consent authority.
- **Actual Linux root uid/euid0**, via `docker exec --user 0` inside the existing cap-drop-ALL container: localPrincipal returns null; even a test grant cannot authorize it; PERMISSION_DENIED and **0 adapter calls**, exit0. No new capabilities, host elevation or host-root access added.
- First root-log redirection attempt failed with permission denied/exit1 because the root process lacks DAC override in the restricted evidence mount. Probe rerun with host-side stdout capture passes. No mount permissions were loosened.
- Native Windows access token has a SID, current token is not elevated administrator; SID value deliberately omitted from logs. Product localPrincipal is **null/fail-closed**, PERMISSION_DENIED,0 adapter calls, exit0. **Native SID-backed product authorization remains unimplemented/open.**
- Real differing uid/euid/setuid process: **not executed**. Existing pure-function mismatch tests pass but do not establish native setuid integration. No security scope reduction approved.
- Existing suites cover default-deny, grants, expiry/revocation, deferred-entry races, pre-entry/in-flight abort, wire cancellation and subsequent liveness, schema strictness, oversized input, sanitization and EOF. Positive SDK fixtures intentionally synthesize identity; native identity evidence above is separate.

## Installed LICENSE/NOTICE evidence

Per OS:245 external lock entries, **209 installed**,36 optional/platform-unselected absent; **207 named LICENSE/NOTICE/COPYING/copyright files** discovered/read/hashed (bounded recursive package scan excluding nested node_modules, maximum depth5). Installed manifests, resolved/integrity data, file hashes, copyright lines, actual runtime license texts and original full text bundle are saved in the evidence ZIP. This is a bounded inventory, not exhaustive legal/supply-chain approval or a declaration about a shipped artifact.

Common package license-file hashes agree across Windows/Linux. Exactly three platform-native installed packages differ: keyring, rolldown binding, lightningcss. Raw package-lock byte hashes differ due Windows CRLF checkout; LF-normalized lock hashes agree at `a3eb56f8874008396496f7af34d20bbad1259319ccb315e89c1bd334086a09b9`.

Installed runtime records: server2.3.1/core2.3.1 Apache-2.0, Zod4.6.7 and workspace-local Zod4.6.5 MIT. All four have standalone LICENSE text, saved with hashes. No separate NOTICE file discovered in this narrow runtime closure; no claim that bundled third-party notice obligations are fully discharged.

Six installed development records per OS lack a standalone matched license file: @humanfs/types0.15.0, platform-specific @rolldown/binding1.2.15, esrecurse4.3.0, imurmurhash0.1.4, natural-compare1.4.0, yoga-layout3.2.1. Follow-up inspection found embedded README license terms in esrecurse/imurmurhash and license mentions/links in some others; missing standalone files therefore do not imply unlicensed code. True distribution graph, all embedded notices, native binary provenance, MPL/Inspector terms and qualified redistribution sign-off remain open.

## New dependency advisory

Both installed audits report **Zod4.6.5**, workspace runtime dependency, affected range `<4.6.6`, [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5), high severity resource exhaustion. npm reports a non-major fix at4.6.7; upstream advisory lists4.6.6 as patched. SDK peer Zod4.6.7 is separately installed and does not fix the workspace-local4.6.5 record. This report does not claim the attack is reachable through the narrow strict-empty-object S02 tool; reachability/remediation remains open. No audit fix/force or lockfile update performed in this acceptance-only task. Prior zero-advisory output is historical and superseded.

## Independent review status

At latest observation, exact tested HEAD e7792f1 has **0 submitted reviews**; CodeRabbit context is **PENDING**, started2026-10-24T17:23:15Z. Last bot reply says review triggered. Historical COMMENTED reviews target44a96289/b8b16a89 and are not current-head approval. No requested/pending review is counted as passed. See review-status-latest.json. Robin absent in the earlier main detection; no new reviewer/CI installed and no Qodo used.

## Time and handoff

Owner-provided paused allowance: **1162 seconds**, same extension4, with **938 seconds** already conservatively charged of2100. Actual resumption **2026-10-24T17:25:36.4324424Z**, hard deadline **17:44:58.4324424Z**. Environment setup during the prior pause was not charged. Final checkpoint accounting is recorded in PROJECT-STATE.json and the time-accounting receipt; no budget reset and no additional session.

Remaining acceptance gates: correct/revalidate the Linux socket test; assess/remediate Zod advisory; complete native Windows SID/user-grant authority and native differing UID/eUID tests; actual distribution NOTICE compliance and qualified sign-off; independent current-final-head review. No merge, no release and no session3–6. Resume only under owner-controlled remaining budget/explicit authorization; do not automatically spend time after this checkpoint.


## S02 extension4 Work verification checkpoint — 2026-10-24T17:31:38.379Z

[Fresh cross-platform results](EXTENSION-4-WORK-VERIFICATION.md), tested HEAD e7792f1c782f28e0be4154e43ed596456022b409. Windows ci/verify exit0:26unit/9protocol pass+1Linuxskip. Linux ci exit0/verify exit1:26unit/8protocol pass+1failed socket assertion+1Windowsskip. Both audit exit1:high Zod4.6.5. Root uid/euid0 native denial confirmed; Windows SID authority remains absent. Independent review pending, license release signoff open. Same extension4 resumed 2026-10-24T17:25:36.4324424+00:00; stopped verification 2026-10-24T17:31:38.379Z; charged this resumed block 542s (362s elapsed rounded up + 180s publication reserve, capped at1162), total 1480/2100s; **conservative remaining 620s**. Publication must finish by 2026-10-24T17:34:38.379Z. No automatic continuation. No product/test/dependency edits, no merge/CI/Qodo/S03-S06.


## Superseding independent review receipt — 2026-10-24T17:32:12Z

CodeRabbit completed an independent incremental review on tested e7792f1c782f28e0be4154e43ed596456022b409, state COMMENTED, **4 actionable comments**, not APPROVED. Check context now SUCCESS means execution completed, not acceptance. Findings concern master-plan current status, extension4 session checkpoint (subsequently added by this publication), package README status, and excluding inherited stdio fd0-2 from the Linux socket test. The socket issue independently corroborates the real diagnostic above. Findings remain open for disposition; no fixes or thread resolutions claimed. Review excludes some paths and does not constitute a full license/security audit or final documentation-head approval. Earlier pending observations above are superseded. Full received review body/comments are in the local evidence ZIP. Budget remains620s; this receipt is within the previously charged publication reserve.

