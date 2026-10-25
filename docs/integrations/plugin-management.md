# Desktop Control management and display identity

The visible product name is **Desktop Control**, and source author metadata is **Anon Allman**. The stable internal plugin name `desktop-control-private`, account plugin ID, storage directory and skill paths are deliberately retained so an update does not create another plugin or abandon existing policy. Private distribution is an audience choice, not the visible product name.

## Management entry

The supported host integration is [OpenAI Structured Settings](https://github.com/openai/mcp-extensions/blob/main/docs/spec.md#structured-settings), read on 2026-10-25. It is a server capability, not a made-up manifest button. `server/discover.capabilities.extensions["openai/settings"]` names `desktop_control.settings_read` and `desktop_control.settings_update`. The read tool accepts `{}` and declares an output schema for `{schema, values, layout}`.

`packages/private-settings/management.mjs` supplies the action-only layout. It links the existing local permissions window, emergency stop and safe version/grant status tools. There are no remote permission toggles or automatic-update enable switches. The update handler accepts only `{set:{}}`; all attempted settings writes fail closed. Only visible native host consent can create a grant.

The native window is titled **Desktop Control — Settings** and shows the current plugin P version from its adjacent manifest. **Versions & updates** distinguishes the installed plugin from the independently running Bridge B. Until a trusted updater is integrated and actually activated, the UI explicitly says automatic Bridge updating is not active. This status is not inferred from an uploaded ZIP. Opening settings and reading versions change no permissions.

The packaged control skill is also the documented onboarding skill. It first checks current version/grant state and explains how to open local settings. It cannot approve its own prompts. A host may require a fresh package installation/reconnection to discover new server capabilities.

## Developer identity limitation

Both portable and compatibility manifests contain `author.name` / `developerName` **Anon Allman**. During preview.4 inspection, the account plugin page still displayed the account creator's identity. The current account listing is not claimed fixed by changing source metadata. No global account profile was changed. Verify the actual host card after the next bundled upload; if the host continues deriving this line from account identity, a supported account/listing feature is needed rather than an undocumented manifest field.

## Verification and limits

Windows normal-user native build and settings tests: **8 pass, 0 fail, 0 skip**, plus ESLint exit0 and `git diff --check` exit0. The tests include an actual native `--info` process reporting package metadata, native normal-token validation, malformed CLI refusals, strict management contract and denial of attempted permission/update writes. An initial metadata-output test exposed Windows console encoding for the decorative middle dot; diagnostic text was changed to ASCII and the full suite rerun successfully. No grants were created.

Read-only reproduction using the actual installed preview.4 UI process's Node/CLI arguments returned `{ "state": "denied" }` for diagnostic, workspace and control status, each exit0. A previously observed UI `PRIVATE_POLICY_UNAVAILABLE` message was not reproducible as a path error. Do not hide a genuine CLI error by relabeling it denied.

Source and native tests do not prove the plugin-page settings button renders in every host or that the new UI is already uploaded. Final integrated protocol, archive and host acceptance belongs to the coordinating release check.
