# Oche – Dart Counter

Web-App (PWA) für das Android-Tablet: X01 und Cricket sowie über 20 Party- und Trainingsspiele, Spielerprofile, Statistik und Export/Import für den Gerätewechsel. Jeder Modus erklärt seine Regeln in der App (Knopf „Regeln" im Setup und im Spielmenü ☰). Läuft nach der Installation offline, im Hoch- und im Querformat (quer mit zweispaltigen Seiten).

Eine „Runde" sind die drei Darts eines Spielers (im Turnierdarts „Aufnahme"). In den Rundenspielen wirft jeder Spieler genau eine Runde je Ziel, 121 und Shooting Gallery zählen stattdessen „Versuche".

## Auf das Tablet bringen (GitHub Pages, kostenlos)

1. Auf github.com ein Konto anlegen.
2. **+ → New repository**. Name `oche`, **Public**, nichts anhaken, **Create repository**.
3. **Settings → Pages → Build and deployment → Source: GitHub Actions** wählen.
4. Zurück zu **Code**, Link **uploading an existing file**. Den *Inhalt* des Ordners `oche` hineinziehen (nicht den Ordner selbst). **Commit changes**.
5. Prüfen, ob `.github/workflows/deploy.yml` im Repository liegt. Beim Hochladen per Ziehen aus dem Windows-Explorer in Firefox kam der Ordner `.github` nicht an, alle anderen schon (Ursache nicht geklärt, vermutlich lässt der Browser-Upload Ordner mit Punkt aus). Dann: **Add file → Create new file**, Name `.github/workflows/deploy.yml` (mit Punkt am Anfang, jedes `/` legt einen Ordner an), Inhalt aus der Datei kopieren, **Commit changes**.
6. Reiter **Actions**: Der Lauf „Deploy" muss grün werden (1 bis 2 Minuten). Die Adresse steht danach unter **Settings → Pages**, z. B. `https://DEINNAME.github.io/oche/`.
7. Auf dem Tablet die Adresse in **Chrome** öffnen, **⋮ → Zum Startbildschirm hinzufügen → Installieren**.

## Updates

1. Geänderte Dateien im Repository hochladen (gleiche Namen überschreiben), **Commit changes**. Neue Dateien in Unterordnern (z. B. `js/rules/golf.js`) im passenden Ordner hochladen: Ordner im Repository öffnen, dann **Add file → Upload files**.
2. GitHub prüft die Regeln (`test/`), baut die Seite (`tools/build.mjs`) und veröffentlicht sie. Cache-Version und Dateiliste des Offline-Caches entstehen dabei automatisch aus dem Inhalt. Nichts mehr von Hand hochzählen.
3. Schlägt ein Test oder die Dateiprüfung fehl, wird der Lauf rot und die alte Version bleibt online. Häufigste Ursache: Eine neue Datei fehlt. Die Meldung im Lauf nennt sie.
4. Beim nächsten Start zeigt die App „Neue Version verfügbar → Aktualisieren". Die Fußzeile zeigt den Build, der gerade läuft.

## Spiele

Das Modusmenü gruppiert in Klassiker, Party und Training. Die vollständigen Regeln stehen in der App und in `js/help.js`, die Regellogik in `js/rules/`.

| Gruppe | Spiel | Kennzahl in der Statistik |
|---|---|---|
| Klassiker | X01 (301–1001, Single/Double/Master In und Out) | 3-Dart-Ø, First 9, Checkout-Quote, Doppelquote |
| Klassiker | Cricket (Standard, Cut-Throat, je mit 15–20 oder Zufallszahlen) | MPR |
| Party | Killer | Ø Darts bis Killer, genommene Leben |
| Party | Blind Killer | Doppeltreffer, genommene Leben |
| Party | Tic-Tac-Toe (genau 2 Spieler) | Trefferquote, Ø Felder je Leg |
| Party | Hare and Hounds (2–4 Spieler) | Trefferquote, Siege als Hase und als Hund |
| Party | Follow the Leader | Ziel getroffen je Versuch, verlorene Leben |
| Party | Knockout | Ø Runde, Striche |
| Party | Gotcha | 3-Dart-Ø, Gotchas |
| Party | Mickey Mouse | MPR |
| Party | Shove Ha'penny | MPR |
| Party | Shanghai | Ø Punkte je Runde, Shanghais |
| Party | Halve-It | Ø und bester Endstand, Halbierungen |
| Party | Bermuda Triangle | Ø und bester Endstand, Halbierungen |
| Party | Golf | Ø Schläge je Loch, beste Runde, Hole in One |
| Party | Nine Lives | Trefferquote, verlorene Leben |
| Training | Around the Clock (aufsteigend, absteigend, zufällig) | Trefferquote, bestes Leg |
| Training | Doppel-Training | Darts je Doppel |
| Training | Chase the Dragon | Trefferquote, bestes Leg |
| Training | Bob's 27 | Ø und bester Endstand, Doppelquote |
| Training | 121 | höchstes Ziel, Checkout-Quote, Ø Darts je Check |
| Training | Shooting Gallery | Ø Punkte, Checkout-Quote, Ø Darts je Check |
| Training | JDC Challenge | Ø Gesamt, Teilsummen, Stufe White bis Black |

### Regelquellen und Optionen

Wo sich Quellen widersprechen, ist die Abweichung eine Setup-Option. Wo keine Quelle etwas sagt, steht die gewählte Regel in der Regeldatei.

- Cricket mit Zufallszahlen: sechs ausgeloste Zahlen und Bull, sonst wie Standard (DARTSLIVE „Random Cricket"). ANNAHME: ausgelost aus 1–20, DARTSLIVE nennt keinen Bereich. Mit Cut-Throat kombinierbar.
- Around the Clock, Reihenfolge: aufsteigend, absteigend mit Bull zuerst, zufällig mit Bull an beliebiger Stelle (dartcounter.net). D/T springt nie über Bull hinweg.
- Tic-Tac-Toe: 1 Treffer je Feld (darts501, World Dolf Federation) oder 4 Marks (Phoenix, Granboard, Arachnid). Volles Raster ohne Reihe: mehr Felder gewinnt (Phoenix). Ein Unentschieden kennt die Engine nicht.
- Hare and Hounds: Hunde starten auf 5 (Darts Corner, WDF) oder 12 (darts501). Double/Triple 1 Feld (WDF) oder 2/3 Felder (Tiny Monkey). Einholen (WDF) oder Überholen (darts501).
- Follow the Leader: Ablauf nach darts501 und Darts Corner, 3 oder 5 Leben. Single innen und außen kann die Eingabe nicht trennen.
- Chase the Dragon: 1 oder 3 Durchgänge (darts501 „Three-headed Dragon").
- Golf: Schlagtabelle D1/T2/S3/5 (GLD Products) oder D1/T3/S4/5 (darthelp). Letzter Dart mit Aufhören (beide Quellen) oder bester Dart. Stechen über weitere Löcher, die Quellen schweigen dazu.
- Knockout: Vorwerfer schlagen (Darts Corner) oder Höchstwert des Legs (darts501), 3 oder 5 Striche.
- Nine Lives: 3 Leben (darts501, darthelp) oder 9 (Darts Corner).
- Blind Killer: Zahlen sichtbar, Besitzer verdeckt (darts501). 3 oder 5 Leben, Triple zählt nicht oder kostet 2 (Tiny Monkey).
- Mickey Mouse: Doppel-/Triple-Feld ja/nein (darts501), beliebige Reihenfolge oder der Reihe nach (Darts Corner), mit Punkten (darts501).
- Bermuda Triangle: Folge 12, 13, 14, Doppel, 15, 16, 17, Triple, 18, 19, 20, 25, Bull (darthelp). Abrunden voreingestellt, Aufrunden wählbar. Tiny Monkey beschreibt unter dem Namen ein anderes Spiel, das nicht eingebaut ist.
- Gotcha: Ziel 201/301/501, Überwerfen Bust (WDF, darthelp) oder Rest zurück (darthelp, Arachnid), Finish beliebig oder Doppel (WDF).
- Shove Ha'penny: Bull mit (darts501) oder ohne (WDF). Überzählige Marks gehen an einen Gegner, der das Feld braucht (beide).
- JDC Challenge: Standard (WDF, GoDartsPro) oder Lang mit 5 Durchgängen (mydartpfeil).
- Shooting Gallery: Punktetabelle nach GoDartsPro. Überwerfen regelt die Quelle nicht, hier wie in X01.

Weitere Details:
- Zufallswerte (Cricket-Zufallszahlen, Around the Clock „Zufällig", Killer- und Blind-Killer-Zahlen, Tic-Tac-Toe-Raster, Halve-It „Zufall", Doppel-Training „Zufällig") werden beim Start einmal ausgelost und im Spiel gespeichert. Revanche lost neu aus.
- Golf und Follow the Leader zeigen eine Taste „Fertig". Sie beendet die Runde vor dem dritten Dart und wird als Stopp-Eintrag gespeichert. Rückgängig nimmt sie zurück.
- Mit einem Spieler heißt das Siegerfenster „Leg beendet" bzw. „Match beendet".

## Daten

- Alles liegt im Browserspeicher (IndexedDB) des Tablets. Jeder einzelne Dart wird gespeichert, Statistiken werden daraus berechnet.
- **Daten → Teilen** schickt die Sicherung per Mail, WhatsApp, Google Drive oder an jede andere App im Android-Teilen-Menü. Sie geht als `.txt` hinaus: Chrome teilt nur Dateitypen von seiner Freigabeliste, `.json` steht nicht darauf. Der Inhalt ist JSON. **Als Datei speichern** legt dieselbe Sicherung als `.json` ab. **Daten → Sicherung importieren** auf dem neuen Tablet liest beide und holt alles zurück. Mehrfaches Importieren legt nichts doppelt an.
- **Profile**: Ein Profil mit Spielen wird archiviert, nicht gelöscht. Es fehlt dann in Spielerauswahl und Statistik, seine Spiele zählen weiter, auch für die Mitspieler. Unter **Spieler → Archiviert** holst du es zurück. Ein Profil ohne Spiele wird gelöscht.
- **Spiele aus der Wertung nehmen**: In der Statistik listet „Spiele" alle Spiele im Filter. **Nicht werten** nimmt ein Spiel aus allen Kennzahlen, für alle Spieler. Es bleibt sichtbar und lässt sich mit **Wieder werten** zurückholen.
- **Löschen** (Spiel im Spielmenü, Profil ohne Spiele) hinterlässt einen Lösch-Vermerk. Er reist mit der Sicherung und gewinnt gegen ältere Kopien. Ohne ihn käme ein gelöschter Eintrag mit jeder älteren Sicherung zurück.
- Sicherungen ab Version 0.6.0 tragen Schema 5 (0.5.0: 4, 0.4.0: 3, 0.3.0: 2). Eine ältere App lehnt sie mit dem Hinweis „zuerst aktualisieren" ab, statt Lösch-Vermerke als Spiele zu lesen. Ab 0.4.0 prüft der Import zusätzlich jeden Spielmodus einzeln.
- Grenze: Löschst du in Chrome die Website-Daten oder deinstallierst die App, sind die Daten auf dem Gerät weg. Nur die Sicherung schützt davor. Die App erinnert nach 7 Tagen mit neuen Spielen an eine Sicherung.

## Aufbau

| Datei | Aufgabe |
|---|---|
| `js/rules/*.js` | Spielregeln je Modus. Ein Dart rein, Annotationen raus |
| `js/rules/rounds.js` | Gemeinsame Auswertung für Rundenspiele mit Stechen |
| `js/rules/checks.js` | Gemeinsame Checkout-Logik (121, Shooting Gallery) |
| `js/rules/cricket.js` | Felder-Spiele mit Marks (Cricket, Mickey Mouse, Shove Ha'penny) |
| `js/rules/atc.js` | Zielfolgen (Around the Clock, Doppel-Training, Chase the Dragon) |
| `js/engine.js` | Aufnahmen, Spielerwechsel, Legs, Sets. Spielstand = Replay aller Darts |
| `js/modes.js` | Oberfläche je Modus (`MODES`): Setup-Optionen, Spielbrett, Tasten, Overlay, Statistik-Abschnitt |
| `js/help.js` | Spielerklärungen und Begriffe |
| `js/ui.js` | Gemeinsamer Zustand und Bausteine (Dialog, Spielerkarten, Leisten) |
| `js/app.js` | Ansichten (Start, Setup, Spiel, Statistik, Daten) und Aktionen |
| `js/checkout.js` | Checkout-Vorschläge |
| `js/stats.js` | Statistik aus denselben Replays (`STATS` je Modus), Filter |
| `js/charts.js` | Verlaufsdiagramm und Dartscheiben-Heatmap (SVG) |
| `js/db.js` | IndexedDB, Export/Import, Lösch-Vermerke, Zusammenführen (`mergeItems`) |
| `sw.js` | Offline-Cache (Version und Dateiliste setzt der Build) |
| `fonts/` | Barlow Condensed und Inter (SIL Open Font License, Lizenztexte liegen bei) |
| `tools/build.mjs` | Baut `_site/`, prüft Verweise, stempelt Cache-Version |
| `tools/make-icons.py` | Erzeugt die Icons neu |
| `.github/workflows/deploy.yml` | Test, Build und Veröffentlichung bei jedem Upload |

### Neuer Spielmodus

1. Datei in `js/rules/` mit dem Regelvertrag, beschrieben oben in `engine.js`:
   - Pflicht: `id`, `title(cfg)`, `subtitle(cfg)`, `initLeg(cfg, n, starter)`, `score(leg, p)`, `applyDart(leg, p, d, cfg, dartIdx)`, `line(st, p)`.
   - `applyDart` liefert `{ pts, marks, bust, won }`, optional `endTurn` und `event` (Flash).
   - Optional: `active(leg, p)`, `turnEnd(leg, p, cfg, turn)` mit `{ winner }`, `{ event }` oder `{ again }`, `canStop(...)` für die Taste „Fertig", `minPlayers`, `maxPlayers`.
2. In `engine.js` bei `RULES` eintragen.
3. In `modes.js` einen Eintrag in `MODES` anlegen (Gruppe, Optionen, `config`, Spielbrett, Tasten, Overlay, Statistik-Abschnitt).
4. In `help.js` die Erklärung schreiben, in `stats.js` den `STATS`-Eintrag, in `test/rules.test.mjs` die Regeln testen.
5. In `db.js` `SCHEMA` um eins erhöhen. Apps bis 0.3.0 prüfen nur diese Nummer.
6. Zufallswerte nie in der Regel auslosen, sondern in `prepare` (modes.js) und in `config` speichern. Sonst ergibt das Replay bei jedem Laden ein anderes Spiel.

Den Offline-Cache ergänzt der Build selbst.

Tests: `node test/rules.test.mjs`. Lokaler Build: `node tools/build.mjs`, danach `_site/` mit einem Webserver ausliefern.
