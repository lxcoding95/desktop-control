# Desktop Control Private 0.0.1-preview.1

Private connectivity preview, not a production release or general computer-control tool.
Requires an existing Node.js >=22.19 installation on Windows x64 or Linux x64.
The Windows archive contains a .NET Framework token-query helper built from the included project source; Linux does not invoke it.

The portable manifest launches `node start.mjs` over stdio. Only `desktop_control.status` is advertised. The production entry intentionally has no grants and returns `PERMISSION_DENIED`; plugin installation does not authorize diagnostics. No test fixture, granting environment variable, local enrollment tool, shell or file capability is shipped. An isolated positive test does not establish production grant provisioning.

Private installation: save/import this archive through Plugin Creator or a supported local marketplace on ChatGPT Desktop. Account save alone does not establish local installation or execution. Verify actual tool discovery and a denied call in a local chat. If the host cannot load local stdio packages, record the error; do not introduce a public proxy/tunnel.

Updates: replace with a separately verified private archive, restart the MCP connection and verify discovery again. No automatic/signature-based updater is implemented. Remove/disable the plugin through the host to disconnect it. Do not edit a host-managed cache.

`PROVENANCE.json` identifies source commit, build platform and locked dependency origins/integrities. `FILES.sha256.json` covers packaged bytes. Original upstream licenses are retained in node_modules and THIRD-PARTY-NOTICES.md. No legal certification is claimed. Node itself is an external prerequisite, not bundled.
