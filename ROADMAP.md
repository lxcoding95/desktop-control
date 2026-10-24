# Desktop Control — Product Roadmap

**Reviewed 2026-10-24.** [Public deliverable register and milestone migration](docs/governance/PRODUCT-MILESTONES.md). **M01–M06 are product outcome IDs, not existing GitHub milestone numeric IDs and not the six development sessions.** M07, M08, … M50+ can be created for distinct deliverables after verification. Feature status always links to implementation and tests rather than a calendar target or a guessed progress percentage.

> **Current product truth:** `main` has architecture/governance material, **no released MCP/desktop application or installer**. A read-only local MCP status-core implementation is only on [Draft PR #22](https://github.com/lxcoding95/desktop-control/pull/22) and was tested by the owner on Windows/Linux (29 unit cases on each; 9 applicable Windows and 10 applicable Linux protocol cases, platform-specific skips, local pinned OSS scans and audit reports PASS). The **independent semantic security review remains open**; the private ChatGPT plugin has **not** established a real local end-to-end connection. [Evidence: S02 #6](https://github.com/lxcoding95/desktop-control/issues/6).

## Product delivery milestones

| Product milestone | User-visible acceptance outcome | Current status | Evidence / next gate |
| --- | --- | --- | --- |
| **M01 — Private MCP connectivity** | A private local install makes an authenticated client-to-host MCP handshake, lists tools and completes an authorized diagnostic call with negative tests | **Partial core prototype tested; ChatGPT integration not tested** | [S02 PR #22](https://github.com/lxcoding95/desktop-control/pull/22); independent review, local ChatGPT executor/stdio integration and private distribution proof pending |
| **M02 — Installation, CLI and permissions** | Reproducible native Win/Linux setup, secure device binding, user grant UI, admin prompts for approved operations, optional WSL/container choices, support diagnostics | **Planned; not implemented** | Integration and least-privilege design/review; no silent admin or WSL changes |
| **M03 — Mandatory signed updates** | Verified app/bridge/plugin version contract; signed releases, rollback/recovery and restart checks; ordinary tools blocked on missing required update | **Planned; not implemented** | Recovery mode, offline rules and host-managed plugin limitations verified |
| **M04 — Authorized filesystem and processes** | User-scoped file tools and bounded shell/process management with revocation, cancellation, audit and positive/negative OS tests | **Planned; not implemented** | Approval and security isolation; historical reserved S03 remains unstarted |
| **M05 — Browser Workspace** | Separate headed persistent browser, screenshot/DOM/mouse/tabs/downloads, safe website permissions and cancellation, no independent AI model | **Planned; not implemented** | Privacy/security review and Windows/Linux evidence; premium licensing model under research |
| **M06 — Integration and release quality** | Complete support matrix, verified installer/uninstaller, signing, SBOM/licensing, CI tests, independent review and explicit owner ship/no-ship | **Planned; not implemented** | [SEC gate #1](https://github.com/lxcoding95/desktop-control/issues/1), [CI gate #2](https://github.com/lxcoding95/desktop-control/issues/2), [release gate #3](https://github.com/lxcoding95/desktop-control/issues/3) |

M03 safety is cross-cutting; milestones are **not** a promise of a rigid six-stage implementation. New milestones require a distinct deliverable, acceptance evidence, dependencies and owning issue. Use [the registry and migration playbook](docs/governance/PRODUCT-MILESTONES.md) before changing GitHub milestone objects.

## Historical development sessions (not product milestones)

The owner reserved **exactly S01–S06** with explicit start approval. S01 architecture [#5](https://github.com/lxcoding95/desktop-control/issues/5) completed with [PR #21](https://github.com/lxcoding95/desktop-control/pull/21); S02 MCP development [#6](https://github.com/lxcoding95/desktop-control/issues/6) remains on Draft PR #22 pending independent review. **S03–S06 (#7–#10) remain not started and unauthorized.** These session records must not be deleted, reset, or portrayed as the public product roadmap. The [session plan](docs/governance/SESSION-PLAN.md) retains their original contract.

## Evidence, privacy and automation

Every milestone reports separately: `planned`, `implemented`, `tested`, `independently reviewed`, `merged`, `released`, and `blocked`. A checked issue or public badge is not proof of feature readiness. Trace improvements by issue, exact branch commit, PR, real OS tests, security/license review, release version and updated public docs. Keep private information in private sources, never GitHub commits or logs: [information policy](docs/governance/PUBLIC-INFORMATION-POLICY.md). Automations are proposals until deployed and verified; **do not activate regular Actions until SEC-GATE-001**.
