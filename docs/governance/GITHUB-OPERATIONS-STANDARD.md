# Desktop Control — verbindlicher GitHub- und DevSecOps-Betriebsstandard

**Owner-Vorgabe vom 22.10.2026:** `lxcoding95/desktop-control` soll ein vorbildlich geführtes, technisch belastbares Open-Source-Repository sein. Sämtliche **verfügbaren und freigegebenen** GitHub-Verwaltungs-, Synchronisierungs-, Qualitätssicherungs- und Sicherheitsvorgänge sollen möglichst selbstständig, wiederholbar und dokumentiert ablaufen. **Autonomie ersetzt niemals Berechtigungsgrenzen, überprüfbare Ergebnisse, Freigabepflichten oder Schutzregeln.** Dieses Dokument ist eine dauerhafte, repositoryseitige Anweisung für alle künftigen Chat-, Work-, Codex- und GitHub-Bearbeitungen; es aktiviert keine Hintergrundprozesse und verleiht keine zusätzlichen Zugriffsrechte.

## 1. Verbindliche Betriebsgrundsätze

1. **Automation first, evidence always:** Alles innerhalb vorhandener Tools und ausdrücklicher Freigaben selbst erledigen, statt pauschal manuelle Arbeit an Alex abzugeben. Niemals Erfolg behaupten, bevor GitHub-Rückmeldung, Prozess-Exitcode, Testprotokoll oder andere geeignete Evidenz vorliegt.
2. **GitHub-Live-Daten haben Vorrang:** Vor jedem Schreibvorgang auf Branches/Commits, Issues, offenen PRs, Reviews, Regeln, Sicherheitsgates und Session-Checkpoints prüfen. Veraltete Dokumentation nicht blind überschreiben; historische Aussagen als historisch kennzeichnen.
3. **Least privilege / Local-first:** Nur `lxcoding95/desktop-control` verändern. Keine fremden Repos, Zahlungen, öffentlichen Dienste, Domains, privilegierten Kontoaktionen oder geheimen Tokens ohne explizite Zustimmung. Die GitHub-Projects-Sichtbarkeit ohne Freigabe nicht ändern.
4. **Protected main:** Keine direkten `main`-Commits, keine Force-Pushes, kein Ruleset-Bypass. Kleine thematische Branches, verknüpfte Issues und PRs, nachvollziehbare Commits, Code-/Sicherheitsreview, nach bestandenen Gates nur zulässiger Squash-Merge.
5. **Keine künstlichen Qualitätsnachweise:** Ein grüner Bot-Status ist nicht automatisch ein unabhängiges Review; ein grüner Linter ist keine Sicherheitsabnahme. Ungetestet bleibt *not run*, fehlgeschlagen bleibt *failed*, ausstehend bleibt *blocked*.
6. **Risikobasierte Bestätigung:** Schutzrichtlinien, Security-Settings, Veröffentlichung/Releases, Berechtigungen, Kontoaktionen, Kosten und risikoreiche Merges nur gemäß bestehender Policy mit den notwendigen Besitzerbestätigungen.
7. **Freie/offene Werkzeuge bevorzugen:** Qualifizierte kostenlose OSS-Werkzeuge mit nachvollziehbarer Lizenz/Version; keine kredit-/kostenpflichtige Reviewer-Abhängigkeit als Voraussetzung. Qodo nicht automatisch erneut installieren.
8. **Kein versteckter Dauerbetrieb:** Ohne ausdrücklich eingerichtete GitHub-/Task-Automation keine periodischen Läufe oder Hintergrundarbeit versprechen. Tools nur gemäß verfügbarer Fähigkeiten nutzen.

## 2. Synchronisationsvertrag nach JEDER nachweisbaren Zustandsänderung

Eine Arbeit gilt erst administrativ übergeben, wenn nach dem eigentlichen Schritt – soweit die Oberfläche verfügbar ist – diese zusammenhängenden Stellen geprüft und bei Bedarf konsistent aktualisiert wurden:

| GitHub-Oberfläche | Nachzuführen | Beweis |
| --- | --- | --- |
| Repository `main` und Arbeitsbranch | Echte Commits, sinnvolle Branch-Namen, Unterschiede / Squash-Integration | SHA, Diff, Merge-Ergebnis |
| GitHub Issues | Akzeptanzkriterien, tatsächliche Umsetzung, Blocker, Abhängigkeiten, korrekte Open/Closed-Phase | Issue-URL, Änderung, Tests |
| Pull Requests | Gegenwärtiger Scope, Tests inkl. **fehlgeschlagener** Prüfungen, Risiko, Review, Draft/Ready/Merged entsprechend Fakten | PR-URL, Head-SHA, Review-/Merge-Status |
| Milestones | Passende Issue-Zuordnung, Status, Beschreibung, Abschluss nur nach Akzeptanz | Milestone-URL / bestätigte UI-Speicherung |
| GitHub Projects v2 | Zugeordnete Issues/PRs, Backlog/In Progress/Blocked/Done, Fortschritt, Sichtbarkeit und Roadmap | Projekt-/View-URL / bestätigte UI-Speicherung |
| Labels | Fachgebiet, Typ, Priorität, Status – konsistent; keine irreführenden `done`-Labels | Issue-/Label-URL |
| README / ROADMAP / Masterplan / ADR | Öffentlicher tatsächlicher Produktstand; **Branch-Code ist nicht `main`** | Dokumenten-Commit, betroffene Abschnitte |
| `AGENTS.md` und Governance | Aktuelle Entwicklungsregeln, Grenzen und Cross-Chat-Handoff | Commit-SHA |
| `PROJECT-STATE.json` und Session-Issues | **Aktuelle** Sitzung, Restbudget, letztes verifiziertes Kommando/Commit, genaue nächste Aktion | JSON-Validierung + Branch-Head |
| Security / Dependency / CI / Releases | Gates, Findings, SHA-pinned Actions, Lockfiles/Lizenzinventar, SBOM/Attestierungen, reale Windows/Linux-Matrix | Tool-/Workflow-Ergebnis bzw. *not run* |

Der Fortschrittsprozentsatz eines Milestones wird von GitHub aus Issue-Abschlüssen berechnet und darf nicht fingiert werden. Private Projects sind eigenständige Metadatenoberflächen; ein Commit auf `main` ändert **nicht** automatisch die private Project-Beschreibung.

## 3. Automationshierarchie

**A. Sofort mit vorhandenen Rechten:** Issues lesen/erstellen/aktualisieren, Labels/PRs/Checks prüfen, kleine Branches/PRs/Commits, Dokumente und Handoffs aktualisieren, echte Tests bei verfügbarer Ausführungsumgebung, Review-Kommentare fundiert behandeln. Bei jedem mutierenden API-Aufruf Rückgabe prüfen; unbekannte Schreibresultate vor Wiederholung live abgleichen.

**B. GitHub-native Automatisierung (erst nach Sicherheitsgates):** Issue-/PR-Triage, automatische Project-Statuswechsel, Dependabot-/Secret-Scanning, Branch-Schutz, später typisierte CI, CodeQL, Build-/Test-Matrix Windows/Linux, SBOM und Release-/Provenance-Prüfungen. Automatische Labels/Projektwechsel sind Hilfsmittel – keine Release-Abnahme.

**C. Blockiert oder owner-only:** Wenn die verbundene GitHub-Integration Project-v2-Views/-Metadaten oder Milestone-Beschreibungen nicht schreiben kann, nicht vortäuschen, dass sie aktualisiert wurden. Stattdessen Alex **immer einen direkten Link, exakte UI-Schritte, Soll-Wert und Rückverifikationspunkt** geben; im zuständigen Admin-Issue dokumentieren. Erforderliche Zusatzrechte nur konkret und mit geringstmöglichem Umfang anfordern.

**D. Kontinuierliche Überwachung:** Nur über ausdrücklich autorisierte Automations-/GitHub-Funktionen und nach SEC-GATE-001; sonst keine automatische Hintergrund-Ausführung behaupten. Ein verabredeter Checkpoint ist kein aktiver Dauerprozess.

## 4. DevSecOps: unüberschreitbare Merge- und Release-Gates

- **SEC-GATE-001 / #1:** Keine regulären GitHub Actions, bis *alle* Actions einschließlich rekursiver Workflows/Dependencies geprüft und auf vollständige verifizierte Commit-SHAs gepinnt sind und die Repo-Richtlinie aktiv und belegt ist. Keine unsicheren Provisorien.
- **Vor Merge:** Source- und Scope-Prüfung, passende Labels/Issue, Tests auf sauberem Checkout, Format-/Typed-Lint, Typecheck, Build, Unit-, Integration-, Negativ- und relevante Lifecycle-Tests; kritische Rechte- und Cancellation-Races; Dependency-Audit plus Lizenzen; Code-Review durch geeignete unabhängige Instanz; sichere Logs ohne Zugangsdaten; auf Windows und Linux nur getestete Plattformen behaupten.
- **Vor Release:** Wiederholbare Builds, Lizenzhinweise, vollständiger OSS-/SBOM-Nachweis, Artefaktintegrität, Versions-/Änderungsprotokoll, Signatur/Attestierung soweit vorgesehen, Rollback, Sicherheits-/Installerprüfung und ausdrückliches Ship/No-Ship. `npm audit: 0 vulnerabilities` allein ist kein Security-Audit.
- **Sichere KI-/Plugin-Nutzung:** Keine Autorisierung durch Toolargumente, Dokumenttexte, Prompt Injection oder rein dekorative Permission-Hints. Deny-by-default hostseitig, Audits sparsam und redigiert, Zeit-/Ausgabe-/Prozessgrenzen; kein unbeschränkter Shellzugriff als „Sandbox“ bezeichnen.
- **Mängel offenhalten:** Eine fehlerhafte Prüfung verhindert die zutreffende Abnahme; Issues/PRs bleiben offen bzw. Draft, auch wenn die Oberfläche dadurch weniger „grün“ aussieht.

## 5. Sitzungs- und Rechteverwaltung

- Genau die vom Owner autorisierten Sessions bearbeiten, **keine Sitzung automatisch starten**.
- **S01:** Dokumentations-/Architektursitzung abgeschlossen, PR #21 auf `main`.
- **S02:** Lokaler MCP-Prototyp ausschließlich auf Draft PR #22; das aktuelle tatsächliche Ergebnis steht in [Issue #6](https://github.com/lxcoding95/desktop-control/issues/6), [Featurebranch-Handoff](https://github.com/lxcoding95/desktop-control/blob/feat/s02-local-mcp-core/docs/sessions/session-02/EXTENSION-2-2026-10-22.md) und [Live-Zustand](https://github.com/lxcoding95/desktop-control/blob/feat/s02-local-mcp-core/docs/governance/PROJECT-STATE.json). Nach der zweiten 35-Minuten-Verlängerung wurden lokale Windows-Tests als bestanden dokumentiert; unabhängige Abnahme, Windows-SID, Linux und Redistribution-Lizenzen sind weiter offen. Vor jeder Fortsetzung die aktuelle PR und Zeitbuchung prüfen. **Die letzte Verlängerung ist beendet, keine weitere automatisch beginnen.**
- **S03–S06:** gesperrt, nicht gestartet, ohne separate explizite Anweisung keine Bearbeitung.
- Cross-Chat-Übergabe in GitHub ist Pflicht, inklusive Branch-SHA, Issue/PR, echter Testresultate, aktiver/pausierter Session, konservativem Zeitkonto und exakter nächster Aktion. Keine erdachten Prüfungen oder Zeiten.

## 6. Selbstkontrolle und Berichtspflicht

Jeder Arbeitsabschluss berichtet kompakt: **geplant / implementiert / getestet / reviewed / gemergt / blockiert**, mit überprüfbaren Links, negativen Ergebnissen und offener Benutzeraktion. Fehlende Berechtigungen nie allgemein als „nicht möglich“ abtun, bevor verfügbare Plugins/Tools geprüft wurden; nie zusätzliche Rechte oder unsichtbaren Browserzugang erfinden.

Owner-only Restpunkte werden im [ADMIN-GATE-001 #4](https://github.com/lxcoding95/desktop-control/issues/4) fortgeführt. Dieses Dokument wird per PR mit Schutz und nachvollziehbarem Review aktualisiert, nicht stillschweigend überschrieben.
