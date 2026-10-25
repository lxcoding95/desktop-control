# Desktop Control — repository working agreement

**Live status checkpoint (2026-10-24):** `main` holds architecture/governance only; local S02 MCP-core code exists on [Draft PR #22](https://github.com/lxcoding95/desktop-control/pull/22), **not merged**. Owner-run Windows/Linux regression and pinned OSS security scans PASS (current test details in [Issue #6](https://github.com/lxcoding95/desktop-control/issues/6)); independent semantic review **PENDING**. A real private ChatGPT local diagnostic grant/allow/revoke/deny cycle was previously evidenced in [Issue #28](https://github.com/lxcoding95/desktop-control/issues/28), but no current product release or full host end-to-end matrix is approved. S01 done (PR #21); S03–S06 not started. Exactly 2/6 reserved sessions started; owner-approved between-session **documentation/governance** work does not start, recharge or extend one.

## Authoritative context

- Product requirements and decisions: [Masterplan](docs/master/PROJECT-MASTERPLAN.md).
- Chat interruption: [Continuity protocol](docs/governance/CHAT-CONTINUITY.md) and [project status snapshot](docs/governance/PROJECT-STATE.json).
- Actual progress: live GitHub main SHA, active working branch, PR, session issue (#5–#10), recent tests/checks and session checkpoint.
- Security: [SECURITY.md](SECURITY.md), [threat model](docs/architecture/THREAT-MODEL.md), [quality gates](docs/governance/QUALITY-GATES.md).
- Open-source reuse: [sources](docs/research/SOURCES.md) and [license requirements](docs/governance/REUSE-LICENSES.md).

## Public delivery versus private session history

Public outcomes are organized as **M01–M06 and M07+** under [product milestones](docs/governance/PRODUCT-MILESTONES.md), with real acceptance evidence and non-destructive milestone migration. Six historical sessions S01–S06 remain recorded in [session plan](docs/governance/SESSION-PLAN.md). Use [public information and freshness policy](docs/governance/PUBLIC-INFORMATION-POLICY.md): no secrets, personal paths, confidential development or unredacted logs in a public commit/issue, even on a draft branch. Before claiming a milestone is active in GitHub, verify its actual object, membership and Project view.

Owner-approved **selected private integration and runtime prototyping outside formal sessions** is now tracked through [M01 #28](https://github.com/lxcoding95/desktop-control/issues/28) and [M03 #29](https://github.com/lxcoding95/desktop-control/issues/29); this does **not** start any formal S03–S06 development session, permit unreviewed OS permissions, or authorize a public release. Never assume an automation is running merely because a process is documented.

## Binding GitHub autonomy standard

The owner requires a **showcase-quality, automation-first, secure and consistently synchronized repository**. Follow [GITHUB-OPERATIONS-STANDARD](docs/governance/GITHUB-OPERATIONS-STANDARD.md) for issues, milestones, Projects v2, labels, PRs, branches, reviews, dependency/security posture, release gates and mandatory cross-chat handoffs. Perform available authorized operations autonomously; if a surface is owner-only, supply Alex a direct link and exact steps, record the blocker and verify afterwards. Automation must not bypass consent, branch protection, test evidence, the active session scope or SEC-GATE-001. Do **not** reactivate Qodo automatically. Latest S02 evidence is on [Draft PR #22](https://github.com/lxcoding95/desktop-control/pull/22), not yet merged.

## Hard boundaries

1. Change only lxcoding95/desktop-control. Other repositories connected via All repositories are off limits.
2. During preflight and separately approved between-session documentation work: no product/desktop/MCP runtime code and no development session start.
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
