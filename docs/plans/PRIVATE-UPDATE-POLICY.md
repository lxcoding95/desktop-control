# Private plugin update policy

Owner display: **Anon Allman**. This policy applies only to the private Desktop Control plugin. No public server, paid service, new API key, external model, global hook, marketplace/cache rewrite or protected-main bypass is required or authorized by this policy.

## One verified update per batch

`tools/plugin/release-policy.mjs` is a zero-dependency, read-only release planner. It does not build, change versions, grant authority, upload, install, sign or activate updates. An active assistant workflow collects related edits, verifies one immutable candidate and invokes the already available Plugin Creator update tool once. A background Node process cannot invoke the host's MCP tools independently without a separate authenticated channel; no such channel is implemented here.

The default quiet window is five minutes after the latest source change. Each additional change restarts the window. The active orchestrator records the last edit time, because Git commit timestamps alone cannot describe an uncommitted editing session. The CLI takes the later of that recorded timestamp and the last relevant Git commit. A deliberate finalization can bypass the quiet window; it cannot bypass cleanliness or evidence. A security-critical update can bypass quiet time only with an explicit reason and all evidence, and the decision marks `required: true`. That marker expresses urgency; it does not enforce installation.

Decisions, in precedence order:

| Decision | Meaning |
| --- | --- |
| `WAIT_DIRTY` | Working tree contains tracked or untracked changes. Commit the reviewed candidate through the authorized workflow. |
| `NO_CHANGE` | Runtime fingerprint equals the last published fingerprint; do not create another release, including after docs-only or version-only edits. |
| `WAIT_QUIET` | More edits can still join the batch. |
| `WAIT_GATES` | At least one required receipt is absent, stale, duplicated, failed, skipped or unreviewed. |
| `READY` | Planner allows the active workflow to prepare the single private update. This is not upload or host execution proof. |

## Source identity and evidence

The runtime fingerprint is SHA-256 over sorted `path + NUL + Git blob ID` records, with a newline after each record. It covers committed `packages/`, `plugin/`, `tools/plugin/`, package/lock manifests, TypeScript configuration and license inputs. Tests and documentation are excluded. The two plugin manifests have their top-level version removed before deriving their Git blob identity, so increasing a release label alone cannot create another update. Changing a source path or its blob changes the fingerprint. Runtime symlinks and submodules are rejected. Git HEAD is provenance and evidence identity, not the runtime fingerprint; a documentation commit does not itself create a release.

Required checks are `verify-windows`, `verify-linux`, `archive-validation`, `package-protocol`, and `licenses`, plus an independent review. Every receipt must contain `status: "passed"`, the exact candidate `fingerprint`, and the exact candidate `head`. Independent review also requires `independent: true`. These are locally supplied evidence records, not cryptographic attestations; the orchestrator must validate the actual commands, outcomes and reviewer independence before recording them. A check on an older HEAD or runtime is unusable. A final version commit changes HEAD and requires fresh receipts before publishing. No skipped required gate is treated as success.

Example input schema (replace descriptive placeholders with real evidence; they are deliberately invalid as executable receipts):

```json
{
  "latestPublished": {
    "version": "0.0.1-preview.3",
    "sourceFingerprint": "<64 lowercase hex characters>",
    "sourceCommit": "<published Git HEAD>"
  },
  "latestChangeAt": "2026-10-25T12:00:00.000Z",
  "receipts": {
    "checks": [
      { "name": "verify-windows", "status": "passed", "fingerprint": "<candidate fingerprint>", "head": "<candidate HEAD>" }
    ],
    "independentReview": {
      "status": "passed", "independent": true,
      "fingerprint": "<candidate fingerprint>", "head": "<candidate HEAD>"
    }
  }
}
```

Include every required check; the abbreviated example waits for gates. `securityCritical: true` additionally requires a nonempty `securityReason`. The CLI always prints `dryRun: true` and inspects the repository containing the script, never a caller-supplied checkout or receipt-supplied HEAD.

```powershell
node tools/plugin/release-policy.mjs --input <explicit-receipt-file.json>
node tools/plugin/release-policy.mjs --input <explicit-receipt-file.json> --finalize
node --test tools/plugin/release-policy.test.mjs
```

Preview version `0.0.1-preview.3` suggests `0.0.1-preview.4`; it does not mutate a manifest. After upload, record the resulting version, runtime fingerprint, source commit and archive SHA-256 as the next published baseline. Reusing the same fingerprint never creates another release.

## Supported private upload and host boundary

The active assistant can upload one verified archive using the available Plugin Creator update API and the existing private release identity. No manual UI upload is necessary. Keep opaque account and release IDs in the active workflow, never in this public repository skill. Check archive contents, source provenance, licenses and hashes before the call; read the returned private release back afterward. An upload receipt is not runtime acceptance.

Observed host behavior in this workflow: the plugin card displayed preview.3 after page refresh. Existing local stdio connections can retain the earlier version; a closed transport required user reselection. Reselect the plugin or open a new local chat, then verify the actual connected tools, visible version, scoped calls, revocation and recovery. Do not promise hot swapping. A public web chat cannot launch a user's local stdio process.

## Signing and mandatory runtime updates: not implemented

There is no signed mandatory runtime updater or automatic activation here. A future design needs an owner-approved Ed25519 trust key, private local artifacts, signed version/hash metadata, signature verification before staging, atomic activation, safe blocking of disallowed versions, and tested recovery to a trusted retained package. Key custody, rotation, rollback authorization, offline behavior and fail-safe recovery need explicit design and independent review. Do not call `required: true`, a new host card version or an uploaded ZIP enforcement of mandatory updates.

Rollback today means retaining the prior verified private archive and provenance, using the supported private update workflow when authorized, reconnecting the host, and repeating runtime acceptance. Never edit plugin caches to simulate activation.
