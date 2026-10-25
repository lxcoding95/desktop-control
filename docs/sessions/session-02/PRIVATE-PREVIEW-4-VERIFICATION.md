# Private preview.4 candidate — verification checkpoint

This is an **unaccepted release candidate**, not a public release or S02 closure. Owner prioritizes a bounded working private plugin; signed unattended bridge updates, general password/download/account management and unsupported Linux desktop/UI are not claimed by this preview.

## Source and continuity

- Recovered local source preserved at `3e4eabf`.
- Upstream private archive hardening `df5879eb4fda5d4f737f55942660e654490bbc81` merged at `51f9df322a3b5f67aa77612cfd556d313db05fec`; both hardened ZIP checks and expanded runtime inventory retained.
- Main remains protected/unmerged. Existing PR22/26/30/31/33 must not be closed merely to reach zero.
- First exact resumed checkpoint2026-10-25T10:22:00.4190848Z. Earlier interruption since03:57 is not measured continuous work. Historical session/time accounts remain unchanged.

## Reproduced findings and disposition

| Finding | Disposition and actual evidence |
| --- | --- |
| Workspace revoke during job ignored | Poll protected policy, abort runner, suppress late success; regression red then green |
| Terminal can replace writable flock inode | Protected read-only external lock plus host-owned Docker name reservation; real hostile-tamper/concurrency test |
| Docker cleanup failure silently accepted | Verify absence, quarantine failed names and refuse later launches until verified repair; injected failures tested |
| Stager parent junction redirects deletion | Canonical parent/reparse guard; actual junction regression preserves external marker |
| Local consent displayed only tool name | Exact immutable argument JSON displayed locally, ASCII escaped, bounded, default Cancel; no values logged |
| Settings/input race | Serialized transitions and urgent-stop barrier; new work waits for protected settings PID |
| Screenshot structured geometry stripped | Full structured output retained;2contract/redaction tests passed |
| Browser selected-tab output mismatch | Output schema matches `{tabId,active:true}` |
| Esc leaves queued actions admitted | Host sequencer interrupted before async cleanup; durable protected browser/desktop stop markers; only matching explicit local regrant clears |
| Browser Esc callback failure permits restart | Synchronous instance latch/generation invalidation; real red reproduction and managed browser regression |
| Invalid Windows system cursor IDs | Exact13documented IDs, partial rollback/start cleanup; native actual T4 passed |
| ZIP Windows aliases | Reject forbidden characters and normalized reserved components;84normal/optimized checks passed |

## Actual component evidence

- Windows11 Pro x64, Node24.21.0/npm12.2.0.
- Native desktop T4:1PASS/0FAIL/0SKIP, actual own-window input/banner/cursor, EOF/forced-helper/watchdog restoration and injected Esc through native global hook; postcheck denied+stop marker+0owned processes. Log SHA256 `5bf388d76b7ead02f953bd384fd7ceed72025ea572877c578b07a85eef074ded`.
- Managed Desktop-Control-Browser final:10PASS/0FAIL/0SKIP, dedicated pinned runtime with renderer sandbox, origin/redirect, virtual cursor, crash/restart and Esc-failed-callback latch. Log SHA256 `86c8c876782a07498d42ea5df135d2afe7614127c44675d587f6dd5e0556bd5f`.
- Windows-host/Linux-Docker workspace boundary:13PASS/0FAIL/0SKIP;8focused unit tests passed. No remaining job/reservation containers observed.
- Protected emergency policy:8PASS/0FAIL/1POSIXskip, including fresh-authority durable denial and explicit matching re-enable.
- Settings/consent:5PASS/0FAIL/0SKIP; visible UI inspected and owner-confirmed short-lived diagnostic/control/workspace grants observed. Grant selection is not evidence of a tool invocation.
- Archive validator84checks PASS in normal Python and `-O`; no extraction on rejected cases.
- SDK private stdio earlier16checks passed with exact32tool list, denial before launch, strict arguments, safe status and EOF. Integrated candidate must be rechecked.

Earlier fixture initialization, foreground and CURSOR_FAILED runs, browser start timeouts and Docker-daemon absence are retained in private raw logs. One intermittent managed browser startup timeout remains unexplained; final passing runs do not erase it. No hardware Esc, arbitrary-app, multi-monitor, secure desktop/UAC, reboot or Linux GUI acceptance is asserted.

## Remaining candidate gates

- Clean exact-commit Windows and Debian installation/verify/ls/audit/diff matrix and complete counts/skips/log hashes.
- Final clean ZIP build/extraction/protocol/license/SBOM checks on both platforms.
- Independent disposition review of the two final security corrections and integrated frozen source.
- Actual new account upload, installed/running version and ChatGPT host allow/revoke/reconnect.
- Browser engine artifact is official pinned Chrome for Testing, not a new Chromium fork; executable signature is absent and redistribution acceptance is open. Browser binary is NOT in plugin ZIP.
- Existing signed policy/FSM PR31 remains a prototype. No unattended signed install/health/rollback lifecycle is active; no claim of two real bridge updates.

For this candidate, activation remains default deny outside the locally confirmed scope. Downloads, credential export, account automation, host shell/elevation and automatic updates are not silently enabled. Raw logs containing private fixture paths stay local; public evidence is sanitized.
