# Desktop Control management inside ChatGPT

This source slice replaces the first native-window shortcut in Structured Settings with an actual, self-contained **MCP App**, `desktop_control.management`, linked to `ui://desktop-control/management`. It is a read-only/authority-reducing management surface. Opening it never grants rights, renews a policy, enrolls an updater or automatically opens a native prompt.

## Protocol and integration

`registerManagementApp(server: McpServer)` in `packages/mcp-server/src/management-app.mts` registers the strict-empty-argument management tool and its bounded HTML resource. The tool supplies `_meta.ui.resourceUri` plus `_meta["openai/ui"].entrypoints` for global and thread entrypoints. Resource contents use `text/html;profile=mcp-app`, no external CSP domains, and inline/fullscreen display hints.

The original tiny client implements the documented MCP Apps `ui/initialize` → `ui/notifications/initialized` handshake, then `tools/call` through the host. It negotiates **UI protocol2026-01-26**, independently of the server's MCP2026-07-28 connection. Responses must come from the parent window, match a pending numeric ID and, after the first response, match the pinned parent origin. Requests have a ten-second timeout and an eight-request bound. Teardown rejects pending work, disables actions and removes the message listener. No credential, local path, network client, external script, storage, app-provided model tool or downloaded dependency is included.

The coordinator must register this helper only in the explicit local-capabilities server, copy the HTML into the verified package, add its exact path to the archive allowlist and update tool inventories/Structured Settings schema. The normal S02 entry remains unchanged. Source tests are not proof that a particular installed host has refreshed its capabilities or rendered the UI.

## Visible behavior and authority

- Status cards display the actual `control_status` group states and plugin P version. An unavailable/malformed result displays **Nicht verifiziert**, never an optimistic active value. Per-capability/origin detail is not inferred from these group states.
- **Steuerung stoppen · Esc** invokes only the existing `stop_control`, followed by a fresh status read. View-level Esc sends the same reducing action. The OS-global Esc hook during native desktop control is a separate safety path.
- **Lokale Freigaben öffnen** invokes `open_settings` only after an explicit button click. The trusted native confirmation remains the authority-increasing boundary. The UI states that opening it does not itself grant access.
- Bridge B independent version and automatic updater state are reported honestly as not independently reported / not active in this build. Fixture updater tests are not live activation.
- Persistent grants are not silently added by this slice. The page explicitly reports that existing grant lifetimes still apply until the separately reviewed host implementation is integrated.

## Why an app-only toggle is not sufficient authorization

The reviewed standard exposes UI visibility/routing and structured settings, but no documented server-verifiable cryptographic proof that a human clicked a specific host control. A raw MCP client can send the same tool arguments or fabricate an elicitation acceptance. `visibility:["app"]`, a boolean `approved`, client metadata or a signed round-trip proposal are not substitutes for the protected host's actual confirmation. Revoke/stop may safely reduce authority; new grants must continue to require the trusted local flow until a verified alternative exists.

References checked2026-10-25: [MCP Apps](https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/draft/apps.mdx), [current UI protocol types](https://github.com/modelcontextprotocol/ext-apps/blob/main/src/spec.types.ts), [OpenAI entrypoints and Structured Settings](https://github.com/openai/mcp-extensions/blob/main/docs/spec.md), [OpenAI reference](https://developers.openai.com/plugins/reference).

## Verification scope

The initial missing-HTML test failed before implementation. The completed client tests exercise the executed inline JavaScript with a controlled host boundary: handshake, foreign-frame refusal, missing capability, unsupported protocol, initial status-only behavior, explicit native fallback, Esc stop, fresh state and teardown. These are protocol-client tests, not a real ChatGPT UI acceptance claim.

A separate real SDK stdio process test checks modern discovery, exact management metadata/entrypoints, strict arguments, actual `resources/read` HTML and CSP, unknown-resource refusal and clean EOF. No desktop input or permission grant is performed. Final integrated Windows/Linux, packaged-resource and real-host rendering acceptance remains the coordinator's responsibility.
