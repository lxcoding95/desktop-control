# Private diagnostic plugin: execution and continuity plan

Owner master order received 2026-10-25 (Europe/Berlin). Existing S02 completion authorization of 2026-10-24 permits necessary finishing time without another fixed extension. Historical session ledgers stay unchanged; S03-S06 remain not started/not authorized.

Baseline: S02 303f1fe143195049e57ca498bc42d628b126f115; protected main 963024f9af90d981a8b3a495e6ddec2bd32a65af. Working branch feat/private-diagnostics-plugin-20261025 is a reviewable private-preview packaging branch based on S02, not a new numbered session. Work interval started 2026-10-24T22:25:00Z approximately (first exact checkpoint 22:30:08.6779919Z); active elapsed time is not independently measured.

## Design and invariants

Reuse the existing TypeScript SDK v2 local stdio implementation and exact locked production dependencies. Produce a portable plugin.json/mcp.json package, original licenses, provenance and file hashes. Do not add cloud hosting, API keys, public publication, arbitrary process/filesystem/browser capabilities, installer or permissions UI.

Alternatives: public desktop-only submission requires partner eligibility and is outside scope; a remote proxy violates local-only constraints. Choose a private local package and supported personal installation. Account upload is not proof of execution.

Default-deny production entry remains unchanged. Positive protocol evidence uses an explicitly isolated test-only host grant; never ship that fixture or grant in the package. Actual usable positive production diagnostics remain blocked until an explicitly scoped trusted host provisioning design is implemented and reviewed; do not infer permission from MCP arguments, package installation, username or browser login.

## Dependency-ordered work

- [x] Fetch live branches/issues/PRs, preserve clean checkout, verify local noreply author/committer with harmless first commit.
- [ ] Reproduce audit callback revocation/cancellation; recheck at adapter boundary and add regression evidence.
- [ ] Fail closed on Windows network query errors, with deliberate listener positive control.
- [ ] Build a production-only private archive; validate manifest/layout/license/hash inventory; no development fixtures.
- [ ] Test real Windows and Debian installation, stdio discovery, denied call, isolated authorized fixture, EOF/restart and source regressions.
- [ ] Install through supported private host flow and prove actual host discovery/call, or record exact host blocker.
- [ ] Independent final diff/security review; synchronize GitHub and report PASS/FAIL/NOT RUN/BLOCKED without premature merge/release.

## Additional authorized work after the first connection slice

Inspect privacy/history and GitHub security settings; configure pinning before any regular CI. Preserve governance PR26 and quality-guard branch; no blind merge/rewrite. Product milestone migration needs membership backup/readback. Updates/signing architecture is preparation only, not a claim of working mandatory updates. Existing OSS scanner replacement is already implemented; do not reinstall CodeRabbit/Qodo or redundant global tooling.

## Available tool assessment

This run exposes native Windows CUA, GitHub connectors, Serena, Plugin Creator private archive operations, Context7, Codex Security and remote task APIs. No earlier tool inventory exists to prove which were introduced by the update. Use relevant capabilities as needed; leave unrelated global hooks, agents, service settings and permissions unchanged. No new paid service or external model.
