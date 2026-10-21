# Contributing

Thank you for considering a contribution. **The product is not implemented yet**; planning proposals and documentation corrections are welcome.

## Before opening a pull request

1. Search existing issues and proposals. Link an issue or explain why a new one is needed.
2. For security-sensitive changes, use [private vulnerability reporting](SECURITY.md), not public issues.
3. Agree on scope, success criteria, trust boundaries and test strategy before implementation.
4. Create a small topic branch from current \`main\`. Do not force-push shared branches.
5. Keep commits readable and include relevant documentation and tests.
6. Fill out the PR template. Mark any checks that have not actually run as unchecked or N/A.
7. Resolve review conversations before merging.

A PR is not "done" simply because it builds. Security-sensitive computer-control behavior requires negative tests (unauthorized access, cancellation, race conditions, and isolation failures), platform coverage, and documented residual risks. See [quality gates](docs/governance/QUALITY-GATES.md).

## Git workflow

- Branch pattern: \`docs/<topic>\`, \`feat/<topic>\`, \`fix/<topic>\`, or \`security/<topic>\`.
- Prefer [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) titles (\`docs:\`, \`feat:\`, \`fix:\`, \`test:\`, \`chore:\`).
- Target \`main\` through a pull request; squash merge is the configured method.
- Never bypass repository protections or report tests as passing without evidence.
- Automation is limited to least privilege; no secrets in PR logs, workflow outputs, or test fixtures.

## Planned local validation

There is **no supported build or test command yet**. Instructions will be added only after the codebase and package manager are selected and their commands have been executed successfully.

## Licenses

By contributing, you agree to release your contributed work under the project's MIT license unless explicitly agreed otherwise. Do not copy code unless its license is compatible and attribution obligations are preserved. See [third-party reuse](docs/governance/REUSE-LICENSES.md).
