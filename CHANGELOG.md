# Changelog

Desktop Control has **no public installable software release yet**. This file tracks human-reviewed changes that reach `main`, not feature-branch development or invented release versions. See the [product roadmap](ROADMAP.md) and [evidence-based milestone register](docs/governance/PRODUCT-MILESTONES.md). Versioned public releases require [release gate #3](https://github.com/lxcoding95/desktop-control/issues/3), integrity, licenses/SBOM, tested install/uninstall and explicit owner approval.

The section **Unreleased** is not a promised release date, download, changelog for an installed client or a claim that the current unmerged PRs are on `main`.

## Unreleased

### Documentation and architecture already on `main`

- **2026-10-22:** [PR #21](https://github.com/lxcoding95/desktop-control/pull/21) merged S01 foundation architecture, a local-first MCP tool contract, documented security requirements, GitHub governance and a six-session development plan.

### In review — **not** on `main` (exclude from release notes until merged)

- [Draft PR #22](https://github.com/lxcoding95/desktop-control/pull/22): S02 local read-only MCP status-core, Windows/Linux owner-run regression and local security-scanner evidence; independent semantic security review is pending.
- [Draft PR #26](https://github.com/lxcoding95/desktop-control/pull/26): evidence-based public product milestones M01–M06/M07+, repository freshness and data classification, reconciliation of public docs and issue templates; GitHub milestone/Project-v2 UI migration is still outstanding.

## Future versioned release discipline

Use documented semantic versions and real artifacts. Each release entry must state the **exact source tag/commit**, installation channel/OS support, breaking MCP/schema or permission changes, migrations and rollback procedures, SBOM/dependency and license provenance, and linked validation/security findings. Do not advertise an auto-updater or mandatory update enforcement until it has passed real signed-artifact, offline, failure and restart tests.

Sources: [release gate](https://github.com/lxcoding95/desktop-control/issues/3), [quality gates](docs/governance/QUALITY-GATES.md), [information policy](docs/governance/PUBLIC-INFORMATION-POLICY.md).
