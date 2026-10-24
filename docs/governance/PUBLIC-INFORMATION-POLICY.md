# Public information, evidence handling and repository freshness

**Public policy — 2026-10-24.** [Governance migration issue #25](https://github.com/lxcoding95/desktop-control/issues/25). Applies to all public source, commits, branches, issues, PR descriptions, labels, wikis, discussions, workflows, releases, CI artifacts and screenshots. An unmerged branch is public in a public GitHub repository. This policy documents handling; it does **not** attest that the entire Git history was scanned.

## Classify before writing or publishing

| Class | Public GitHub? | Examples and handling |
| --- | --- | --- |
| **PUBLIC** | Yes, after review | MIT OSS source; accurate product milestones; public ADRs; non-sensitive reproducible test summaries; SPDX/license attributions; approved release notes |
| **INTERNAL** | No | Unpublished private commercial strategy, private planning, personal support workflow and non-public operational notes. Keep in approved private project sources or other explicit owner-approved private storage |
| **CONFIDENTIAL** | No | Personal paths with usernames, non-redacted system logs, IPs/device IDs, private threat investigations and unannounced account/business details; require restricted storage, access control and redacted public summaries |
| **SECRET** | Absolutely not | Passwords, access tokens, signing keys, recovery codes, client/device private keys, real credentials and production license secrets. Use OS-backed vault or approved secrets infrastructure, with rotation/revocation on exposure |

A .gitignore entry, branch name, ZIP archive, password prompt or obscured folder does **not** make content private after it reaches a public Git remote. No plain ZIP or ChatGPT project source should be a storage location for actual secrets.

## Controls at each boundary

1. **Pre-commit:** apply data minimization; inspect changed files, test logs, screenshots and `git diff --check`. Review logs for home paths, Windows usernames, IPs, token-bearing URLs, cookies and metadata. Never paste raw credential material into chats, issues, PRs or logs.
2. **Pre-PR:** scan added files and full relevant diff with a pinned, license-reviewed scanner; review possible false positives manually. Changes to a sensitive file need an independent privacy/security review.
3. **Before merge/release:** validate base/head, tests, license notices and complete applicable Git history for committed sensitive material. Treat old/public branches and artifacts as reachable even if deleted. Avoid claiming all clear from filename checks.
4. **If something sensitive is public:** stop further publication, classify exposure without reprinting the data, revoke/rotate exposed credentials first if any; coordinate safe remediation and platform cache/history concerns with owner. No force-push or `main` rule bypass without separately agreed incident plan.
5. **Private sources:** create a sanitized public decision record with non-sensitive requirements and public evidence links. Keep classified implementation/exploitation notes separately, never automatically move private files to GitHub. Encrypted archives are **not** a substitute for a proper key-management policy.
6. **Builds and releases:** no public npm, installer or ChatGPT plugin package before release approval. Public MIT source remains cloneable and modifiable; official installer or device authorization can restrict **official connections**, not source redistribution.

**Current inspection limitation (2026-10-24):** the public S02 feature branch includes local platform test logs; at least one sampled log includes local Windows path/network context. No confirmed credential exposure was established by this limited inspection, and full file-content/history secret scanning remains pending. Do not publish names, IP addresses or paths in follow-up tickets. Track classification/remediation privately, and record only the existence of this blocker in public review if required.

## Project-wide freshness contract

The following are checked after each significant issue/PR/release decision, within available tooling and permissions:

| Public surface | Current source of truth | Drift to detect / responsible correction |
| --- | --- | --- |
| README and ROADMAP | `main` plus open PR source evidence | Outdated completion claims, broken links, branch features misrepresented as shipped; fix by reviewed docs PR |
| Masterplan / ADR / AGENTS | Approved decisions plus live code and security controls | Contradictory dated requirements, hidden unapproved scope shifts; amend with date and supersession instead of rewriting history |
| Issues / PRs / labels | Issue state, exact PR head, review submissions | Incomplete proof, stale blocker and false `done` status; link test evidence and update issue |
| Product milestones / Projects v2 | Verified GitHub milestone and Project configuration | Missing membership, inaccurate progress, unmaintained fields; reconcile on owner-approved surface (some currently UI-only) |
| S01–S06 session history | #5–#10 and session-specific checkpoints | False time/finished claims or unexpected session starts; do not charge planning as a session |
| SDK/dependencies/licensing | `package-lock.json`, upstream release/license and signed artifacts | Unverified upgrades or vulnerabilities; open dependency PR with real Windows/Linux regression tests |
| Security/CI gates | [SEC #1](https://github.com/lxcoding95/desktop-control/issues/1), [CI #2](https://github.com/lxcoding95/desktop-control/issues/2) | No regular GitHub Actions before full-SHA action pinning AND required settings evidence |
| Installer/update pipeline | Approved provenance/signatures/compatibility policy | Stale update URLs, unsigned packages, unsupported OS; security-reviewed update/rollback tests before activation |

**Automation levels:** (1) passive evidence/index checking and report-only can run with authorized read access; (2) PRs/issues may be drafted automatically under least privilege; (3) protected settings changes, reviewer signoff, merges, public releases, user-account/privileged operations and payments remain owner- or policy-gated. Automations operate only when actually installed and running; document task trigger, permissions, logs, retry/idempotence, failure notification and shutdown. No “always running” claim from documentation alone.

### Operational quality checklist

- [ ] GitHub HEAD, affected issue/PR and historical session state read **before** writes.
- [ ] Public/private/secret classification and log review complete for changed content.
- [ ] Traceability: requirement → issue → product milestone → commit → PR → test → review → merged/released state.
- [ ] Cross-OS and negative tests identified; unmet tests and review blockers displayed, not hidden.
- [ ] All dependencies and third-party licenses verified before integration; security tool findings independently triaged.
- [ ] Documentation links, status tables, milestone/project UI and version matrix agree with the underlying live state.
- [ ] Recovery/handoff checkpoint, next exact action and owner-only blockers updated.
- [ ] Protected `main`, S03–S06 restrictions, SEC-GATE-001 and private data preserved.

This checklist is the definition of a high-quality **process**, not a guarantee of bug-free code or an automated control already enabled. See [product milestones](PRODUCT-MILESTONES.md), [operations standard](GITHUB-OPERATIONS-STANDARD.md) and [quality gates](QUALITY-GATES.md).
