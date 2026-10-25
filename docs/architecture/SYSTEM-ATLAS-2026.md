# Desktop Control — öffentlicher Systematlas (2026-10-25)

> **Darstellungsstatus:** Architektur + evidenzbasierter Entwicklungsstand, **keine freigegebene Anwendung**. S01 abgeschlossen, S02 noch in Draft PR #22 und M01 private Diagnose historisch nachgewiesen. S03–S06 wurden als formelle Sitzungen nicht gestartet; ausgewählte private Vorarbeiten sind davon unabhängig vorhanden. Die Diagramme unterscheiden *spezifiziert*, *historisch nachgewiesen*, *teilimplementiert/getesteter Draft*, *geplant* und *blockiert*. **Keine privaten Gerätedaten oder Schlüssel enthalten.**

## Leseregel und Legende

- **Spezifiziert** = genehmigte/entworfene Architektur, nicht implementiert.
- **Historisch nachgewiesen** = früherer echter Hosttest; heutige Installation nicht dadurch belegt.
- **Draft getestet** = Code/Test auf PR-Branch, weder abgenommen noch in \`main\` gemergt.
- **Teilprototyp** = begrenzte Implementierung, keine vollständige Client→OS-Abnahme.
- **Geplant** = Sollzustand.
- **Blockiert** = erforderliche Security-, Review- oder Releasefreigabe fehlt.
- Pfeile bezeichnen **beabsichtigte Datenflüsse und Abhängigkeiten**, nicht den Beweis einer bereits funktionierenden Verbindung. **Deny** bedeutet keine Adapterausführung.

## 1. Produkt und lokale Vertrauensgrenzen

\`\`\`mermaid
flowchart LR
  USER["Benutzer: Grants, Widerruf und Not-Aus<br/>Status: UI geplant"]
  AI["ChatGPT / MCP-Client<br/>Status: M01 Diagnose historisch"]
  P["Plugin-Paket P / Tool Discovery<br/>0.0.1-preview.3 privat gespeichert"]
  MCP["Lokaler MCP-Server / stdio<br/>S02: Draft #22, Win/Linux getestet"]
  POLICY{"Pro-Aufruf-Policy<br/>Principal · Tool · Ressource · TTL"}
  B["Lokale Bridge B<br/>Hostabhängige Adapter"]
  FS["Workspace-Dateien / PDF<br/>privater Teilprototyp"]
  WEB["Sichtbarer KI-Browser<br/>eigenes Profil · geplant"]
  DESK["Desktop / begrenztes Terminal<br/>lokale Zustimmung · geplant"]
  OS["Windows SID/ACL/UAC<br/>Linux UID/Portale"]
  AUDIT["Redigiertes Audit / Recovery"]
  AI -->|Tool-Aufruf| P -->|stdio| MCP -->|schema| POLICY
  USER -->|grant/revoke/stop| POLICY
  POLICY -->|erlaubt| B
  POLICY -->|verweigert| AUDIT
  B --> FS & WEB & DESK
  FS & WEB & DESK -->|OS-API, Rechte| OS
  B --> AUDIT
\`\`\`

**Grenze:** Client, Webseiten und Dateiinhalte sind keine vertrauenswürdigen Quellen für lokale Rechte. Browser-Sessions sind getrennt, lokale privilegierte Befehle benötigen die Zustimmung der tatsächlich betroffenen OS-Identität. Kein zweiter KI-Agent und keine verpflichtende Cloud in der privaten Local-first-Phase. [Architektur](OVERVIEW.md) · [Threat Model](THREAT-MODEL.md) · [Browser ADR](ADR-0002-AI-BROWSER.md).

## 2. Produktmeilensteine und ihre Abnahme

\`\`\`mermaid
flowchart LR
 M01["M01 – Private MCP-Verbindung<br/>Historischer Grant / Revoke E2E"]
 M02["M02 – Installation & Rechte<br/>Geplant"]
 M03["M03 – Signierte Updates<br/>Policy/FSM-Draft getestet"]
 M04["M04 – Dateien & Prozesse<br/>Privater Worker-Teilprototyp"]
 M05["M05 – Browser & Desktop<br/>Geplant"]
 M06["M06 – Integrations-/Releasequalität<br/>Blockiert"]
 M07["M07+ – Weitere freigegebene Versionen"]
 M01 --> M02 & M04
 M02 --> M03 & M05
 M03 & M04 & M05 --> M06 --> M07
\`\`\`

**M01–M06 sind Produktlieferziele, nicht die sechs historischen Sitzungen S01–S06.** Eine später getestete Teilfunktion darf ihren Session-Status nicht eigenmächtig verändern. [Produktmeilensteine](../governance/PRODUCT-MILESTONES.md) · [M01 #28](https://github.com/lxcoding95/desktop-control/issues/28) · [M03 #29](https://github.com/lxcoding95/desktop-control/issues/29).

## 3. Sicherer GitHub-/Releaseprozess

\`\`\`mermaid
flowchart LR
  ISSUE["Issue / Scope / Datenschutzklasse"]
  DRAFT["Feature-Branch / Draft PR"]
  CI["Windows + Linux<br/>begrenzte Tests"]
  REVIEW{"Independentes Review<br/>+ erforderliche Checks?"}
  MERGE["Squash nach protected main"]
  RELEASE{"Installer + SBOM<br/>Signatur + Release-Gate?"}
  ACTIVE["Geprüfte Version verfügbar"]
  BLOCK["Blockieren · Befund dokumentieren"]
  ISSUE --> DRAFT --> CI --> REVIEW
  REVIEW -->|Nein| BLOCK
  REVIEW -->|Ja| MERGE --> RELEASE
  RELEASE -->|Nein| BLOCK
  RELEASE -->|Ja| ACTIVE
\`\`\`

**Nachweisgrenzen:** Der universelle CI-Pilot [PR #30](https://github.com/lxcoding95/desktop-control/pull/30) hatte Windows/Ubuntu **19/19**, die signierte Policy/FSM [PR #31](https://github.com/lxcoding95/desktop-control/pull/31) **66/66** je Plattform. Diese Tests belegen **weder** einen Installer **noch** eine vollständige Releasefreigabe. Bei letzter Prüfung: fünf Draft-PRs (#22, #26, #30, #31, #33), keine im Hauptbranch abgenommen; [SEC #1](https://github.com/lxcoding95/desktop-control/issues/1), [CI #2](https://github.com/lxcoding95/desktop-control/issues/2) und [Release #3](https://github.com/lxcoding95/desktop-control/issues/3) offen.

## 4. Sicherer Installations- und Updatepfad (Soll)

\`\`\`mermaid
flowchart LR
  SOURCE["Verifizierte offizielle Quelle"]
  CHECK["OS-Prüfung / Signatur / kompatible Version"]
  LOCAL["Per-user Installation, ohne Standard-Admin"]
  LINK["Plugin P / Bridge B getrennt koppeln"]
  POLICY{"Pflichtversion / lokale Rechte gültig?"}
  RUN["Normale MCP-Funktionen"]
  REPAIR["Diagnose · Widerruf · Update · Reparatur"]
  STAGE["Signierte Bridge B gestaged"]
  HEALTH{"Neustart / authentifizierter Health?"}
  SOURCE --> CHECK --> LOCAL --> LINK --> POLICY
  POLICY -->|Ja| RUN
  POLICY -->|Nein| REPAIR --> STAGE --> HEALTH
  HEALTH -->|Bestanden| POLICY
  HEALTH -->|Fehler| REPAIR
\`\`\`

**Wichtige Trennung:** Ein Update von **B** (lokale Bridge) ersetzt nicht automatisch die hostverwaltete Registrierung des **P**-Pluginpakets. [M03-Draft](https://github.com/lxcoding95/desktop-control/pull/31) implementiert bisher nur isolierte Kryptografie-, Kompatibilitäts- und Zustandsentscheidungen. Echte Update-Installation, Start/Health-Receipts, OS-Trust-Root, Rollback und Host-P-Refresh sind offen.

## Statusregister: Ist → Soll → prüfbare nächste Aktion

| Bereich | Ist (belegt) | Soll | Nächste Abnahme |
|---|---|---|---|
| S02 MCP Core | Draft #22, historische Win/Linux-Tests | geprüfter MCP-Basiskern in main | unabhängige Security- und Datenschutzreview, aktuelle E2E-Matrix |
| M01 Private Verbindung | Preview gespeichert, echter historischer diagnose.read/deny nach Widerruf | stabiler aktueller Host | aktuelle Installation/Grant-Revocation und Tool Discovery prüfen |
| M02 App/Installer | Architektur | per-user Setup/Recovery/UI | native Win/Linux Install-/Uninstall-Sicherheit |
| M03 Update-Policy | Draft #31, CI 66/66 je OS | signierte gebündelte B-Updates und unabhängiger P-Zyklus | vertrauenswürdige Schlüssel, Checkpoint, E2E-Staging/Rollback |
| M04 Dateien/PDF | privater Worker teils isoliert getestet | hostgebundene OS-sichere Tools | Workspace-Races, Symlinks, Grant und Widerruf |
| M05 Browser/Desktop | Browser-ADR, UI-Entwurf | sichtbares eigenes Profil, black cursor, Esc | Origin/Account-/Desktop-Consent-E2E |
| M06 Qualität | Draft-CI-Pilots und offene Sicherheitsgates | verlässliche main-CI, SBOM, Release-Signaturen | #1 / #2 / #3 nach echten Checks schließen |

## Pflege- und Informationssicherheit

Diese Sicht ist ein **Snapshot 2026-10-25**, kein automatisch aktualisierter Projektmonitor. Bei neuen Tests/Commits alle Zustände, Quellen und Abhängigkeiten neu prüfen; kein grüner Status aus bloßen Planungen. Keine vollständigen privaten Pfade, persönlichen Geräte- oder Nutzerdaten, Signing Private Keys, Konten oder Browserprofile veröffentlichen.

**Weiterführend:** [GitHub-Quellen](https://github.com/lxcoding95/desktop-control), [MCP-S02](https://github.com/lxcoding95/desktop-control/pull/22), [M01-Integration](https://github.com/lxcoding95/desktop-control/pull/33), [Update-Prototyp](https://github.com/lxcoding95/desktop-control/pull/31). Ein reichhaltiger interaktiver Offline-Atlas mit vier öffentlichen sowie sechs nicht-öffentlichen Karten, Zoom/Pan, Detailfeldern und Legenden wird **getrennt von dieser GitHub-Markdown-Version** verwaltet.
