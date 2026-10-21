# External Code Reuse and License Policy

Reuse verified upstream implementations rather than reinventing everything, **but never copy code solely on the basis of a repository being public**.

## Required steps

1. Identify the exact upstream repository URL, file path, license, version/commit and copyright holders.
2. Inspect the relevant source implementation and tests; compare alternatives.
3. Check license compatibility, third-party dependencies and security history.
4. Preserve source notices and required license text in the distribution.
5. Record adaptations, provenance and regression tests in the corresponding PR.
6. Prefer narrow, well-tested components with stable boundaries.

## References to evaluate

- [Desktop Commander MCP](https://github.com/wonderwhy-er/DesktopCommanderMCP): MIT-licensed codebase; local file, terminal and remote-device behavior. Evaluate individual modules and tests for portability; maintain notices.
- [Munim Computer Use](https://github.com/munimtechnologies/munim-computer-use): Apache-2.0 project; evaluate licensing and platform-specific computer-use techniques.
- Other OS accessibility, MCP and browser tools: assess individually; no code may be copied without a license check.

These entries are **research candidates, not imported dependencies**. Desktop Control is independent and unaffiliated with these projects.

## License inventory requirement

Before shipping, produce a third-party notice inventory covering included code, licenses, pinned revisions, attribution and redistribution requirements. MIT licensing of this repository does not relicense third-party components.
