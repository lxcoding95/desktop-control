# Roadmap

**Progress as of 2026-10-25:** S01 is complete in PR21; S02 acceptance remains open on Draft PR22. The owner separately authorized selected private S02–S06 implementation on Draft PR33/Issue28 without starting or resetting the historical formal session accounts. Authorization is not feature acceptance or production certification.

| Stage | Current state | Primary objective | Evidence expected |
| --- | --- | --- | --- |
| Session 1: Foundation & Architecture | **Completed (docs); PR #21 merged** | Freeze minimal end-to-end scope, protocols and security boundaries | ADRs, verified feasibility and executable acceptance criteria |
| Session 2: MCP Core & Connectivity | **Owner-authorized completion; PR #22 draft; final native/security/license/review acceptance pending** | Establish one local end-to-end read-only MCP operation | Automated protocol and transport tests, controlled smoke test |
| Session 3: Filesystem & Terminal | **Formal session not started; selected private work authorized** | Add bounded read/edit/process primitives | Authorization tests, cancel/timeout/rollback tests |
| Session 4: Desktop & Browser | **Formal session not started; selected private work authorized** | Platform-specific UI and browser integrations | Windows/Linux environment matrix, accessibility and input tests |
| Session 5: Security, Packaging & Installation | **Formal session not started; selected private work authorized** | Permissions, installers and verified packaging | Abuse tests, install/uninstall and credential-revocation tests |
| Session 6: Integration, Quality & Release Candidate | **Formal session not started; selected private work authorized** | Integration and release-readiness assessment | CI evidence, defects, risk register and explicit ship/no-ship decision |

These are **timeboxed workstreams**, not guarantees that a release-ready product can be completed in 150 minutes. Unfinished work remains open; do not compress security validation to hit a timebox.

## Mandatory pre-release gates

- [SEC-GATE-001: pin Actions to full commit SHAs](https://github.com/lxcoding95/desktop-control/issues/1)
- [CI-GATE-001: quality validation](https://github.com/lxcoding95/desktop-control/issues/2)
- [REL-GATE-001: release safety](https://github.com/lxcoding95/desktop-control/issues/3)
- [ADMIN-GATE-001: GitHub management automation](https://github.com/lxcoding95/desktop-control/issues/4)

See [architecture](docs/architecture/OVERVIEW.md), [threat model](docs/architecture/THREAT-MODEL.md), [sessions](docs/governance/SESSION-PLAN.md) and [quality gates](docs/governance/QUALITY-GATES.md).
