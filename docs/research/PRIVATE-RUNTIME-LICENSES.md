# Private runtime provenance and license inventory

Source inspection and installed-file inventory on Windows, 2026-10-25; **not release or legal certification**. The package builder now targets nine locked external packages. A final clean Windows/Linux archive and host test are still required; source changes alone do not replace the installed preview.

## Reproducible technical evidence

Run `node tools/plugin/licenses-runtime.mjs <private-output-directory>` after `npm ci --ignore-scripts` on each OS. The script uses only Node built-ins, reads the lockfile and installed package files, runs no package scripts and makes no network requests. It writes:

- `LICENSE-INVENTORY.json`: declared package licenses, registry origins, npm integrity values, original notice paths and SHA-256 values, binary/WASM file hashes, installed-development inventory and missing standalone-file findings.
- `SBOM.cdx.json`: CycloneDX 1.6 document for the selected nine-package external runtime closure. This is a technical SBOM; no external schema certification or complete reconstruction of bundled/inlined components is claimed.

Current Windows observation with Node 24.21.0: **250 external lock entries, 214 installed external packages, 218 matched license/notice/copyright files; nine selected runtime packages with 15 original notice files**. Counts include recursively found bundle-license sidecars and intentionally differ from the earlier 207-file snapshot. Optional development native packages are OS-filtered; Windows counts cannot certify Linux installation. Linux recomputation remains required.

Runtime versions are MCP Server/Core2.3.1, Zod4.6.7, pdf-lib1.17.1, standard-fonts1.0.0, upng1.0.1, pako1.0.11, tslib1.14.1, playwright-core1.64.1. Every selected installed version must match the root lockfile and use its npm registry URL/integrity; an unlisted transitive runtime dependency stops packaging.

## Distribution boundaries

The private archive includes those complete installed runtime directories, the separately staged five-package PDF-worker closure, original project source for native helpers, native Windows helper outputs when building on Windows, private controllers, explicit local provisioning CLI, skills and byte inventory. The Docker worker mount contains its selected files and dependencies; no checkout, `.git`, private evidence or policy store is mounted.

Playwright's `webp_codec.wasm` is a bundled WASM asset, not a browser executable. Its hash and original `webp_codec.LICENSE` are inventoried. `utilsBundle.js.LICENSE` and `serverRegistry.js.LICENSE` contain inlined dependency notices. The complete package is copied to preserve these sidecars. The generated top-level SBOM does not normalize all bundled component identities/versions; this is a remaining provenance limitation before a public release.

Node, Docker/its selected image, the separately installed pinned Chrome for Testing runtime, Windows/.NET and the Linux OS remain external prerequisites with their own distribution/licensing terms. This archive does not redistribute a browser installation or Node executable. Browser runtime licensing/redistribution and independent upstream authenticity remain open gates. The separately pinned Docker image must retain its own provenance/license evidence before distributing that image.

MCP's Apache-2.0 metadata coexists with original transition text preserving earlier MIT contributions. pako declares MIT AND Zlib and retains LICENSE/source headers. tslib requires preservation of its original 0BSD text and copyright notice. Playwright's top-level Apache declaration does not replace bundled libwebp/Emscripten or other embedded terms. The project MIT license replaces none of these.

## Development-only gaps

The Windows inventory found no matching standalone license/notice file in six development-only packages: `@humanfs/types`, `@rolldown/binding-win32-x64-msvc`, `esrecurse`, `imurmurhash`, `natural-compare`, `yoga-layout`. They are **not** in the selected private runtime closure. README/source-embedded text and upstream distribution terms need separate qualified disposition if development artifacts are redistributed. Absence of a standalone file is not itself proof of an illegal package, and package metadata is not a substitute for required original text.

MCP Inspector is a development dependency with `SEE LICENSE IN LICENSE`; its original file carries the Apache/MIT transition. Lightning CSS is MPL-2.0 and development-only. Neither is copied into the private runtime archive. No legal gate is closed by these technical counts or an npm-audit result.
