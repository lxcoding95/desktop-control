# S02 Local MCP Contract — ready for implementation review

**Status:** specification, **no runtime implementation and no successful protocol test**.  
**Parent design:** [ADR-0004](../architecture/ADR-0004-MCP-FOUNDATION.md).  
**Scope:** S02 / [Issue #6](https://github.com/lxcoding95/desktop-control/issues/6). No permission to start S02 is implied.

## Scope boundary

Implement only a local **stdio** server and one harmless, intentionally permission-checked tool; do not add file reads, arbitrary process execution, browser login, desktop input, network listening, remote accounts, installations or elevated privileges.

## Proposed exported MCP tool

| Field | Contract |
| --- | --- |
| Name | `desktop_control.status` |
| Description | "Return minimal local bridge readiness if diagnostics.read is authorized. No host identifiers or private data." |
| Annotation | `readOnlyHint: true` (advisory; **not** an authorization control) |
| Input | JSON object with **no properties**; unknown keys rejected |
| Output | Structured object with `service`, `ready`, `api_version`; human-readable text mirror |
| Capability | `diagnostics.read` |
| Decision point | Bridge evaluates local grant immediately before invoking diagnostics adapter |
| Denial | `isError: true`, safe error code `PERMISSION_DENIED`, no diagnostic collection performed |
| Side effects | No filesystem, network, shell or desktop changes; sanitized audit event allowed |
| Limits | Single small JSON object; bounded output, timeout, abort support |

**Exact successful logical payload** (the actual MCP SDK wire envelope and negotiated protocol version are determined in S02 tests):

```json
{
  "service": "desktop-control",
  "ready": true,
  "api_version": 1
}
```

SDK v2 implementation must register one `z.object({}).strict()` input schema and a matching Zod output schema via `McpServer.registerTool(name, {inputSchema, outputSchema}, handler)`; deliver both `structuredContent` and text `content`. The server should be instantiated per stdio transport by `serveStdio(() => new McpServer(...))`. This is an implementation recipe extracted from upstream docs, **not running source**.

**Denied logical error**: `PERMISSION_DENIED`, with `isError: true`; test for no adapter invocation. Return a generic error without leaking grant storage paths or OS usernames. Ensure no secondary error response exposes privileged data. A nonexistent tool must be classified separately from authorization denial.

## S02 policy interface

```text
authorize({
  principal: <OS-derived local execution context>,
  capability: "diagnostics.read",
  resource: "local:desktop-control",
  effectiveGrant: <locally provisioned explicit grant>
}) -> ALLOW | DENY
```

- **Default deny** when the policy store is missing, unreadable, invalid, expired or revoked.
- S02 tests can inject an isolated fixture policy with explicit local grant `diagnostics.read`; make dev-only fixtures impossible to activate implicitly in a packaged product.
- Never treat MCP input, environment-provided arbitrary IDs, `LOW/MEDIUM/FULL/CUSTOM` labels, tool annotations or log strings as grants.
- No policy modification tool in S02. Temporary grant setup must be outside the MCP tool surface and documented as test-only.
- Audit only request correlation, capability, decision and redacted error; no machine fingerprint.
- Use injected adapter spy or counter to prove a denied call caused **zero** executions.

## Protocol and lifecycle checks

1. Start from locked Node/npm dependencies (target Node >=22.19, exact version checked locally).
2. Launch through official v2 `serveStdio`; protocol bytes **only on stdout**, logs **only on stderr**.
3. Use an actual modern MCP client or Inspector v2 to validate tool discovery and one positive `tools/call` with `diagnostics.read` grant.
4. Validate missing grant and revoked grant return `PERMISSION_DENIED` without calling the adapter.
5. Validate wrong arguments (unknown property, wrong JSON input), unknown tool, malformed/oversized message, and keep server alive where protocol specifies.
6. Verify cancellation, EOF shutdown, bounded output, and no secret leakage. Current 2026-07-28 stdio cancellation is `notifications/cancelled`; SDK must handle protocol eras appropriately.
7. Capture command, exact package versions, stdout/stderr and pass/fail evidence; do **not** substitute unit mocks for Inspector protocol smoke test.

## Acceptance matrix for S02

| ID | Level | Expected verifiable outcome |
| --- | --- | --- |
| S02-T01 | Build | Typecheck/build + package lock succeed in actual repo checkout |
| S02-T02 | Protocol | Modern-client connection; `tools/list` advertises exactly intended safe tool |
| S02-T03 | Positive | Authorized status returns schema-valid structured object |
| S02-T04 | Negative | Missing/expired/revoked grant fails with `PERMISSION_DENIED`; adapter count remains zero |
| S02-T05 | Negative | Unknown input key or wrong type rejected before handler |
| S02-T06 | Security | No local HTTP listener; stdout contains valid protocol messages only |
| S02-T07 | Lifecycle | Closing client stdin terminates server without runaway child |
| S02-T08 | Robustness | Timeouts/cancellation/oversize paths behave within bounded limits |
| S02-T09 | Disclosure | Results, diagnostics and audit do not contain real personal data or secrets |
| S02-T10 | Provenance | Locked dependencies, license and upstream API references documented |

## Reproducible *planned* workflow

```sh
# Run ONLY after S02 is separately authorized and code/dependency locks actually exist:
node --version
npm ci
npm run typecheck
npm test
npm run build
npx --no-install @modelcontextprotocol/inspector --cli node packages/mcp-server/dist/index.js --method tools/list
```

The CLI line is an **example target**, not a verified executable command; install an exact Inspector version as a dev dependency and validate its flags/launch paths first. For positive/negative policy tests, supply only non-secret temporary test fixture grants and collect the real output. Inspector's web UI can expose a per-launch token and store other credentials; use only non-sensitive local fixtures for S02.

## Deferred decisions

- Future permissions UI, real OS account derivation and IPC authorization must be independently threat-modeled and tested.
- App shell (Electron/Tauri), Windows UIA, Linux Wayland/X11, browser Playwright integration, credentials, public/remote transports and installer require their later sessions and separate access.
- Do not claim that a local `stdio` tool automatically gives a ChatGPT web chat access to the computer.

## References

- https://ts.sdk.modelcontextprotocol.io/v2/servers/tools.html
- https://ts.sdk.modelcontextprotocol.io/v2/serving/stdio.html
- https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/stdio
- https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/docs/2026-07-28/tools/inspector.mdx
