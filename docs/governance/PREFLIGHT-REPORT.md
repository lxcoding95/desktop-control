# GitHub Preflight Report

**Date:** 2026-10-22. **Scope:** lxcoding95/desktop-control only. **Sessions:** 0/6; no development authorized.
**Assessment:** READY FOR OWNER REVIEW for Session 1 architecture/local MCP planning. CI and release gates remain open and do not constitute implementation or release approval.

## Saved administrative configuration

- [Project #3](https://github.com/users/lxcoding95/projects/3/views/1): Desktop Control Development, private (preserved), truthful description/readme, default and linked repository lxcoding95/desktop-control.
- Six status options: Backlog, Ready, In Progress, In Review, Blocked, Done. Priority: Critical/High/Medium/Low; Area: mcp/filesystem/terminal/desktop/browser/windows/linux/security/ci/docs/release.
- Issues #1–#10 individually verified as project members with Backlog, Priority and Area populated. Initial aggregate Project API returned zero despite existing memberships; issue-level GraphQL and the rendered board prove the ten cards. Idempotent item-add did not create duplicates.
- Saved views: Board, Backlog / Table, Roadmap. Empty Start date/Target date fields added; no issue dates assigned. No dates invented; unscheduled work has no timeline dates. Milestone remains the authoritative session grouping.
- [Labels](https://github.com/lxcoding95/desktop-control/labels): 34 definitions inspected with pagination; type/priority/status/area categories have colors/descriptions and no duplicate names. No unnecessary new labels.
- [Milestones](https://github.com/lxcoding95/desktop-control/milestones): six open, no due dates, issues #5–#10 mapped to sessions 1–6. Milestone IDs 6 and 5 correctly represent sessions 5 and 6 respectively; do not renumber by ID.

## Free built-in automation

- Auto-add: exactly desktop-control, filter `is:issue is:open`; enabled. New items -> Backlog.
- Item closed -> Done limited to issues; PR merged -> Done; PR linked -> review workflow retained. An unmerged closed PR must not be treated as a successful merge.
- Item reopened -> Backlog, enabled. Moving cards never authorizes development.
- Auto-close issue disabled: moving a card to Done cannot close unfinished work. Auto-add sub-issues disabled to preserve the single-repository boundary. Auto-archive left disabled.
- Controlled [test issue #19](https://github.com/lxcoding95/desktop-control/issues/19): created without manual project-add, observed automatic membership + Backlog; closed and observed Done; reopened and observed Backlog. Final close and project archive preserve the issue audit without clutter. No CI workflow was created to test Projects.
- PR-specific automation is saved configuration; it is not a claim of runtime/CI testing.

## Repository settings — fresh admin API evidence

- [Protect main](https://github.com/lxcoding95/desktop-control/rules/25569795) active on default branch: deletion/force pushes blocked, PR required, review threads resolved, squash only, no bypass actors. Zero required approvals remains the established solo-owner policy.
- [General settings](https://github.com/lxcoding95/desktop-control/settings): squash enabled; merge/rebase disabled; auto-merge disabled; automatic merged-branch deletion and update-branch suggestions enabled.
- [Actions settings](https://github.com/lxcoding95/desktop-control/settings/actions): default workflow token read-only, PR review approval disabled; approval required for all external fork contributors; artifact/log retention 30 days. Selected Actions: GitHub-owned allowed, verified third-party disabled, no wildcard patterns.
- [Security](https://github.com/lxcoding95/desktop-control/settings/security_analysis): Dependabot alerts (204), security updates, private vulnerability reporting, secret scanning and push protection enabled. No setting was weakened. Non-provider-pattern and validity-check extras remain disabled; no zero-risk claim.
- No Actions workflows exist. SHA pinning enforcement currently false: [#1 SEC-GATE-001](https://github.com/lxcoding95/desktop-control/issues/1) stays OPEN until real Action provenance/full SHAs, positive/negative workflow tests and enforcement verification. No dummy CI or nonexistent required checks.
- CodeQL deferred until supported source language/build exists; public repository eligibility does not establish a successful scan. No code, runner job, paid agent or paid infrastructure activated.

## Owner decision and remaining gates

Option 1 accepted: local MCP core + local client/Inspector proof first, ChatGPT afterwards. Target Windows/Linux app with tray, dashboard and separate visible AI browser; version-pinned npx is optional developer/expert access. No domain, public server or paid cloud in phase one. ADR-0003 and Masterplan record this decision; #17 retains future technical validation tasks.

[Administration issue #4](https://github.com/lxcoding95/desktop-control/issues/4) holds current evidence and any residual limits. Existing GitHub CLI authentication and signed-in browser were used; no new credentials requested. All repositories app selection untouched; no other repository changed. GitHub's project root initially failed to load; the direct saved Board route works. Aggregate project reads remain inconsistent, so future checks should inspect issue-level memberships and saved views.

Session 1 still needs explicit owner start. #1 SHA pinning before regular CI; #2 real CI and #3 release validation are future gates. Public ChatGPT transport eligibility/costs, app-shell selection and real Windows/Linux behavior remain untested. No production readiness claim, costs incurred or product code.
