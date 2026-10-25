# Owner-private local permission window

`node packages/private-settings/controller.mjs --build` builds the original WinForms helper using the existing Windows Framework compiler. `--open` displays it. `openPrivateSettings()` returns the child process: the desktop controller integrator **must protect this exact process ID before allowing further input**, including every concurrently open settings process. The framework window class is not the `DesktopControlPrivateSettings` prefix, so class-prefix detection alone is insufficient.

Opening the window changes no grants. Visible Grant buttons ask for local confirmation and invoke the fixed local Node policy CLI with bounded structured stdin. Grants expire after 15 minutes. Controls are individually selected, but granting replaces the complete control selection; Revoke ALL controls revokes the whole control policy. Diagnostics and workspace permissions remain separate. No HTTP server, MCP grant tool, arbitrary executable path, user principal, custom workspace path or elevation is exposed by the UI.

The native window refuses elevated, non-medium-integrity, UIAccess and non-interactive processes. Root/system POSIX processes remain refused by the policy principal layer. Browser origins are exact HTTP(S) origins, at most 20; account-specific approval is **not implemented**. Desktop input is full interactive session trust, not a sandbox. Blocking direct input into this window does not prevent every indirect permission manipulation by arbitrary same-user code or full desktop control. Do not advertise this as isolation from the logged-in account.

`control-policy` uses separate DPAPI CurrentUser context entropy and protected ACLs on Windows, or owner-only no-follow storage on POSIX. Each authorization reads policy and the real native principal afresh. The durable `desktop-stop` sentinel denies both desktop read/input. Status, unrelated grants and MCP calls never clear it; only an explicit local desktop grant clears it. Invalid/missing policy, principal mismatch, expired/revoked grants, unknown fields/capabilities and invalid origins deny.

Source CLI examples (local trusted terminal only):

```powershell
'{"capabilities":["browser.read"],"allowedOrigins":["https://example.com"]}' | node packages/mcp-server/scripts/private-grant.mjs control-grant
node packages/mcp-server/scripts/private-grant.mjs control-status
node packages/mcp-server/scripts/private-grant.mjs control-revoke
```

This component currently provides policy status, diagnostics/workspace grants and selected browser/desktop/isolated-terminal grants. Update/rollback status, per-account/window grants, audit history, Linux GUI, translations, installer and full accessibility/interactive acceptance are pending. A successful build or policy test is not proof of a tested visible UI or host integration.

## Conservative per-action approval

`confirmPrivateAction({ kind: 'desktop.input' | 'browser.interact', summary }, signal?)` opens a **new visible local confirmation for one input action**. The literal summary is limited to 240 printable characters, with control/bidi override characters rejected. Do not include passwords, typed content or other secrets in summaries. Only explicit native OK returns `true`; Cancel, window closure, wrong token/platform, malformed input, spawn failure, a concurrent prompt, cancellation and a 60-second timeout return `false`. Timeout/cancellation requests helper termination. No grant or policy is written.

The caller must pause/stop outstanding input controllers before displaying the prompt, protect the helper process from automated input, and recheck the relevant grant and cancellation **after approval and immediately before action**. A confirmation is neither an account-specific policy nor a durable grant. The conservative initial integration asks for each input because the product cannot reliably identify all critical account actions from a locator or coordinates. Do not automatically click approval dialogs. Native interactive acceptance remains pending; injected-process tests prove wrapper behavior, not a real human approval.
