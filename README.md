# Desktop Control

Open-source desktop control tooling for MCP-compatible AI clients on Windows and Linux.

> **Status reviewed 2026-10-24:** no production release, installer or published plugin. The only local MCP status-core source is on [Draft PR #22](https://github.com/lxcoding95/desktop-control/pull/22), **not on `main`**; owner-run Windows/Linux regression and local security scanners passed, but **independent semantic review remains pending. A prior real private ChatGPT diagnostic call and post-revocation denial were verified in [M01 Issue #28](https://github.com/lxcoding95/desktop-control/issues/28); this does not establish a released or current host installation**. Do not rely on this repository for production computer control.

## Intended capabilities

- File reading, searching, structured edits, and reversible changes when feasible.
- Terminal and process management with bounded sessions, logs, and explicit cancellation.
- Native desktop input and accessibility automation across supported Windows and Linux configurations.
- Browser automation through tested browser-native interfaces.
- Device pairing and user-controlled tool, skill, path, network, and privilege permissions.
- Local-first development with a later option for hosted remote MCP and self-hosting.

An AI client makes decisions; this project will provide **tools and a local execution bridge**, not another AI agent.

## Product roadmap and verified delivery

Desktop Control uses **product-outcome milestones M01–M06 and M07+** (unbounded) to present real user-visible progress, dependencies and evidence; they are **not** the six timeboxed development sessions. See the [product roadmap](ROADMAP.md) and [milestone/evidence register](docs/governance/PRODUCT-MILESTONES.md). Full GitHub milestone/Project-v2 migration is **not yet independently verified** (Issue #28 is assigned milestone object #7, but that does not certify the whole migration): the [non-destructive migration issue #25](https://github.com/lxcoding95/desktop-control/issues/25) tracks verified owner/UI follow-up.

**Actual work:** S01 architecture [#5](https://github.com/lxcoding95/desktop-control/issues/5) and [PR #21](https://github.com/lxcoding95/desktop-control/pull/21) completed/merged; S02 [#6](https://github.com/lxcoding95/desktop-control/issues/6) read-only MCP status-core was tested on Windows/Linux on [Draft PR #22](https://github.com/lxcoding95/desktop-control/pull/22), **not accepted or merged**. Windows: 29 unit/9 platform-applicable protocol tests passed, 2 Linux-only tests skipped; Linux: 29 unit/10 protocol passed, 1 Windows-only test skipped; local OSS security scan checks passed. **A previous private ChatGPT diagnostic end-to-end connection was demonstrated on 2026-10-24; the current host/plugin version is not independently revalidated in this documentation review, and there is no installer or released application.** The independent semantic security review remains an outstanding gate. S03–S06 remain **not started, not authorized**; [session history](docs/governance/SESSION-PLAN.md) is preserved separately.

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

- [Product milestones M01–M06, migration and evidence semantics](docs/governance/PRODUCT-MILESTONES.md)
- [Changelog — merged changes versus in-review work](CHANGELOG.md)
- [Public information classification and repository freshness](docs/governance/PUBLIC-INFORMATION-POLICY.md)
- [German masterplan (scope, decisions, architecture, sources and six sessions)](docs/master/PROJECT-MASTERPLAN.md)
- [Cross-chat recovery protocol](docs/governance/CHAT-CONTINUITY.md)
- [Machine-readable project state snapshot](docs/governance/PROJECT-STATE.json)
- [GitHub automation, security and DevSecOps operating standard](docs/governance/GITHUB-OPERATIONS-STANDARD.md)
- [Research and authoritative sources](docs/research/SOURCES.md)
- [29 Desktop Commander tool coverage plan](docs/research/DESKTOP-COMMANDER-COVERAGE.md)
- [Final GitHub Work administration assignment](docs/governance/WORK-ADMIN-FINAL.md)

Plans and snapshots **are not live execution results**. Read actual GitHub `main`, open PR branches and issues before any write. S02's current evidence is on [Issue #6](https://github.com/lxcoding95/desktop-control/issues/6), [Draft PR #22](https://github.com/lxcoding95/desktop-control/pull/22) and the [feature-branch state snapshot](https://github.com/lxcoding95/desktop-control/blob/feat/s02-local-mcp-core/docs/governance/PROJECT-STATE.json). GitHub milestone descriptions and private Project metadata may lag; do not interpret completion percentages as proof of tests or independent review.

## Dedicated AI browser profile (planned)

The AI will use its **own persistent browser profile**, separate from the user's existing browser. The specification covers history, bookmarks, cookies/login state, session restoration, downloaded files, site permissions and a password manager or OS-backed credential vault subject to security validation. Browser automation will use Playwright where practical, with a visible black virtual cursor only during mouse actions. Sensitive browser credentials must not be exposed to AI tools. See [browser profile specification](docs/architecture/AI-BROWSER-PROFILE.md), [proposed ADR](docs/architecture/ADR-0002-AI-BROWSER.md), and [feature tracking issue #14](https://github.com/lxcoding95/desktop-control/issues/14). The browser is **not implemented**. Its reserved development session S04 remains unstarted and unauthorised.

## Security

Computer control is a high-trust capability. An unrestricted shell is **not contained** by a command blocklist or an allowed-directory configuration. Production designs must use OS-enforced isolation where a strong boundary is required. See [SECURITY.md](SECURITY.md) before reporting a vulnerability or experimenting with privileged execution.

## Contributing and community

Read [CONTRIBUTING.md](CONTRIBUTING.md), [GOVERNANCE.md](GOVERNANCE.md), [SUPPORT.md](SUPPORT.md), and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). Use the issue templates for proposals or bug reports. Do not submit real credentials, private machine data, or security exploit details in public issues.

## Licensing and attribution

Project-authored source and documents are licensed under [MIT](LICENSE), unless a file explicitly states otherwise. Third-party code retains its original license and notices; see the [reuse policy](docs/governance/REUSE-LICENSES.md). This project is independent of Desktop Commander and other referenced projects, and does not claim affiliation.

Maintained by the repository owner and contributors; contributors and reviewers are credited only for work actually performed.
