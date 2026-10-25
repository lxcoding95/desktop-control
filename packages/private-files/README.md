# Private workspace worker

One JSON request on stdin produces one JSON reply on stdout. `worker.mjs` always uses `/workspace`; it accepts no root from arguments or environment. The host launcher must enforce the Linux Docker boundary: pinned image, user 1000, no network, read-only root and application code, dropped capabilities, no-new-privileges, and one explicitly selected read/write workspace mount. Do not launch this worker on the host for production use. The exported `executeOperation(root, request)` seam exists for isolated temporary-directory tests.

Requests have an `op` and only the following fields:

| op | Fields | Successful reply fields besides `ok: true` |
| --- | --- | --- |
| `list` | optional `path` (omitted means root) | `path`, `entries: [{name,type,bytes?}]` |
| `read` | `path`, optional `encoding` (`utf8` default or `base64`) | `path`, `encoding`, `data`, `bytes`, `sha256` |
| `write` | `path`, `data`, optional `encoding`, optional `expectedSha256` | `path`, `bytes`, `sha256` |
| `mkdir` | `path`, optional boolean `recursive` | `path` |
| `remove` | `path`, required `expectedSha256` | opaque `token` |
| `restore` | `token` | original `path`, `bytes`, `sha256` |
| `pdf` | `path`, `text`, optional `expectedSha256` | `path`, `bytes`, `sha256` |

Errors are `{ "ok": false, "error": { "code": "..." } }`. Codes are `INVALID_INPUT`, `PATH_NOT_ALLOWED`, `NOT_FOUND`, `CONFLICT`, `LIMIT_EXCEEDED`, or `INTERNAL_ERROR`. Replies never contain stack traces, absolute paths or OS error messages. Relative workspace paths and requested file content are intentionally returned to the authorized caller.

Paths are relative, at most 512 characters and 16 components; portable Windows reserved names, traversal, alternate streams, absolute paths, backslashes, control characters and internal names are refused. Parents must be real directories, and file targets must be regular files with one link. Data is limited to 1 MiB, requests to 2 MiB, lists to 200 visible entries. UTF-8 reads fail on malformed data; base64 is canonical. Binary writes allow any filename extension.

Writes create exclusively by default. Overwrite requires the SHA-256 of current bytes and uses a temporary file plus rename. Remove supports files only and moves data into an internal trash directory with metadata; no permanent-delete API exists. Restore validates an opaque UUID token, stored path and hash, and fails exclusively on collisions. An interruption can leave recoverable trash or temporary artifacts; no crash-recovery or trash-management UI is claimed. Directory creation can leave already-created validated parents if a later step fails.

PDF creation uses MIT-licensed `pdf-lib` 1.17.1 with built-in Helvetica, no external fonts, files or URLs and no parsing of untrusted PDFs. Input is at most 32 KiB and output at most 30 pages; unsupported WinAnsi characters fail closed. The tests parse only PDF bytes that this worker just generated.

The launcher must serialize worker mutations. Path checks and hash preconditions do not isolate arbitrary code or other same-user processes; hostile concurrent mutation of the mounted workspace is outside this boundary. Docker is the actual OS boundary protecting unrelated host files. Grant provisioning, revocation and user consent belong to the host integration.

Run focused tests with `node --test packages/private-files/test/*.test.mjs` after installing workspace dependencies. Tests use actual temporary files; Windows link tests explicitly skip only if the OS denies creation. Linux/container verification is a separate required integration check.
