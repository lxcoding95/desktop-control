# Desktop Control — repository working agreement

**Status (2026-10-24):** S01 completed/merged (PR #21); S02 MCP stdio source remains on [Draft PR #22](https://github.com/lxcoding95/desktop-control/pull/22), not yet approved/merged. Windows and Linux prior verified checks passed; later authorization-audit source regression tests and Linux socket descriptor probe are committed but require a clean Work rerun. S02 extension #4 was expressly authorized and is separately timed in [the branch-local state](docs/governance/PROJECT-STATE.json). **2/6 sessions started; S03–S06 remain locked.** `main` contains no runnable product release.

## Authoritative context

- Product requirements and decisions: [Masterplan](docs/master/PROJECT-MASTERPLAN.md).
- Chat interruption: [Continuity protocol](docs/governance/CHAT-CONTINUITY.md) and [project status snapshot](docs/governance/PROJECT-STATE.json).
- Actual progress: live GitHub main SHA, active working branch, PR, session issue (#5–#10), recent tests/checks and session checkpoint.
- Security: [SECURITY.md](SECURITY.md), [threat model](docs/architecture/THREAT-MODEL.md), [quality gates](docs/governance/QUALITY-GATES.md).
- Open-source reuse: [sources](docs/research/SOURCES.md) and [license requirements](docs/governance/REUSE-LICENSES.md).

## Binding GitHub autonomy standard

The owner requires a **showcase-quality, automation-first, secure and consistently synchronized repository**. Follow [GITHUB-OPERATIONS-STANDARD](docs/governance/GITHUB-OPERATIONS-STANDARD.md) for issues, milestones, Projects v2, labels, PRs, branches, reviews, dependency/security posture, release gates and mandatory cross-chat handoffs. Perform available authorized operations autonomously; if a surface is owner-only, supply Alex a direct link and exact steps, record the blocker and verify afterwards. Automation must not bypass consent, branch protection, test evidence, the active session scope or SEC-GATE-001. Do **not** reactivate Qodo automatically. Latest S02 evidence is on [Draft PR #22](https://github.com/lxcoding95/desktop-control/pull/22), not yet merged.

## Hard boundaries

1. Change only lxcoding95/desktop-control. Other repositories connected via All repositories are off limits.
2. During preflight no product/desktop/MCP runtime code and no development session start.
3. Work on reviewable branches; protect main. No force pushes, deleted protection, or bypasses.
4. No unapproved paid services, public registrations, credentials, tokens or domain expenses.
5. Never invent tests, reviewer identities, audits, green badges or Windows/Linux capability evidence.
6. [SEC-GATE-001](https://github.com/lxcoding95/desktop-control/issues/1): verify full commit-SHA references for GitHub Actions and enforce pinning before regular CI activation.
7. Actual shell execution cannot be safely contained by a command or path allowlist alone; use on-host authorization and OS-enforced isolation where needed.
8. Start a session only on explicit owner authorization; a paused session resumes with the same session ID and verified remaining budget.

## New chat/continuation

Read current repository state before writing. If an active or paused session exists, read its issue, working branch, PR and its SESSION-STATE document. Never restart 25 minutes or count a new session automatically. Preserve work in commits and issue comments; when time data is absent, mark unverified. See [checkpoint template](docs/governance/SESSION-STATE-TEMPLATE.md).

Follow: source review → small plan → risks and license → branch change → positive and negative tests → diff/CI review → authorized squash merge → update docs, issue and next exact action. Unverified work is blocked, not done.

This file guides tooling that recognizes AGENTS.md; it cannot launch a new ChatGPT session or bypass usage limits.
