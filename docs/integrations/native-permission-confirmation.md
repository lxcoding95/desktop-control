# Native confirmation for persistent permission proposals

This source adds a **consent boundary**, not a grant endpoint or permission
migration. Opening settings, reading the contract, proposing permissions, or
receiving an MCP `approved: true` field cannot provision anything. No existing
protected policy is changed by this implementation task.

## Host API

`packages/private-settings/controller.mjs` exports:

```js
await confirmPrivatePermissionProposal(proposal, signal); // boolean
```

The only accepted proposal shape is:

```json
{
  "controls": ["browser.read", "desktop.input"],
  "allowedOrigins": ["https://github.com"],
  "diagnostics": true,
  "workspaceCapabilities": ["files.read", "pdf.create"],
  "reenableStopped": false,
  "lifetime": { "kind": "until-revoked" }
}
```

Every key is required; extra keys, accessors, inherited values and malformed
collections are rejected before a process starts. Controls are a unique subset
of `browser.read`, `browser.interact`, `desktop.read`, `desktop.input`,
`terminal.exec`. Workspace rights are a unique subset of `files.read`,
`files.write`, `files.remove`, `pdf.create`. Empty subsets are permitted; the
calling host decides whether a no-op proposal needs presenting.

Origins are unique, exact canonical HTTP(S) origins, maximum20 entries and512
ASCII characters per entry, without credentials, paths, queries, fragments or
wildcards. Browser controls require at least one origin. Both booleans must be
actual booleans. Lifetime must be exactly `until-revoked`. The complete pretty
printed ASCII JSON snapshot shown to the user must fit8KiB; oversized proposals
are refused rather than truncated.

The wrapper takes a fresh literal snapshot before waiting, so later caller
mutation cannot change what the native prompt displays. It uses the existing
fixed `private-settings.exe --confirm-action` child protocol with the distinct
kind `permissions.grant`. The fixed summary and full proposal are passed through
stdin, not interpolated into a command line. The native helper independently
validates the capability/origin/lifetime schema and distinguishes persistent
permission consent from a one-action browser or desktop input prompt.

## Decision and lifecycle

The visible native dialog says **until revoked**, shows every actual capability,
the diagnostics flag, exact origins and `reenableStopped`, and explains the
durable-stop effect. Cancel is focused and is the Enter/Esc default. A native
60-second deadline also cancels the window if the parent disappears. The parent
has its own maximum60-second timeout; cancellation, unavailable helper, child
failure, nonzero/null exit and late success after cancellation all return false.
Permission and input prompts share one production mutex. Non-Windows platforms
return false rather than inventing a GUI approval path.

Only native exit0 after the human approves the actual prompt may return true.
The boolean does **not** write a grant. The calling trusted host must separately
apply the **same validated, frozen proposal**, check cancellation again, re-read
the actual OS identity, and retain deny-by-default/error handling. It must not
reconstruct a broader proposal after consent. Multi-policy application and
rollback are host integration responsibilities, not accepted by this module.

The separate, existing local WinForms **Grant selected controls / re-enable**
button now explicitly includes `reenableStopped: true` only in the payload sent
after the human confirms its default-Cancel dialog. Merely opening the window or
calling a proposal endpoint does not clear durable Esc markers. This does not
change the browser/desktop helper's existing refusal to automate its own
`private-settings.exe` approval window, nor does it permit UAC/secure-desktop
input or Administrator elevation.

Persistent means the selected host grants remain until explicitly revoked; it
does not override ChatGPT tool approval policy, local input confirmations,
emergency stop, process identity constraints or future security policy changes.

## Evidence and limits

Fresh Windows tests:

```text
node --test packages/private-settings/test/settings.test.mjs
10 PASS, 0 FAIL, 0 SKIP; exit0
```

Coverage includes strict input rejection with0 child invocations, full immutable
proposal transport, granular workspace capabilities, explicit native-exit
semantics, concurrent prompt refusal, timeout, cancellation, child failures and
late success. Controlled child-spawn seams never provision a real grant.

The real compiled native helper's `--permission-contract` introspection verifies
the declared capability lists, lifetime, default denial,8KiB/60-second bounds and
no grant write. A separate normal Windows PowerShell process reflects the
compiled pure native proposal validator against valid and invalid proposals
without creating a window. An invalid `permissions.grant` child payload is
also actually rejected with exit2 before a dialog can open. PowerShell5 may emit
first-use module-preparation progress as CLIXML; the test retains errors and
checks the actual validator output rather than treating progress as a defect.

No human approval click, actual permission grant, policy migration, UI screenshot
or full host end-to-end proposal/application acceptance is claimed here. Those
remain separate controlled integration checks after the complete bundle passes
its Windows/Linux verification and review.
