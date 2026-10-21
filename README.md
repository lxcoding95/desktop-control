# Desktop Control

Open-source desktop control tooling for MCP-compatible AI clients on Windows and Linux.

> **Status: pre-development.** No working desktop bridge, MCP server, installer, hosted service, or ChatGPT plugin package has been released. Do not install or rely on this repository for computer control yet.

## Intended capabilities

- File reading, searching, structured edits, and reversible changes when feasible.
- Terminal and process management with bounded sessions, logs, and explicit cancellation.
- Native desktop input and accessibility automation across supported Windows and Linux configurations.
- Browser automation through tested browser-native interfaces.
- Device pairing and user-controlled tool, skill, path, network, and privilege permissions.
- Local-first development with a later option for hosted remote MCP and self-hosting.

An AI client makes decisions; this project will provide **tools and a local execution bridge**, not another AI agent.

## Status and roadmap

Development sessions have **not started**. Work is currently limited to repository governance and planning. See [ROADMAP.md](ROADMAP.md), [session plan](docs/governance/SESSION-PLAN.md), and [issues](https://github.com/lxcoding95/desktop-control/issues). A six-session timebox is a planning constraint, **not a promise that full feature parity or a production release will fit inside it**.

## Planned system boundary

\`\`\`text
MCP-compatible AI client
           |
     MCP gateway / protocol layer (planned)
           |
  authenticated device channel (planned)
           |
  local desktop bridge (planned)
           |
 Windows / Linux capabilities (planned)
\`\`\`

The gateway, local bridge, identity model and transports remain subject to design review and real tests. No cloud service or public registration is live. See [architecture overview](docs/architecture/OVERVIEW.md) and [threat model](docs/architecture/THREAT-MODEL.md).

## Security

Computer control is a high-trust capability. An unrestricted shell is **not contained** by a command blocklist or an allowed-directory configuration. Production designs must use OS-enforced isolation where a strong boundary is required. See [SECURITY.md](SECURITY.md) before reporting a vulnerability or experimenting with privileged execution.

## Contributing and community

Read [CONTRIBUTING.md](CONTRIBUTING.md), [GOVERNANCE.md](GOVERNANCE.md), [SUPPORT.md](SUPPORT.md), and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). Use the issue templates for proposals or bug reports. Do not submit real credentials, private machine data, or security exploit details in public issues.

## Licensing and attribution

Project-authored source and documents are licensed under [MIT](LICENSE), unless a file explicitly states otherwise. Third-party code retains its original license and notices; see the [reuse policy](docs/governance/REUSE-LICENSES.md). This project is independent of Desktop Commander and other referenced projects, and does not claim affiliation.

Maintained by the repository owner and contributors; contributors and reviewers are credited only for work actually performed.
