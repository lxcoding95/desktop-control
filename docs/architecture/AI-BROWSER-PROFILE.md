# AI Browser: Persistent Private Profile and Virtual Cursor

**Status:** Proposed specification / planning only. **Session count:** 0/6 started. **Owner decisions:** 2026-10-22.
**Related:** [Issue #14](https://github.com/lxcoding95/desktop-control/issues/14), [Session 4 #8](https://github.com/lxcoding95/desktop-control/issues/8), [threat model](THREAT-MODEL.md), [quality gates](../governance/QUALITY-GATES.md).
**No product code, browser or credentials have been created.**

## 1. Fixed owner decisions

- The AI controls **only its own dedicated browser**, not the user's existing browser, tabs, browser profile or accounts.
- On the shared desktop it has a **visible black virtual cursor + controlled exclusive takeover**, not a fabricated second system mouse.
- When the human uses the shared desktop, the AI may continue **only in its isolated browser**, as long as it does not steal desktop input/focus or collide with user activity.
- The black AI cursor is visible **only for mouse interactions**; an activity indicator remains available for non-pointer actions.
- Site-by-site/app-by-app permissions and session-scoped permission profiles **are both available**, with user-selected policies and local confirmation for dangerous tasks.
- The AI browser has **its own durable browser data**: history, bookmarks, saved credentials subject to user consent/security, cookie/login state, cache, sessions, downloads, site policies and other regular browser features.
- There is no separate AI agent: ChatGPT/MCP client drives bounded authorized tools; the local Desktop Control bridge executes them.

## 2. Implementation principles and browser selection

**Use existing web engines, not a new browser engine.** Begin feasibility tests with a maintained Playwright-managed Chromium browser in headed mode and a **new, dedicated, persistent user data directory**. Alternative: an installed Chrome/Edge channel explicitly pointed at a **new, non-default** profile directory. Chromium's user data directory can preserve history/bookmarks/cookies; Playwright `launchPersistentContext(userDataDir)` preserves storage state. The real behavior of password-save prompts, extensions, profile services and navigation history must be tested per channel: Playwright persistence **does not guarantee full branded-browser features**.

Never attach to or point remote debugging to the user's default Chrome profile. New Chrome releases restrict automation of the default profile. Do not use a fixed public remote-debugging port; prefer a controlled local process/pipe transport with OS permissions and no unauthenticated listeners. No profile may be opened by two active browser processes simultaneously. Use a lock and an explicit recovery path.

**Packaging tradeoff:** packaged Chromium offers reproducibility but increases installer size and update responsibility; installed Chrome/Edge offers familiar UI/password functionality but can impose brand-specific features, policies and compatibility issues. Verify license, redistribution, platform requirements and update procedures before choosing.

## 3. Persistent browser data and feature requirements

| Feature | Required behavior | Initial approach and caveat |
| --- | --- | --- |
| Navigation history | Dedicated chronological history, domain/time search, selective/full deletion, configurable retention | Chromium profile's native history; verify programmatic navigation really appears in UI |
| Bookmarks | Create/rename/remove/search folders, shortcuts, export/import where supported | Chromium's own bookmark store and UI; adapter for controlled MCP access only |
| Passwords | Explicit opt-in to save, secure storage, user-managed deletion and reveal gates | Tested native manager or custom **OS-backed vault**, not raw JSON or a Playwright storageState file |
| Site login/session state | Persist dedicated cookies, localStorage, IndexedDB and login while permitted | Persistent profile. Logout clears site tokens only when explicitly requested |
| Tabs/windows | Multiple AI tabs, restore previous tabs, manage popups with per-origin policy | Browser-native; cap number, memory and runaway windows |
| Downloads | Separate directory, filenames, progress, SHA hash, scanning and retention | Save each approved download explicitly; Playwright temp downloads disappear when context closes |
| Uploads | Only explicitly permitted files/paths, preview names and destinations | No unrestricted file chooser or local file exposure |
| Browser cache | Independent cache, clear by site/date/all | Chromium profile; prohibit sensitive cache export without permission |
| Private session | Temporary isolated context/profile disposed at close | Must not share persistent cookies/history or credentials unless explicitly approved |
| Autofill | Addresses/form fields as user-selected options | Sensitive personal data needs scoped consent and local secure storage |
| Bookmarks/credentials import | Deliberate user-triggered import of specific data only | Never silently import personal browser history/passwords |
| Website permissions | Site-specific notification, camera, mic, geolocation, clipboard, popup policies | Default deny sensitive permissions, grant with local consent |
| Tabs/media | PDFs, zoom, accessibility, language, notifications, media playback | Test actual browser variant + OS |
| Extensions | Allowlist and review of extensions, explicit install permission | Deferred until sandbox and supply-chain assessment |
| Browsing protection | TLS validation, safe URL/download checks, no auto-bypass of cert warnings | Test browser security services and keep engine patched |
| Session/crash recovery | Recover tabs/history after restart/crash; no duplicate actions on reconnection | Durable local state, startup lock, action idempotency |
| Backups and deletion | Export privacy-safe settings/bookmarks, backup/migration, irreversible wipe | No automatic upload to cloud; full profile backups may contain credentials |
| Browser updates | Compatibility-pinned engine, security patches, rollback planning | Separate from runtime/MCP update; verify on Windows + Linux |
| Tracking/privacy | Cookie controls, per-site clear, blocking if supported | Never claim tracking prevention without actual browser checks |
| Data synchronization | Off by default; possible later feature with explicit consent | No domain, cloud identity or Google/Edge sync integration yet |

**Browser UI vs tool API:** A user may navigate settings/Chrome pages in the AI browser, but the AI is given a **narrow tool set** (navigate, list tabs, inspect safe accessibility tree, click/scroll/type, manage user-approved bookmarks/downloads); not direct raw access to SQLite profile databases, arbitrary CDP commands, cookie/token exports or unrestricted JS evaluation in the lower-risk permission profiles.

## 4. Password manager, passkeys and credential threat model

### Verbindliche Owner-Entscheidungen – Freigabegebundene Anmeldung und sichtbarer Browser

**Automatisches Login (ausdrücklich entschieden):** Nur für lokal vom Nutzer vorab freigegebene **exakte Website-Origin + Kontoidentität** darf die KI im *eigenen* Browser bereits vorhandene authentifizierte Sitzungen wiederverwenden oder sicher gespeicherte Zugangsdaten für die routinemäßige Anmeldung verwenden. Freigaben müssen Zweck, Website/Konto, erlaubte Aktionen, Gültigkeit und Widerruf zeigen. Eine Webseitenanweisung, Phishing-Domain, Cross-Origin-Weiterleitung, anderer Account oder Session-Wiederaufnahme erweitert diese Freigabe nicht. Nach Widerruf werden neue Logins/Aktionen verweigert; bestehende Remote-Sessions müssen nach dem Sicherheitsmodell separat invalidiert werden, statt eine sofortige serverseitige Abmeldung zu behaupten.

**Kritische Aktionen (weiterhin gesondert freizugeben):** Zahlung/Kauf, Nachricht/Posting, Kontolöschung, Passwort-/Recovery-/2FA-/Passkey-Änderung, neue Website-Berechtigungen, sensible Uploads und Datenexport. Site-Autologin allein autorisiert keine dieser Aktionen. Lokale Bestätigung ist an die konkrete Aktion, Domain, Konto und Risikoklasse gebunden. Menschlich erforderliche 2FA-/Passkey-/OS-Prompts nicht automatisch umgehen.

**Passwortgeheimnis:** Speicherung weiterhin nur opt-in und mit nachgewiesenem OS-backed Verschlüsselungsweg. Gegenüber ChatGPT/MCP standardmäßig kein Klartext, keine Cookie-/Storage-State-Exporte, kein generisches JavaScript/CDP mit Secret-Zugriff. Playwright MCP stellt optional Storage-Tools bereit; diese müssen im Desktop-Control-Tool-Gateway für normale Profile deaktiviert/abgegrenzt werden. Wichtig: Auch ohne Kenntnis eines Passworts kann die KI über eingeloggte Seiten missbräuchlich handeln; deshalb prüfen Host-Policy und Benutzerfreigaben **jede** sensitive Aktion.

**Immer sichtbares KI-Browserfenster (ausdrücklich entschieden):** Während KI-Browseraktionen läuft ein eigenes normales Browserfenster im **headed-Modus**; kein stiller Wechsel zu Headless-/verstecktem Betrieb, keine automatisch minimierte Oberfläche. "Sichtbar" ist nicht "ständig ganz vorn": Kein erzwungenes Always-on-top oder Fokus-Stealing, damit der Nutzer andere Fenster bedienen kann. Wenn die Anzeige nicht zuverlässig verfügbar ist, Zustand melden und pausieren statt heimlich im Hintergrund ohne Browserfenster weiterzuarbeiten. Ein KI-Browser darf weiterarbeiten, wenn andere menschliche Fenster im Vordergrund sind und keine geteilte physische Eingabe benötigt wird. Native OS-Datei-/Passwort-Dialoge → explizite Übernahme und lokale Bestätigung.

**Zusätzliche ungetestete Abnahmetests:** AUT-01: nur freigegebenes exaktes Konto/Origin darf Routine-Login nach Neustart automatisch verwenden; AUT-02: Subdomain, Redirect, Homograph, fremdes Konto und Widerruf blockieren; AUT-03: Kauf/Nachricht/Kontosicherheit erfordern trotz Login eine neue Bestätigung; AUT-04: keine Geheimnisse in MCP-Ergebnissen, Traces oder Logs; VIS-01: eigenes Browserfenster bleibt headed und zugänglich über Neustart, Tabwechsel, DPI, X11/Wayland/Windows; VIS-02: keine unfreiwillige Always-on-top-/Fokusübernahme. Alle Tests **not run** bis zu explizit genehmigter Implementierung.



**Desired UX:** user can choose "Save password?" for the AI profile; next visit can offer autofill. Passwords stay local, use encryption tied to OS-user and OS secret store when practical. This requires a real test on **every supported browser channel and OS**, because Playwright's persistent-context API itself provides no password manager or credential vault.

**Supported-store principle:** Windows Credential Manager / applicable browser encryption; Linux Secret Service/libsecret or KWallet. Chromium on Linux can fall back to a **basic plaintext** store if no service exists; Desktop Control must refuse **secure saved-password mode** when suitable secret storage is unavailable. A custom local vault is permissible if the native browser password manager is insufficient, but it must be narrowly designed, audited and never expose a "show all passwords" MCP tool.

**Critical limitation:** Password-field values, cookies and authenticated sessions can potentially be accessed by unrestricted script/DevTools. No claim of mathematically guaranteeing secrecy when a model controls arbitrary browser script is credible. Restrict generic `evaluate`, extension/script installation, direct cookie export, raw network headers and profile file tools by default. Never send passwords, OTP recovery codes, passkeys, bearer tokens or entire authenticated storageState exports to an LLM or hosted relay. Authenticated browsing still grants the AI indirect powers of the logged-in account; important transactions require separate host-side approval.

**Consent policy (owner decisions established; implementation/testing pending):**
- Default: human enters password/2FA/passkey locally; optional consent to securely save it in AI profile.
- AI can subsequently navigate authenticated pages **within per-site/per-action authorizations** without receiving raw credentials.
- New account registration, password changes, money transfers, exporting account data and security settings require explicit approval.
- **Previously approved sites/accounts** may reuse secure local credentials or persisted sessions for routine login without repeated human confirmation; never expand that privilege to another site/account or critical account action.
- No cross-profile browser sync or importing passwords from the user's everyday browser by default.

Passkeys/WebAuthn, OS biometric prompts, SSO and password managers must be tested with mock accounts. A browser prompt can require human participation; do not automatically bypass security challenges.

## 5. Input isolation and black cursor model

Browser automation uses **Playwright locators/DOM/accessibility**, not physical OS mouse movement, wherever possible. The browser adapter translates a pointer action into an ephemeral black cursor position/animation inside the AI browser's window. The cursor disappears after a short inactivity period, while a persistent small activity/stop control indicates that the AI browser remains active.

The human's white **system pointer** is never programmatically replaced for browser-native actions. The model may still cause visible changes within its isolated browser but must not steal focus or interact with the user's existing browser.

On the shared OS desktop outside the AI browser: black overlay cursor indicates an **exclusive takeover** but is not a second independent system cursor on Windows/standard Wayland. If the user interacts with the same window, pause/terminate pending input and release pressed keys/buttons. The owner explicitly permits background AI-browser operations to continue **only while properly isolated and not requiring shared focus/keyboard**.

If a browser operation necessarily invokes OS-level input, system dialogs, shared clipboard or desktop focus, suspend the "independent mode" and use an explicit foreground takeover/approval path. Race conditions and compositor restrictions are test blockers, not permission to inject input blindly.

## 6. Permissions and data governance

**Scope axes:** User/device/profile, site origin, tab, capability/tool, time window, background execution, download/upload path, clipboard, credential autofill, storage, network access and sensitive operations. Support per-site grants and session-wide profiles together. A later public hosted gateway must authenticate each session, but **local host-side enforcement** stays mandatory.

**Default policies:** deny camera/mic/geolocation/clipboard notifications and executable downloads without explicit consent; block unsafe URL schemes (file:, javascript:, data:) in navigate tool unless narrowly justified; prohibit file uploads by default; cap download sizes; do not leak browsing/history into ChatGPT analytics or server logs. Audit *actions and origin* but redact URL query secrets, form values and screenshots of credentials. Allow configurable audit retention and user-initiated deletion.

**Security separation:** A different browser profile isolates browser data, NOT OS process privileges or filesystem permissions. Browsing malicious content still carries browser zero-day risk. Launch as normal restricted user and preserve Chromium sandbox; investigate further OS sandbox/VM for hostile sites or FULL-trust use.

## 7. Tool interface (proposal, not MCP implementation)

- `browser.profile_status`: profile ID, storage usage, security/secret-store support flags, active sessions (never raw secrets).
- `browser.launch`, `browser.close`, `browser.tabs`, `browser.navigate`, `browser.snapshot`.
- `browser.find`, `browser.click`, `browser.type`, `browser.scroll`, `browser.wait`, `browser.go_back`.
- `browser.bookmarks.list/add/remove`, `browser.history.search/delete` (scoped, host authorized).
- `browser.download.list/approve/save/delete`, `browser.permissions.inspect/request/revoke`.
- `browser.session.pause/resume/stop`, `browser.cursor.state`, `browser.profile.clear`.
- Human-only/local UI: saved password list/show/delete, 2FA and passkey prompts, local secrets import, profile-wide export.

**Never put `browser.cookies.export`, `browser.passwords.dump`, or generic unrestricted `browser.evaluate` into the standard model-facing surface.** Add tool schemas with strict origin/action validation and deterministic error/result formats after design approval.

## 8. Build-vs-reuse and licensing

- Reuse [Chromium's user-data-directory model](https://chromium.googlesource.com/chromium/src/%2B/HEAD/docs/user_data_dir.md), [Playwright persistent contexts](https://playwright.dev/docs/api/class-browsertype), [Microsoft Playwright MCP](https://github.com/microsoft/playwright-mcp) as evaluated Apache-2.0 basis.
- Do NOT copy branded browser assets, proprietary Chrome/Edge services or Desktop Commander's non-OSS remote modules.
- New code limited to: policy enforcement, wrapper/Tool APIs, black cursor/overlay, optional secure vault integration, UX dashboard/tray, cross-platform packaging, migration/retention and tests.
- Investigate optional browser extension **only if** a built-in tool/overlay is insufficient; evaluate extension permissions and store distribution requirements. No browser UI rewrite from scratch.
- Record exact copied files, license notices, pinned upstream revision, security results and compatibility checks in PR.

## 9. Test and acceptance matrix

| ID | Mandatory test before claimed support |
| --- | --- |
| PROF-01 | No reads/writes to user's existing Chrome/Edge/Firefox profile paths; fresh AI profile only |
| PROF-02 | History, bookmarks, cookies/login and tabs survive restart; private mode leaves no persistent state |
| PROF-03 | Browser profile rejects simultaneous writers and recovers cleanly from browser crash |
| CRED-01 | Password-saving prompt + secure local storage works per OS/channel; fails closed if no Linux secret store |
| CRED-02 | AI tools cannot dump raw passwords/tokens through allowed APIs; test unauthorized script/cookie access |
| CRED-03 | Human login/2FA/passkey and permission revocation behave correctly |
| AUT-01–04 | Exact-origin/account automatic login works only with a valid local grant; redirect/foreign-account/revocation denied; critical actions reconfirmed; no secret leakage |
| VIS-01–02 | Always-visible headed browser, no silent headless fallback, no forced always-on-top/focus stealing on tested desktops |
| INPUT-01 | Two on-screen indicators; Playwright clicks do not move the physical white OS pointer |
| INPUT-02 | User can operate personal browser; AI browser works independently with no unintended focus stealing |
| INPUT-03 | Shared OS input falls back to explicit takeover, pause and cancellation |
| DATA-01 | Downloads explicitly saved in AI folder and survive browser close; unsafe downloads require consent |
| DATA-02 | Per-site cookie/history/bookmark/permission deletion works; secure wipe limitations documented |
| SITE-01 | Origin/capability policies block disallowed camera/clipboard/upload/transfer actions |
| SITE-02 | Same-site navigation, iframes, dynamic pages, CSP, zoom, DPI, multiple monitors, redirects tested |
| PLATFORM-01 | Windows 10/11 with supported browser channel; Linux X11, GNOME/KDE Wayland separately classified |
| REL-01 | Versioned browser/Playwright upgrade with migration/backups, rollback and security patch behavior |
| E2E-01 | MCP client -> bridge -> AI browser -> verified action -> bounded response, with logs redacted |

All entries are **unverified** until real execution in permitted test environments; not a promise of zero defects.

## 10. Deferred decisions and current state

**Decided**: durable isolated AI browser, history/bookmarks/logins/downloads, opt-in password storage goal, ephemeral black cursor, independent in-browser actions, profile/scoped permissions. **Owner decision confirmed**: automatic routine login only on sites/accounts explicitly preapproved locally; critical account changes require separate confirmation; browser always runs visibly headed, never silently headless or hidden. Additional choices (Google sync, number of AI profiles, extensions, private browsing) can default conservatively until needed.

**No session started.** This document is a specification for Session 1 architecture and Session 4 browser work, not an implementation authorization.

## Sources (external, to recheck during coding)

- [Playwright MCP Profile & State](https://playwright.dev/mcp/configuration/user-profile)
- [Playwright BrowserType persistent contexts](https://playwright.dev/docs/api/class-browsertype)
- [Chromium user-data-dir profile contents](https://chromium.googlesource.com/chromium/src/%2B/HEAD/docs/user_data_dir.md)
- [Chrome remote debugging profile protection](https://developer.chrome.com/blog/remote-debugging-port)
- [Playwright downloads lifecycle](https://playwright.dev/docs/downloads)
- [Chromium Linux password storage](https://chromium.googlesource.com/chromium/src/%2B/master/docs/linux/password_storage.md)
- [Chromium password storage security](https://github.com/chromium/chromium/blob/main/docs/security/faq.md)
- [Windows Credential Manager guidance](https://learn.microsoft.com/en-us/windows/win32/secbp/handling-passwords)
