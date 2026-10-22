# S02 — Lockfile, license and supply-chain review (2026-10-22)

**Scope and provenance:** These are read-only checks on [`package-lock.json`](../../../package-lock.json) from branch `feat/s02-local-mcp-core`, confirmed through the GitHub connector during the expressly authorized S02 extension. They are **not** a complete license audit, SBOM attestation, or proof of clean install after code changes.

| Recorded check | Observed |
| --- | --- |
| npm lockfile | v3 |
| Total package entries | 163, including workspace metadata |
| External resolved registry artifacts | 160 |
| Off-registry external resolved artifacts | 0 (of 160) |
| External resolved artifacts missing `integrity` | 0 (of 160) |
| `@modelcontextprotocol/server` | 2.3.1, Apache-2.0 |
| `@modelcontextprotocol/inspector` | 2.12.0, `SEE LICENSE IN LICENSE` |
| TypeScript | 5.9.3, Apache-2.0 |
| root `zod` | 4.6.7, MIT, with package-local `zod` 4.6.5 also resolved (MIT) |

## License metadata counts by lockfile entry

- MIT: 131
- Apache-2.0: 6
- BSD-3-Clause: 2
- ISC: 7
- MPL-2.0: 12 (all are Lightning CSS platform binaries/packages at version 1.33.0)
- `(MIT OR CC0-1.0)`: 1 (`type-fest`)
- `SEE LICENSE IN LICENSE`: 1 (MCP Inspector)
- Missing `license` value in lockfile: 3 entries, root workspace plus the two linked entries for our private `@desktop-control/mcp-server`.

**Review limits:** An npm lockfile's `license` field is only package metadata. Real third-party LICENSE, NOTICE, COPYING, third-party notices, optional dependency/platform handling and redistribution obligations remain to be inspected before release. MPL-2.0 components are file-level copyleft; do not copy or modify their source without recording notices/obligations. The MCP Inspector package's own upstream npm listing identifies a mixed MIT/Apache-2.0 transition; preserve the exact bundled `LICENSE` if redistributed, and prefer **development-only** use.

The earlier Windows Work continuation reported `npm audit --json` **exit 0** and zero reported advisories on its tested lockfile; that is not a guarantee of safety, not a new scan at this checkpoint, and is not a full transitive-source review.

Current release posture: **NOT APPROVED for redistribution**. There are no directly copied third-party source files in this S02 PR, no npm publication, installer, CI run, or bundled Inspector application. `SEC-GATE-001` (Issue #1) remains open.

References:
- https://www.npmjs.com/package/@modelcontextprotocol/inspector
- https://www.npmjs.com/package/@modelcontextprotocol/server
- https://www.mozilla.org/en-US/MPL/2.0/
- [Reuse policy](../../governance/REUSE-LICENSES.md)
