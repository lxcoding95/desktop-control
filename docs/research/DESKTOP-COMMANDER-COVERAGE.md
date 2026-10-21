# Desktop Commander tool parity research backlog

Source: user-supplied inventory of **29 named Desktop Commander operations**. This is a **target mapping**, not a statement that any tool is implemented. New Desktop Control API names and schemas may change; behavior should be compatible where safe, not a verbatim copy of a proprietary remote service.

| # | Reference tool | Target module | Risk / acceptance emphasis | Target phase |
| --- | --- | --- | --- | --- |
| 01 | `create_directory` | filesystem | scoped directory, idempotent, symlink/race policy | S3 |
| 02 | `edit_block` | filesystem/edit | exact occurrence count, safe atomic write, preview/diff | S3 |
| 03 | `force_terminate` | process | identity-bound handle, process group, audit | S3 |
| 04 | `get_config` | permission/config | redact secrets, schema version, visibility scope | S1/S5 |
| 05 | `get_file_info` | filesystem | path scope, symlinks, metadata, errors | S3 |
| 06 | `get_more_search_results` | search | opaque cursor, paging and timeout | S3 |
| 07 | `get_recent_tool_calls` | audit | structured log, redaction, retention, consent | S5 |
| 08 | `get_tool_result` | jobs | bound result handle, access check, TTL | S3/S5 |
| 09 | `get_usage_stats` | diagnostics | local telemetry optional, anonymization | S5 |
| 10 | `interact_with_process` | terminal | bounded REPL input/output, no cross-user PID access | S3 |
| 11 | `kill_process` | process | ownership, force decision, safe child cleanup | S3 |
| 12 | `list_devices` | device management | scoped to user, no tenant leakage | S2/S5 |
| 13 | `list_directory` | filesystem | pagination, encoding, permissions, symlinks | S3 |
| 14 | `list_processes` | process | safe disclosure, filtering, privilege boundary | S3 |
| 15 | `list_remote_tool_calls` | audit | verified sessions only, secret redaction | S5 |
| 16 | `list_searches` | search | per-session handles, cleanup | S3 |
| 17 | `list_sessions` | process/terminal | scoped sessions, terminal lifecycle | S3 |
| 18 | `move_file` | filesystem | no outside-scope rename, atomicity/cross-volume | S3 |
| 19 | `read_file` | filesystem | bounded text/binary, encoding, no implicit URL egress | S2/S3 |
| 20 | `read_multiple_files` | filesystem | independent path checks, total size limits | S3 |
| 21 | `read_process_output` | terminal | bounded streaming and replay-aware cursor | S3 |
| 22 | `set_config_value` | permission/config | schema validation and guarded admin settings | S5 |
| 23 | `shutdown` | device/session | authenticated session, graceful close | S2/S5 |
| 24 | `start_process` | terminal | policy, timeout, cwd, sandbox, credential boundaries | S3 |
| 25 | `start_search` | search | streaming, ignore rules, quotas, cancellation | S3 |
| 26 | `stop_search` | search | terminate jobs; no abandoned subprocess | S3 |
| 27 | `who_am_i` | identity/device | identity/authorized device, least-privilege info | S2 |
| 28 | `write_file` | filesystem | guard scope, backup, atomic replacement, audit | S3 |
| 29 | `write_pdf` | document | output correctness, font/language tests, size limits | post-core |

## Additional differentiated capabilities (not in the 29)

- Screenshot region/window capture and visual inspection; output contains potentially sensitive content.
- Focus/window enumerate/manage; mouse/keyboard events gated by foreground session.
- Accessibility-tree queries via Windows UI Automation / Linux AT-SPI when available.
- Playwright browser actions with origins, profiles, cookies and download policies.
- Explicit scope inspection, dry-run, approval receipts, privileged requests and emergency disconnect.
- Device pairing, credential rotation/revocation, host policy enforcement, self-hosting and remote authentication.
- Project-level workflows, diagnosis, resumability and reliable cancellation.
- Installer/uninstaller, rollback when possible, signed updates and application dashboard.

## Parity acceptance rubric

For each tool require: stable versioned request/response JSON schema, capability requirement, negative tests, real Win/Linux support statement, error taxonomy, idempotency/cancellation semantics, bounded performance, log redaction, docs and at least one measured end-to-end call. `Supported` can mean Windows-only or Linux X11-only; never falsely claim cross-platform parity.

**Security constraints:** shell or GUI automation that can execute arbitrary code cannot be made safe by file allowlists alone. Users choosing FULL must understand the host's real rights and trust boundary. Test unauthorized tool calls at the bridge, not just through model instructions.
