# Desktop Control Private 0.0.1-preview.3

Private connectivity preview, not a production release or general computer-control tool.
Requires an existing Node.js >=22.19 installation on Windows x64 or Linux x64.
The Windows archive contains a .NET Framework token-query helper built from the included project source; Linux does not invoke it.

The portable manifest launches `node start.mjs` over stdio. Only `desktop_control.status` is advertised. Installation does not authorize diagnostics. The explicit private entry reads trusted local policy; the normal S02 production entry remains deny-all. No test grant, granting environment variable, shell or file capability is shipped.

## Local diagnostic permission

From the extracted private package, run `node grant.mjs grant` as your normal OS user to authorize **only diagnostics.read for 15 minutes**. `node grant.mjs status` reports safe state/expiry, and `node grant.mjs revoke` revokes it. No custom principal, path or duration is accepted; no MCP tool provisions grants. Root/elevated/mismatched identities remain refused.

Windows policy uses DPAPI CurrentUser and protected owner/SYSTEM ACLs; Linux requires a private owner-only directory and regular owner-only policy file, rejects symlinks/hardlinks and oversized/untrusted data. Every authorization check re-reads policy and native identity. Arbitrary code running as the same OS account remains trusted: this is not isolation from local malware or proof of a separate remote client/device identity. No new password/API key is required.

Private installation: save/import this archive through Plugin Creator or a supported local marketplace on ChatGPT Desktop. Account save alone does not establish local installation or execution. Verify actual tool discovery and a denied call in a local chat. If the host cannot load local stdio packages, record the error; do not introduce a public proxy/tunnel.

Portable and Codex compatibility manifests share the same identity, version and local command. Explicit public noreply author metadata prevents account-import defaults from inserting private contact details. Account import can normalize compatibility files; the archive byte inventory applies to the original artifact, not an unverified host-transformed export.

Updates: replace with a separately verified private archive, restart the MCP connection and verify discovery again. No automatic/signature-based updater is implemented. Remove/disable the plugin through the host to disconnect it. Do not edit a host-managed cache.

`PROVENANCE.json` identifies source commit, build platform and locked dependency origins/integrities. `FILES.sha256.json` covers packaged bytes. Original upstream licenses are retained in node_modules and THIRD-PARTY-NOTICES.md. No legal certification is claimed. Node itself is an external prerequisite, not bundled.
