# Desktop Control visual identity

Original repository-native artwork: a bright blue desktop window, black pointer
with a pale contrast edge, and a teal control indicator on a rounded navy tile.
It refers to visible local control, not a second AI agent. The icon is a static
brand mark: its teal dot is **not** a live permission or connection indicator.
Permission state must still come from the protected host and visible control UI.

No competitor logo, proprietary plugin artwork, downloaded graphic, font, paid
dependency or image generation service was used. Artwork is part of this MIT
repository. `plugin/assets/desktop-control.svg` is the editable vector source;
`render-icon.ps1` reproduces the same original geometry with the existing Windows
System.Drawing runtime. SVG contains no scripts, links, embedded raster content,
external fonts or external resource references.

## Supported integration

The official [plugin metadata reference](https://developers.openai.com/plugins/deploy/submission#icons-and-screenshots)
supports PNG, JPEG, WebP and SVG, up to5MiB per image. Icons must be square and at
least48×48; SVG needs square numeric dimensions or a square viewBox of at least48.
Paths start `./` and resolve from the plugin root; the referenced files must be
included in the actual package.

For the portable root `plugin.json`, use these existing interface fields under
`extensions.com.openai.interface`:

```json
{
  "category": "Developer Tools",
  "logo": "./assets/desktop-control.png",
  "composerIcon": "./assets/desktop-control.png",
  "brandColor": "#2374DE",
  "brandColorDark": "#68D9F4"
}
```

For the legacy `.codex-plugin/plugin.json`, put the same fields inside its
top-level `interface` object. When the portable inline extension exists, it is
canonical and the compatibility overlay is not merged. A single high-contrast
icon works on both light and dark backgrounds, so separate `logoDark` and
`composerIconDark` are unnecessary. Do not use inventively named icon fields.
The public directory's selected developer identity is distinct from source
`author.name`/`interface.developerName`; artwork does not change that identity.
The official [submission normalization rules](https://developers.openai.com/plugins/deploy/submission-errors)
state that directory developer names come from the selected verified identity,
regardless of the name in a ZIP. This publication rule does not establish a
per-personal-plugin override for the account creator label. Source retains
**Anon Allman**; no global account-profile change, new identity verification or
public publication is part of this private fix.

### Source-only correction after preview.5

Cloud preview.5 readback preserved the original SVG logo, PNG composer icon and
Anon Allman source metadata, yet the account card still showed a generic icon.
The canonical manifest omitted `category`, and the service-generated compatibility
manifest defaulted it to `Other`. The official category rules explicitly support
**Developer Tools** and default an omitted category to Other.

Both source manifests now set `category: "Developer Tools"` and use the existing
64px PNG for both logo fields as a bounded SVG-ingestion compatibility experiment.
The original SVG remains unchanged as editable vector artwork; no image is added
or regenerated for this correction. This does **not** prove that PNG fixes the
cloud card. The next bundled release must be read back and the actual host/card
visually checked before reporting icon or category rendering as fixed.

This correction is source-only: package version and account release remain
unchanged until the coordinating release process batches and verifies the update.
Existing build/archive handling already includes both declared assets. Do not
distribute `render-icon.ps1` or tiny preview variants merely because they share
the asset directory.

## Verification on 2026-10-25

Run `& ./plugin/assets/render-icon.ps1` from PowerShell on Windows to reproduce
the four PNG sizes. No software installation is required.

| File | Dimensions | Purpose |
| --- | --- | --- |
| `desktop-control.svg` |128×128 viewBox and numeric dimensions | Original scalable artwork, retained |
| `desktop-control.png` |64×64 | Current source logo and composer icon; below10KiB |
| `desktop-control-128.png` |128×128 | Larger raster alternative |
| `desktop-control-32.png` |32×32 | Visual scale preview only; too small for manifest |
| `desktop-control-16.png` |16×16 | Visual scale preview only; too small for manifest |

The generated PNGs were decoded by System.Drawing and their square dimensions and
PNG format checked. Actual128px and16px raster images were visually inspected:
the window silhouette, pointer and indicator remain identifiable at small size;
fine window details naturally disappear at16px. This is asset QA, not a claim
that the account listing has already adopted the new icon.
