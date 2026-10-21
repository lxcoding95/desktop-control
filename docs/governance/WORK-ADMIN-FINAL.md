# Work administrative completion — executable instruction

**Target:** https://github.com/lxcoding95/desktop-control
**Owner:** lxcoding95
**Scope:** COMPLETE ONLY missing GitHub administration/Projects tasks. Existing GitHub documents and PR #11 were already merged by ChatGPT; avoid duplicates.
**Scheduling:** owner indicated a planned Work session around **2026-10-22 01:00 Europe/Berlin**. This document does **not** itself schedule an automated Work run.

## Copy-ready assignment for Work

> Finish the GitHub *administrative preflight* of \`lxcoding95/desktop-control\` on your authorized GitHub browser/CLI environment. You are allowed to actually configure and verify settings, not merely report capability. Do not start any of the six development sessions, develop the desktop plugin, create paid resources, authorize new broad credentials, or touch other repositories.
>
> First read the live GitHub repository and these four documents:
> - \`docs/master/PROJECT-MASTERPLAN.md\`
> - \`docs/governance/PROJECT-STATE.json\`
> - \`docs/governance/CHAT-CONTINUITY.md\`
> - Issue [#4 ADMIN-GATE-001](https://github.com/lxcoding95/desktop-control/issues/4).
> Reconcile with current main/PRs and never recreate objects that exist.
>
> **1 — GitHub Project:** Check existing **user project #3**, as seen in paused Work browser screenshot (location \`https://github.com/users/lxcoding95/projects/3\`), before creating anything. Rename it \`Desktop Control Development\` if it is still untitled, set a truthful description, create/status-verify \`Backlog, Ready, In Progress, In Review, Blocked, Done\`, priority and area fields. Make views Backlog/Table, Board, Roadmap if included in the free plan. Link repository and all existing Issues #1–#10, preserving existing milestones/labels. If project visibility should be public, inspect its contents for secrets first and confirm public-sharing expectation with owner if needed.
>
> **2 — Labels and milestones:** Examine existing label names/colors/descriptions and six Milestone objects. Fill missing categories (\`type\`, \`priority\`, \`status\`, \`area\`) with readable color contrast and clear descriptions; no duplicates. Confirm six milestones open, dates not invented, session issues assigned correctly. Fix only discrepancies.
>
> **3 — Project automation:** Use free built-in Project workflows if available: add matching repo issues to project, consistent default status, closed/merged -> Done only when true. Do not automatically move incomplete issues to Done or grant workflow secrets to PRs from forks. Check triggers on a harmless controlled item if possible; remove test artifacts once verified, preserving evidence.
>
> **4 — Settings verification:** Re-check \`Protect main\` active, required PR/squash, no bypass, no deletion/force pushes, thread resolution, suggest updating branch, auto-merge disabled, head-branch cleanup. Verify Actions permissions (default read-only, fork approvals, retention, trusted Action source restriction), Dependabot, private vulnerability reporting, push/secret protection. The ChatGPT GitHub connector cannot mutate these, so do it via authorized browser/UI if required.
>
> **5 — Future CI guardrails:** Check \`SEC-GATE-001\` Issue #1. The full-length SHA pinning rule remains a **mandatory gate before regular CI**, not a forgotten optional suggestion. Do not activate dummy CI or require non-existent status checks. If no Actions are in use, document readiness and keep the issue open for actual pinning+live validation. Do not activate fee-bearing AI features or start CodeQL scans prematurely on a code-free repository; document eligibility and planned setup. Consider workflow dependency lockfiles as an optional improvement after compatibility evaluation.
>
> **6 — Verification and reporting:** Record exact result links and evidence (screenshots only supplementary; verify saved settings). Update Issue #4, its labels and GitHub Project status. If you can edit a repository report, do so through a branch+PR under \`Protect main\`, not direct main push. State which admin operations could be performed; note any blocked permissions or costs without requesting tokens in chat. Do not mark #4 Done unless all acceptance items actually verified. Do not start a development session or commit runtime/plugin code.
>
> **Final response:** Provide a table with target item, verified state, evidence URL, remaining blocker, and whether preflight is READY FOR OWNER REVIEW or BLOCKED. Link the actual GitHub Project, labels/milestones pages and affected issues; do not report success without saved evidence.

## Separation of responsibilities

- **Assistant in this chat:** Governance docs, source research, issue/PR/branch management and continuity contract (connector-tested).
- **Work browser:** Graphical GitHub Projects fields, account/repo admin settings and missing label definitions (only when actually authorized).
- **Owner:** Explicit start of Session 1; approval of new costs/registration/hosting, secrets, irreversible privilege escalation and public publication.

## Completion checklist

- [ ] Actual GitHub Project title and visibility verified.
- [ ] Six statuses, Priority/Area fields and views verified.
- [ ] Existing #1–#10 issues linked and auto-add checked.
- [ ] Labels/milestones audited and corrected.
- [ ] Repo ruleset, Actions and Security admin settings saved & verified.
- [ ] SEC-GATE-001 remains tracked until SHA-pinned CI verified.
- [ ] Issue #4 updated with authoritative links and residual blockers.
- [ ] No unapproved fees or extra repository writes.
- [ ] Session count remains **0/6**.
