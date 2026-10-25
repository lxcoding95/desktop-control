# Desktop Control M03: signed update-policy prototype

**Status: isolated prototype, not an installed updater.** See [M03 #29](https://github.com/lxcoding95/desktop-control/issues/29). No public releases, no production host integration, no automatic install, no signing infrastructure. S03–S06 remain unstarted. The protected `main` and SEC-GATE-001 are unchanged.

## Tested behavior

`node --test packages/update-policy/index.test.mjs` uses Node's built-in `node:test` and the native `crypto` Ed25519 primitives; it generates throwaway test signing keys in memory only. The repository contains **no private signing key**. The library has **zero external npm dependencies**. It currently checks:

* A trusted Ed25519 **public** key supplied by a protected launcher (never from a downloaded envelope); the signed payload remains bytes-exact and is UTF-8 decoded only after signature validation.
* Bounded/strict policy and artifact metadata; expiry, issued-at tolerance, replay/equivocation checks and a monotonic checkpoint; compatible plugin and platform rules.
* Signed mandatory-version decisions: normal MCP functions blocked in `REPAIR_ONLY` while version, doctor, update, revoke, logout and emergency-stop are permitted. A real MCP server **must separately enforce** this decision; the prototype does not intercept tools.
* One coalesced bridge patch **candidate**, only from owner-approved **and verified** commits; a regular window, explicit release-now or a critical change can trigger it. This function does **not** upload or install artifacts.
* SHA-256 verification of a prospective byte buffer against signed metadata; real artifact signature and provenance/release controls remain future integration work.

## Pure update activation lifecycle

`activation-machine.mjs` is a second, independent state machine. `node --test packages/update-policy/activation-machine.test.mjs` passed **29/29** on Linux Node **22.16.0** at the tested prototype source. The test suite exercises correct order, stage/quiesce/switch failure, health failure, mandatory versus optional rollback, aborts, wrong transaction IDs, state mutation and forged ACTIVE snapshots, all 14,641 four-event permutations (only one ordering reaches ACTIVE), and repeat-abort handling. The source and test Git blob IDs were checked against the locally tested files. No Windows run or actual filesystem install has been performed.

The sequence is `AWAITING_STAGE → AWAITING_QUIESCE → AWAITING_SWITCH → AWAITING_HEALTH → ACTIVE`. Failures after a possible active-pointer swap go to `ROLLBACK_REQUIRED`; a rollback or abort never silently authorizes an older bridge if the update is mandatory. All non-`ACTIVE` states keep normal tools closed in `activationGate`, including `RETAINED_OLD`: a separate trusted signed-policy/recovery recheck must decide whether an optional old runtime can resume.

The module accepts update lifecycle **events and descriptors only from a trusted local orchestrator**. It does not cryptographically authenticate those inputs or observe actual file integrity, quiescence or process health. Its `WeakSet` protects only locally minted in-process snapshots from direct object forgery. This is *not* a durable trust anchor or an OS privilege boundary: after a restart, the signed policy and persisted transaction state must be revalidated from independently protected local storage. A malicious process with the ability to call `beginActivation` using fabricated success data must not control the real MCP authorization gate. **Neither these state results nor unverified event receipts are permission to execute MCP tools.** Actual signature, expiry, authorization, identity, lifecycle receipts and grants require integration tests.

## Trust model and hard limitations

`verifyPolicy(envelope, trustedKeys, { previous, now })` validates one metadata envelope and returns a checkpoint. `previous` has to be stored **atomically, safely and per OS principal** outside untrusted directories before making production decisions. Missing/corrupt/expired policy, rollback detected or an unavailable trusted clock means **repair-only**, never a silent allow. The caller must not invoke `decideAccess` on an unverified policy and must not treat `READY` as permission to bypass per-tool/per-resource grants. The metadata expiration limit is not a full TUF implementation; trusted clock rollback, signature key rotation, freeze/mirror attacks and root recovery require a proper update subsystem and independent review.

An OS-owned, **immutable** per-user launcher must own its public trust keys; no JSON supplied by an MCP client or remote HTTP endpoint can add a trust key or mutate the update checkpoint. Only an out-of-band authorized key-rotation operation could change that anchor. Real installation must additionally validate platform artifact signatures, private release transport, download length/hash, clean frozen source/lockfile, provenance, dependency licenses, ACLs/symlinks, locking, atomic pointer changes, health verification and rollback restrictions. Windows and Linux native tests are required; a green Node unit suite is not an end-to-end proof.

**Plugin vs Bridge:** This library addresses the local **B** version policy and records allowed **P** versions. It cannot update the host-installed ChatGPT **P** plugin, manifest, cache or tool list. That layer requires Plugin Creator/versioned host installation and real reconnect/discovery tests. No plugin ZIP should be uploaded per commit; no public GitHub Releases or npm distribution in the private phase.

## Independent pre-integration blocker identified

**FIXED AT ISOLATED POLICY-API LEVEL — not released or host-enforced:** `verifyPolicy(envelope, trustedKeys, { previous, clock })` now returns a frozen ticket minted inside a module-private `WeakMap`. `decideAccess(ticket, versions)` and `verifyArtifact(bytes, ticket)` reject raw policy JSON, unsigned artifact checksum objects, cloned/crafted tickets, modified nested metadata and tickets whose protected clock has expired or moved backwards. The caller cannot set the decision time through a tool argument: each check reads the same clock bound at verification. Passing an untrusted clock or untrusted signing keys to `verifyPolicy` **still voids the trust boundary**, and a pure WeakMap cannot protect across process restarts. The caller must provide OS-protected trust anchors, trusted clock and persisted monotonic checkpoint, and the **MCP authorization handler must enforce** expiry and resource grants on every real call.

**STILL OPEN — activation/installation trust:** `activation-machine.mjs` checks sequencing only; a malicious caller could fake `HEALTH_OK`, `SWITCH_OK` or the initial transaction descriptor unless these events originate from an independently protected local updater with verified OS/process receipts. Real signed artifact transport, platform installer, protected immutable runtime directories, rollback, fail-closed recovery, cross-platform testing and ChatGPT plugin refresh remain unimplemented. This draft cannot be deployed as a secure automatic updater.


## 2026-10-25 signed-ticket correction and combined verification

At PR #31 code HEAD prior to this documentation-only update, the exact GitHub blobs used in the local sandbox had IDs:

- `index.mjs` `71fd8a579af16114ac61659acb99efb8590ef1a3`; `index.test.mjs` `4899aa4a8b5a0b309457c7c18bcf8eb083434c46`;
- `activation-machine.mjs` `38bfd65c1325caded9530ec05496707998da2a86`; `activation-machine.test.mjs` `094821887c0814bb3622f3f5eb8e8b93e8ef649d`.

These **four blob hashes matched independently reconstructed local files** by `git hash-object` in an isolated Linux container (Node.js 22.16.0), and `node --check` for the policy module passed. **Combined command `node --test index.test.mjs activation-machine.test.mjs`: 66 tests passed, 0 failed, 0 skipped**, including hostile unsigned policy / checksum substitution, mutable/forged proof attempts, clock rollback, signature expiry, successful signed data, batching semantics, and 14,641 short activation-event traces. No live MCP tool, native Windows verification, Docker installer, GitHub Actions check, background updater or OS security boundary was exercised. The test fixtures use ephemeral Ed25519 keys only.

## Next integration acceptance

1. Owner-approved signing/trust bootstrap (real private keys outside GitHub/ChatGPT); native protected checkpoint and launcher, replay/freeze/clock tests.
2. Integrate the verified policy into the live MCP authorization gate and retain only recovery tools during a mandated update; regression matrix including short grant/revocation/cancel.
3. Add deduplicating persisted release queue, immutable signed per-platform artifacts, staged install/health/rollback and interrupted/offline/concurrent-update simulations.
4. Validate Windows and Linux local test installation, then test running ChatGPT P/B version reporting and host refresh behavior.
5. Independent review on the final commit, security and privacy controls, GitHub source/evidence handoff, owner release decision; no unattended update activation before that.

Relevant public specifications: [TUF](https://theupdateframework.github.io/specification/), [Tauri v2 updater](https://v2.tauri.app/plugin/updater/), [Node crypto](https://nodejs.org/api/crypto.html). Tauri is an optional future App updater, not a substitute for the local Bridge launcher or ChatGPT plugin lifecycle.
