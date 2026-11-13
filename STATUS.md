# Oche – Projektstand (Übergabe)

Stand: 13.11.2026, Version 0.7.0. Maßgebliche Quelle ist das GitHub-Repository `Lutzkasan/oche`. Im Projekt liegen nur die Textdateien (die Icons als PNG nicht). Updates gehen als ZIP mit den geänderten Dateien an den Nutzer, er lädt sie über **Add file → Upload files** hoch.

Hosting-Stand: Repository `Lutzkasan/oche` (öffentlich), Pages-Quelle „GitHub Actions". Adresse `https://lutzkasan.github.io/oche/` (maßgeblich ist Settings → Pages). Auf dem Tablet in Chrome installiert. Auf GitHub liegt 0.6.0 (Commit vom 12.11.2026, 15:51). Das ZIP für 0.6.1 kam nie dort an. Am 13.11.2026 aus den Projektdateien rekonstruiert (101 + 1 Tests grün) und mit 0.7.0 zusammengelegt. `oche-0.7.0-update.zip` enthält alle Änderungen gegenüber GitHub, also 0.6.1 und 0.7.0. Upload durch den Nutzer steht aus. Aus der Sitzung gibt es weiterhin keinen Schreibzugriff auf GitHub.

Beim ersten Upload fehlte `.github`: Ordner per Drag-and-drop aus dem Windows-Explorer in Firefox hochgeladen, alle anderen Ordner kamen an, `.github` nicht. Die Workflow-Datei wurde von Hand angelegt. Mechanismus nicht geklärt, wahrscheinlich lässt der Browser-Upload Punkt-Ordner aus. Im Repository liegt außerdem eine überzählige `deploy.yml` im Wurzelordner (gleicher Inhalt, wirkungslos). Updates berühren die Workflow-Datei nicht.

Neue Dateien in 0.7.0, die im Repository an die richtige Stelle müssen: `js/rules/baseball.js`, `js/rules/fives.js`, `js/rules/steeples.js`, `js/rules/war.js`, `js/rules/scram.js` (Ordner `js/rules`), `icons/logo.svg` (Ordner `icons`). Der Build bricht ab, wenn eine davon fehlt.

## Entscheidungen
- PWA statt nativer App: läuft in Chrome auf dem Android-Tablet, offline, ohne Build-Schritt im Code (ES-Module, kein Framework).
- Datenmodell: Ein Spiel speichert nur die Liste aller Einzeldarts `{s, m, t}`. Spielstand, Undo, Fortsetzen und Statistik entstehen per Replay (`engine.js`). Neue Kennzahlen gelten rückwirkend.
- Eingabe: jeder Dart einzeln (Segment + Double/Triple). Single innen/außen wird nicht unterschieden, das Trefferbild färbt beide Ringe gleich.
- Speicher: IndexedDB, `navigator.storage.persist()`, Export/Import als JSON (Merge nach ID, neuere `updatedAt` gewinnt, `mergeItems` in `db.js`).
- UI-Regel: erst Zustand ändern und rendern, dann im Hintergrund speichern.
- Hosting: GitHub Pages mit GitHub Actions (öffentliches Repository). Der Workflow testet, baut und stempelt die Cache-Version automatisch.
- Service Worker cache-first. `VERSION` (Inhalts-Hash) und `FILES` (Verzeichnis) setzt `tools/build.mjs`. Der Build bricht ab, wenn ein Import oder Verweis auf eine fehlende Datei zeigt.
- Regelvertrag: Pflicht `id, title, subtitle, initLeg(cfg, n, starter), score, applyDart, line`. Optional `active`, `turnEnd(leg, p, cfg, turn)` mit `{winner}`, `{event}` oder `{again}`, `canStop`, `stops`, `draw`, `minPlayers`, `maxPlayers`, im Dart-Ergebnis `endTurn` und `event`. Die Engine kennt keine Modi beim Namen.
- 0.5.0: `starter` in `initLeg` (Index des anwerfenden Spielers). Hare and Hounds macht ihn zum Hasen, Scram (0.7.0) zum Stopper der ersten Hälfte. Legwechsel und Revanche tauschen so die Rollen.
- 0.5.0: Stopp-Eintrag `{s: 0, m: 0, stop: true}` in der Dartliste. Er beendet die Runde, zählt nicht als Dart und erscheint nicht in `st.darts`. Erlaubt nur, wenn die Regel `canStop` meldet (Golf „letzter Dart", Follow the Leader „letzter Dart"). Undo nimmt ihn wie einen Dart zurück.
- 0.5.0: Rundenspiele mit Stechen teilen `rules/rounds.js` (Shanghai, Bob's 27, Halve-It, Bermuda, 121, Golf, JDC, Shooting Gallery, ab 0.7.0 Baseball). Golf negiert die Wertung in `rank()`.
- 0.5.0: Gemeinsame Bausteine statt Kopien: `rules/checks.js` (Double-Out-Versuch für 121 und Shooting Gallery), `rules/cricket.js` `applyMarks` (Cricket, Mickey Mouse, Shove Ha'penny), `rules/atc.js` (Around the Clock, Doppel-Training, Chase the Dragon), `halveit.js` (Halve-It, Bermuda Triangle). Doppel-Training und Bermuda sind eigene Modus-IDs mit geteilter Regel, damit Menü und Statistik sie getrennt führen.
- 0.5.0: Oberfläche aufgeteilt: `ui.js` (Zustand, Bausteine), `modes.js` (`MODES` je Modus mit Gruppe, deklarativen Optionen, Brett, Tasten, Overlay, Statistik-Abschnitt), `help.js` (Erklärtexte), `app.js` (Ansichten, Aktionen). Setup-Vorgaben entstehen aus den Optionen (`setupDefaults`).
- 0.5.0: `stats.js` mit Registry `STATS[mode] = {init, add, fin}` und Replay-Cache (`replayCached`, ab 0.7.0 auch für „Ergebnisse"). `hasPlay(g, spieler)` ist die einzige Prüfung, ob ein Spiel für einen Spieler zählt (Filter und Kennzahlen). Ab 0.6.0 prüft sie auch `excluded`. `hasDarts` ist dieselbe Prüfung ohne Wertung, nur für die Spieleliste.
- Zufallswerte (Cricket-Zufallszahlen, Around the Clock „Zufällig", Killer-/Blind-Killer-Zahlen, Tic-Tac-Toe-Raster, Halve-It „Zufall", Doppel-Training „Zufällig") lost ab 0.6.1 jedes Leg neu aus. Die Regel liefert sie über `draw(cfg, n, rnd)`, die Engine ruft `draw` je Leg mit einem Generator aus `config.seed` und der Leg-Nummer (mulberry32). Replay bleibt deterministisch. Leg 1 steht zusätzlich ausgeschrieben in der config. `st.cfg` ist die config des laufenden Legs, `st.base` die gespeicherte, `legResults[i].cfg` die des beendeten Legs. Spiele ohne seed (vor 0.6.1) behalten ihre Werte für alle Legs. Revanche vergibt einen neuen seed. Die fünf Modi aus 0.7.0 haben keinen Zufall.
- 0.6.0: Begriff „Runde" statt „Aufnahme" in allen Texten (Nutzerwunsch). Im Glossar mit Hinweis auf „Aufnahme". 121 und Shooting Gallery zählen „Versuche". Code-Kommentare und Bezeichner sprechen weiter von Aufnahme/turn. Baseball nennt seine Runden „Innings" (Glossar).
- 0.6.0: Löschen schreibt einen Lösch-Vermerk `{ id, deleted: true, updatedAt }` statt den Eintrag zu entfernen. Ursache: Der Import führt nach ID zusammen, ein spurlos gelöschter Eintrag kam mit jeder älteren Sicherung zurück. Die App lädt nur lebende Einträge (`getLive`), Export und Import tragen die Vermerke mit.
- 0.6.0: Archivieren (Profil) und Nicht werten (Spiel) sind umkehrbare Kennzeichen (`archived`, `excluded`) über `setFlag`, das `updatedAt` setzt. Welche Profile in Auswahllisten erscheinen, entscheidet nur `visiblePlayers()` in `app.js`.
- 0.6.0: `gameTime` (Zeitraum-Filter) nutzt Spielende, sonst den letzten Wurf, sonst `createdAt`.
- 0.6.0: Teilen schickt die Sicherung als `.txt` mit `text/plain`. Chrome prüft beim Teilen Endung und MIME-Typ gegen eine Freigabeliste, `.json` steht nicht darauf (Chromium `share_service_impl.cc`). „Als Datei speichern" bleibt `.json`, der Import liest beide.
- 0.6.0: Meldungen (Toasts) ohne Knopf lassen Tipps durch (`pointer-events: none`).
- 0.6.0: Spielerkarten bei 1–2 Spielern sind Größen-Container (`cqh`/`cqw`). Querformat ab 1000 px Breite: Start, Setup, Spieler und Statistik zweispaltig, Seiten bis 1440 px breit.
- Sicherungs-Schema 7 (0.7.0, fünf neue Modi). Schema 6 (0.6.1, `config.seed`). Schema 5 (0.6.0, Lösch-Vermerke). Apps bis 0.3.0 prüfen nur die Schema-Nummer. Ab 0.4.0 prüft der Import zusätzlich jeden Modus gegen `RULES`, Lösch-Vermerke ausgenommen.
- 0.6.1: Follow the Leader mit `cfg.set`: 'first' (Regel des Nutzers, Standard, genaues Feld) und 'last' (darts501). ANNAHME: Wirft der Setzer zu Beginn nur daneben, gibt es kein Ziel und kein Leben weniger.
- 0.6.1: 16 Farben (`COLORS`), „Bearbeiten" ändert Name und Farbe, „Vergessen" schreibt einen Lösch-Vermerk fürs Profil, seine Spiele bleiben mit dem Platzhalter `FORGOTTEN`.
- 0.7.0: Archiv unter „Daten" (Entscheidung des Nutzers). Die eigene Archiv-Ansicht und der Knopf auf der Spielerseite sind weg. „Daten" ist die Verwaltungsseite: Sichern, Wiederherstellen, Archiv (Zurückholen/Vergessen), Speicher, Zurücksetzen.
- 0.7.0: Startseite zeigt nur laufende Spiele. Beendete Spiele unter der Kachel „Ergebnisse" (rechts unten neben Spieler, Statistik, Daten). Je Spiel gewonnene Legs bzw. Sets, Sieger hervorgehoben, 30 Einträge, dann „Alle zeigen".
- 0.7.0: Zurücksetzen (`resetAll` in `db.js`): leert `players`, `games` (mit Lösch-Vermerken) und `meta`, löscht `LOCAL_KEYS` (`oche.setup`, `oche.statsFilter`) aus localStorage. Ablauf: Sicherung anbieten (Teilen, Als Datei, Ohne Sicherung), dann `LÖSCHEN` eintippen. Eine danach importierte Sicherung bringt alles zurück, gewollt (Wiederherstellung).
- 0.7.0: Logo „A Turnierscheibe". Einzige Geometriequelle ist `tools/make-icons.py`. Es schreibt `icons/logo.svg` und die drei PNG-Icons. `logo()` in `app.js` zeigt `icons/logo.svg` als Bild. Vorher standen Logo-Geometrie in `app.js` und `make-icons.py` doppelt.
- Verworfen (13.11.2026): „Kaffee ausgeben“-Knopf mit PayPal. Grund des Nutzers: Der PayPal.me-Link mit seinem Namen stünde öffentlich im Code auf GitHub. Nicht einbauen.
- Regelquellen 0.7.0 (13.11.2026 geprüft). Die erste Fassung im STATUS nannte für Steeples und War darts501 und für Scram Tiny Monkey. Das stimmte nicht: Steeples und War stehen nur bei Tiny Monkey, Scam bei darts501 und darts-uk.
  - Baseball: 9 Innings, Inning n zählt nur die n, S/D/T = 1/2/3 Runs, nicht mit der Inning-Nummer multipliziert (GLD, darts501, dartspiks, getgamesgo). KONFLIKT Gleichstand: Extra-Innings auf Bull, 25 = 1, Bull = 2 (darts501, dartspiks) gegen weiter mit 10, 11 … (GLD nennt beides) → Option. „7th Inning Catch" (darts501, getgamesgo): kein Run im 7. Inning halbiert → Option. ANNAHME: abgerundet. Handicap-Regeln (dartspiks) nicht eingebaut.
  - Fives: Summe ÷ 5 nur bei Teilbarkeit, ein Dart daneben macht die Runde ungültig (darts501, darthelp, dolfdarts). KONFLIKT Ziel 51 (darthelp, dolfdarts, darting.com) gegen 50/100 (darts501, darts-uk) → Option. Überwerfen: Bust (darthelp, dolfdarts), darts501/darts-uk regeln es nicht → Option „Erreichen reicht" als ANNAHME. KONFLIKT D/T: voller Wert (darts501, darthelp) gegen wie Single (darts-uk) → Option. Nicht eingebaut: feste Rundenzahl (Tiny Monkey), Strafpunkte (darthelp-Variante), D/T als Foul (darts501-Variante).
  - Steeples: nur Tiny Monkey. Kurs 1–20 + Bull, D überspringt eine Zahl, T zwei, außer der Reihe → zurück. „Vorige Zahl" ist mehrdeutig → Option: ein Feld zurück (Standard), zurück auf Rundenbeginn, ohne Strafe. ANNAHME: außer der Reihe = jeder Treffer auf eine andere Kurszahl, auch Bull, daneben nicht. Mehrere Fehltreffer einer Runde kosten einmal. Nie über Bull springen (wie ATC). Steeplechase (darthelp, GLD, dartbase: inneres Single, Hürden mit Triple, Ausscheiden) ist ein anderes Spiel, nicht eingebaut.
  - War: nur Tiny Monkey (Felder vereinbaren, erobern nach vereinbarter Trefferzahl, eine Runde zum Zurückerobern mit mehr Treffern als der Halter, meiste Felder gewinnt). Optionen: Felder 15–20 + Bull oder 1–20 + Bull, erobern mit 3 Marks oder 1 Treffer. ANNAHMEN: Marks auf freien Feldern sammeln sich über Runden. Stärke = Marks des Halters bis Ende seiner Eroberungsrunde. Rückeroberung = mehr Marks in einer einzigen Runde, neuer Halter bekommt dasselbe Fenster gegen alle anderen. Ein Feld ist gesichert, wenn alle anderen ihre Runde hatten. Leg-Ende, wenn alle Felder gesichert. Gleichstand → Stechen auf Bull (25 = 1, Bull = 2), keine Quelle. Doppel/Triple als Felder nicht eingebaut. DartoUSA „War" ist eine Killer-Variante, nicht eingebaut.
  - Scram: Stopper/Scorer, Stopper beginnt, jeder Treffer schließt (dolfdarts ausdrücklich, Ring egal), Hälfte endet mit der letzten Zahl auch mitten in der Runde, Rollentausch, höhere Scorer-Summe (GLD, dolfdarts, china-tungsten-dart, dartspiks). KONFLIKT Bull: mit (GLD, dolfdarts, china-tungsten-dart) gegen ohne (darts501/darts-uk „Scam", dartspiks) → Option. Gleichstand: dolfdarts je ein Dart aufs Bull, näher gewinnt. ANNAHME: Bull > 25 > Rest, gleich → weiter. „Brag"-Wette (darts501) nicht eingebaut. Genau 2 Spieler.
- Regelquellen 0.6.0 und 0.5.0: siehe README „Regelquellen und Optionen" und die Kopfkommentare der Regeldateien (Cricket-Zufall, ATC-Reihenfolge, Tic-Tac-Toe, Hare and Hounds, Follow the Leader, Chase the Dragon, Golf, Knockout, Nine Lives, Blind Killer, Mickey Mouse, Bermuda, Gotcha, Shove Ha'penny, JDC, Shooting Gallery).

## Fertig
- Phase 1 + 2: X01, Cricket, Profile, Revanche, Undo über Leg-/Matchgrenzen, Basis-Statistik, Backup-Erinnerung, Wake Lock.
- Phase 3 (teilweise): Filter nach Zeitraum und Modus, Verlauf je Match, Trefferbild als Dartscheibe.
- Phase 4: Around the Clock, Shanghai, Killer (0.3.0). Bob's 27, Halve-It, 121 (0.4.0). 15 weitere Modi (0.5.0).
- 0.6.0 (Wunschliste vom 12.11.2026): Querformat, Archivieren/Löschen, „Runde", Cricket- und ATC-Zufall, Teilen als `.txt`, Nicht werten, Zeitraum Von–Bis.
- 0.6.1 (Tests vom 12.11.2026): Zufall je Leg, Follow the Leader nach Nutzerregel, Archiv, Vergessen, 16 Farben.
- 0.7.0 (Wünsche vom 13.11.2026):
  1. Fünf neue Modi in der Gruppe Party: Baseball, Fives, Steeples, War, Scram. Je Modus Regeldatei, `RULES`, `MODES`, `help.js`, `STATS`, Regeltests. Neue Spielbretter für War (Felderraster mit Halter, Stärke, Fortschritt) und Scram (Zahlenleiste, Rollen im Kartenkopf). Neue Meldungen: EROBERT, ZURÜCKEROBERT, ZÄHLT NICHT, ZURÜCK, HALBIERT, ROLLENTAUSCH. Glossar: Inning, Runs, Stopper, Scorer.
  2. Logo Turnierscheibe in App, Favicon und App-Icons.
  3. Zurücksetzen mit Sicherungsangebot und Bestätigungswort.
  4. Archiv unter „Daten".
  5. Startseite nur mit laufenden Spielen, Kachel „Ergebnisse".
- Prüfung 0.7.0: 119 Regeltests grün (vorher 102 im rekonstruierten 0.6.1-Stand). Build sauber (48 Dateien). Headless-Chrome, 84 Prüfungen: Startseite mit fünf Kacheln und „Ergebnisse" rechts unten, Logo lädt, Scram über ein ganzes Match mit Rollentausch, Ergebnisse mit Sieger, War Eroberung und Rückeroberung, Fives-Summenhinweis und Wertung, Baseball, Steeples-Rückschritt, Archiv unter Daten mit Zurückholen, Zurücksetzen (falsches Wort, richtiges Wort, Datenbank und Einstellungen leer), Import der vorher gezogenen Sicherung holt alles zurück, Sicherung mit Schema 7, Regression aller 28 Modi quer (1280×800) und hoch (800×1280). Keine Konsolenfehler. Nicht auf dem Tablet geprüft.

## Offen
- Upload 0.7.0 (enthält 0.6.1) durch den Nutzer, danach Test auf dem Tablet.
- Querformat auf dem Tablet noch nicht bestätigt. Ob es das trifft, was der Nutzer mit „Widescreen" meinte, ist UNSICHER.
- Überzählige `deploy.yml` im Wurzelordner des Repositorys löschen (Komfort, wirkungslos).
- Killer mit „ganzes Feld": Ein Triple auf die eigene Zahl macht nur zum Killer, die übrigen Treffer verfallen. Entscheidung des Nutzers steht aus.
- Ein Dart, der unmittelbar vor dem Schließen der App eingegeben wird, kann fehlen (Speichern nach dem Rendern im Hintergrund). Im Test nach 500 ms gespeichert, Zeitspanne dazwischen nicht gemessen.
- Nicht eingebaut, weil eine Engine-Erweiterung oder die Eingabe fehlt: Unentschieden in Tic-Tac-Toe, Tic-Tac-Toe mit festen Feldern wie T9, „Big Single" in Follow the Leader, Abstandswertung in Hare and Hounds, Abstand zum Bull im Scram-Stechen.
- War mit 1–20 + Bull dauert lang (21 Felder). Ob die Annahmen zu Stärke und Rückeroberung im Spiel passen, muss der Nutzer am Brett prüfen.
- Checkout-Wege gültig, aber nicht überall Profi-Tabelle (z. B. 130, 123). Betrifft X01, 121 und Shooting Gallery.
- Phase 3 Rest: Verlauf je Leg statt je Match, Trefferquote auf das angepeilte Feld in X01.

## Spätere Phasen
4. Rest: Score-Ansage per Sprachausgabe.
5. Optional: Cloud-Sync (Supabase), APK über Capacitor.
