# Bridge updater — development runtime slice

**Production activation is OFF. This is not the updater for the currently running ChatGPT plugin.**

The owner requested automatic bundled updates. This original, dependency-free implementation reuses `../update-policy` and exercises the local signed-artifact path with actual files and fresh child processes. It supports a protected per-user store, signed local inbox, replay/expiry checks, version staging, nonce/EOF/exit health checks, retained-version rollback, interrupted-journal recovery and autonomous polling.

Build the normal-user Windows store helper before testing:

```sh
node packages/bridge-updater/build-native.mjs
node --test --test-concurrency=1 packages/bridge-updater/runtime.test.mjs
```

Linux requires the existing system `flock` executable and a non-root account with equal real/effective UID. Windows requires an ordinary medium-integrity interactive token; the helper rejects elevation. Tests use new protected fixture directories directly beneath that account's profile and ephemeral in-memory Ed25519 keys. They do not enroll production trust, start a service or grant any desktop/file/terminal permission.

The local inbox watcher is executable library behavior tested with two later fixture versions. It is **not** proof that a live MCP process was updated. The small artifact limits (64 files, 1 MiB decoded) intentionally prevent treating this development slice as full plugin delivery. No production publisher, private signing key, live-runtime lease, per-MCP-operation policy integration, installed host update or unattended activation is supplied here.

See [the implementation and acceptance plan](../../docs/plans/2026-10-25-bridge-updater.md) for APIs, data format, trust boundaries, independently identified corrections and the precise blocking production work. Do not wire this library to the plugin launcher until those gates pass. Source changes and passing fixture tests are not permission to bypass existing host grants or local action confirmations.
