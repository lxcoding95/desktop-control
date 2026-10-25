# S02 — Dependency provenance and license acceptance inventory

**Reviewed 2026-10-24 during S02 extension #4.** Source: the exact `package-lock.json` in `feat/s02-local-mcp-core` at the time of inspection, plus version-tagged upstream license pages. This is a **source/metadata review**, not a clean install, npm tarball LICENSE-file checksum, legal opinion, or complete release audit.

## Exact lockfile snapshot

- Lockfile v3, **248 entries** including root/workspace; **245 externally resolved registry artifacts**.
- All 245 external artifacts resolved to `https://registry.npmjs.org/` with nonempty `integrity` digests. This verifies recorded URL/integrity metadata, **not package archive content**.
- License-metadata counts: `(MIT OR CC0-1.0)`: 1; `Apache-2.0`: 18; `BSD-2-Clause`: 6; `BSD-3-Clause`: 3; `BlueOak-1.0.0`: 1; `ISC`: 10; `MISSING`: 3; `MIT`: 193; `MPL-2.0`: 12; `SEE LICENSE IN LICENSE`: 1.
- The 3 missing `license` fields are project root/workspace link entries, **not third-party downloads**.
- Previous *Windows* and *Linux* `npm ci --ignore-scripts` results passed with zero known advisories reported. This is **not a fresh `npm audit` run after the latest source modification** and not a legal/security approval.

## Estimated S02 runtime closure (npm workspace without development packages)

| Dependency | Locked version | Lockfile license | Intended use |
| --- | --- | --- | --- |
| `@modelcontextprotocol/server` | 2.3.1 | Apache-2.0 | Runtime MCP stdio server |
| `@modelcontextprotocol/core` | 2.3.1 | Apache-2.0 | Transitive MCP core |
| `zod` (workspace-local) | 4.6.5 | MIT | Runtime schemas |
| `zod` (root peer/transitive resolution) | 4.6.7 | MIT | Peer resolution in lockfile |

The above **four package records** are reachable through recursively traversing `packages/mcp-server`'s declared `dependencies` and each resolved record's `dependencies`. This is an approximate lockfile graph, **not proof of what a future distributable actually includes**. Recalculate on the final packaging command, with peers/optionals/platform-specific packages, and inspect the compiled shipped artifact.

The runtime graph's available metadata is **2 Apache-2.0 records and 2 MIT records**. The upstream **version-tagged** sources confirm the [MCP TypeScript SDK v2.3.1 LICENSE](https://github.com/modelcontextprotocol/typescript-sdk/blob/v2.3.1/LICENSE) includes explicit license-transition language and both Apache-2.0 and MIT terms; the [Zod v4.6.5 LICENSE](https://github.com/colinhacks/zod/blob/v4.6.5/LICENSE) contains the MIT terms. Verify exact installed npm tarballs and any nested notice texts before redistribution.

## Development-only graph and attribution notes

- The Inspector is a **devDependency**, not an intended application/runtime dependency. Locked Inspector 2.12.0 reports `SEE LICENSE IN LICENSE`. The [upstream licensing statement](https://github.com/modelcontextprotocol/inspector/blob/main/LICENSE) includes Apache-2.0 and MIT transition plus documentation CC-BY-4.0 distinctions. Its **actual version-2.12.0 npm archive LICENSE** must be inspected before it could ever be redistributed; prefer *not* bundling Inspector at all.
- The **12 MPL-2.0 entries** correspond to Lightning CSS and platform binaries in the currently development-oriented tool tree. Their license/notices and any modified MPL-covered source must be handled appropriately **if** included in a release. They are **not** in the above recursively estimated four-package runtime closure.
- The one `BlueOak-1.0.0` development entry needs its notice-or-license-link preservation if redistributed ([SPDX text](https://spdx.org/licenses/BlueOak-1.0.0.html)).
- No published app, installer, npm package, binary artifact, static bundler output or GitHub release is present in S02. No third-party source was intentionally pasted into the project's runtime files. The project's own MIT license does **not** override upstream authors' rights.

## Mandatory remaining license / provenance gates

- [ ] In a **real clean Node>=22.19 Work checkout**, `npm ci --ignore-scripts` then inspect all actual `node_modules/**/LICENSE*`, `NOTICE*`, `COPYING*`, package manifests and embedded third-party notices in both production and development trees.
- [ ] Verify that installed server/core/zod package LICENSE notices **match the version-tagged source** (not only the mutable `main` licensing page); record upstream source commit/tag, package integrity hash, licence-holder and any exception.
- [ ] Build the intended distributable with production-only dependency packaging and generate a third-party notices/SBOM inventory from **what is actually shipped**, documenting per-OS optional dependency differences.
- [ ] Ensure all applicable Apache-2.0/MIT notices, modifications and upstream copyrights are preserved; if Inspector or MPL-related code is ever packaged, evaluate its individual terms before release.
- [ ] Independent legal/supply-chain review (or designated qualified maintainer sign-off) plus final `npm audit` and package provenance check.

**Disposition:** License risk seems *tractable for the narrow, unpublished S02 prototype*, but **redistribution compliance is NOT yet certified**; PR #22 remains Draft and cannot be represented as production-ready. [Policy](../../governance/REUSE-LICENSES.md), [S02 Issue #6](https://github.com/lxcoding95/desktop-control/issues/6).
