# Session checkpoint template — no session started

**Template only.** After explicit session-start approval, copy onto the active branch under a session-specific path, for example docs/sessions/session-02/SESSION-STATE.md. Sessions begun: **0 of 6**. Read [CHAT-CONTINUITY.md](CHAT-CONTINUITY.md).

| Field | Required recorded value |
| --- | --- |
| Session ID / issue | S01–S06 and exact issue #5–#10 |
| State | running, paused, blocked, completed |
| Real start/checkpoint UTC | Actual timestamp, not estimated |
| Elapsed/remaining active seconds | Verified from evidence or explicitly unverified |
| Base main SHA | Real GitHub commit SHA |
| Work branch / HEAD SHA / PR | Real refs, including whether merged |
| Completed changes | Paths, commits, acceptance criteria |
| Test evidence | Command, OS, timestamp, result, URL |
| Failed or unperformed tests | Explicit list with reason |
| Risks and blockers | Security, license, permissions |
| Next exact action | One executable instruction |
| Authorization to start another session | No until separately approved |

## Example state (placeholder; not actual session)

    session_id: S02
    state: paused
    started_at_utc: null
    last_checkpoint_at_utc: null
    elapsed_active_seconds_verified: null
    remaining_budget_seconds_verified: null
    base_main_sha: null
    work_branch: null
    head_sha: null
    pull_request: null
    last_verified_test: null
    failed_tests: []
    completed: []
    remaining: []
    blockers: []
    next_exact_action: null

## Safe resume

A tool call may succeed immediately before a ChatGPT quota cutoff. Before repeating a write, read the GitHub branch/commit/PR/issue and deduplicate. Resuming S02 stays S02 and does not restart the 1500-second budget. Preserve exact real elapsed time or label it unknown. Keep next session not started until its own owner approval.
