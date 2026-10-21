# Repository Operations Playbook

## Known configuration (observed 2026-10-21)

- Public repository `lxcoding95/desktop-control`, default branch `main`, MIT license.
- Active `Protect main` ruleset: deletion/force-push restricted; PR required; zero mandatory independent approvals; review conversations resolved; squash-only; no bypass list.
- Repository settings: squash merges, automatic deletion of merged head branches, suggest updating PR branches; auto-merge disabled.
- Existing ChatGPT GitHub connector: contents, issue, PR, branch and workflow-related operations exposed; **cannot currently create repository rulesets, labels, milestones or GitHub Project fields using available connector writes**.
- Installed GitHub app remains set to **All repositories**, per owner instruction. This playbook's actions target only `lxcoding95/desktop-control`; do not modify other repositories.

## Safe change workflow

1. Read repo and branch state through the GitHub API.
2. Use an isolated topic branch and check its base/head SHAs.
3. Publish a small, reviewable commit; no direct `main` writes.
4. Open a PR and inspect changed files and CI.
5. Merge via squash only when applicable requirements are met; leave as draft/blocked otherwise.
6. Verify the resulting `main` tree, ruleset and issues.

## Administrative limits and workaround

Managing GitHub Project fields, label definitions, repo settings or rulesets requires authorized GitHub UI/CLI/API capabilities beyond the currently exposed GitHub connector methods. The user's Work cloud browser can perform UI operations when enabled, but its quotas may pause execution. Do not assume work was completed from a screenshot of a partially edited form.

No credential may be pasted into chat, stored in repository files or written to Actions logs. If extra GitHub permissions are needed, use an official interactive authorization and scope them appropriately.

## Workflow safety and supply chain

- Global `GITHUB_TOKEN` defaults to read-only; workflows request additional permissions only per job.
- External contributions require review before privileged workflows; avoid using `pull_request_target` to execute untrusted fork code.
- Select and verify Actions before use; pin them to full commit SHAs.
- Activate required CI status checks **only after** their workflow identifiers and initial green runs are validated.
- Avoid paid add-ons or extra integrations without owner authorization.
