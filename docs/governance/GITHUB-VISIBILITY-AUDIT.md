# GitHub public/private progress surfaces — 2026-10-22

This describes **actual project tracking** vs. repository release state, not a certification.

| Surface | Ground truth | Status / action |
| --- | --- | --- |
| Repository README on `main` | S01 complete, S02 experimental in draft | Updated by this docs-only PR. No MCP product code merged. |
| Roadmap, session plan, masterplan and AGENTS | Two of six session starts; S03–S06 blocked | Updated by this docs-only PR |
| [S01 issue #5](https://github.com/lxcoding95/desktop-control/issues/5) | Closed completed, milestone Foundation & Architecture (#1) | Milestone percentage auto-derived from issue status; reload GitHub. Do not fabricate manual percentage |
| [S02 issue #6](https://github.com/lxcoding95/desktop-control/issues/6) | Open, in-progress/paused, milestone MCP Core & Connectivity (#2) | Leave open until real acceptance tests complete |
| [S02 Draft PR #22](https://github.com/lxcoding95/desktop-control/pull/22) | Prototype implementation, tests pending | Do not merge or switch out of Draft while gates open |
| [SEC-GATE-001 #1](https://github.com/lxcoding95/desktop-control/issues/1) | Open, regular CI forbidden | Do not claim green CI or activate workflows |
| [Milestone descriptions](https://github.com/lxcoding95/desktop-control/milestones) | Descriptions may still say “planned, not started” | Existing GitHub connector supports reading issue milestone relation and issue state **but no milestone description mutation**. Owner UI update required only if this stale text persists after refresh |
| [GitHub Projects](https://github.com/lxcoding95/desktop-control/projects) | Private project description still says “no implementation started” in owner screenshot | This connector has no Project v2 metadata/field/view edit operation. Owner UI update required |
| [Labels](https://github.com/lxcoding95/desktop-control/labels) | 34 issue labels shown in owner screenshot | Labels are a taxonomy, **not** a real-time phase counter; avoid adding fake “done” labels. Existing S01 #5 completed and S02 #6 open accurately track lifecycle |

## Owner-only UI actions where automation is not available

1. In [Projects](https://github.com/lxcoding95/desktop-control/projects), open **Desktop Control Development** → project menu **…** → **Settings** → edit **Short description** to: `S01 architecture completed and merged; S02 local MCP prototype under active testing (draft PR #22, not yet accepted). S03–S06 not started.` Save. **Do not change private/public visibility**.
2. In [Milestones](https://github.com/lxcoding95/desktop-control/milestones), edit the **Foundation & Architecture** description from `planned / not started` to `S01 completed (docs), Issue #5 closed, PR #21 squash merged on main.` Edit **MCP Core & Connectivity** to `S02 in progress: stdio prototype on draft PR #22, integration/build tests pending; Issue #6 and SEC-GATE-001 remain open.` Leave milestone #2 open; S03–S06 unchanged.
3. Refresh [Issues](https://github.com/lxcoding95/desktop-control/issues) and [PRs](https://github.com/lxcoding95/desktop-control/pulls). Milestone percentages are **automatically computed from issue closure**; do not manually assert completion percentages.

## Future consistency rule

After each development checkpoint, synchronize the issue/PR, session checkpoint, PROJECT-STATE, README/ROADMAP when milestone status changes, then milestone/project UI if the supported account surface permits it. Distinguish planned, implemented, tested, reviewed, and merged. Files on an unmerged PR are **not on `main`**.
