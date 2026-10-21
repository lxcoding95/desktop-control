# ChatGPT Cross-Chat Continuity Contract

**Nicht verhandelbar:** Der Chatverlauf allein ist keine verlässliche Zustandsspeicherung. ChatGPT-Projektquellen sind ein **Basis-Snapshot**; das GitHub-Repository und aktive PRs/Issues sind der **aktuelle operative Zustand**. Session 1–6 starten nur auf ausdrückliches Nutzerkommando. Vorbereiten heißt nicht starten.

## A. Wo welcher Zustand liegt

| Zustand | Dauerhafter Ort | Aktualisierung |
| --- | --- | --- |
| Gesamtziele/Entscheidungen | `docs/master/PROJECT-MASTERPLAN.md` | nach genehmigter Änderung per PR |
| Baseline/Projekt-Snapshot | `docs/governance/PROJECT-STATE.json` | per PR, vor/nach großen Phasen |
| Laufende Session | Issue #5–#10 + Arbeitsbranch `docs/sessions/session-N/SESSION-STATE.md` oder vergleichbar | zu Beginn, nach wichtigen Änderungen und vor Verlassen |
| Unfertiger Code | aktiver Feature-Branch + offene PR | jeder Commit |
| Review- und Testbelege | GitHub Checks / CI URLs / PR-Konversation | jede Validierung |
| Admin-Blocker | Issue #4 | nach jeder Änderung |
| SHA-Pinning-Pflicht | Issue #1 | offen bis live verified |
| Zeitaufzeichnung | aktives Session-Issue + SESSION-STATE | echte Start-/Stopzeiten |

**Wichtig:** Kein Zugriff auf diesen alten Chat wird vorausgesetzt. Kein autonomes Fortsetzen im Hintergrund wird behauptet; ein Nutzer eröffnet/aktiviert den nächsten Chat und gibt den Fortsetzungsbefehl.

## B. Pflicht-Handoff (innerhalb eines bestehenden Arbeitsbranches)

Vor jeder Unterbrechung und spätestens nach einer zusammenhängenden Änderung/ungefähr fünf Minuten (sofern Toolzugang besteht), `SESSION-STATE.md` aktualisieren mit:

```yaml
session_id: S02
session_issue: https://github.com/lxcoding95/desktop-control/issues/6
state: running|paused|blocked|complete
started_at_utc: "ISO8601 or null"
last_checkpoint_at_utc: "ISO8601 or null"
elapsed_active_seconds_verified: null
remaining_budget_seconds_verified: null
base_main_sha: "actual SHA"
work_branch: "feat/..."
head_sha: "actual SHA"
pull_request: null
last_successful_test: "name, command, output URL, timestamp or none"
failed_tests: []
changes_completed: []
changes_pending: []
security_blockers: []
next_exact_action: "imperative action with path/command"
handoff_validated_by: "assistant or human; not an invented reviewer"
```

**Der Text ist ein Schema, keine Aussage über eine existierende Sitzung.** Bei einem Chatlimit möglichst zusätzlich einen Issue-Kommentar mit Commit-SHA, PR, Status und „next_exact_action“ schreiben. Commits auf dem offenen Branch bleiben lesbar, selbst wenn `main` noch unverändert ist. Ein automatisch begonnenes oder abgelaufenes Sitzungsfenster darf nicht frei konstruiert werden.

## C. Algorithmus für einen neuen Chat

1. **Explizite Fortsetzung**: Nutzer schreibt „Desktop Control: Fortsetzen nach Übergabe, keine neue Session starten.“
2. Project Sources/Masterplan lesen. Falls Quellen fehlen: direkt GitHub-Dateien abrufen; nicht nach bereits dokumentierten Antworten fragen.
3. Abrufen: `main` SHA; `PROJECT-STATE.json`; alle offenen PRs/Arbeitsbranches; #4 Administration; #1 SHA-Pinning; Session-Issues #5–#10; letzte GitHub-Checks.
4. Falls ein offener Session-Branch/PR existiert: zuerst dessen `SESSION-STATE.md` lesen; **vor** irgendeiner Dateiänderung Branch-HEAD mit Handoff vergleichen.
5. Wenn Session `running/paused/blocked`: **dieselbe** Session-ID und Issue fortsetzen, keine neue Session eröffnen; Zeitbudget aus echten Zeitstempeln bzw. explizit gemessener Aktivzeit rekonstruieren. Ist Rekonstruktion nicht möglich: `remaining_budget_seconds_verified: null` und Nutzer zur Zeitfreigabe fragen; niemals vermutete Zeiten als Fakten ausgeben.
6. Konflikte (z. B. HEAD fortgeschritten, unbekannter Merge, abweichender PR-Status): keine neuen Commits schreiben, erst reconciliieren. Doppelte Labels, Issues und Meilensteine vermeiden.
7. Arbeiten, Tests, Review, Commit auf demselben Branch oder sauber dokumentiertem Folgebranch. Handoff nach dem ersten verifizierten Schritt aktualisieren.
8. Wenn die Session formal beendet ist: Abschlussbericht mit Evidenz und nächster Session `not_started`. Start der nächsten Session erfordert **neue explizite Freigabe**.

## D. Arbeit über Nutzungslimit/Chatwechsel hinweg

- Ein Chat kann unerwartet mitten in einer Toolaktion abbrechen. Github-Aktionen sind **nicht garantiert atomar über mehrere Aufrufe**.
- Vor Wiederholung eines fehlgeschlagenen Aufrufs zuerst per GitHub lesen, ob der Commit/das Issue/die PR bereits angelegt wurde. Suche via eindeutigen Titel/Issue-Link/SHA; sichere idempotente Wiederaufnahme.
- Mindestens nach Commit: Branch, SHA, PR, Issue und Testpfad dauerhaft festhalten.
- Bei quota-Limit unmittelbar nach einem Toolaufruf: möglicher unbekannter Schreibzustand → zuerst auf GitHub nachlesen.
- Kein GitHub Actions Workflow darf bei normalem PR-Event Schreibberechtigungen oder Geheimnisse an untrusted Fork-Code weiterreichen.

## E. Session-Uhr

`session_id` ist über Chats hinweg stabil. Budget: 1500 Sekunden pro Session, 6 Sessions, Ziel 94 % sinnvoller Nutzung = mindestens 1410 Sekunden **nur sofern wirklich protokolliert**. Nach Ablauf oder unterbrochenem zeitlichen Rahmen nicht heimlich verlängern. UTC-Zeitpunkte mit Zeitzonenbezug speichern; tatsächliche **aktive** Bearbeitungszeit ist nicht mit Chat-Wallclock gleichzusetzen. Fehlerhafte oder fehlende Daten als `unverified` markieren. Pausierte Session-2-Arbeit bleibt Session 2.

## F. Verbindliche Kurzbefehle für neue Chats

**Vorbereitung prüfen, keine Sessions:** „Öffne `docs/master/PROJECT-MASTERPLAN.md`, `docs/governance/PROJECT-STATE.json`, `docs/governance/CHAT-CONTINUITY.md` in `lxcoding95/desktop-control`; gleiche GitHub-Live-Stand mit #1–#10 und offenen PRs ab, ohne Session zu starten.“

**Unterbrochene Session fortsetzen:** „Desktop Control: Setze die zuletzt aktive Sitzung anhand des GitHub-Handoff-Protokolls fort. Lies zuerst `main` + aktiven Arbeitsbranch + Session-Issue + letzten Test/Commit, prüfe Zeitbudget, ändere nichts an anderen Repositories und beginne keine neue Session.“

**Nur Admin-Work:** Siehe [WORK-ADMIN-FINAL](WORK-ADMIN-FINAL.md).

## G. Drift / Quellenkonflikte

Ändert Work Admin-Konfiguration im Browser, reicht ein Screenshot nicht: Regeln/Fields/Projektlinks nach Änderung prüfen und Issue #4 aktualisieren. Ein altes lokales Project-Source-Dokument darf nicht den realen GitHub-Zustand überschreiben. Neue Chat-Instanz meldet Abweichungen vor Weiterarbeit.

## H. Unerreichbare Gewissheit

Kein Chat kann garantieren, dass ein Plattformlimit immer vor dem Abbruch erkennbar ist. Diese Regeln minimieren Verlust, ersetzen aber keine persistenten Commits/Issues. Ebenso können 100 % Fehlerfreiheit oder sechs Sitzungen für Produktionsreife nicht garantiert werden. Quality Gates erfordern reale Nachweise.
