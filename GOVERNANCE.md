# Project Governance

## Ownership

The GitHub repository owner `lxcoding95` currently serves as the primary maintainer. No independent review team or organization governance board has been established. Do not imply otherwise.

## Decisions

- Track substantial changes in issues and pull requests, linking requirements, risks, tests, and verification evidence.
- Record major technical trade-offs as Architecture Decision Records (ADRs) in `docs/architecture/`.
- Prefer narrow, reviewable PRs and a protected default branch.
- Security policy, license changes, credential handling and release signing require explicit maintainer approval.
- AI-generated contributions are not automatically trusted. Generated code follows the same tests, attribution, review and documentation rules as human-authored code.

## Definition of done

A task is done only once its **written acceptance criteria** are demonstrably met and the relevant reviews or audits have completed. This is not a guarantee of zero defects. If no test or environment is available, mark the task **blocked** or **unverified**, never passed. See [quality gates](docs/governance/QUALITY-GATES.md).

## Scope and costs

The initial project is open source and free to use. Hosted infrastructure, login, domain registration, paid features and premium agents are deferred until product safety and cost review. New expenses require owner approval.

## Releases

There is no public release yet. Version tags, changelog, artifact provenance, update/rollback procedures and release approval will be defined and verified before any production release.

## Changes to governance

Changes must go through a PR with rationale and potential impact. Avoid bypassing branch protection for convenience.

## GitHub operations automation standard

The repository's owner requires an exemplary Open Source / DevSecOps administration model: maximum permitted automation, reproducible evidence, secure PR-only merges, synchronized Issues/PRs/Labels/Milestones/Projects/Docs, and explicit, accountable owner-only UI steps for unavailable actions. The binding runbook is [GitHub Operations Standard](docs/governance/GITHUB-OPERATIONS-STANDARD.md). This ambition does not supersede approval gates, security isolation, contributor attribution, repository rulesets or the six-session reservation.
