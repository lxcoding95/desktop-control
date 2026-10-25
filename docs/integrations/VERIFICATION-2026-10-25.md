# Verified integration checkpoint — 25 October 2026

This report separates installed behavior, tested source and open acceptance gates. It is not a release certificate.

| Evidence | Exact source | Result |
| --- | --- | --- |
| Ordinary-user Windows clean install and verify | 5817093949ece2a7451588020397ccb85d6eccb3 | ci0, verify0;124tests,117pass,0fail,7skip |
| Clean Windows full platform runner | 39a5fa3eb1e1127a9372db35d5a82eb42c4124f4 | all10commands0;128tests,121pass,0fail,7skip; clean/sameHEAD |
| Clean Debian12 full platform runner | 39a5fa3eb1e1127a9372db35d5a82eb42c4124f4 | all10commands0;128tests,107pass,0fail,21skip; clean/sameHEAD |
| Root policy test script | b26efcb |66pass,0fail/skip,exit0 |
| Frozen updater fixture, ordinary Windows | runtime6510ad5b7a130fa6ab7145261e203b1e1ff7ae505c3e88d54b7526a7bd8b499f |16tests,15pass,0fail,1POSIXskip,exit0 |
| Same frozen updater fixture, Debian12 UID/eUID1000 | same runtime hash |16pass,0fail/skip,exit0 |
| Independent updater fix regressions | same runtime hash |4pass,0fail/skip; mandatory and missing-inbox defects fixed |
| Real Docker workspace/PDF/terminal recheck | source unchanged from tested workspace implementation |13namedchecks pass,0fail/skip,exit0 |
| Hardened Docker MCP container | 9ec2439 production source snapshot |8namedchecks pass |
| Dedicated Toolkit profile and pinned-image Gateway | image sha256:11c6f85d8ca36069d0b7b08a4cc4114b505ba9a95bdbff840d0bd58389b49e91 |5namedchecks pass,exit0; actual profile card observed |
| Archive regression validator with management/icon closure | next bundle source |88checks pass in normal and optimized Python |

Windows: Node24.21.0/npm12.2.0, non-elevated token. Linux: existing Debian12 Docker container, Node24.22.1/npm11.19.1, UID/eUID1000. Platform-specific and opt-in interactive skips are retained; none count as passing tests.

The platform runner executes versions/registry/ping, npm ci --ignore-scripts, npm run verify, npm ls --all, npm audit --json, git diff --check and archive regression tests. Its receipts retain each command exit, time and log SHA256. Raw logs remain local; only sanitized summaries are posted to GitHub.

## Installed host

The existing account plugin preview.4 was installed in the actual ChatGPT desktop app. A real tool call reports preview.4/win32 and all grants denied. Diagnostic status returns PERMISSION_DENIED. open_settings opened the native window from the installed preview.4 cache; an explicit read-only refresh returned all three denied states. No extra production grants were created for this proof. Source preview.5 adds management, branding and indication improvements; source changes are not proof of upload or running-host refresh.

## Updater limitations

The updater is development-only. Real fixture child-version changes, nonce/EOF/deadline health checks, polling, signature/integrity/replay/expiry checks, journal recovery and rollback are tested. Two independent gate defects were reproduced, corrected and rechecked. This does not prove live MCP Bridge upgrades. Production publisher, full runtime packaging, per-operation policy, live process lease/quiescence, scalable staging/retention and actual host upgrade/rollback acceptance remain open. No personal signing key or trust root was installed.

## Cleanup and continuity

The obsolete uninstalled local marketplace was unregistered through the supported Codex CLI. A private ACL-preserving config backup and parsed-TOML comparison verified that only that entry changed. The redundant generated PR33 test clone was moved to the Windows Recycle Bin after checking its exact5817093 HEAD, clean tree and retained external logs/summary. Active host cache, rollback archives, historical time records and evidence were preserved. There is no general unattended deletion service yet.

PR31 is integrated into the private feature branch, not protected main. PR33 remains Draft. No public release or blanket issue closure is justified. Independent local reviews are not GitHub APPROVED. Formal session count and historical budgets are not reset; exact active duration across chat interruptions is not invented.

## Functional inventory for the next bundle

| Capability | Current evidence / remaining limit |
| --- | --- |
| MCP discovery, strict input, default denial, audit/cancellation | source protocol tests; actual installed host denial |
| Workspace list/read/write/mkdir/remove/restore | real isolated Docker integration; soft deletion only, bounded file sizes |
| PDF creation | real PDF generation; reading/editing/OCR/conversion not implemented |
| Terminal | bounded networkless Docker only; no general host shell or system-service API |
| Separate browser | fresh10tests/10pass/0fail/0skip; real managed browser fixtures, origins/revoke/Esc/restarts; downloads/password/account features remain open |
| Native Windows input/screenshot | owned fixture evidence; ordinary-user context, protected/elevated targets refused |
| Blue edges/black cursor/banner/Esc | final source SHA344e62a98afea1f01b4c25dd6ac10ea8b499adcf5054b126618927e82873fc12;21noninteractive +1actualfixture pass; one physical monitor |
| Display-change failure | independent native regression1pass; synchronous input latch and forced shutdown on marshal failure; real monitor rearrangement not performed |
| Host management | modern settings capability and strict action-only protocol tested; next package host-rendering pending |
| Bundled plugin updates | preview.4 uploaded/installed; preview.5 source prepared, upload/activation pending |
| Autonomous Bridge updates | bounded development fixture only; production OFF, blockers above |
| Cleanup | stale marketplace removed; one redundant verification clone recycled; general unattended GC remains open |
| Host services/admin/general installations | no dedicated APIs implemented or accepted; no new administrative rights granted |

No claim of every requested future feature, flawless behavior, public readiness or guaranteed popularity is made.
