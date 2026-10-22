# Forschungsnotizen zu KI-Browser und Cursor

**Stand:** 2026-10-22 | **Status:** Dokumentenprüfung, keine Programmausführung und keine Übernahme von Quellcode.  
**Vorgeschlagene Hauptbibliothek:** Microsoft Playwright MCP + Playwright; Lizenz vor tatsächlicher Übernahme mit genauem Repository-Commit verifizieren.

## Offizielle Grundlagen

- [Playwright MCP: Einführung und Toolumfang](https://playwright.dev/mcp/introduction) — Browser-Automation mit Accessibility-Snapshots, Locator-basierten Klicks, Tabs und Formularen; Browser sichtbar im headed-Modus.
- [Playwright MCP: Profile und Zustand](https://playwright.dev/mcp/configuration/user-profile) — isolierter kurzlebiger Modus (`--isolated`) versus persistente Profile (`--user-data-dir`). Standardzustand und Pfade versioniert nachlesen.
- [Playwright: BrowserContext API](https://playwright.dev/docs/api/class-browsercontext) — getrennte Cookies, Tabs und non-persistent contexts; addInitScript für Page/Frame, aber Overlay mit Cross-Origin/Schutzseiten separat evaluieren.
- [Playwright MCP: Konfiguration und Netzwerk](https://playwright.dev/mcp/configuration/options) — Allowed-Origin-Filter sind ausdrücklich nur Convenience-Guardrails, **keine** Sicherheitsgrenze; Redirects und untrusted Browsercode brauchen zusätzliche Host-/Network-Policy.
- [Playwright MCP: Capabilities](https://playwright.dev/mcp/capabilities) — explizites Freischalten von Toolgruppen verringert exponierte Fähigkeiten, ersetzt aber keine hostseitigen Rechte.
- [Win32 SendInput](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-sendinput) — speist OS-Eingaben in den gemeinsamen Eingabestrom, UIPI-Einschränkungen; kein frei unabhängiger Desktop-Cursor.
- [XDG RemoteDesktop Portal](https://flatpak.github.io/xdg-desktop-portal/docs/doc-org.freedesktop.portal.RemoteDesktop.html) — Zustimmung durch Portaldialog, libei/EIS, persist_mode/restore_token; Wayland-Kompositorunterstützung prüfen.
- [Electron transparent windows](https://www.electronjs.org/docs/latest/tutorial/custom-window-styles) — visueller Overlay-Kandidat mit bekannten Plattformgrenzen, keine bereits festgelegte Dependency.
- [Playwright MCP source](https://github.com/microsoft/playwright-mcp) und [Playwright source](https://github.com/microsoft/playwright) — Lizenz, Tests und Revision vor Codeübernahme prüfen.
- [MCP-Spezifikation](https://modelcontextprotocol.io/specification/2025-11-25) — client-seitige Toolaufrufe und Protokoll, nicht automatisch autorisierte lokale OS-Aktionen.

## Technologiewahl und sinnvolle Codewiederverwendung

**Wiederverwenden:** Browsersteuerung, BrowserContexts, Navigation, Accessibility-Snapshots, Locator-Aktionen und Playback/Tracing aus Playwright. Native OS-Automation erst nach Fokus-/Permissions-Test ergänzen. Keine neue KI-Agent-Implementierung.

**Selbst entwickeln:** verbindliche Host-Policies, Geräte-/Session-Bindung, Limitierung auf den eigenen KI-Browser, Cursor-Visualisierung, Window Ownership/Fokus-Arbitration, Not-Aus, Redaction, Audit und MCP-Typisierung des eigenen Plugin-Interfaces.

## Prüfaufträge vor Implementierung

1. Entscheiden, ob Playwright MCP direkt als eingeschränkter MCP-Server eingebettet/gestartet oder eine dedizierte Playwright-Library-Wrapper-Schicht benötigt wird. Client darf nicht ungefiltert alle ursprünglichen Tools erhalten, wenn Desktop-Control-Policies nur einen Teil erlauben.
2. DOM-basierten, click-through Browser-Overlay-Versuch mit Maus-Action-Events durchführen; Navigation, CSP, Popup, Zoom/DPI und mehrere Monitore testen. Alternativen: separates UI-Overlay oder browser-internes kontrolliertes HUD.
3. Performance und Fokuskonflikte mit Sichtfenster, Browser-Sandbox und separatem Nutzerbrowser nachweisen.
4. End-to-End-Härtung: eigene Profile, sichere Anmeldung, Session-Cleanup, origin- und netzwerkseitige Policy, temporäre Downloads, Datei-Uploads, Clipboard, WebSockets, sensitive Aktionen.
5. Durch echte Plattformtests belegen, dass die behauptete Unabhängigkeit im KI-Browser funktioniert und gemeinsamer Desktop sicher pausiert.

## Lizenzrechtliche Grenzen

Ein öffentliches GitHub-Repository ist nicht automatisch frei kopierbar. Jede übernommene Datei benötigt Lizenzprüfung, Herkunfts- und Copyright-/NOTICE-Erhalt und idealerweise fixierten Upstream-Commit. Das proprietäre Remote-Desktop-Commander-Projekt ist nicht pauschal kopierbar.
