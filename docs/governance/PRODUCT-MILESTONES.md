# Product delivery milestones — independent of development sessions

**Public governance standard — 2026-10-24.** Tracking issue: [#25](https://github.com/lxcoding95/desktop-control/issues/25). This document describes **approved product outcomes and gates**, not proof that the outcomes already exist. Actual repository state comes from `main`, active PR branches, issue statuses and recorded test evidence. No release/installation is offered.

## Two independent axes: deliverables versus historical work

- **Product milestone IDs `M01`, `M02`, … `M50+` are unbounded.** Each new milestone groups coherent user-visible deliverables and their acceptance evidence. Do not equate a milestone with a single session, issue, PR, calendar period or GitHub completion percentage.
- **Exactly six reserved development sessions `S01`–`S06` remain unchanged**, with issues [#5–#10](https://github.com/lxcoding95/desktop-control/issues/5) (one issue per session) as historical/time-accounting records. S01 completed; S02 [Draft PR #22](https://github.com/lxcoding95/desktop-control/pull/22) is not independently accepted; S03–S06 have not started. Authorizing documentation planning never starts a development session.
- The existing GitHub milestone objects currently track session history. **Do not rename, close, delete or reassign them in place** until the full membership inventory, replacement product milestones, owner permission and migration rollback are verified. A newly proposed `M01` is **not** the preexisting GitHub milestone whose numeric ID is 1.
- Public `M` entries here are **planned canonical product labels**, not automatically created GitHub Milestones. Milestone objects and Project v2 views require separately verified GitHub UI/API mutations.

## Product delivery register

| ID / outcome | Concrete acceptance evidence (not just checked boxes) | Initial state / known dependency |
| --- | --- | --- |
| **M01 — Private MCP connectivity** | Local MCP handshake and `tools/list`; actual status-tool call under a host-authorized local principal; denied-without-grant negative case; ChatGPT desktop local-executor support tested on actual device; private install/restart evidence and platform/version matrix | **In preparation.** Core Windows/Linux test evidence lives on [Draft PR #22](https://github.com/lxcoding95/desktop-control/pull/22) / [S02 #6](https://github.com/lxcoding95/desktop-control/issues/6). **Private ChatGPT diagnostic success and subsequent revoke/denial were observed on 2026-10-24** ([M01 #28](https://github.com/lxcoding95/desktop-control/issues/28)); full production integration, current host freshness and final grant review remain outstanding. S02 independent semantic security review outstanding |
| **M02 — Installation, CLI and permissions** | Reproducible Win/Linux per-user install/uninstall; `status`, `doctor`, `login`, `logout`, `restart`, `debug`, `update` behavior; locally verified device-bound identity, revocation and safe consent; OS UAC/polkit allow/deny tests; optional feature detection/repair and no silent WSL/container installation | **Planned only.** Owner-selected WSL/container opt-in. Requires M01 authorization/transport and explicit development permission |
| **M03 — Verified automatic mandatory updates** | Separate plugin, bridge, app, browser and optional CLI versions; signed artifact/metadata verification; detect incompatible versions and block ordinary MCP tools while retaining repair/revoke/diagnostic controls; download interruption, offline, malicious/rollback and cross-platform recovery tests; restart and post-update health proof | **Prototype only.** `always-block` policy chosen; pure signed policy and staging decision prototypes exist in [Draft PR #31](https://github.com/lxcoding95/desktop-control/pull/31), but no signed production updater or verified OS deployment exists; ChatGPT host-managed plugin updates cannot be promised as automatically controllable |
| **M04 — Authorized files and processes** | Least-privilege file/path grants, symlink-race/escape checks, read/write behavior, bounded shell/process actions, cancellation/timeout, audit and redaction; Windows/Linux real positive and negative tests | **Planned only.** S03 not authorized; shell allowlists do not constitute containment |
| **M05 — Browser Workspace** | Separate visible persistent browser profile, domain/account approvals, screenshots, navigation, virtual cursor during mouse events, downloads, cancellation and privacy tests; no additional in-browser AI agent; browser runtime compatibility evidence | **Planned only.** Requires privileged boundaries and actual integration tests; future monetization/licensing **under research, not decided** |
| **M06 — Integration and release readiness** | Complete platform support matrix; independently reviewed security boundaries; pinned-action CI gate, SBOM, licensing, provenance, signed packaging, install/uninstall and update rollback drills; owner-approved ship/no-ship | **Planned only.** [SEC #1](https://github.com/lxcoding95/desktop-control/issues/1), [CI #2](https://github.com/lxcoding95/desktop-control/issues/2), [Release #3](https://github.com/lxcoding95/desktop-control/issues/3) remain separate tracked gates |

**Dependencies, not rigid sequence:** M03 update safety is a cross-cutting prerequisite for distributing M02–M05 components; an M01 private diagnostic proof need not imply M02–M05 are complete. No fixed limit applies to future milestone IDs.

## Evidenced issue and PR lifecycle

Each substantive product issue should carry:

1. `Product milestone: Mnn` (once an actual corresponding milestone exists), user outcome, acceptance checks, owner, dependencies, labels and threat/OS scope.
2. PR link, exact tested commit SHA, environment/commands/exit status, failure and skip explanations, license provenance and local/non-CI versus CI origin.
3. One of **planned → implemented → tested → independently reviewed → merged → released**, never treating a later state as implied by an earlier one. Keep **blocked** and **not run** as explicit orthogonal states.
4. Changelog and upgrade compatibility if behavior changes. A merge into `main` is not proof of release; an unmerged branch is not a feature on `main`.
5. Change/update cadence: review status at every meaningful PR/issue change and when correcting drift; periodic checks run **only when an actual permitted automation exists**. No imaginary automatic sweeps or fabricated velocity.

### Growing from M06 to M07–M50+

Create a new product milestone only when there is a separately demonstrable outcome, a named acceptance test, an owning issue, defined dependency/risk and a meaningful user-facing result; otherwise group work into existing milestones. New versions, supported OS releases, hardening work and post-release maintenance can add milestones indefinitely. Deduplicate by issue links and maintain previous versions' compatibility/support decisions. Do not create fifty empty milestones for appearance.

## Safe GitHub milestone migration (owner/admin UI pending)

1. **Inventory:** open [existing milestones](https://github.com/lxcoding95/desktop-control/milestones) and [issues](https://github.com/lxcoding95/desktop-control/issues); record each current milestone's GitHub **numeric** ID, title, description, open/closed state and member Issue/PR numbers. Preserve session #5–#10 as history.
2. **Create** new product milestones `M01 — Private MCP Connectivity`, `M02 — Installation & Permissions`, `M03 — Mandatory Updates`, `M04 — Files & Processes`, `M05 — Browser Workspace`, `M06 — Integration & Release Quality` with this register's acceptance criteria. No artificial deadlines; additional M IDs created on demand.
3. **Map** product implementation issues to the new M milestones only after verifying their intended outcome and preserving historical session backlinks. [#25](https://github.com/lxcoding95/desktop-control/issues/25) is a governance migration issue, not evidence that M01 is implemented.
4. **Projects v2:** keep the current private project visibility unchanged. Add product outcome/milestone and evidence/status views where available; do not silently make private boards public. Verify status fields against actual issue/PR/merge states and record manual-only blockers.
5. **Reconcile:** compare before/after membership and counts; sample S01/PR21, S02/PR22 and S03–S06, check orphaned issues. Roll back incorrect assignments using the captured original mapping. **Never delete historical milestones or their audit trail** until separately approved.
6. Only claim migration completed after independent readback of milestone URLs, memberships and Project v2 view/visibility. The connected GitHub app currently exposes issue-to-milestone assignment, but **no create/edit-milestone or Project-v2 metadata mutation method**; the owner may need [GitHub milestone UI](https://github.com/lxcoding95/desktop-control/milestones) or a properly authorized Work/admin environment.

## Canonical references

- [Product roadmap](../../ROADMAP.md) (public reader-facing), [masterplan](../master/PROJECT-MASTERPLAN.md) (requirements), [operations standard](GITHUB-OPERATIONS-STANDARD.md), [quality gates](QUALITY-GATES.md), [public information policy](PUBLIC-INFORMATION-POLICY.md).
- [S02 issue #6](https://github.com/lxcoding95/desktop-control/issues/6) and [Draft PR #22](https://github.com/lxcoding95/desktop-control/pull/22) are the current Windows/Linux evidence source; source branch and private host permissions remain distinct.
- [GitHub REST milestones](https://docs.github.com/en/rest/issues/milestones), [GitHub Projects](https://docs.github.com/en/issues/planning-and-tracking-with-projects) (consult current API/UI before migration).
