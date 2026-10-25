# Desktop Control in Docker MCP Toolkit

## Local integration, not a public catalog listing

Desktop Control has a dedicated local MCP Toolkit profile named **Desktop Control**
(`desktop-control`). It contains the production deny-by-default stdio core. Its only
product tool is `desktop_control.status`; without a trusted host grant it returns
`PERMISSION_DENIED`. A request argument cannot grant access. The image does **not**
contain the private entry, Windows helpers, a browser, settings UI or host mounts.
It cannot control the Windows desktop from the Linux container.

This is a tested foundation for Docker distribution, **not** acceptance of all
private desktop features, an autonomous Bridge updater, public Docker Hub upload,
or inclusion in Docker's official catalog. No registry was pushed, client connected,
secret supplied, other project profile modified, or global Docker feature changed.

Official integration instructions:
[Docker MCP CLI and local definitions](https://docs.docker.com/ai/mcp-catalog-and-toolkit/cli/).
Toolkit is Beta; this machine has CLI `v0.44.1` with a Linux Docker engine.

## Build and verify

From the repository root, with Docker running and the intended source committed:

```text
node tools/docker-mcp/build.mjs
node tools/docker-mcp/test.mjs <image ID from the build receipt>
node tools/docker-mcp/install-profile.mjs
node tools/docker-mcp/test-gateway.mjs
```

The builder snapshots only the committed lockfile, package manifests, project
license and five production source modules. It never sends the working tree,
`.git`, private logs, credentials, grants or host workspace to the Docker builder.
Build context and receipt are retained under `.cache/docker-mcp/<source SHA>/`.
An existing context or existing `desktop-control` profile is refused rather than
overwritten. Read the retained receipt before cleaning or migrating either.

The digest-pinned existing Node image is used in both build stages. Installation
uses `npm ci --ignore-scripts` and the public npm registry. Only the MCP server,
MCP core and Zod runtime package directories enter the final application payload;
their original package license/notice files remain in those directories. The base
image also contains its own distribution software. This slice is local only;
complete image SBOM, base-image CVE assessment and redistribution review remain
open gates before publishing. No new license certification is asserted.

The direct Docker test applies UID1000, no network, read-only root, no host mounts,
no privileges, dropped capabilities, no-new-privileges, CPU/memory/PID limits. It
checks the actual live container settings, real protocol responses and removal
after EOF. It does not inject a positive diagnostic grant.

The Toolkit gateway uses its **own defaults** (observed no-new-privileges and
CPU/memory limits), not all direct-test flags. Do not claim that the gateway test
proved `--network none`, read-only root or full sandbox equivalence. No Windows
grant integration is present. Docker's already-enabled Dynamic MCP feature also
advertises internal management tools; these are gateway tools, not Desktop Control
tools. No client is connected automatically, so this setup does not give an agent
those management capabilities.

## Fresh evidence: 2026-10-25

Source snapshot: `9ec243963ec0bd4b1325863aab99d4bcee53a7bc`.
The five production modules and lockfile/manifests used here are unchanged from
the uploaded preview.4 source `5817093949ece2a7451588020397ccb85d6eccb3`.

Local image: `desktop-control/mcp-local:9ec243963ec0`.
Image ID: `sha256:11c6f85d8ca36069d0b7b08a4cc4114b505ba9a95bdbff840d0bd58389b49e91`.

| Actual command/check | Result |
| --- | --- |
| `node tools/docker-mcp/build.mjs` | Exit0; locked install and TypeScript compilation |
| `node tools/docker-mcp/test.mjs desktop-control/mcp-local:9ec243963ec0` | Exit0; 8 named acceptance checks, all PASS |
| Direct MCP2026-07-28 discovery/list/status | PASS; exactly1 product tool, denied status |
| Forged grant / unavailable terminal tool | PASS; both rejected |
| Live container containment / EOF / removal | PASS |
| Local profile creation via YAML | Exit0;1 server; no client connection |
| `docker mcp gateway run --profile desktop-control --dry-run` | Exit0;1 product tool discovered |
| `node tools/docker-mcp/test-gateway.mjs` | Exit0;5 named acceptance checks, all PASS |
| Gateway initialize / discovery / denied call / forged grant / EOF | PASS |
| Docker Desktop rendered profile card | NOT RUN; CLI profile exists |
| Windows host control through the Docker profile | NOT IMPLEMENTED |
| Positive authorization through Docker profile | NOT RUN; no grant provisioning |

The named checks above are contract checks in real integration scripts, not a
claim of13 separately registered unit tests. Raw build/gateway logs stay local in
`.cache/docker-mcp-*.log`; publish only this sanitized summary.

Two failed attempts are retained: direct `docker://` profile import rejects an
image without self-describing catalog metadata, so the official local YAML path
is used. `--static` gateway mode requires a host `socat` executable unavailable on
this Windows installation; the supported default stdio gateway succeeds without
installing another dependency or disabling signature checks. A non-fatal Docker
OAuth notification pipe warning appeared during dry-run. No OAuth is required
by this server, and the subsequent real gateway call completed successfully.

To see the local setup, open Docker Desktop → MCP Toolkit → Profiles and refresh;
look for **Desktop Control**. Docker's official catalog/template listing is a
separate publication/review process and has not been claimed or submitted.
