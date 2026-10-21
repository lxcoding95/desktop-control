# Desktop Control — repository working agreement

**Status: pre-development.** Product implementation is not authorized by this file. The owner has reserved six sessions; **0/6 started**. An explicit owner command starts a development session.

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
8. Keep zero sessions until explicit owner authorization; a paused session resumes with the same session ID.

## New chat/continuation

Read current repository state before writing. If an active or paused session exists, read its issue, working branch, PR and its SESSION-STATE document. Never restart 25 minutes or count a new session automatically. Preserve work in commits and issue comments; when time data is absent, mark unverified. See [checkpoint template](docs/governance/SESSION-STATE-TEMPLATE.md).

Follow: source review → small plan → risks and license → branch change → positive and negative tests → diff/CI review → authorized squash merge → update docs, issue and next exact action. Unverified work is blocked, not done.

This file guides tooling that recognizes AGENTS.md; it cannot launch a new ChatGPT session or bypass usage limits.
