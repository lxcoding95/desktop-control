# Desktop Control

Open-source desktop control tooling for MCP-compatible AI clients on Windows and Linux.

> **Status: experimental private integration, not a public release.** S01 is complete; S02 acceptance remains open. [Draft PR33](https://github.com/lxcoding95/desktop-control/pull/33) integrates the local MCP core, bounded workspace/PDF/terminal tools, separate browser, visible Windows desktop control and permission management. Account plugin preview.4 has been installed and queried in the real Windows host. These changes are not on protected main and are not production certification.

Clean verification at source `39a5fa3`: Windows128tests/121pass/7skip, Linux128tests/107pass/21skip; zero failures. The [local Docker MCP Toolkit profile](docs/integrations/docker-mcp.md) has real stdio/Gateway evidence and exposes only the deny-by-default core. [Management](docs/integrations/plugin-management.md), [visual identity](docs/integrations/visual-identity.md), and the [Bridge updater plan](docs/plans/2026-10-25-bridge-updater.md) separate implemented source, installed versions and remaining gates. **The production autonomous updater is not active.**

## Intended capabilities

- File reading, searching, structured edits, and reversible changes when feasible.
- Terminal and process management with bounded sessions, logs, and explicit cancellation.
- Native desktop input and accessibility automation across supported Windows and Linux configurations.
- Browser automation through tested browser-native interfaces.
- Device pairing and user-controlled tool, skill, path, network, and privilege permissions.
- Local-first development with a later option for hosted remote MCP and self-hosting.

An AI client makes decisions; this project will provide **tools and a local execution bridge**, not another AI agent.

## Status and roadmap

**Two of six reserved sessions have started.** S01 [Foundation & Architecture](https://github.com/lxcoding95/desktop-control/issues/5) is **completed** and [PR #21](https://github.com/lxcoding95/desktop-control/pull/21) was squash-merged. S02 [MCP Core & Connectivity](https://github.com/lxcoding95/desktop-control/issues/6) is **under owner-authorized completion with working Windows/Linux environments; final native/security/license/review acceptance pending**, with an owner-authorized additional time allowance and [Draft PR #22](https://github.com/lxcoding95/desktop-control/pull/22). Formal S03–S06 sessions remain unstarted. The owner separately authorized selected private S02–S06 implementation on 25 October, without resetting historical ledgers; private integration is tracked by PR33/Issue28. See [ROADMAP.md](ROADMAP.md), [session plan](docs/governance/SESSION-PLAN.md), and [issues](https://github.com/lxcoding95/desktop-control/issues). A six-session timebox is a planning constraint, **not a promise that full feature parity or a production release will fit inside it**.

## Planned system boundary

```text
MCP-compatible AI client
           |
     MCP gateway / protocol layer (planned)
           |
  authenticated device channel (planned)
           |
  local desktop bridge (planned)
           |
 Windows / Linux capabilities (planned)
```

The gateway, local bridge, identity model and transports remain subject to design review and real tests. No cloud service or public registration is live. See [architecture overview](docs/architecture/OVERVIEW.md) and [threat model](docs/architecture/THREAT-MODEL.md).


## Canonical project plan and cross-chat continuity

- [German masterplan (scope, decisions, architecture, sources and six sessions)](docs/master/PROJECT-MASTERPLAN.md)
- [Cross-chat recovery protocol](docs/governance/CHAT-CONTINUITY.md)
- [Machine-readable project state snapshot](docs/governance/PROJECT-STATE.json)
- [GitHub automation, security and DevSecOps operating standard](docs/governance/GITHUB-OPERATIONS-STANDARD.md)
- [Research and authoritative sources](docs/research/SOURCES.md)
- [29 Desktop Commander tool coverage plan](docs/research/DESKTOP-COMMANDER-COVERAGE.md)
- [Final GitHub Work administration assignment](docs/governance/WORK-ADMIN-FINAL.md)

The plan and state files **are not live execution results**. Before making changes, read GitHub's current branch SHA, open PRs, linked Issues #1–#10 and any session-specific branch handoff. Sessions started: **2/6** (S01 completed; S02 incomplete). Authoritative S02 progress, tests and time accounting are on [Issue #6](https://github.com/lxcoding95/desktop-control/issues/6), [Draft PR #22](https://github.com/lxcoding95/desktop-control/pull/22) and [S02 extension checkpoint](https://github.com/lxcoding95/desktop-control/blob/feat/s02-local-mcp-core/docs/sessions/session-02/EXTENSION-2026-10-22.md). GitHub Projects and milestone descriptions may lag until separately updated; do not interpret labels or progress bars as execution evidence.

## Desktop-Control-Browser (experimental)

The AI will use its **own persistent browser profile**, separate from the user's existing browser. The specification covers history, bookmarks, cookies/login state, session restoration, downloaded files, site permissions and a password manager or OS-backed credential vault subject to security validation. Browser automation will use Playwright where practical, with a visible black virtual cursor only during mouse actions. Sensitive browser credentials must not be exposed to AI tools. See [browser profile specification](docs/architecture/AI-BROWSER-PROFILE.md), [proposed ADR](docs/architecture/ADR-0002-AI-BROWSER.md), and [feature tracking issue #14](https://github.com/lxcoding95/desktop-control/issues/14). A dedicated private browser implementation now exists on PR33, with separate runtime/profile and automation cursor. Current exact-origin checks block redirects and downloads. History/password/account flows, redistribution and full platform acceptance remain open; see the current recovery plan. Its formal S04 session remains unstarted.

## Security

Computer control is a high-trust capability. An unrestricted shell is **not contained** by a command blocklist or an allowed-directory configuration. Production designs must use OS-enforced isolation where a strong boundary is required. See [SECURITY.md](SECURITY.md) before reporting a vulnerability or experimenting with privileged execution.

## Contributing and community

Read [CONTRIBUTING.md](CONTRIBUTING.md), [GOVERNANCE.md](GOVERNANCE.md), [SUPPORT.md](SUPPORT.md), and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). Use the issue templates for proposals or bug reports. Do not submit real credentials, private machine data, or security exploit details in public issues.

## Licensing and attribution

Project-authored source and documents are licensed under [MIT](LICENSE), unless a file explicitly states otherwise. Third-party code retains its original license and notices; see the [reuse policy](docs/governance/REUSE-LICENSES.md). This project is independent of Desktop Commander and other referenced projects, and does not claim affiliation.

Maintained by the repository owner and contributors; contributors and reviewers are credited only for work actually performed.
