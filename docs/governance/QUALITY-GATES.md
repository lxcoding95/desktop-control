# Engineering Quality Gates

Status: **planned, not operational**. These requirements will be implemented and measured as code and CI become available.

## Before starting work

- Link a tracked issue with objective, requirements, out-of-scope elements and measurable acceptance criteria.
- Read existing docs and competing OSS licenses before reusing code.
- Enumerate changes, risks and testing strategy; assess impact on Windows and Linux.
- Resolve design blockers or document why a narrowly scoped spike is appropriate.

## Pull-request verification

1. Scope and diff match the issue.
2. No secrets, credentials or private machine data committed.
3. Build, type checks, formatter and linter pass when defined.
4. Unit/integration/negative tests pass with logs and platform matrix where relevant.
5. Dependency licenses, known vulnerabilities and supply-chain references are checked.
6. Security review addresses authority boundaries, race conditions, cancellation, input validation, and logs.
7. UI changes include accessibility/visual verification where applicable.
8. Docs, migration, rollback and operational impact are updated.
9. Review comments resolved; no unverified success claims.

## Mandatory future CI gates

- **SEC-GATE-001**: all Actions pinned to verified full-length commit SHAs; repository enforcement enabled only after successful trial.
- **CI-GATE-001**: Windows/Linux checks, static analysis, tests and code scanning are configured and required only after reliable successful runs.
- **REL-GATE-001**: reproducible release process, signatures or attestations, checksums, SBOM, license inventory and rollback verification.
- **ADMIN-GATE-001**: documented GitHub admin access with least privilege and accountable actions.

No status badge, release label, issue closure or `Done` column is evidence by itself. The evidence must be traceable to successful executions and reviewed results. When a control cannot run, mark it **not verified** and block applicable release claims.

## Security posture

It is not possible to guarantee zero defects or 100% completeness across all future requirements. Every release instead has explicit scope, pass/fail criteria, regression tests and a residual risk register.
