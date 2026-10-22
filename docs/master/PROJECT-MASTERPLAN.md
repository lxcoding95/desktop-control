# Desktop Control — Verbindlicher Projekt-Masterplan

**Stand:** 2026-10-22 | **Status:** S02 MCP-Grundgerüst implementiert, SDK-Integration und End-to-End-Tests noch blockiert | **Lizenz:** MIT | **Repository:** https://github.com/lxcoding95/desktop-control

> Dieses Dokument beschreibt Ziele, Entscheidungen und Gates. Es ist keine Behauptung, dass das Produkt bereits implementiert ist. Vorhandene GitHub-Daten (Commits, PRs, Issues und aktuelle Branches) haben Vorrang vor statischen Statusangaben. Für neue ChatGPT-Chats zwingend auch [CHAT-CONTINUITY.md](../governance/CHAT-CONTINUITY.md) lesen.

## 0. Dokumenten-Hierarchie und Wahrheitsquellen

1. **Ist-Zustand:** GitHub-API/Repository `main`, aktive PR-Branches, Commits, Issue-Status, echte Checks und Projektkonfiguration. Niemals auf Basis eines alten Chatverlaufs ungeprüft schreiben.
2. **Anforderungen / Entscheidungen:** dieser Masterplan, [ROADMAP](../../ROADMAP.md), [ADR-0001](../architecture/ADR-0001.md), [OVERVIEW](../architecture/OVERVIEW.md), [THREAT-MODEL](../architecture/THREAT-MODEL.md).
3. **Live-Handoff:** [PROJECT-STATE.json](../governance/PROJECT-STATE.json), [CHAT-CONTINUITY.md](../governance/CHAT-CONTINUITY.md), SESSION-Issues #5–#10 und PR-Kommentare. Bei Konflikten durch tatsächlichen GitHub-Ist-Zustand auflösen und dokumentieren.
4. **Normative externe Quellen:** [SOURCES.md](../research/SOURCES.md) und offizielle Dokumentationen; vor Implementierung erneut Version/Datum überprüfen.
5. **Quellmaterial der Nutzeranforderungen:** `Projektbeschreibung.txt` („Computer Worker“) und bereitgestellte Desktop-Commander-Werkzeugübersicht mit 29 Einträgen. In der Unterhaltung heißt das Produkt verbindlich **Desktop Control**; „Computer Worker“ ist ein früher Arbeitstitel, kein zusätzliches Agentenprodukt.

## 1. Fixierte Produktentscheidungen

| Kennzeichen | Entscheidung | Status |
| --- | --- | --- |
| DEC-001 | **Echtes installierbares ChatGPT-Plugin**, zusätzliche MCP-kompatible Clients | entschieden |
| DEC-002 | Kein selbstständiger KI-Agent; ChatGPT/Client plant, Plugin stellt Tools bereit, Bridge führt autorisiert aus | entschieden |
| DEC-003 | **Windows und Linux** im Zielumfang, reale Support-Matrix nach Tests | entschieden |
| DEC-004 | Dateien, Terminal, Prozesse, native Desktop-GUI, Browser und begrenzte Systemverwaltung im Zielumfang | entschieden |
| DEC-005 | Hohe Autonomie innerhalb **explizit freigegebener** Rechte; kritische Aktionen einzeln, Administrator-/Security-Eingriffe lokal bestätigen | entschieden |
| DEC-006 | Einfache Nutzerinstallation **und** Experten-/Self-Hosting-Modus | entschieden |
| DEC-007 | Lokales Tray-Symbol + Web-Dashboard für Geräte, Sessions, Rechte und Audit | entschieden |
| DEC-008 | Zunächst **Open Source und kostenlos**, spätere optionale Bezahlangebote nur nach Stabilität und neuer Entscheidung | entschieden |
| DEC-009 | Zunächst lokal entwickeln, später Domain, zentraler Dienst und Google-/E-Mail-Registrierung | entschieden |
| DEC-010 | **GitHub ist Code- und Zustandsquelle**, ChatGPT Project Sources enthalten stabile Basisspezifikation | entschieden |
| DEC-011 | GitHub-App **All repositories** bleibt auf Wunsch des Owners aktiv; Schreibaufträge strikt auf `lxcoding95/desktop-control` begrenzt | entschieden |
| DEC-012 | 6 explizit gestartete, maximal 25-minütige Entwicklungssitzungen, jetzt **2/6**; pro Sitzung Ziel 94 % aktive Nutzzeit, kein erfundener Zeitnachweis | entschieden |
| DEC-013 | Research und lizenzkonforme Wiederverwendung vorhandener OSS-Module priorisieren | entschieden |
| DEC-014 | **SEC-GATE-001**: GitHub Actions auf verifizierte vollständige SHAs pinnen und Schutzregel vor regulärer CI-Nutzung aktivieren | verpflichtend/offen |

Unentschieden bis zu evidenzbasiertem Architekturreview: Native Bridge-Sprache nach S02 (Node/TypeScript für lokalen MCP-Kern in ADR-0004 entschieden), langfristiger Paketmanager nach Locked-Install, Lizenzinventar der eingebundenen Komponenten, Windows-UI-Backend, Wayland-Umsetzung, Hosting-Stack, Account-Provider, Remote-Protokollvarianten und Kosten. Nicht so tun, als seien diese Entscheidungen schon implementiert.

## 2. Produktgrenzen und UX

### 2.1 Benutzerablauf (Zielzustand)

1. Nutzer wählt Plugin-Paket in einem kompatiblen ChatGPT-/MCP-Client; Installierbarkeit und ZIP-Format sind host-spezifisch zu validieren.
2. Lokal wird eine **Desktop Bridge** installiert (kein zweiter KI-Agent). Der Nutzer aktiviert Gerät und Profil (LOW / MEDIUM / FULL / CUSTOM).
3. Im lokal erreichbaren Dashboard/Tray: Geräte, verfügbare Tools/Skills, erlaubte Pfade, Netzwerkziele, Sessions, Auditlog, sofortige Trennung und Widerruf.
4. ChatGPT ruft **strukturierte MCP-Tools** auf. Die Bridge verifiziert **jede** Aktion mit eigener Policy und zeigt erforderliche Freigaben lokal an.
5. Rückgabe: typisiertes Ergebnis, begrenzte Ausgabe, nachvollziehbare Fehler, Dauer, Cancellation-ID, Herkunft. Keine voreilige Erfolgsmeldung.
6. Für Remote-Nutzung kann später ein HTTPS-Streamable-HTTP-Gateway plus ausgehender Gerätekanal verwendet werden. Die Bridge führt weiterhin lokal aus. Registrierung und Hosting erst nach lokalem End-to-End-Nachweis.

**Referenz-UX:** Desktop Commander verwendet `npx @wonderwhy-er/desktop-commander@latest remote` und Device Authorization. Unser entsprechender zukünftiger CLI-Befehl ist **noch nicht festgelegt, nicht veröffentlicht und nicht ausführbar**. Sinnvolle Subkommandos zur Planung: `remote`, `status`, `doctor`, `logout`, `revoke`, `update`; bei Logout stets zwischen lokaler Credential-Löschung und serverseitigem Widerruf unterscheiden.

### 2.2 Rechtedimensionen

Unabhängige Policies: Gerät, Konto, Toolgruppe, Pfade, Netzwerk-Egress, Terminal-/Prozessfähigkeiten, GUI-Input, Browser-Profil, Admin/Root, Secrets, Zeitfenster, Audit, Aufbewahrung, genehmigte Domains und Skills. Ein Skill darf keine Tool-Rechte selbst erhöhen. Ein MCP-Client kann keine lokalen Policy-Dateien unkontrolliert umschreiben.

| Profil | Geplante Voreinstellung | Einschränkung |
| --- | --- | --- |
| LOW | Diagnose und Lesen expliziter Projektpfade; keine Shell/GUI-Writes | Auch Lesen kann Geheimnisse offenbaren |
| MEDIUM | Freigegebene Schreibpfade, begrenzte Befehle/Browseraktionen, Backups | Keine implizite Admin-Freigabe |
| FULL | Umfangreiche Rechnerkontrolle nach expliziter informierter Wahl | Volles Shell-Recht ist kein Sandbox-Modell |
| CUSTOM | Pro Tool/Skill/Pfad/Gerät fein granular | Policy muss hostseitig zur Ausführungszeit greifen |

Für destruktives Löschen, externen Datentransfer sensibler Daten, Accountänderungen, OS-Security, Paketinstallation und Admin/Root gilt eine eigenständige Risiko- und Freigabeprüfung. Technisch nicht rücknehmbare Aktionen als solche kennzeichnen; Backups niemals als universelle Rollback-Garantie verkaufen.

## 2.3 KI-Browser: bestätigte Produktvorgaben (2026-10-22)

- Getrennter **dauerhafter** KI-Browser mit Verlauf, Lesezeichen, Tabs, Downloads, Login-Sessions sowie optional sicher gespeicherten Passwörtern. Keine Übernahme privater Standard-Browserprofile.
- **Automatische Anmeldung** nur für **vorher lokal ausdrücklich freigegebene Website-Origin und Kontoidentität**. Revokation, Konto-/Domain-Wechsel und Umleitungen müssen hostseitig überprüft werden; 2FA/Passkeys werden nicht umgangen.
- **Kritische Kontoaktionen bleiben bestätigungspflichtig**, auch wenn der Browser bereits angemeldet ist.
- **Browserfenster während KI-Aktionen immer sichtbar als headed-Fenster**, kein versteckter Headless-Browser. Sichtbarkeit bedeutet nicht Always-on-top oder Fokus-Stealing.
- Schwarzer KI-Cursor nur bei Mausaktionen; KI-Browser darf unabhängig von menschlichem OS-Cursor arbeiten, solange keine gemeinsame OS-Eingabe nötig ist. Gemeinsamer Desktop erfordert getrennte Übernahme-/Stoppregeln.
- Verbindliche vollständige Planung und Tests: [KI-Browser-Spezifikation](../architecture/AI-BROWSER-PROFILE.md), [ADR-0002](../architecture/ADR-0002-AI-BROWSER.md), [Issue #14](https://github.com/lxcoding95/desktop-control/issues/14). **2/6 Entwicklungssitzungen gestartet.**

## 2.4 Auslieferung und Verbindung – verbindliche Ownerentscheidung vom 22.10.2026

**Option 1 — Local-first bestätigt.** Zuerst einen lokalen MCP-Kern entwickeln und mit lokalem MCP-Testclient beziehungsweise MCP Inspector prüfen; danach ChatGPT anbinden. Zielprodukt ist eine lokal installierbare Windows-/Linux-App mit Tray, lokalem Dashboard und eigenem sichtbarem KI-Browser. Ein versionierter `npx`-Start ist ein zusätzlicher Entwickler-/Expertenweg. In der ersten Entwicklungsphase keine Domain, kein eigener öffentlicher Server und keine kostenpflichtige Cloud-Infrastruktur. Transport, App-Shell und Installer benötigen später reale technische Prüfung; Tunnel-Zugang/Kosten sind keine Voraussetzung für den ersten lokalen Nachweis. [ADR-0003](../architecture/ADR-0003-PRODUCT-DELIVERY.md), [Issue #17](https://github.com/lxcoding95/desktop-control/issues/17). **Keine Entwicklungsfreigabe, Sessions 2/6.**

## 3. Architektur und Vertrauensgrenzen

```text
AI client (ChatGPT / Codex / MCP client)
  -> Plugin package: plugin.json + mcp.json + optional skills
  -> MCP interface (typed versioned schemas; tools/list + tools/call)
  -> local loopback MCP adapter OR future authenticated HTTPS gateway
  -> authorized device transport, scoped session/device identity
  -> Desktop Bridge in interactive user session
      -> permission engine / approval UI / audit / cancellation
      -> filesystem | terminal/process | OS UI | browser | diagnostics
  -> bounded typed result to AI client
```

**Sicherheitsprinzipien:** Deny-by-default für unkonfigurierte Fähigkeiten; lokale Nutzereinwilligung; getrennte Identität und Autorisierung; nur TLS für externen Remote-Zugriff; Replay-Schutz, Tokenscope/-ablauf/-Widerruf; keine Klartext-Credentials; datensparsame Telemetrie opt-in; Logs redigieren; Rate-/Zeit-/Ausgabelimits; Not-Aus. Terminal erlaubter Code umgeht command- und path-based Filters; bei Isolation OS-Sandbox/VM/container mit echtem Threat Model verwenden. Relevante Bedrohungen: Prompt Injection, bösartige Webseiten, Pfadtraversal/Symlink-Races, Cross-Tenant, Token-Diebstahl, privilegierte GUI, Supply Chain, Runaway-Prozesse. Siehe [THREAT-MODEL](../architecture/THREAT-MODEL.md).

**Plattform:** Windows UI Automation, interaktive Sessions/UAC; Linux X11 vs. Wayland, AT-SPI/Portale, Distribution/Desktop-Rechte. Kein globales Versprechen universeller GUI-Steuerung. Jede Feature-Behauptung braucht getestete OS-Version/Desktop-Matrix.

**Vorgeschlagene Repository-Zielstruktur, nicht erstellt:**
```text
plugin/               # Portable manifest, skills, assets
packages/mcp-server/  # SDK, transports, tool definitions
packages/bridge/      # Local execution and policies
packages/ui/          # Tray + local dashboard
packages/shared/      # Schemas, errors, audit types
tests/                # unit/integration/e2e/abuse/platform
installers/           # Win/Linux install/uninstall
infra/                # Future optional remote gateway
docs/                 # architecture, ADRs, threat model, support
.github/              # guarded CI + templates
```
Erste Implementierung nach Phase-1-Review: möglichst **kleinster funktionierender vertikaler Schnitt** (read-only Rechner-/Dateifunktion + MCP-Client + lokale Autorisierung + Test), statt den gesamten Zielstack vorab zu erzeugen. Bestehenden TypeScript-MCP/Node-Ansatz zuerst auf Wiederverwendung prüfen; Rust nur begründet nach Sicherheits-/Packaging-Trade-off.

## 3a. Ergebnis Session 1 – lokaler MCP-Kern (22.10.2026)

Der Owner hat **ausschließlich S01** freigegeben. In S01 wurden die Architektur und der konkrete Vertrag für einen minimalen lokalen MCP-Dienst erstellt:

- [ADR-0004: MCP v2 Foundation](../architecture/ADR-0004-MCP-FOUNDATION.md): Node.js/TypeScript, offizielles v2 SDK, 2026-07-28 Protokoll, lokal via stdio, deny-by-default Policy und keine öffentliche Schnittstelle.
- [S02-MCP-Toolvertrag](../contracts/S02-LOCAL-MCP-CONTRACT.md): `desktop_control.status`, hostseitiges `diagnostics.read`-Gate, Fehler-/Schema-/Lifecycle-Tests.
- [OSS-Vergleich](../research/S01-COMPONENT-REVIEW.md): Lizenz- und Wiederverwendungsgrenzen einschließlich Desktop Commander, Playwright, Electron und Tauri.
- [S01-Checkpoint](../sessions/session-01/SESSION-STATE.md): Branch/Commit/Issue/PR und präzise bekannte bzw. unbekannte Zeit- und Testdaten.

**Grenzen:** Es existiert dadurch noch **kein ausführbarer MCP-Server, keine OS-Freigabeimplementierung, kein lokaler Inspector-End-to-End-Test, keine Windows/Linux-Testmatrix und kein CI-Lauf**. Eine registrierte Codex-Testumgebung wurde nicht gefunden; der Work-Handoff wurde nicht angenommen. Die nächste Implementierungssitzung S02 benötigt weiterhin einen neuen ausdrücklichen Nutzerbefehl und eine geeignete Ausführungsumgebung. SEC-GATE-001 bleibt offen.

## 3b. Session 2 – MCP Core & Connectivity (22.10.2026)

Nur S02 wurde zusätzlich ausdrücklich freigegeben. Der aktive Arbeitsbranch `feat/s02-local-mcp-core` und [Draft PR #22](https://github.com/lxcoding95/desktop-control/pull/22) enthalten den ersten MCP-v2-`serveStdio`-Einstiegspunkt, ein strukturiertes `desktop_control.status`-Tool und eine hostseitige `diagnostics.read`-Berechtigungsprüfung. Die Berechtigung ist **standardmäßig verweigert**; nur Testcode injiziert zeitlich begrenzte synthetische Grants. POSIX UID/EUID-Abweichungen und Windows ohne geprüfte SID-Unterstützung verweigern die Erlaubnis.

**Echte technische Belege (chronologisch):** Frühe isolierte Linux-Tests: 18/18 Unit-Tests sowie eingeschränkter Bridge-Typecheck bestanden; damals schlug die npm-Installation mit ENOTCACHED fehl. **Spätere Windows-Work-Fortsetzung** mit Node 24.21.0: Lockfile v3 erstellt, `npm ci` bestanden, 18/18 Unit-Tests bestanden, offizieller Inspector initialisierte **Protokoll 2025-11-25**, `tools/list` und verweigerter `tools/call` bestanden. **Nicht bestanden/unverifiziert:** vollständiger Typecheck und Build scheiterten an Test-Typfehlern (danach Quellkorrekturen committed, jedoch am neuesten Commit nicht sauber mit SDK-Abhängigkeiten geprüft); modernes Protokoll 2026-07-28/`server/discover`, Positiv-Grant, Prozessende/Abbruch/Größenlimits, echte Windows/Linux-Gesamtintegration und CI sind noch offen. Weitere lokale Prepared-Copy-Tests 20/20 bestanden, aber keine saubere Abnahme des GitHub-Branches. Siehe [Windows-Protokoll](../sessions/session-02/CONTINUATION-2026-10-22.md), [Verlängerungs-Checkpoint](../sessions/session-02/EXTENSION-2026-10-22.md) und [Draft PR #22](https://github.com/lxcoding95/desktop-control/pull/22). Es existiert noch kein überprüft funktionsfähiger MCP-End-to-End-Server; für reguläre CI bleibt SEC-GATE-001 offen.

Verbindliche Quelle für den aktuellen Zustand und die nicht zurückgesetzte Restzeit: [S02 Checkpoint](../sessions/session-02/SESSION-STATE.md) und [Validierung](../sessions/session-02/VALIDATION.md). **Session 3 ist nicht gestartet oder autorisiert.**

## 4. Desktop-Commander-Funktionsreferenz: 29 Werkzeuge

Aus der bereitgestellten Werkzeugübersicht: `create_directory`, `edit_block`, `force_terminate`, `get_config`, `get_file_info`, `get_more_search_results`, `get_recent_tool_calls`, `get_tool_result`, `get_usage_stats`, `interact_with_process`, `kill_process`, `list_devices`, `list_directory`, `list_processes`, `list_remote_tool_calls`, `list_searches`, `list_sessions`, `move_file`, `read_file`, `read_multiple_files`, `read_process_output`, `set_config_value`, `shutdown`, `start_process`, `start_search`, `stop_search`, `who_am_i`, `write_file`, `write_pdf`.

**Paritätsziel ≠ Identische API oder Kopie aller Implementierungen.** Jedes Tool erhält spezifische Schemas, Berechtigungsklasse, OS-Abdeckung, Idempotenz, typische Fehler und Tests. Besondere Semantik: `edit_block` erwartet eindeutige Match-Anzahl; `start_process`/REPL erfordert begrenzte Sessions und Cancellation; `read_file` darf private Pfade nicht ohne Scope öffnen; `write_pdf` besitzt Format-/Integritätsprüfung. Ergänzungen: Screenshots, Fokus/Fenster, Maus/Tastatur, Browser-DOM, Accessibility, Gerätewiderruf, Recovery, Audit und Permission-Dry-Run. Priorisierte Featuregruppen und Definition of Done in [DESKTOP-COMMANDER-COVERAGE](../research/DESKTOP-COMMANDER-COVERAGE.md).

## 5. Forschungs- und Wiederverwendungsstrategie

VOR jeder Modulimplementierung: 1) Quellcode und offizielle Dokumentation prüfen, 2) mindestens zwei sinnvolle Designoptionen vergleichen, 3) Lizenz, Sicherheitszustand und Wartung bewerten, 4) konkreten Commit/SHA der Wiederverwendung protokollieren, 5) Integrationstest und neue negative Tests schreiben, 6) Review und Copyright-/Lizenzhinweise erhalten.

**Lizenzgrenze:** Das lokale Desktop-Commander-MCP-Repository ist MIT; das separate **Remote Desktop Commander** Repository hat eigene proprietäre Einschränkungen, sein Service ist nicht OSS. Nicht die proprietäre Serverimplementierung, Website, Markenidentität oder Assets übernehmen. Open-Source-Lizenzen nicht durch unsere MIT-Datei überschreiben. Siehe [SOURCES](../research/SOURCES.md) und [REUSE-LICENSES](../governance/REUSE-LICENSES.md).

## 6. GitHub Governance und Automatisierung

Repository: https://github.com/lxcoding95/desktop-control; owner `lxcoding95`; public; MIT; `main` protected via [Protect main](https://github.com/lxcoding95/desktop-control/rules/25569795). Pull Requests erforderlich, Force Push/Deletion eingeschränkt, Review-Konversationen auflösen, nur Squash-Merge, 0 erzwungene unabhängige Approvals bis echte Reviewer existieren, kein Bypass. Auto-Merge aus, automatische Löschung gemergter Branches an. **GitHub-App All repositories** auf Owner-Wunsch, alle Aktionen dieses Projekts dennoch auf den genannten Repo-Pfad einschränken.

**Issue-Labels:** `type:*`, `priority:*`, `status:*`, `area:*`; keine Duplikate. **Milestones:** sechs geordnete Sessions, siehe [ROADMAP](../../ROADMAP.md). **Projects:** `Desktop Control Development`, 6+ Statusansichten/Felder, Issues #1–#10 verknüpfen. Project #3: Titel, private Sichtbarkeit, Repository-Link, sechs Statuswerte, Priority/Area und Board/Table/Roadmap am 22.10.2026 verifiziert; Audit und Automationsnachweise in Issue #4.

**Change flow:** issue -> Akzeptanzkriterien/Risiko -> branch -> kleine Commits -> PR -> Code-/Sicherheits-/Dokumenten-Prüfung -> reale Testausgaben -> Squash unter Ruleset -> Verifikation auf main -> Issue-/Projektstatus aktualisieren. Entwickler dürfen keinen Merge-Blocker durch Deaktivieren des Rulesets umgehen.

**Vor produktiver CI:** [SEC-GATE-001](https://github.com/lxcoding95/desktop-control/issues/1) mit vollständigen verifizierten Action-SHAs, Policy enforced, ggf. GitHub Workflow-Lockfiles als stärkere zusätzliche Option evaluieren; [CI-GATE-001](https://github.com/lxcoding95/desktop-control/issues/2) real grün; Required Status Checks nur für stabile verifizierte Jobs; CodeQL, Dependabot, Secret/Push Protection, Supply-Chain-Analyse, Tests Win/Linux. Freie oder kostenpflichtige Agenten nur nach separater Kosten-/Rechteprüfung. Secrets ausschließlich in GitHub-Secrets/OS Secret Store, keine Tokens im Chat, Repo, Workflow-Logs.

**Release:** [REL-GATE-001](https://github.com/lxcoding95/desktop-control/issues/3): SemVer, changelog, reproduzierbare Builds wo möglich, Checksummen, Signaturen/Attestations, SBOM, Third-Party Notices, package/install/uninstall Tests, downgrade/rollback, Windows/Linux Smoke, Security Review, explizites Release Go/No-Go. Keine erfundenen grünen Badges.

**Admin-Zugang:** [ADMIN-GATE-001](https://github.com/lxcoding95/desktop-control/issues/4) enthält Restarbeiten. Die bestehende lokale GitHub-CLI-Anmeldung ermöglicht administrative API-Zugriffe; Project-Workflows wurden zusätzlich in der angemeldeten UI geprüft. Keine neuen Tokens oder zusätzlichen Gebühren.

## 7. Sechs Entwicklungssitzungen – festes Zeitbudget

**Plan:** sechs Sitzungen, maximal je 25:00 Minuten, Ziel je 23:30 aktive Arbeitszeit (94 %). **Keine künstliche Verlängerung**, kein falsches Protokoll; bei Tool-/Nutzungsgrenzen früher stoppen und den Zustand verifizieren. Zeitangaben nur aus ausdrücklich protokollierten lokalen Zeitpunkten mit Zeitzone; eine pausierte Sitzung bleibt dieselbe Sitzungsnummer.

| # | Issue / Milestone | Minimaler, überprüfbarer Meilenstein |
| --- | --- | --- |
| 1 | [#5 Foundation & Architecture](https://github.com/lxcoding95/desktop-control/issues/5) | ADR, Anforderungen, Tool-Schema/Policy-Vertrag, erreichbarer lokaler Entwicklungsweg festgelegt und getestet |
| 2 | [#6 MCP Core & Connectivity](https://github.com/lxcoding95/desktop-control/issues/6) | ein autorisiertes read-only Tool wirklich über MCP auf Win/Linux-Testumgebung aufgerufen |
| 3 | [#7 Filesystem & Terminal](https://github.com/lxcoding95/desktop-control/issues/7) | Kern-Tools mit Scope/Timeout/Cancellation/fehlerhaften Eingaben getestet |
| 4 | [#8 Desktop & Browser](https://github.com/lxcoding95/desktop-control/issues/8) | mindestens ein nachweisbarer UI- und Browser-Pfad pro deklarierter Plattform |
| 5 | [#9 Security, Packaging & Installation](https://github.com/lxcoding95/desktop-control/issues/9) | Rechte/Pairing/Install-/Uninstall- und negative Tests, geprüfte Paketierung |
| 6 | [#10 Integration & Quality](https://github.com/lxcoding95/desktop-control/issues/10) | Integrationsbericht, Mängelliste, Release-Readiness mit expliziter Go/No-Go-Entscheidung |

**Kein Releaseversprechen:** Vollständige Konkurrenzparität und Produktionsreife in 150 Minuten sind nicht zuverlässig zu garantieren. Alle unbeendeten Anforderungen bleiben Issues und werden in späteren Entwicklungszyklen abgearbeitet. „Done“ nur bei nachweislich erfüllten Acceptance Criteria.

### Sitzungseintritt (erst auf expliziten User-Befehl)

1. Lade dieses Dokument, [CHAT-CONTINUITY](../governance/CHAT-CONTINUITY.md), [PROJECT-STATE.json](../governance/PROJECT-STATE.json) und GitHub-Issue der aktiven Sitzung.
2. Prüfe GitHub live: default-Branch-SHA, offene PRs, Arbeitsbranch, CI-Gates, Work-Admin-Blocker. Korrigiere widersprüchliche/veraltete Daten per PR/Issue.
3. Sichere Sitzungs-ID, explizite Startzeit Europe/Berlin plus UTC, Start-Commit, verfügbare Restzeit, konkrete Akzeptanzkriterien im Issue und `SESSION-STATE.md` des Arbeitsbranches.
4. Arbeite kurze überprüfbare Änderungen; Checkpoint nach jeder zusammenhängenden Änderung, spätestens ungefähr alle fünf Minuten sofern möglich.
5. Am Ende (oder vor Kontext-/Quota-Wechsel) speichere mindestens Commit/Branch, Issue-Kommentar, nächsten Befehl, Teststatus, Blocker, Restzeit und eine klare Übergabenachricht.
6. Merge nur, wenn die Regeln erfüllt sind; sonst offen lassen und von neuem Chat unter derselben Session-ID fortsetzen.

### Neuer Chat mitten in Session 2/3/etc.

Ein neuer Chat startet niemals automatisch die nächste Sitzung. Er identifiziert aus GitHub-/Handoff-Daten die **laufende oder pausierte Sitzung** samt verbleibender Restzeit, öffnet deren Issue und Branch, und setzt **genau denselben Arbeitsauftrag** fort; kein zweites Startdatum, keine doppelten GitHub-Objekte. Falls letzter Commit nicht auf `main`: Branch direkt lesen. GitHub-Zeit und Chat-Zeit sind keine zuverlässige Stopuhr, wenn keine Start-/Stopdaten gespeichert wurden; in diesem Fall Restzeit als **unbestätigt** kennzeichnen und nachfragen, statt Zeit zu erfinden. Ausführliches Verfahren in [CHAT-CONTINUITY](../governance/CHAT-CONTINUITY.md).

## 8. Definition of Ready / Done / Blocked

**Ready:** Problem und Umfang verstanden; Sicherheitsgrenzen klar; Quellen/Lizenzen geprüft; reproduzierbare Testumgebung; Rückfallplan; Akzeptanzkriterien; benötigte Zugänge vorhanden. **Done:** Änderungen im Repository sichtbar; Anforderungen und Negative Tests erfüllt; CI/Review, falls verfügbar, echt bestanden; Dokumentation und Handoff aktuell; keine unerledigten kritischen Blocker. **Blocked:** Rechte/Plan/Plattform fehlen; sichere Alternative nicht verfügbar; Test konnte nicht ausgeführt werden oder Kontextverlust ungesichert. „94 % Zeitausnutzung“ ersetzt kein Qualitätstor.

## 9. Work um 01:00 – getrennte Administration

Owner plant selbst eine spätere Work-Fortsetzung für GitHub Projects und Administration, angedacht **22.10.2026 um 01:00 Europe/Berlin**. Das ist **nicht** durch diesen Chat automatisch geplant oder gestartet. Nach Work-Abschluss: Projektnamen/Felder/Views, Items/Automation, vorhandene Labels/Milestones, Actions-Richtlinie/SHA-Pinning-Bedingungen und CodeQL-Konfiguration lesen und verifizieren; anschließend [ADMIN-GATE-001](https://github.com/lxcoding95/desktop-control/issues/4) aktualisieren. Kein Desktop-Control-Produktcode und kein Sitzungsstart. Vollständiger ausführbarer Auftrag: [WORK-ADMIN-FINAL](../governance/WORK-ADMIN-FINAL.md).

## 10. Quellen, Projektquellen und Übergabe

- Vollständige öffentliche technische Quelllinks und Lizenzhinweise: [SOURCES.md](../research/SOURCES.md).
- GitHub-Betrieb: [REPOSITORY-OPERATIONS.md](../governance/REPOSITORY-OPERATIONS.md).
- Übergabevertrag: [CHAT-CONTINUITY.md](../governance/CHAT-CONTINUITY.md).
- Snapshot: [PROJECT-STATE.json](../governance/PROJECT-STATE.json).
- GitHub-Sicherheitsgates: [QUALITY-GATES](../governance/QUALITY-GATES.md).
- [Preflight-Report](../governance/PREFLIGHT-REPORT.md).
- Für ChatGPT Project Sources eine Kopie dieses Masters plus Handoff-/Quellenliste hochladen. **Bei älterer Projektquelle muss der neue Chat GitHub Live-Daten bevorzugen.**

## 11. Änderungen / Dokumentstatus

Masterplan v1.0: aus Userentscheidungen, Projektbeschreibung, 29-Tool-Übersicht und aktueller offizieller Dokumentation erstellt. Architektur- und Codeentscheidungen bleiben bis realer Prüfung „proposed“. Der Zweck ist verlässliche Fortsetzbarkeit und Sicherheit, nicht Marketing oder eine fingierte Entwicklerorganisation.

### S02 Live-Nachweis — neue separate Verlängerung #2 am 22.10.2026

Dieser Nachtrag ersetzt ältere Aussagen zu fehlender SDK-Umgebung und fehlgeschlagenem Vollbuild: Am Quellstand `8f5333297f47d2969894d03a5f433ac672c6e4f3` bestehen im echten Windows-Checkout `npm ci`, vollständiger Typecheck, 18/18 versionierte Unit-Tests, Build und moderner MCP-stdio-Test (2026-07-28). Zusätzliche Protokollprüfungen bestehen 8/8; positive Aufrufe verwenden eine ausdrücklich synthetische Testidentität und belegen keine native Windows-SID-Integration.

S02 bleibt unvollständig: Zwei zusätzliche Ausführungsgrenztests reproduzieren Adapteraufrufe nach Widerruf bzw. Abbruch vor dem verzögerten Adapterstart (3/5 bestanden, 2 fehlgeschlagen). Keine Produktkorrektur, kein Merge und keine reguläre CI-Aktivierung in diesem Prüfauftrag. Native Plattformmatrix/Lizenzfreigabe bleiben offen. Nur **eine** neue separat erfasste Verlängerung mit maximal 35 Minuten ist für diesen Chat freigegeben; Session 3–6 bleiben gesperrt. [Aktuelle Belege, Uhr und nächster Schritt](../sessions/session-02/EXTENSION-2-2026-10-22.md).
