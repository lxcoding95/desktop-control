# Architecture Overview (Proposal — not implemented)

## Product identity

Desktop Control provides a set of tools for MCP-compatible AI clients. It is **not a new AI agent or an autonomous AI runtime**. A desktop bridge executes authorized operations on the user's machine.

## Proposed components

1. **Plugin distribution**: client-specific configuration/packaging, skills and discoverable tools. Compatibility of any ZIP format must be tested against each supported host.
2. **MCP protocol adapter**: tool descriptions, versioned schemas, request IDs, typed results and transport adapters.
3. **Gateway (optional later)**: authenticated, multi-tenant remote MCP and device routing; never trust an unauthenticated inbound request.
4. **Local desktop bridge**: a least-privileged, user-session service on Windows/Linux with capability discovery and explicit local escalation.
5. **Permission engine**: evaluates caller identity, device, operation, path/resource, risk and approval receipt per operation.
6. **System adapters**: filesystem, process/shell, native UI accessibility, browser automation and system diagnostics.
7. **Dashboard/tray UI**: local device visibility, current session, scopes, approvals, audit logs and emergency disconnect.

## Planned deployment tracks

- **Local-first:** start with a loopback-only development endpoint and a single verified tool, no authentication shortcuts that would later be exposed publicly.
- **Self-hosted:** gateway exposed only behind TLS and authenticated access.
- **Hosted (later):** registration, identity federation, device pairing and multi-tenant isolation; domain and infrastructure deferred until the product works.

A sample command modeled after modern `npx <package> remote` onboarding is only a **future UX goal**; there is no published npm package or working command.

## Hard boundaries

- Each request must be bound to a specific authorized user, session and device.
- Authentication is not authorization; every operation is independently checked at the host.
- Environment variables, tool output, webpages and workspace files cannot grant themselves privileges.
- An unrestricted terminal defeats command-blocklist-only guarantees; isolation must be enforced by the OS when required.
- Local UI controls and audit records remain accessible even when an AI client disconnects.

## Cross-platform caveats

Windows UI Automation normally needs an interactive user session. Linux UI capabilities vary by X11, Wayland, desktop environment, portals and accessibility support. A capability probe and coverage matrix precede feature claims.

## Local-first delivery clarification (proposed, not implemented)

The recommended initial product is **a local user-session app/bridge**, with a local HTTP dashboard/tray, a local stdio MCP server and a versioned CLI path; public website/cloud hosting is a future phase. For ChatGPT web, the official **Secure MCP Tunnel** is a potential private testing route without owned domain/server, subject to eligibility and costs. It is not a public plugin distribution mechanism. Desktop-only local MCP plugin publication has approval restrictions. Details: [delivery plan](DELIVERY-LOCAL-FIRST.md), [ADR-0003](ADR-0003-PRODUCT-DELIVERY.md).

## Open design decisions

Transport and backend languages; terminal sandbox model; remote relay infrastructure; identity and device pairing; plugin distribution channels; accessibility implementations; event logs and retention; document editing; upgrade strategy. Record choices and tests in ADRs rather than locking in technology prematurely.
