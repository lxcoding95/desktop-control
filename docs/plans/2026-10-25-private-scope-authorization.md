# Private preview scope amendment

Owner explicitly authorized selected implementation/testing from S03-S06 for a useful private version on 2026-10-25 (Europe/Berlin), after the private-grant clarification. This supersedes the earlier blanket session lock for such owner-approved work. Historical six session IDs, time accounts, main protection, privacy, cost and security gates remain intact. Authorization is not completion: mark only implemented and actually verified capabilities as done.

First slice: a fixed, OS-user-bound, expiring and revocable diagnostics.read grant provisioned outside MCP. Standard production remains default-deny. Private entry is explicit; no identity/permission from MCP input or environment. Windows DPAPI+restricted ACL / Linux owner-only storage are trust boundaries against other accounts, not arbitrary same-user code.

Next slice: bounded private workspace file operations and PDF creation, with explicit workspace scope, safe path/size/lifecycle tests and independent review. General host filesystem or unrestricted shell access is not implied by an allowlist. Evaluate OS-enforced containment before enabling mutation tools. No work outside this repository/explicit private test workspace, no credentials, public release, paid service or automatic merge.

Observed first real ChatGPT-host call: 2026-10-24T22:49:28Z, desktop_control.status -> PERMISSION_DENIED. Private installation/actual connection is now evidenced; positive grant and revocation integration still pending at this checkpoint. No S03-S06 feature is yet marked complete.
