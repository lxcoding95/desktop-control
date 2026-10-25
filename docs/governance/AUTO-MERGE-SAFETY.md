# Desktop Control — native GitHub Auto-Merge safety contract

Status on **2026-10-25**: GitHub repo `allow_auto_merge=true` verified by API. **No PR is granted auto-merge.** This file is staged in [Draft PR #26](https://github.com/lxcoding95/desktop-control/pull/26), not yet on `main`. The authoritative settings are the live GitHub rulesets and actual status checks, not this file.

## Why an enabled switch is insufficient

The active [Protect main ruleset](https://github.com/lxcoding95/desktop-control/rules/25569795) currently allows only squash merging and enforces conversation resolution, but `required_approving_review_count=0` and has **no required status checks**. The separate [Copilot review ruleset](https://github.com/lxcoding95/desktop-control/rules/25790407) triggers a bot review but does **not** count as an independent human/security APPROVED review. Therefore enabling GitHub's auto-merge on an existing eligible non-Draft PR **could immediately merge it**. Do not activate per-PR auto-merge under that weak gate.

## Minimum configuration BEFORE any live auto-merge

1. Keep `main` no-force-push/no-delete and `Require pull request before merging`; only squash merge (already implemented).
2. Enable `Require status checks to pass before merging` and preferably `Require branches to be up to date`. Only select **real, stable, always-running, uniquely named** merge-gate checks after the exact jobs have been proven on a PR *and* merged to `main`. Never require a path-filtered job globally: a skipped workflow can permanently block unrelated PRs.
3. Require `1` independent approving review (dismiss stale approval after new code commits and require last-push approval where supported). **Solo-maintainer caveat:** GitHub does not permit the author to independently approve their own PR. This rule will intentionally stop automatic merges until an authorized independent maintainer/eligible reviewer exists; do not fake approval through a bot or loosen the count silently.
4. Keep required review-thread resolution enabled and prefer preventing admins/apps from bypassing branch protection. Do not allow approval from untrusted/fork-created code, `pull_request_target` CI or an unverified robot identity.
5. For dependencies, only reviewed compatible version PRs are eligible, with actual lockfile, license and security-audit checks. Major/breaking, cryptographic, workflow, account/security, local MCP grants and installer changes require additional explicit security review and a high-risk acceptance record.
6. GitHub's native auto-merge is **per PR**, not permission to accept every new PR. Only set it after exact source-head, base, checks, approvals, privacy and licensing have been read back. PRs in Draft or with failing/unknown checks are not eligible. Use GitHub's native **squash** method, never auto-approve.
7. Release and deploy are separately gated. A merged source PR is **not** a signed executable release, bridge installer, ChatGPT plugin update or permission to publish. M03 signing, per-user local install/rollback, SBOM and provenance remain required.

## Current concrete rollout dependency graph

- [SEC-GATE #1](https://github.com/lxcoding95/desktop-control/issues/1): main policy, full-SHA-enforced workflows, admin settings confirmation, final review.
- [CI-GATE #2](https://github.com/lxcoding95/desktop-control/issues/2): always-running checks that are unskippable and attested on the exact candidate merge HEAD.
- [PR #30](https://github.com/lxcoding95/desktop-control/pull/30): tokenless path-scoped security trial (Windows 19/19, Linux 19/19); not sufficient as a universally required merge check.
- [PR #31](https://github.com/lxcoding95/desktop-control/pull/31): isolated signed-policy/FSM test trial (Windows 66/66, Linux 66/66); source-based, not installer security acceptance.
- [PR #22](https://github.com/lxcoding95/desktop-control/pull/22) and [PR #33](https://github.com/lxcoding95/desktop-control/pull/33): MCP runtime and private plugin integration; high trust and historical privacy risks, Draft pending independent semantic review. #31 is stacked on #33 source.
- [REL-GATE #3](https://github.com/lxcoding95/desktop-control/issues/3): separate signed release gate, not waived by an ordinary PR merge.

## Current connector restrictions / manual settings step

The authenticated GitHub connection can read the rulesets, repo `allow_auto_merge` and PRs and can change PR metadata/code, but **has no GitHub ruleset-edit mutation**. Branch-protection REST read is also denied by the connection. Until an authorized UI/Work action updates these rule parameters, **the native branch-level required approval and required checks remain unconfigured**. Do not claim that this Markdown file changes GitHub's rulesets.

Once eligible always-running checks are merged to main, update [Protect main](https://github.com/lxcoding95/desktop-control/rules/25569795) and verify via GitHub GET. Set mandatory checks only after checking they ran as `success` from GitHub Actions on every PR class. Initial drafts stay drafts; an independently reviewed PR may later be marked ready and native auto-merge can be enabled only after all gates are satisfied.

The repository currently has one owner and does not have documented, independently eligible review authority. This is a **deliberate release blocker** for autonomous merging of high-risk changes, not a reason to fabricate approvals.

## Audit/evidence on every merge

Record PR number, source/target SHA, review authority, current required checks and run URLs, risk/exception status, squash commit, and post-merge issue/handoff reconciliation. Refuse ambiguous results and re-read GitHub state; never blindly retry a merge. Admin settings are not personal data, but no account identifiers, signing keys, tokens, local home paths or private logs belong in this record.

Sources: [GitHub auto-merge](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/automatically-merging-a-pull-request), [Rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets), [Protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches).
