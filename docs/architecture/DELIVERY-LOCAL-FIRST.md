# Desktop Control — Produktform, Installation und MCP-Verbindung

**Stand:** 2026-10-22 | **Status:** Architektur-Empfehlung, **noch keine bestätigte Nutzerentscheidung**, keine Implementierung, Sitzungen **0/6**.
**Tracking:** [Issue #17](https://github.com/lxcoding95/desktop-control/issues/17), [Session 1 #5](https://github.com/lxcoding95/desktop-control/issues/5).
**Grundsätze:** keine eigene KI-Agent-Engine; Windows/Linux; kostenloser und quelloffener Einstieg; keine gekaufte Domain oder eigener Server vorhanden; eigener sichtbarer KI-Browser mit persistiertem Profil nach [Browser-Spec](AI-BROWSER-PROFILE.md).

## 1. Fragestellung und Kurzantwort

Wir brauchen **ein lokal installiertes Produkt** und mehrere **Transportwege**. Eine öffentliche Webseite allein kann nicht zuverlässig und sicher lokale OS-/GUI-Funktionen bereitstellen. Ein reiner Terminalbefehl wäre für normale Endnutzer unnötig kompliziert. Die optimale Zielstruktur:

1. **Lokale Desktop-Control-Bridge** als ausführbare App im eingeloggten Nutzerkontext auf Windows/Linux, nicht als allmächtiger Remote-Agent; enthält Tools, Autorisierung, OS-/Browseradapter und lokale Auditfunktionen.
2. **Tray/Status-Fenster** und **lokales Web-Dashboard** auf Loopback für Sitzungen, Geräte, Rechte, Browserprofile, Not-Aus und Diagnose.
3. **MCP Adapter** derselben Tool-Schemas über lokalen stdio-Transport, optional Loopback-HTTP; für berechtigte ChatGPT-Web-Tests später ein privater ausgehender Tunnel.
4. **CLI** zur Entwicklung und Expertennutzung, später als versionierter npm-`npx`-Startweg; der App-Installer bleibt der primäre Endnutzerkanal.
5. **Öffentlicher HTTPS-MCP-Gateway** und begleitende Webseite erst als separate spätere Produktphase, wenn Finanzierung, Identität, Sicherheit und Veröffentlichung geklärt sind.

Dies ist kein Widerspruch zu den früheren Entscheidungen „installierbares ChatGPT-Plugin“ und „lokales Tray + Dashboard“: Ein ChatGPT-Plugin ist der clientseitige **Anschluss**, die lokale Bridge die tatsächliche **Ausführungsumgebung**. Ein Plugin-ZIP allein kann auf der ChatGPT-Weboberfläche keinen beliebigen lokalen Windows-/Linux-Rechner erreichen.

## 2. Teile des fertigen Systems

| Teil | Läuft wo? | Aufgabe | Im lokalen MVP? |
| --- | --- | --- | --- |
| Desktop-Control-Bridge (Host) | Auf dem Nutzer-PC, eingeschränkte User-Sitzung | Files/Terminal/GUI/Browser + verbindliche Permission Engine | Ja |
| MCP-Toolserver | Auf dem PC / später auch als Gateway | Strukturiertes MCP `tools/list`, `tools/call` und begrenzte Ergebnisse | Ja |
| CLI (Node/TS zunächst evaluieren) | Terminal des Nutzers | `start`, `status`, `doctor`, `stop`, `logout`, ggf. `remote` | Minimal im MVP |
| Lokales Dashboard | Loopback `127.0.0.1`, vom Tray geöffnet | Rechte, Freigaben, Geräte, Audit, Profil, Not-Aus | Basismodul |
| Tray/App Shell | Desktop-Session | Sichtbarer Online-/Freigabestatus, App-Start/Stop, lokales Fenster | Nach funktionierendem Kern, für erste nutzerfreundliche Beta |
| KI-Browser | Lokaler separater sichtbarer Browserprozess | Privates eigenständiges Browserprofil, Playwright-Tools, schwarzer virtueller Cursor | Geplant, späterer Arbeitsabschnitt |
| Privater MCP-Tunnel | Lokaler `tunnel-client` → OpenAI | ChatGPT-Web verbindet sich privat ohne eigene Domain | Optional nach Zugangs-/Kostenprüfung |
| Öffentlicher Gateway/Account-Service | Später externe HTTPS-Infrastruktur | Authentifizierte Multiuser-/Device-Routing-API und Remote-MCP | Nein, erst künftige Produktphase |
| Öffentliche Webseite | Später gehostet | Registrierung, Download, Dokumentation, ggf. Geräteverwaltung | Nein |

**Wichtig:** „Lokaler Web-Dashboard“ bedeutet eine Webseite, die der **lokal laufende Prozess** anbietet (z. B. unter `http://127.0.0.1:<lokaler-port>/`). Es ist **keine** Domain erforderlich. Loopback schützt nicht automatisch vor bösartigen Webseiten auf demselben Gerät: Session-Auth, Origin-/Host-Validierung, CSRF-Schutz, CORS-Restriktion, keine privilegierten GET-Aktionen, CSP und keine LAN-Bindings ohne explizite Konfiguration.

## 3. Verbindungsvarianten

### A — Nur lokal und kostenlos entwickelbar: stdio / Loopback

```text
lokaler MCP Client / MCP Inspector / kompatibler Desktop-Client
    └── stdio oder authentifiziertes Loopback-MCP
          └── Desktop Control (lokale User-Session)
                ├── Files/Terminal/Prozesse
                ├── Browser (sichtbar, eigenes Profil)
                ├── lokale Berechtigungen/Not-Aus
                └── Dashboard/Tray
```

- **Kein Server, keine Domain, kein Konto** beim Desktop-Control-Anbieter nötig.
- MCP Inspector kann echte Tools sicher lokal testen; für ChatGPT-Web ist `localhost` aus OpenAIs Cloud nicht einfach erreichbar.
- Lokale Desktop-Plugins mit stdio können je nach Client installierbar sein. **Öffentliche lokale ChatGPT-Desktop-only-Plugin-Einreichungen sind derzeit nur für zugelassene Partner möglich**; das ist keine garantierte öffentliche Vertriebsstrategie. Nach Möglichkeit den Plugin-ZIP-Pfad parallel vorbereiten, aber nicht davon abhängig machen.

### B — Privater ChatGPT-Web-Test ohne eigene Domain (empfohlen, falls berechtigt)

```text
ChatGPT Work auf Web → OpenAI Secure MCP Tunnel Endpoint
                       ↑ ausgehendes HTTPS (kein offener Inbound-Port)
                  lokaler tunnel-client
                       ↓ nur interner MCP-Transport
                  lokale Desktop-Control-Bridge
```

- Offizieller [Secure MCP Tunnel](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels) unterstützt stdio oder HTTP zu privaten MCP-Servern und erfordert **keinen eigenen öffentlichen MCP-Server**.
- Auf OpenAI Platform werden `tunnel_id` und passende RBAC-Rechte (`Tunnels Read/Manage/Use`) benötigt, ein Runtime-API-Key für den **lokalen** `tunnel-client` und Freigabe für Custom MCP im ChatGPT-Workspace. Tunnel-/Org-Verknüpfung muss funktionieren. **Zugriff, Abrechnung und Erreichbarkeit beim Owner sind nicht verifiziert**.
- Keine API-Keys im Chat, im GitHub-Repo, Screenshots oder Build-Logs. OS-Credential-Store nutzen. Bei Disconnect muss die Bridge sicher stoppen bzw. sich abschotten, der Tray zeigt Offline.
- Dies ist **keine Public-Plugin-Distribution**. Für späteres öffentliches Plugin weiterhin stabilen öffentlichen HTTPS-MCP-Endpunkt samt Veröffentlichungsvoraussetzungen planen.
- Tunnel ist bei dieser vertrauenswürdigen Desktop-Steuerung nur **Transport**, nicht Ersatz für Host-Policy oder lokale Nutzerzustimmung. Remote-Tunnel-Zugang darf keine unbeaufsichtigten OS-Rechte verleihen.
- Limit-/Kostenprüfung vor Tests: Tunnel-API-Berechtigungen, Platform-Verträge, Tokenverwendung, kein bezahltes Feature ohne Owner-Zustimmung.

### C — Öffentlicher temporärer HTTPS-Test-Tunnel als Fallback

Eine Dev-Tunnel-URL, z. B. durch ngrok laut [OpenAI-Quickstart](https://developers.openai.com/plugins/build/app-quickstart), kann ChatGPT einen Test-MCP-Endpunkt erreichbar machen. **Nicht pauschal auf volle Desktopsteuerung anwenden:** Ein öffentlich erreichbarer Tunnel auf einen hochprivilegierten MCP-Server ist ein erhebliches Angriffsrisiko. Nur isolierte Testdaten, starke Auth, Tool-Allowlist/Read-only, lokal erzwingbare Autorisierung, zeitliche Abschaltung, keine Langzeit-Credentials und vorheriger Security-Review. Tunnel-Angebote/Preise/Quoten ändern sich; nicht als „kostenlos und unbegrenzt“ versprechen.

### D — Später öffentliche Remote-Dienste

```text
ChatGPT anderer Nutzer → domain.example/mcp (HTTPS + OAuth)
                           └── zentraler Gateway/Device-Registry
                                 └── verschlüsselter, ausgehender Device-Channel
                                       └── lokale Bridge des Nutzers
```

Vor öffentlichem Release braucht es stabile und finanzierte Infrastruktur, Domain-/Identitätsverifikation, Datenschutz und Incident Response, Schutz vor Cross-Tenant-Zugriff, Device Pairing/Widerruf und sichere Zugangssysteme. Für öffentliche Remote-MCP-Plugin-Submission verlangt OpenAI einen extern erreichbaren stabilen HTTPS-MCP-Endpunkt samt Domain-/Produktnachweisen. **Domainkauf/Hosting erst nach eigener Nutzerentscheidung**, nicht jetzt.

## 4. Installation — zwei Kanäle, ein Kern

### Entwicklungs- und Expertenvariante (früh)

- Klonen und lokal starten, bevorzugt TypeScript/Node wegen MCP SDK und Playwright; vor Beginn aber die zu verwendenden SDK-Versionen prüfen. Im MCP-TS-SDK existieren mittlerweile getrennte v2-Pakete `@modelcontextprotocol/server` und `@modelcontextprotocol/client`; nicht unkritisch nur alte `@modelcontextprotocol/sdk`-Beispiele übernehmen.
- Test zuerst via MCP Inspector mit `who_am_i`, lokalem Diagnose-/Read-only-Tool und echten negativen Tests.
- Nach sicherer, testbarer npm-Paketierung kann ein Befehl wie `npx @desktop-control/cli@<geprüfte-version> start` angeboten werden. **Nur UX-Beispiel, kein registrierter Paketname oder funktionsfähiger Befehl.** npm-Paket/Scope/Namen-Verfügbarkeit und Signatur/Provenienz prüfen; feste geprüfte Versionen statt ungeprüfter `latest` für sicherheitssensitive Installationen.
- Experten können statt npx einen lokal gepinnten Quell-Build oder systemeigenen Paketmanager nutzen.

### Endnutzer-Variante (bevorzugtes Endprodukt)

1. Windows: geprüfter Installer; Linux: getestetes Paket (z. B. AppImage oder deb/rpm, nach Plattformmatrix).
2. Installiert lokalen Kern im normalen Benutzerkontext; kein stiller Root/Admin-Dienst.
3. Autostart optional, Tray und Dashboard lokal erreichbar; lokaler Not-Aus.
4. Einrichtung: getrennten KI-Browser aktivieren; Benutzer wählt Low/Medium/Full/Custom.
5. ChatGPT-Verbindungsseite zeigt tatsächliche Anschlussmöglichkeiten: lokaler MCP-Client, privater Tunnel nur wenn verfügbar, später öffentlicher Gateway.
6. Einmalige Testaktion mit geringer Berechtigung; erst danach gezielte Freigabe weiterer Fähigkeiten.
7. Update-/Rollback-/Uninstall/Secret-Wipe und Datenexport/Profil-Löschung müssen unterstützt und getestet sein.

### App-Shell-Entscheidung noch offen

Electron bietet bewährte Node-Integration/Tray/APIs und ergänzt unsere Playwright-Basis, kann aber Speicherbedarf und Paketgröße erhöhen. Tauri 2 kann kleinere App-Pakete erzeugen, benötigt jedoch eine gut abgesicherte Rust↔Node-Bridge bzw. Sidecar und plattformspezifische Tests. Native UI wäre möglich, erhöht aber die separate Windows/Linux-Implementierung. **Nicht vor einem kurzen Prototyp mit Dependency-/Lizenzprüfung endgültig wählen.**

## 5. Lieferreihenfolge und Test-Evidenz

| Schritt | Arbeitsziel | Erfolg nur nach realem Nachweis |
| --- | --- | --- |
| A – Architektur-/Sicherheitsreview (Session 1 nach Owner-Freigabe) | Tool-Schemas, User-Rechte, stdio vs HTTP, Browser/Bridge-Verantwortung, Stack | genehmigter ADR, klare Kriterien, geeigneter Test-PC |
| B – Ein lokales, lesendes MCP-Tool (Session 2) | stabiles MCP SDK, lokaler Start, Inspector, Rechteprüfung | STDIO/HTTP echte Tool-Antwort + negatives Zugriffstestresultat |
| C – Filesystem/Terminal (Session 3) | sichere, begrenzte Tools in lokaler Bridge | Windows/Linux-Tests, keinen Shell-Sandbox-Schein versprechen |
| D – KI-Browser/GUI (Session 4) | sichtbarer eigener Browser, lokaler schwarzer Cursor, Testaktionen | realer Win/Linux-/Wayland-Status, Auth-/Focus-Tests, keine Nutzerprofilkopie |
| E – App/Installer und optionale private Verbindung (Session 5) | Tray/Dashboard, Installer und sofern möglich Secure MCP Tunnel | Installer/Deinstallation, Run-Logs, Security-Review; keine ungeprüften Keys |
| F – Integration & Release-Gate (Session 6) | Qualität und Go/No-Go | CI, Lizenz, negative Tests, Downloadpakete und Mängelliste |

**6 × 25 Minuten sind Zeitboxen, keine Garantie, dass ein robustes Produkt innerhalb von 150 Minuten fertig ist.** Unfertige Funktionen werden als Issues offen gehalten. Kein Sessionstart in dieser Planung.

## 6. Security-Gates

- Nur explizit freigegebene Benutzerkonten, Geräte, Tools, Pfade, Browser-Origin, Hintergrundaktionen und Zeiträume. Modell/Website kann keine Rechte aus seinem Text generieren.
- Grundsätzlich gesonderte Bestätigung für destruktive, kostenpflichtige, externe Datenübertragungen, Kontosicherheit und Privilegien-Eskalation; keine pauschal unbeschränkte Windows/Root-Macht.
- Loopback-MCP und lokales Dashboard nie ohne überprüfte Bindings und CSRF-/Origin-/Sitzungs-Guards veröffentlichen.
- Remote nur über TLS, authentifizierte Identität, korrekte Session-/Device-Zuordnung und Host-Enforcement; abgeschnittene Verbindungen dürfen keinen unbegrenzten lokalen Job hinterlassen.
- Kein `pull_request_target` für untrusted Code, Actions-Source-Audit, vollständige SHA-Pins und GitHub-Sicherheitsdurchsetzung gemäß [SEC-GATE-001](https://github.com/lxcoding95/desktop-control/issues/1) **vor regulärer CI**.
- Keine geheimen Konfigurationswerte in Logs, GitHub oder ChatGPT-Chat, keine ungeschützte Browser-Storage-State-Datei, keine unsicheren Default-HTTP-Remote-Endpoints.

## 7. Offene Entscheidungen für den Owner

**Nur eine Produktpriorität ist jetzt relevant:** Soll der erste praktische Nachweis zunächst lokal über MCP Inspector/kompatiblen lokalen Client erfolgen (am sichersten, Server-null) oder muss ChatGPT im Web **sofort** über einen privaten Tunnel verbunden werden (hängt von externem Berechtigungs-/Kostenstatus ab)? Die langfristige App+CLI-Strategie ist hier eine Empfehlung, die der Owner noch ausdrücklich bestätigen kann.

Folgende technische Detailentscheidungen erst mit echter Entwicklungsumgebung: Electron/Tauri, Node/TS-Version, npm-Name, Installer-Format, Offline-Updatepfad, URL/Port, Browser-Bundling, Tunnel-Integration, Identity/Hosted-Service. Bei fehlendem Secure MCP Tunnel niemals ungesicherte öffentliche Server oder Nutzer-Tokens als Abkürzung nutzen.

## 8. Quellen (gültige Leselinks, Datum 2026-10-22)

- [Secure MCP Tunnel – offizielle OpenAI-Anleitung](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels)
- [Secure MCP Tunnel Client – Apache-2.0](https://github.com/openai/tunnel-client)
- [ChatGPT Plugin: Desktop-only Anforderungen und Zulassung](https://developers.openai.com/plugins/deploy/desktop-only)
- [ChatGPT Plugin: Public Submission und Domain](https://developers.openai.com/plugins/deploy/submission)
- [ChatGPT Plugin: portable package](https://developers.openai.com/plugins/build/plugins)
- [ChatGPT custom MCP, Test mit öffentlichem URL/Tunnel](https://developers.openai.com/plugins/build/app-quickstart)
- [MCP TypeScript SDK v2, STDIO/HTTP](https://github.com/modelcontextprotocol/typescript-sdk)
- [Electron Tray](https://www.electronjs.org/docs/latest/api/tray)
- [Tauri 2](https://v2.tauri.app/)
- [Desktop Commander Remote Device UX reference](https://github.com/wonderwhy-er/DesktopCommanderMCP/blob/main/src/remote-device/README.md)
