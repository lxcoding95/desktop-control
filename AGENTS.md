# Desktop Control — repository working agreement

**Status: S02 Windows typed lint/build, 23 unit and 9 stdio tests verified (2026-10-22); native platform/license/review gates remain.** Two of six sessions started (S01 completed; S02 running or paused per its live checkpoint). S03-S06 require separate explicit owner authorization. See [S02 session record](docs/sessions/session-02/SESSION-STATE.md) and [draft PR #22](https://github.com/lxcoding95/desktop-control/pull/22).

## Authoritative context

- Product requirements and decisions: [Masterplan](docs/master/PROJECT-MASTERPLAN.md).
- Chat interruption: [Continuity protocol](docs/governance/CHAT-CONTINUITY.md) and [project status snapshot](docs/governance/PROJECT-STATE.json).
- Actual progress: live GitHub main SHA, active working branch, PR, session issue (#5–#10), recent tests/checks and session checkpoint.
- Security: [SECURITY.md](SECURITY.md), [threat model](docs/architecture/THREAT-MODEL.md), [quality gates](docs/governance/QUALITY-GATES.md).
- Open-source reuse: [sources](docs/research/SOURCES.md) and [license requirements](docs/governance/REUSE-LICENSES.md).

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

## Free local S02 quality checks

Use `npm ci` then `npm run verify` (typed ESLint, full typecheck, unit tests, build, real protocol tests). The owner removed Qodo on this computer; do not invoke, reinstall or require Qodo/credit-based services. Local static checks do not establish independent semantic review. Keep ordinary CI disabled until SEC-GATE-001 is verified. See the [current S02 evidence](docs/sessions/session-02/EXTENSION-2-2026-10-22.md).
