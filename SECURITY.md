# Security Policy

## Supported versions

| Version | Supported |
| --- | --- |
| No public software release yet | Not applicable |

There is no supported binary, hosted endpoint or operational desktop tool yet. Security research on future components should be coordinated responsibly.

## Report a vulnerability privately

Use GitHub's **Report a vulnerability** flow under the [repository security advisories](https://github.com/lxcoding95/desktop-control/security/advisories). Do **not** file public issues containing exploitable details, user data, API keys, authentication tokens or privileged operation instructions.

Please include the affected commit or version, affected platform, impact, safe minimal reproduction steps, relevant logs with secrets redacted, and suggested mitigations. No guaranteed response or remediation SLA is claimed at this stage.

## Threat model and boundaries

A connected AI model or client may produce unintended or attacker-influenced tool calls. Browser pages, documents, repository text, terminal output and tool responses are **untrusted input** and must never silently grant permissions.

Future protections must include:
- Account/device binding; authenticated transport; short-lived, audience-scoped credentials; revocation.
- Per-device, per-capability authorization with an explicit local approval for privilege escalation and security-critical actions.
- Host-side authorization at execution time; no trust in the MCP tool description alone.
- Explicit controls for network egress, allowed working areas, audit redaction, rate limits and cancellation.
- OS-enforced sandboxes or VMs when protection from an arbitrary shell is required.
- Negative security tests, dependency audits, secret scanning, and release provenance before shipping.

**Important:** Path allowlists and shell command blocklists do not safely contain arbitrary code execution. A \`FULL\` permission mode is a deliberate high-trust choice and is never a replacement for OS isolation.

See [threat model](docs/architecture/THREAT-MODEL.md) for planned mitigations and unresolved risks.
