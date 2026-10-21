# Threat Model (Preliminary)

## Assets and actors

Assets: local files, credentials, shell privileges, UI session, browser profiles, remote device channels, audit logs and distribution artifacts.

Actors: authorized user; AI client; MCP gateway; local bridge; external websites/repositories; malicious or compromised AI account; dependency author; supply-chain attacker.

## Trust boundaries

1. Untrusted task content -> AI tool selection.
2. AI client -> MCP endpoint.
3. Gateway -> authenticated device transport.
4. Bridge -> local OS APIs and privileged process boundary.
5. Browser/web/document content -> tools' responses.
6. CI/dependencies -> distributable binaries.

## Representative abuse cases and required controls

| Threat | Proposed control | Verification |
| --- | --- | --- |
| Prompt injection in a webpage requests secret exfiltration | Treat page text as data; explicit per-action authorization and egress policy | Injection/unauthorized-send tests |
| Compromised client asks for arbitrary shell access | Dedicated OS sandbox, protected host-side policy, limited user account | Sandbox escape and privilege tests |
| Directory traversal, symlinks, TOCTOU | Canonical path checks and open-handle policy; OS isolation for shell | Symlink/race tests |
| Cross-user device access | Scoped identity and device binding, tenant isolation | Cross-tenant integration tests |
| Device credential theft/replay | Secure OS key storage, audience scoping, rotation/revoke, nonce/time windows | Replay and revocation tests |
| Unauthorized administrative actions | Local OS elevation confirmation + narrow approval scope | Failed escalation tests |
| Malicious dependency / GitHub Action | Reviewed provenance, full SHA pinning, SBOM, lockfiles, vulnerability scanning | CI supply-chain checks |
| Lost session / runaway process | Timeouts, cancellation, process-tree termination and bounded output | Crash/reconnect and timeout tests |

## Important limitations

No policy filtering of individual shell strings can make arbitrary code execution safe on a host. Even a read-only MCP tool can disclose sensitive information if its scope is too broad. `LOW/MEDIUM/FULL/CUSTOM` must be explicitly documented as user permission profiles, with OS-enforced limits described separately.

No threat mitigation is implemented or validated yet. All risks remain open until tested.
