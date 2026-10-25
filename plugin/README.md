# Desktop Control — local source candidate

Developer: **Anon Allman**. The actual package version is in `plugin.json` and `PROVENANCE.json`. Source implementation, archive creation, account upload, local installation and running host version are separate states; none implies the next.

Requires an existing Node.js >=22.19 on Windows/Linux x64. The native desktop and permission-window helpers currently require Windows with a normal interactive medium-integrity user. Docker is required for isolated workspace/terminal operations. The separate visible browser uses a separately installed pinned Chrome for Testing runtime and private profile. No browser executable is included in this archive; the trusted local installer is separate from MCP and does not grant browser permissions.

`node start.mjs` starts only local MCP stdio. Normal S02 `dist/packages/mcp-server/src/index.mjs` still advertises one status tool and defaults to deny. The explicit private entry has additional host-authorized tools. Tool discovery is not permission: missing, invalid, expired or revoked local policy denies operations. No MCP tool can grant itself permission.

## Local permissions and emergency stop

Use `node grant.mjs status|grant|revoke` for diagnostics only. Workspace controls are separate: `workspace-status|workspace-grant|workspace-revoke`. Control permissions use `control-status|control-revoke`; `control-grant` consumes a strict local JSON object on stdin containing `capabilities` and exact `allowedOrigins`. Grants last 15 minutes; paths, principals and custom durations are not arguments. Prefer the visible local permission window when it is available and tested. Opening that window changes no grants.

Windows policy is DPAPI CurrentUser with protected owner/SYSTEM ACLs and trusted ancestors. Linux uses owner-only/no-follow regular policy files. Native principal and policy are freshly checked; root/elevated/mismatched identities are refused. Same-user arbitrary code remains trusted; this is not malware isolation or proof of a separate remote client identity.

Desktop input is a high-trust interactive capability, not a sandbox or independent second physical cursor. During active input the helper displays `ChatGPT controls your computer | Esc to stop` and temporarily changes common cursor shapes to an original black arrow. Esc stops the helper and leaves a durable stop sentinel; only explicit local desktop re-enable clears it. The watchdog attempts cursor restoration on helper exit. Real interactive/Esc/crash acceptance must be recorded separately; compile/unit success alone is insufficient. UAC and the secure desktop are not bypassed.

## Workspace, terminal and browser boundaries

Workspace file/PDF operations run in a pinned, unprivileged Docker image with network disabled, read-only runtime, a single approved workspace mount, capability/resource/time/output limits and cancellation. The runtime mount excludes the source checkout, Git history, private evidence and policy directory. Removal is recoverable soft-delete, not permanent deletion. Existing content replacement uses an expected SHA-256 precondition. Already committed writes are not atomically undone by a later revocation.

Terminal execution additionally requires `terminal.exec` and workspace write permission. It is a general command capability **inside that container**, not a general host shell or safety guarantee from an executable allowlist. No host root, Docker socket or policy directory is mounted. Node/npm/git/sh execution remains subject to the container limits and local approval.

Browser control uses a distinct visible profile and exact approved origins. Current redirect/login/account-sensitive-action limitations must be read in the current source acceptance report; do not infer broad account authorization from an origin grant. Browser/desktop integration and Linux desktop support are not accepted merely because their controllers exist.

The browser runtime installer is `node packages/private-browser/runtime.mjs install`; `status` reports safe version/hash state. It is pinned by Playwright SDK1.64.1's original manifest to Chrome for Testing revision1248, version156.0.8078.4. Download/installation acceptance, upstream signature verification and browser redistribution licensing remain separate gates. A local executable SHA-256 receipt is not proof of upstream authenticity. Do not place the downloaded runtime/profile inside the source/plugin archive.

## Installation and bundled updates

Import only a freshly verified private archive with Plugin Creator or a supported local marketplace on the local desktop host. Account upload is not proof of local execution. Test actual MCP discovery, denied calls, authorized fixture operations, revoke and reconnect. Browser-only chats cannot directly spawn a local stdio process; use the supported desktop handoff. Do not introduce an unauthenticated public proxy/tunnel or edit the host-managed cache.

Several source edits should become one reviewed/tested batch. The release policy/skill waits for clean source, unchanged-package detection, the quiet window and current-head checks/review before recommending a release. It does not create credentials, run an unattended upload daemon or prove signature-based installation. The P (host plugin package) and B (running bridge) lifecycle must be reported separately; host refresh/reselection can still be required. Never uninstall the existing working plugin before a tested replacement and rollback artifact exist.

`PROVENANCE.json` records source/versions/registry integrity. `FILES.sha256.json` covers archive bytes. `RUNTIME-LICENSES.json` and `SBOM.cdx.json` describe the selected runtime closure. Original dependency licenses, Playwright bundle sidecars and notices are retained. Full bundled-component/legal/release acceptance remains open until explicitly verified. No public release, zero-defect claim or automatic update activation is implied.
