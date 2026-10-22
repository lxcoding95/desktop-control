# SPEC-BC-001 — Isolierter KI-Browser und virtueller schwarzer Cursor

**Projekt:** Desktop Control | **Status:** Produktanforderungen entschieden; Architekturentwurf, noch nicht implementiert | **Stand:** 2026-10-22  
**Haupt-Tracking:** [Issue #14](https://github.com/lxcoding95/desktop-control/issues/14), [Session 4 / Issue #8](https://github.com/lxcoding95/desktop-control/issues/8)  
**Gültigkeit:** Dieses Dokument ist eine Spezifikation für spätere Entwicklungssitzungen; keine Freigabe für Implementierung und kein Start einer Session. **0/6 gestartet.**

## 1. Verbindliche Entscheidungen aus Fragerunde

| ID | Nutzerentscheidung | Technische Auslegung |
| --- | --- | --- |
| BC-D01 | **Nur eigener, getrennter KI-Browser** | Eigene Browser-Instanz / eigener Browserkontext und Profilbereich. Bestehende persönliche Browserfenster, Tabs, Profile und Cookies dürfen nicht automatisch verbunden oder übernommen werden. Keine Browser-Extension-Attachments als Standard. |
| BC-D02 | **Sichtbarer KI-Cursor mit geregelter Bildschirmübernahme** | Schwarzer *virtueller* Pointer in KI-eigenem Browser; im gemeinsamen Desktop nur visuelle Markierung mit geregelter temporärer Eingabeübernahme. Kein Versprechen zweier unabhängiger System-Cursor unter Windows/Wayland. |
| BC-D03 | **Unabhängig weiterarbeiten nur im isolierten KI-Browser** | Nutzeraktivität in persönlichen Fenstern unterbricht isolierte Browseraktionen nicht automatisch. Jede KI-Desktopaktion auf der *gemeinsamen* Sitzung pausiert bei relevanter Nutzerinteraktion. Nutzt der Mensch das KI-eigene Fenster, hat er Vorrang und diese KI-Fensteraktion wird pausiert. |
| BC-D04 | **Schwarzen Zeiger nur bei Mausaktionen anzeigen** | Nur während Hover, koordinatenbasierter Bewegung, Klick, Drag/Drop und ggf. Scroll mit Pointerziel; sonst ausblenden. Eine persistente kleine Aktivitätsanzeige im Tray/Dashboard bleibt zulässig, sie ist **kein** Mauszeiger. |
| BC-D05 | **Website-/App-Einzelerlaubnis und Sitzungsprofile** | Beide Modi konfigurierbar: präzise Regeln pro Domain/App/Capability und zeitlich begrenzte Sitzungsfreigaben; Risiken/Privilegien getrennt freigeben; lokale sofortige Sperre. |

## 2. Korrekte Bedeutung von „zweite Maus“

### Im eigenen KI-Browser

Playwright führt semantische Locator-Aktionen, DOM-Eingaben und Browser-Mausaktionen innerhalb des KI-Browsers aus, ohne die physische Nutzermaus bewegen zu müssen. Der schwarze Cursor wird als **Visualisierung** des aktuell adressierten Elements bzw. der Browserposition gezeichnet. Bei semantischen Locator-Clicks ist die Animation optional zur Veranschaulichung; ihr Bildschirmtreffer ist nicht die Autorisierungsinstanz.

Isolierter Browser bedeutet getrenntes Profil / Cookies / Browserkontext, **nicht** vollständige OS-Sandbox, getrennte Identität auf der Website oder zusätzliche selbstständige KI. Netzwerkzugriff, Downloads, Standort, Clipboard, Browser-Profile und Datei-Uploads erfordern weiterhin Host-Policies.

### Auf dem gemeinsamen Desktop

Windows SendInput nutzt den bestehenden System-Eingabestrom; der schwarze Zeiger kann als Overlay gezeigt werden, darf aber **nicht** als echter unabhängiger Windows-Systemcursor bezeichnet werden. OS-Takeover ist eine zeitlich begrenzte, zugestimmte Steuerung einer gemeinsamen Desktop-Sitzung. Die normale Maus und Tastatur des Menschen haben jederzeit Vorrang. Beim ersten relevanten Benutzer-Ereignis auf diesem gemeinsamen Surface: neue OS-Eingaben sofort unterdrücken, laufende mehrteilige Aktion wenn gefahrlos abbrechen und gedrückte synthetische Tasten/Buttons kontrolliert freigeben. Bereits ausgelöste irreversibel wirkende Aktionen können nicht pauschal rückgängig gemacht werden.

Linux X11-Multi-Pointer kann experimentell abweichen, ist **keine** plattformübergreifende Mussfunktion. Wayland nutzt für gemeinsame Desktopsteuerung nach Compositor-Fähigkeit ggf. XDG RemoteDesktop Portal und libei, mit lokal sichtbarer Zustimmung. Bildschirmweites transparentes Overlay/„always on top“ unter Wayland ist nicht zugesichert. Fallback: sichtbare Aktivitätsmarkierung innerhalb unseres KI-Browserfensters bzw. Dashboard statt globalem Overlay.

## 3. Abgrenzung und Normative Mussregeln

- **Keine Übernahme vorhandener Nutzer-Browserprofile** (z. B. regulärer Chrome/Edge/Firefox, eingeloggte persönliche Tabs), keine ungefragte Übernahme von Cookies, Passwortmanagern oder Lesezeichen.
- **Browsersteuerung ist vorrangig**: Accessibility-Snapshot + Locator, dann geprüfte DOM-Eingaben, dann Screenshot/Koordinaten-Fallback nur mit passendem Scope. Native OS-Input ist niemals die Standardimplementierung von Browseraktionen.
- **Konkurrierende Eingaben werden isoliert:** Benutzer kann andere Programme mit der weißen Maus bedienen, während KI-Browseraktionen im eigenen Kontext stattfinden; keine globale Tastatur-/Mauseingabe für KI-Browseraktionen.
- **Keine unbestätigten Aussagen zur Focus-Steuerung:** Headed Browser, native Dialoge, Dateiauswahl und OS-Popups können trotzdem Fokus beeinflussen. Fällt eine Aktion auf einen nativen Dialog zurück, zunächst pausieren und lokal um Zustimmung bitten.
- **Nur bei Pointeraktionen sichtbar:** schwarze visuelle Markierung darf keine Klicks oder Tastatur abfangen (pointer-events: none oder plattformspezifisch durchlässige Overlay-Lösung). Wird Overlay beim Navigieren oder in Sonderseiten unmöglich, protokollieren und im Dashboard anzeigen, nicht still falsches Cursorfeedback behaupten.
- **Gesperrte Domains dürfen nicht durch Redirects, Subrequests oder WebSocket-Verbindungen umgangen werden.** Upstream `--allowed-origins` ist laut Playwright nur Komfortschutz, keine harte Sicherheitsgrenze. Host-seitige Policy, soweit nötig ergänzende Netzwerk-Isolation und überprüfbare Autorisierung für externe Datenübertragungen sind erforderlich.
- **Default-deny für Eingriffe:** Zahlungen, Käufe, Nachrichten versenden, Dateien hochladen, geheime Eingaben, Konto-/Sicherheitsänderungen, Download-Ausführung und administrative Aktionen brauchen gesonderte relevante Genehmigung.
- **Kein OS-Credential- oder Clipboard-Zugriff durch Browser-Plugins automatisch**; sensible Daten in Audit/Traces/Screenshots redigieren.
- **Always-available Stop:** Tray und Dashboard erlauben „Pause“, „Stop“, „Berechtigung widerrufen“. Stop muss weitere Kommandos nach Widerruf blockieren und laufende asynchrone Aufgaben abbrechen, soweit technisch möglich.

## 4. Geplante Module (noch kein Code)

```text
ChatGPT / anderer MCP-kompatibler Client
  -> Desktop Control MCP (versionierte Tool-Schemas)
  -> Request AuthN + Host Policy (Benutzer, Gerät, Site/App, Tool, Zeit, Risiko)
  -> Session Manager / auditfähige Action IDs
  -> Operation Arbiter:
       BrowserOnly -> Playwright MCP/Playwright in eigener Browser-Instanz
       DesktopTakeover -> lokaler OS-Adapter NACH zeitlich begrenzter Freigabe
  -> Cursor Visualizer (schwarzer virt. Zeiger NUR bei Mausaktionen)
  -> Action Verifier -> typisierte Ergebnis-/Fehlerantwort an ChatGPT
Tray + lokales Dashboard: Berechtigungen, Browserprofile, Status, Pause, Not-Aus
```

**Möglichst wiederverwenden:** Playwright MCP/Playwright zuerst auf lizenzkonforme direkte Wiederverwendung oder Wrapper prüfen. Für native Desktopsteuerung Windows UI Automation; für X11/Wayland OS-Schnittstellen nach realen Tests. Eigenentwicklung beschränken auf Policy-/Session-Orchestrierung, Cursor-Visualisierung, Fokus-/Interaktionsschutz, spezifische MCP-Tools und UI. Architektur „Electron als Overlay“ ist *Kandidat*, noch keine technische Festlegung; auch Tauri oder Browser-eigene transparente UI prüfen.

### Geplanter Cursor-Visualizer

Input: Session-ID, Browserfenster-/Frame-ID, Viewportgröße, Zoom, DPR, Ziel-Bounding-Box oder Pointerkoordinaten, Bewegungs-/Aktionstyp, Action-ID.
Output: Darstellung als schwarzer Cursor im KI-Browserfenster für die Dauer der Aktion und danach verschwinden. Bei DOM-Locatoraktionen Bounding-Box/Elementmitte berechnen; bei Scroll, Layoutshift, Resize, Navigation, Cross-Origin-Frames, Multi-Monitor oder Browserchrome spezielle Koordinatenbehandlung und Fallback.

**Synchronisation:** Visualisierung wird aus demselben autorisierten Action-Event ausgelöst wie die echte Playwright-Aktion; ein sichtbarer Cursor allein bedeutet **nicht**, dass die Aktion gelang. Verifikation erst nach Action-Response und Zustandsprüfung. Overlay darf nicht in personenbezogene Screenshots oder untrusted Webseiten unkontrolliert leaken; ggf. Overlay außerhalb der Webpage rendern.

## 5. Minimale Tool-Gruppen (Entwurf)

| Gruppe | Beispiele | Policy |
| --- | --- | --- |
| Browser Sessions | browser_create_isolated_session, browser_list_owned_tabs, browser_close_session | eigenes Profil und Eigentümerschaft erzwingen |
| Browser Read | browser_snapshot, browser_screenshot, browser_get_url, browser_find | Origin/Fenster/Tab & Datenfreigabe |
| Browser Act | browser_navigate, browser_click, browser_hover, browser_type, browser_scroll, browser_drag | Aktion, Domain, Risikoklasse, Rate/Timeout |
| Cursor | browser_cursor_show_for_action, browser_cursor_state | rein visuell, kein globales Inputrecht |
| Desktop | desktop_request_takeover, desktop_release, desktop_window_snapshot, desktop_action | separater lokaler Freigabedialog; Rechtegrenze |
| Control | session_pause, session_resume, session_stop, permissions_get/revoke, audit_recent | owner-bound, sofortige Revozierbarkeit |

MCP-Endpunkte liefern Scope, Ergebnisstatus, Fehlercode, Navigation/Tabbezug, Action-ID und bei Abbruch nachvollziehbare Meldung. Als technische API zählt das **geplante Semantikmodell**, nicht der endgültige Toolname. Keine „erfolgreich“-Meldung ohne überprüften Effekt.

## 6. Berechtigungsmodell (Ausbau vorhandener Profile)

- **LOW:** Eigene KI-Browserinstanz öffnen, ausdrücklich freigegebene öffentliche Seiten lesen, sichtbare UI; keine Formulare absenden, Downloads öffnen, externe Daten senden oder Desktopinput.
- **MEDIUM:** Erlaubte Browserseiten bedienen, Formulare innerhalb vordefinierter Zwecke/Scopes; bestätigungspflichtige sensitive Aktionen weiterhin separat.
- **FULL:** Größere Website-/App-Freigaben, aber kein automatischer Zugriff auf Nutzerbrowser/Credentials und kein Bypass kritischer Bestätigungen; Desktopübernahme lokal begrenzt und widerrufbar.
- **CUSTOM:** Detaillierte Site-, App-, Fenster-, Pfad-, Network- und Toolrechte; temporäre Session-Profile und dauerhafte Site-Profile unabhängig wählbar.

Priorität: Verbote und host-seitige Sicherheitsgates > Einmalfreigabe > zeitlich gültiges Scope > erlaubtes Profil > Standard-deny. Für Login, persistente Cookies/Session und Autologout gibt es noch eine zu treffende Produktentscheidung (siehe Abschnitt 9).

## 7. Ablauf einer Browseraktion (geplantes Verhalten)

1. ChatGPT schlägt Browser-Tool mit Ziel und Scope vor.
2. Host-Policy validiert Nutzer, Device, Browser-Session, Tab, Origin, Action, Risiko und ggf. lokalen Freigabebeleg.
3. Eigener KI-Browserprozess/BrowserContext wird im autorisierten Profil gestartet/gewählt.
4. Playwright erzeugt Accessibility-/DOM-Snapshot, wählt stabiles Element, prüft Sichtbarkeit und Ziel.
5. Falls Hover/Klick/Drag/Scroll: visueller schwarzer Cursor wird temporär zum Ziel animiert; keine Veränderung der echten weißen Maus.
6. Playwright führt Aktion aus, prüft Rückmeldung/Navigation/Zielzustand, protokolliert **redigierte** Action-Metadaten.
7. Cursor verschwindet unmittelbar nach dem begrenzten Action-Fenster. ChatGPT erhält echte Ergebnisinformationen. Fehler -> sichere Pause/Retryregel; riskante Aktionen werden nicht blind wiederholt.

**Bei Benutzereingabe:** Ist sie auf dem allgemeinen Desktop außerhalb des KI-Browserfensters, darf der isolierte KI-Browser weiterarbeiten. Ist sie im KI-Browserfenster, pausiert der betreffende KI-Browser-Arbeitsablauf; bei gemeinsamen Desktop-Aktionen ist User-Input unmittelbar vorrangig und beendet die Takeover-Eingabe.

## 8. Geplante Test- und Abnahmematrix (alles aktuell ungetestet)

| Testfall | Sollverhalten |
| --- | --- |
| Isolierte Cookies/Profile | Nutzerbrowser-Sitzung bleibt unberührt, KI-Sitzung kann nach erlaubtem Modell persistieren oder neu starten |
| Gleichzeitige Nutzung | Weiße Systemmaus bleibt für fremde Nutzerfenster frei, während Browserautomatisierung läuft |
| UI-Eingabe in KI-Fenster | KI-Interaktion pausiert und gibt dem Nutzer Vorrang |
| Cursor bei semantischem Klick | Schwarzes Symbol lokalisiert richtig, Klickwirkung wird unabhängig nachgewiesen |
| Kein Pointer-Event | Kein schwarzer Cursor bei nur textueller Snapshot-/Auswertung |
| Reload, Popups, Frames | Cursor-/Locator-Zuordnung neu berechnet; keine stale-element Clicks |
| Zoom/DPI/Multi-Monitor | Viewport↔Fenster-Koordinaten stimmen oder klarer Fallback |
| Sensitive Aktionen | Passwort/Datei-Upload/Send/Payment/Download-Ausführung blockiert ohne nötige Genehmigung |
| Redirects/Netzwerk | Site-Policy wirkt auch über Cross-Origin-Navigation und externe Requests |
| Session-Stop und Revoke | laufende Inputs/Tasks abbrechen, danach keine weiteren Tools |
| Windows / Linux | Windows 10/11, X11, GNOME Wayland, KDE Wayland separat testen, mit Version/Evidenz |
| Accessibility/Screenreader | Overlay verdeckt keine Elemente und stört keinen Fokus; keyboard-only Nutzbarkeit |
| Crash/Race | Keine hängenden Tasten, keine Zombie-Sessions, keine Wiederholung riskanter Writes |
| Prompt Injection | Webseiten können weder Policy ändern noch Credentials oder fremde Pfade anfordern |

**Release-/Feature-Kriterium:** Nur jene OS-/Browser-Kombination als unterstützt deklarieren, für die echte Tests mit Logs und Screenshots (redigiert) vorliegen. Zuverlässigkeit, Sicherheit und konkurrierende Nutzung separat bewerten. Keine Zusage von „100 % fehlerfrei“.

## 9. Genau zwei offene Produktfragen (noch nicht durch Nutzer entschieden)

- **BC-Q01 – Sitzungsdaten:** Soll der eigene KI-Browser standardmäßig ein neues temporäres Profil ohne Login-Persistenz verwenden oder ein getrenntes dauerhaftes Profil mit explizitem Cookie-/Login-Speichern? Default bis zur Entscheidung: temporär, ohne Import aus dem persönlichen Browser.
- **BC-Q02 – Sichtbarkeit:** Soll KI-Browser stets als eigenes sichtbares Browserfenster angezeigt werden oder soll er im Hintergrund laufen können, mit optionaler Live-Ansicht im Dashboard? Default bis zur Entscheidung: sichtbares eigenes Fenster.

Die bereits fünf beantworteten Fragen dürfen nicht erneut abgefragt werden. Die Browser-Technologie-/Overlay-Entscheidung wird durch Prototyptests während einer **separat autorisierten Entwicklungssitzung** verifiziert.

## 10. Änderungen an Gesamtroadmap und Grenzen

- Forschung und Architekturentscheidung für eigenständige Browsersteuerung im Rahmen von Session 1; MCP-Session-/Policy-Primitiven in Session 2; GUI-/Browserintegration in Session 4.
- Alles, was das 25-Minuten-Zeitbudget oder getestete Kompetenzgrenzen überschreitet, bleibt offenes, verfolgbares Issue; kein erzwungenes „fertig“ wegen Ablauf.
- SEC-GATE-001 (vollständige GitHub-Actions-SHAs vor regulärer CI) unverändert.
- Keine zusätzlichen KI-Agenten, keine ungeprüften kostenpflichtigen Bausteine, keine ChatGPT-Webbrowser-Übernahme ohne ausdrückliche separate spätere Entscheidung.
