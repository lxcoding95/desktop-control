# Bridge updater implementation and acceptance plan

The owner prioritizes a real autonomous Bridge update path. This change builds a **development-only host-side runtime slice**, not an activated updater for the live ChatGPT plugin. It does not change the existing account plugin, grant additional rights, publish artifacts or modify protected main.

## Architecture and decision

Reuse the existing M03 signed-policy verifier instead of reimplementing signature, expiry and anti-replay rules. A local protected inbox feeds a per-user store with retained version directories, a kernel-held process-lifetime lock and one atomic state document. The atomic active descriptor is committed only after a fresh child responds to a nonce-bound health request and exits. An interrupted journal retains the previous descriptor, and recovery freshly verifies that actual previous runtime. A mandatory policy whose target fails becomes repair-only.

The first transport is a **local inbox**, not a public server, automatic GitHub upload or unsigned URL. Its signed JSON bundle has bounded files and no links; no extraction tool or external dependency is required. A future verified publisher can supply it. The test signing keys exist only in test-process memory. No production signing key or trust root was created by this work.

## Source surfaces

- `packages/bridge-updater/store.mjs`: fixed production location `userInfo().homedir/.desktop-control-private/bridge`; Linux UID/eUID and ownership/mode/no-link checks; original Windows token/ACL/no-reparse helper; exclusive lifetime locks.
- `packages/bridge-updater/native/BridgeStore.cs` and `build-native.mjs`: normal-user native Windows identity/store checks and lock holder. Build outputs are ignored under `.build/`.
- `packages/bridge-updater/runtime.mjs`: signed metadata/artifact validation, version staging, real child health, atomic state journal, optional rollback, mandatory repair-only, bounded autonomous inbox polling and validated startup resolution.
- `packages/bridge-updater/runtime.test.mjs`: fresh temporary stores directly below the real user profile, ephemeral keys and actual child processes. No production grants or personal state are touched.

## Public host API and artifact contract

`openStore()` accepts no path. `enrollTrust(store,{keyId:spkiPem})` is an explicit first-time host operation; an existing trust root is never overwritten. `new BridgeUpdater(store,{pluginVersion})` exposes `applyPending()`, `status()`, `resolveActive()` and `watch({intervalMs,onResult})`. `watch` returns an awaited stop function. None is registered as an MCP tool.

`inbox/policy.json` is the existing `dc-update-policy-v1` Ed25519 envelope. Its signed artifact filename selects a file **inside that inbox**. The artifact is UTF-8 JSON `{schema:1,version,contract:"desktop-control-bridge-v1",entry:"entry.mjs",files:[{path,content:base64}]}`. Limits: 2 MiB encoded artifact, 1 MiB decoded files, 64 files, at most 12 path components, canonical ASCII paths, no traversal/aliases/device names. These development bounds deliberately cover verification fixtures and **cannot fit the complete current plugin runtime**. Full-store rechecks on each file are conservative but scale quadratically; production staging needs a reviewed bounded strategy. A capacity preflight refuses materialization before the protected store's hard entry limit. Automatic cleanup/garbage collection is intentionally absent; retained-version capacity remains a production blocker.

Health executes a fresh Node process under the Node permission API with read access only to that version's runtime and no child-process permission. `entry.mjs --desktop-control-health <nonce>` must emit exactly `{schema:1,version,contract,nonce}`, then EOF/exit 0 within four seconds. This is an actual process compatibility/version probe; it is **not full MCP initialization, grant, cancellation or tool-call acceptance**. Existing trust in signed code remains necessary; the permission flag is not a sandbox against malicious native code.

## Implemented verification

- [x] Two actual signed fixture runtime versions activate; a third whose real process exits with an error rolls back; a fresh engine verifies the retained version and accepts a subsequent corrected release.
- [x] Autonomous polling consumes a later signed local inbox release without the caller invoking installation.
- [x] Signature, byte tamper, replay/equivocation, downgrade, clock rollback/expiry, mandatory failure, traversal/alias and installed-file tamper refuse operation.
- [x] Actual kernel locks exclude another store instance; explicit first-time trust enrollment cannot replace an existing root.
- [x] Interrupted durable journal reconstruction verifies an actual previous child and does not commit an unverified target.
- [x] Actual Node health process cannot spawn children. Linux symlink/world-readable fixture refusal is tested; Windows symlink privilege is not assumed.

At 2026-10-25 11:49 UTC, the new Debian-12 Docker run completed **13/13 PASS, 0 FAIL, 0 SKIP**, normal UID/eUID 1000. The Windows rerun completed **13 tests, 12 PASS, 0 FAIL, 1 SKIP**, normal medium-integrity account. The first Windows run exposed a test-only watcher synchronization/cleanup race; it was corrected, and the failed log was retained. The focused Windows watcher retry passed before the full rerun. Additional nonce/EOF/hanging-child regressions are tracked separately in local evidence. Do not count any result beyond the recorded command receipts.

## Blocking production acceptance — updater remains OFF

- [ ] Independently review this new code and native store helper; freeze and rerun exact final source on Windows and Linux.
- [ ] Implement the host-only verified publisher. It must bind clean source commit, exact Windows/Linux matrix receipts, dependency/provenance inventory and independent approval to the artifact, and keep a protected signing key outside Git/MCP/logs. There is no production signing CLI in this slice.
- [ ] Integrate a stable P launcher and full-size B runtime package without changing plugin identity. Verify actual MCP protocol/tool health, not only the fixture nonce response.
- [ ] Replace per-file full-tree rechecks with a reviewed bounded staging transaction, and implement capacity/retention rules without weakening ACL, owner or no-link checks. Current limits intentionally prevent full-size runtime use.
- [ ] Add an owned live-runtime lease and actual quiescence. A committed pointer alone cannot update a process still executing old code. No active MCP request may be silently lost during switching.
- [ ] Enforce signed policy expiry/mandatory-update decisions on **every live MCP operation** alongside existing grants. `resolveActive()` is startup-only and cannot provide that guarantee.
- [ ] Verify crash/process-tree cleanup, interrupted staging, power-loss durability, key rotation/recovery, offline behavior and independently reviewed mandatory rollback restrictions. Current retained version directories are never automatically deleted or repaired.
- [ ] Prove two updates of the **real installed Bridge** in the ChatGPT host, with visible P/B versions and controls; no autonomous account-plugin P upload is claimed.

The precise next integration step is the live process lease/quiescence contract and per-operation update-policy gate. Until those and the publisher/review requirements pass, keep the uploaded preview.4 fallback and do not enroll or activate a production updater.

## Independent review dispositions, 2026-10-25

1. **Mandatory metadata arrived before missing/tampered artifact:** reproduced on actual Windows (the focused regression failed because `status()` still returned `ACTIVE`). Corrected by persisting verified metadata/checkpoint before attempting artifact reads; `status()` and startup resolution now refuse the old runtime under that mandatory policy. The same verified metadata can complete when the authentic bytes arrive. Focused Windows regression passed after correction.
2. **Missing inbox returned a cached state:** corrected by revalidating the protected latest policy, trusted clock, artifact bytes and access decision while holding the existing lock. A focused test removes the inbox, proves valid old operation, then advances beyond expiry and proves repair-only. Focused Windows regression passed.
3. **Quadratic full-tree checks and retained-version entry exhaustion:** not accepted for production. Development bundles were reduced to 64 files/1 MiB with a depth bound; a pre-materialization capacity check preserves headroom below the store hard limit. Full-size staging and retention/cleanup remain explicitly blocked; ownership/no-link checks were not weakened.

New final-source Windows/Linux runs include both security regressions; earlier 13/14-test runs are historical, not final acceptance. Raw local logs stay outside Git, and only sanitized counts/exit codes belong in GitHub.

## Frozen source verification at 12:00 UTC

- Windows normal account: **16 tests, 15 PASS, 0 FAIL, 1 SKIP**, exit 0; the skip is the POSIX link/mode test because Windows symlink privilege was not requested.
- Debian 12 Docker, UID/eUID 1000: **16 tests, 16 PASS, 0 FAIL, 0 SKIP**, exit 0.
- `npx eslint packages/bridge-updater --max-warnings 0`: exit 0. `git diff --check`: exit 0.
- Windows raw-log SHA-256: `2766332e3181934e6e3ac2e8558cc4c04f36e4ab0f83e839968409c76f8a7df3`.
- Linux raw-log SHA-256: `18523ea90d8519ce6c7ace2c881625eac790ede2a78db828b05fd02031dbc9de`.
- Tested final `runtime.mjs` SHA-256: `6510ad5b7a130fa6ab7145261e203b1e1ff7ae505c3e88d54b7526a7bd8b499f`; `store.mjs`: `41ce562e73cb929d2afcbc39ec21242302a1bb83bb08fa1a2c1afbb3c2be2b16`. The local source receipt records all other files. Documentation-only changes after these runs do not change those runtime hashes.

These are component development tests only. Production activation remains OFF for every blocking integration item above.
