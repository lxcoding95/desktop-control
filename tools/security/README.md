# Desktop Control S02 — lokale Open-Source-Sicherheitsprüfkette

**Stand 24.10.2026:** Ersatzkonfiguration für das vom Eigentümer deinstallierte CodeRabbit. Auf `feat/s02-local-mcp-core` vorbereitet. **Keine tatsächliche Installation auf Alex' Windows-Rechner oder in dessen Docker-Container wurde durch diesen Chat durchgeführt.** Die Download-/Scan- und Positivkontrollbefehle müssen in einer ausführbaren Work-/Terminal-Umgebung mit Netzwerkzugang erstmals ausgeführt und protokolliert werden. Die Tools ersetzen keinen unabhängigen semantischen Code-Review.

## Werkzeuge (reproduzierbar festgelegt)

Die offizielle GitHub-Release-API wurde live abgefragt. [toolchain.lock.json](toolchain.lock.json) hält jeweils den konkreten Release-Asset-Namen, die Release-URL und die vom Herausgeber veröffentlichte vollständige SHA-256-Prüfsumme **für Windows x64 und Linux x64** fest:

- [Opengrep 1.30.0](https://github.com/opengrep/opengrep/releases/tag/v1.30.0): LGPL-2.1, lokale statische Regeln; diese Konfiguration nutzt ausschließlich selbst verwaltete [rules.yml](rules.yml), keine extern bezogenen Regelsets oder Uploads
- [OSV-Scanner 2.7.0](https://github.com/google/osv-scanner/releases/tag/v2.7.0): Apache-2.0, liest `package-lock.json` und fragt OSV-Sicherheitsdaten über das Netzwerk ab; **keine Offline-/Datenschutzgarantie**
- [reviewdog 0.21.2](https://github.com/reviewdog/reviewdog/releases/tag/v0.21.2): MIT, wandelt SARIF lokal in RDJSON um; hier **kein GitHub-Reporter, Token, PR-Kommentar oder SaaS-Review**
- Vorhandene ESLint-/TypeScript-/Unit-/SDK-Protokoll-Prüfungen bleiben Bestandteil von `npm run verify`.

Der Runner lädt die festgelegten offiziellen Release-Assets ausschließlich nach `tools/security/.installed/`, prüft heruntergeladene Dateien auf SHA-256-Übereinstimmung und verweigert nicht unterstützte Plattformen. Extrahierte Executables werden **nicht global** installiert oder auf den System-PATH gesetzt; Windows-Administratorrechte sind nicht nötig.

## Ausführung unter Windows PowerShell und Debian-Linux

Im **sauberen Checkout** auf dem zu prüfenden PR-HEAD (und mit Node >= 22.19):

```sh
git fetch origin
git switch feat/s02-local-mcp-core
git pull --ff-only
git rev-parse HEAD
npm ci --ignore-scripts
node tools/security/run-local.mjs install
node tools/security/run-local.mjs selftest
node tools/security/run-local.mjs scan
npm run verify
npm audit --json
```

**Pflichtkontrollen:**

1. `install`: Nur wenn die **gepinnten offiziellen Artefakte** heruntergeladen und geprüft wurden und jedes Tool mit `--help` exit0 reagiert, ist *lokale Installation* belegt. Freigegebene `installer`-Skripte von Upstream werden nicht blind über `curl | bash` oder `irm | iex` ausgeführt.
2. `selftest`: Der nicht ausführbare, bewusst unsichere `fixtures/intentionally-unsafe.ts` enthält `eval`; Opengrep muss den Verstoß finden und wegen `--error` mit Exit1 antworten. Der Wrapper bewertet das als **bestandene Erkennungsprüfung**. Ein leerer oder falsch konfigurierter Scan ist kein PASS.
3. `scan`: Opengrep prüft S02-Produktquellcode unter `packages/mcp-server/src`, OSV prüft den versionierten `package-lock.json`, reviewdog formatiert lokale SARIF-Befunde. Bei jedem Toolfehler/Befund gilt der Gesamtstatus als FAIL/BLOCKED, bis der konkrete Befund fachlich beurteilt ist.
4. Ergebnisse in `tools/security/.reports/`, das lokal per `.gitignore` ignoriert ist. `summary.json` liefert Laufzeit, HEAD, Befehle und tatsächliche Exitcodes. Prüfe ggf. Reports vor jeder manuellen Übernahme nach GitHub auf sensible Daten.
5. Wiederhole alle Schritte auf Windows 11 x64 und Debian12 x64, erfasse Tools-Versionen und Hashes, kontrolliere **echten Scanumfang** einschließlich `.mts`-Quelldateien, behebe Findings ohne pauschale Rule-Suppression.
6. Ein **unabhängiger** semantischer/security Reviewer soll die finalen Änderungen lesen, insbesondere Autorisierung, Prozessidentität, Widerruf, Cancellation, Windows Native Token Helper und mögliche Supply-Chain-Probleme. Scanner/Formatter allein können dieses Gate **nicht schließen**.

## Sicherheitsgrenzen

- Die laufende S02 ist weiterhin **nicht final abgenommen**; [Draft PR #22](https://github.com/lxcoding95/desktop-control/pull/22) und [Issue #6](https://github.com/lxcoding95/desktop-control/issues/6) bleiben offen.
- **SEC-GATE-001 (#1):** Keinerlei GitHub Actions / unpinned Workflow / automatische PR-Report-Uploads aktivieren. Keine Tokens in Logs, keine fremden Repositories ändern.
- **Keine Qodo-/CodeRabbit-Installation** oder Lizenz-/Accountzahlungen. Der Eigentümer hat die CodeRabbit-GitHub-App deinstalliert; die Verbindung wird nicht automatisch ersetzt.
- [S03–S06](https://github.com/lxcoding95/desktop-control/issues) bleiben ausdrücklich gesperrt. Keine Filesystem-/Shell-/Browser-/Installer-Produktfähigkeiten hinzufügen.
- Kein veröffentlichter Release, keine Zulassung zu Redistribution und kein „production ready“ aus bloßen Scannerergebnissen ableiten.

## Nächste verifizierbare Aktion

Ein lokaler Work-Lauf mit Zugriff auf die vorhandenen Windows- und Linux-Docker-Checkouts installiert diese Toolchain, führt den Positivkontrolltest, echte Quell-/Lockfile-Scans und `npm run verify` aus und aktualisiert danach Issue #6/PR #22/Session-Checkpoint. **Vorher ist die neue Prüfkette lediglich im Branch eingerichtet, nicht auf Alex' Maschine installiert oder als getestet/aktiviert nachgewiesen.**
