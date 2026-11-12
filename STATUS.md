# Oche – Projektstand (Übergabe)

Stand: 12.11.2026, Version 0.6.0. Maßgebliche Quelle ist das GitHub-Repository `Lutzkasan/oche`. Im Projekt liegen nur die Textdateien. Updates gehen als ZIP mit den geänderten Dateien an den Nutzer, er lädt sie über **Add file → Upload files** hoch.

Hosting-Stand: Repository `Lutzkasan/oche` (öffentlich), Pages-Quelle „GitHub Actions". Erster Upload 0.5.0 am 12.11.2026, Lauf „Deploy #1" grün. Adresse aus dem Kontonamen abgeleitet: `https://lutzkasan.github.io/oche/` (maßgeblich ist Settings → Pages). Auf dem Tablet in Chrome installiert, startet. Update 0.6.0 als `oche-0.6.0-update.zip` ausgeliefert, Upload durch den Nutzer steht aus.

Beim ersten Upload fehlte `.github`: Ordner per Drag-and-drop aus dem Windows-Explorer in Firefox hochgeladen, alle anderen Ordner kamen an, `.github` nicht. Die Workflow-Datei wurde von Hand angelegt (zuerst unter `workflows/deploy.yml` ohne `.github`, dann verschoben). Mechanismus nicht geklärt, wahrscheinlich lässt der Browser-Upload Punkt-Ordner aus. Im Repository liegt außerdem eine überzählige `deploy.yml` im Wurzelordner (gleicher Inhalt, wirkungslos, der Build kopiert sie nicht). Spätere Updates berühren die Workflow-Datei nicht.

## Entscheidungen
- PWA statt nativer App: läuft in Chrome auf dem Android-Tablet, offline, ohne Build-Schritt im Code (ES-Module, kein Framework).
- Datenmodell: Ein Spiel speichert nur die Liste aller Einzeldarts `{s, m, t}`. Spielstand, Undo, Fortsetzen und Statistik entstehen per Replay (`engine.js`). Neue Kennzahlen gelten rückwirkend.
- Eingabe: jeder Dart einzeln (Segment + Double/Triple). Single innen/außen wird nicht unterschieden, das Trefferbild färbt beide Ringe gleich.
- Speicher: IndexedDB, `navigator.storage.persist()`, Export/Import als JSON (Merge nach ID, neuere `updatedAt` gewinnt, `mergeItems` in `db.js`).
- UI-Regel: erst Zustand ändern und rendern, dann im Hintergrund speichern.
- Hosting: GitHub Pages mit GitHub Actions (öffentliches Repository). Der Workflow testet, baut und stempelt die Cache-Version automatisch.
- Service Worker cache-first. `VERSION` (Inhalts-Hash) und `FILES` (Verzeichnis) setzt `tools/build.mjs`. Der Build bricht ab, wenn ein Import oder Verweis auf eine fehlende Datei zeigt.
- Regelvertrag: Pflicht `id, title, subtitle, initLeg(cfg, n, starter), score, applyDart, line`. Optional `active`, `turnEnd(leg, p, cfg, turn)` mit `{winner}`, `{event}` oder `{again}`, `canStop`, `minPlayers`, `maxPlayers`, im Dart-Ergebnis `endTurn` und `event`. Die Engine kennt keine Modi beim Namen.
- 0.5.0: `starter` in `initLeg` (Index des anwerfenden Spielers). Hare and Hounds macht ihn zum Hasen, damit Legwechsel und Revanche die Rollen tauschen.
- 0.5.0: Stopp-Eintrag `{s: 0, m: 0, stop: true}` in der Dartliste. Er beendet die Runde, zählt nicht als Dart und erscheint nicht in `st.darts`. Erlaubt nur, wenn die Regel `canStop` meldet (Golf „letzter Dart", Follow the Leader). Undo nimmt ihn wie einen Dart zurück.
- 0.5.0: Rundenspiele mit Stechen teilen `rules/rounds.js` (Shanghai, Bob's 27, Halve-It, Bermuda, 121, Golf, JDC, Shooting Gallery). Golf negiert die Wertung in `rank()`.
- 0.5.0: Gemeinsame Bausteine statt Kopien: `rules/checks.js` (Double-Out-Versuch für 121 und Shooting Gallery), `rules/cricket.js` `applyMarks` (Cricket, Mickey Mouse, Shove Ha'penny), `rules/atc.js` (Around the Clock, Doppel-Training, Chase the Dragon), `halveit.js` (Halve-It, Bermuda Triangle). Doppel-Training und Bermuda sind eigene Modus-IDs mit geteilter Regel, damit Menü und Statistik sie getrennt führen.
- 0.5.0: Oberfläche aufgeteilt: `ui.js` (Zustand, Bausteine), `modes.js` (`MODES` je Modus mit Gruppe, deklarativen Optionen, Brett, Tasten, Overlay, Statistik-Abschnitt), `help.js` (Erklärtexte), `app.js` (Ansichten, Aktionen). Setup-Vorgaben entstehen aus den Optionen (`setupDefaults`).
- 0.5.0: `stats.js` mit Registry `STATS[mode] = {init, add, fin}` und Replay-Cache. `hasPlay(g, spieler)` ist die einzige Prüfung, ob ein Spiel für einen Spieler zählt (Filter und Kennzahlen). Ab 0.6.0 prüft sie auch `excluded`. `hasDarts` ist dieselbe Prüfung ohne Wertung, nur für die Spieleliste.
- Zufallswerte (Cricket-Zufallszahlen, Around the Clock „Zufällig", Killer-/Blind-Killer-Zahlen, Tic-Tac-Toe-Raster, Halve-It „Zufall", Doppel-Training „Zufällig") werden in `prepare` (modes.js) beim Start einmal ausgelost und in `config` gespeichert. Replay bleibt deterministisch. Revanche lost neu aus.
- 0.6.0: Begriff „Runde" statt „Aufnahme" in allen Texten (Nutzerwunsch, Lösung 1). Im Glossar mit Hinweis auf „Aufnahme". In allen Rundenspielen wirft jeder Spieler genau eine Runde je Ziel, die Doppelbedeutung, die vor der Entscheidung befürchtet war, entsteht deshalb nicht. 121 und Shooting Gallery zählen „Versuche" (mehrere Runden). Code-Kommentare und Bezeichner sprechen weiter von Aufnahme/turn.
- 0.6.0: Löschen schreibt einen Lösch-Vermerk `{ id, deleted: true, updatedAt }` statt den Eintrag zu entfernen (Spiel löschen im Spielmenü, Profil ohne Spiele). Ursache: Der Import führt nach ID zusammen, ein spurlos gelöschter Eintrag kam mit jeder älteren Sicherung zurück. Die App lädt nur lebende Einträge (`getLive`), Export und Import tragen die Vermerke mit.
- 0.6.0: Archivieren (Profil) und Nicht werten (Spiel) sind umkehrbare Kennzeichen (`archived`, `excluded`) über `setFlag`, das `updatedAt` setzt. Der bestehende Merge behält damit den neueren Stand, kein Lösch-Vermerk nötig. Welche Profile in Auswahllisten erscheinen, entscheidet nur `visiblePlayers()` in `app.js`.
- 0.6.0: `gameTime` (Zeitraum-Filter) nutzt Spielende, sonst den letzten Wurf, sonst `createdAt`. Vorher `updatedAt`, das auch beim Ausnehmen wechselt und damit ein laufendes Spiel im Zeitraum verschoben hätte.
- 0.6.0: Teilen schickt die Sicherung als `.txt` mit `text/plain`. Chrome prüft beim Teilen Endung und MIME-Typ gegen eine Freigabeliste. `.json` und `application/json` stehen nicht darauf, `.txt` und `text/plain` schon (Chromium `share_service_impl.cc`, Android-Liste laut Kommentar synchron). Mit `.json` lehnte `canShare` jede Sicherung ab und „Teilen" speicherte nur eine Datei. „Als Datei speichern" bleibt `.json`, der Import liest beide.
- 0.6.0: Meldungen (Toasts) ohne Knopf lassen Tipps durch (`pointer-events: none`). Eine Meldung am unteren Rand fing sonst den nächsten Tipp auf einen Knopf darunter ab (im Browsertest „Nicht werten", betrifft genauso die untere Tastenreihe im Spiel).
- 0.6.0: Spielerkarten bei 1–2 Spielern sind Größen-Container. Zahl, Zielleiste, Leben, Kennzahlen und Slots skalieren mit `cqh`/`cqw`. Querformat ab 1000 px Breite: Start, Setup, Spieler und Statistik zweispaltig, Seiten bis 1440 px breit.
- Sicherungs-Schema 5 (0.6.0). Eine App mit Schema 4 lehnt Sicherungen mit Lösch-Vermerken ab, statt sie als Spiele ohne Modus zu lesen. Apps bis 0.3.0 prüfen nur die Schema-Nummer. Ab 0.4.0 prüft der Import zusätzlich jeden Modus gegen `RULES`, Lösch-Vermerke ausgenommen.
- Regelquellen 0.6.0:
  - Cricket mit Zufallszahlen: DARTSLIVE „Random Cricket": sechs zufällige Zahlen und Bull, sonst Standard Cricket. ANNAHME: Bereich 1–20, DARTSLIVE nennt keinen. Andere Varianten gesichtet, nicht eingebaut: Wild Cricket (15–20 + Bull + eine Wildzahl aus 1–14, dolfdarts), Wild Card Cricket (6 aus 7–20, auf Automaten wechselnd), Hidden Cricket (verdeckt, DARTSLIVE).
  - Around the Clock, Reihenfolge: aufsteigend, absteigend mit Bull zuerst, zufällig mit Bull an beliebiger Stelle (dartcounter.net). Im Uhrzeigersinn (mydartpfeil) nicht eingebaut. D/T springt endet vor jedem Bull, auch mitten in der Folge.
  - Zufall nicht eingebaut für Mickey Mouse, Shove Ha'penny, Shanghai, Chase the Dragon, Bob's 27: Die Zielfolge ist dort das Spiel selbst, keine Quelle beschreibt eine Zufallsvariante.
- Regelquellen 0.5.0 (vor dem Bau geprüft, Abweichungen als Setup-Option):
  - Tic-Tac-Toe: ANNAHME „3 Marks" ohne Quelle, ersetzt durch 1 Treffer (darts501, World Dolf Federation) oder 4 Marks (Phoenix, Granboard, Arachnid laut WDF). Volles Raster: mehr Felder gewinnt (Phoenix). Bei 9 Feldern und 2 Spielern immer eindeutig, das Stechen auf Bull entfällt.
  - Hare and Hounds: Laufweg im Uhrzeigersinn bestätigt (WDF, darts501, Darts Corner). ANNAHME „D/T rückt nur eins vor" bestätigt (WDF), Tiny Monkey: 2/3 Felder → Option. Hunde ab 5 oder 12 (darts501) → Option. Einholen (WDF) oder Überholen (darts501) → Option. 2–4 Spieler (darts501, Tiny Monkey).
  - Follow the Leader: Ablauf nach darts501 (Treffer mit Dart 1/2: übrige Darts legen fest, mit Dart 3: Extra-Runde, festlegender Dart daneben kostet Leben, Setzer darf passen). Tiny Monkey beschreibt ein anderes Spiel (Strafpunkte), nicht eingebaut.
  - Chase the Dragon: T10–T20, 25, Bull bestätigt (Darts Corner, darts501). Tiny-Monkey-Variante (Punkte, ohne Fehlwurf) weggelassen. „Three-headed Dragon" (darts501) als Option.
  - Golf: KONFLIKT Schlagtabelle D1/T2/S3/5 (GLD) gegen D1/T3/S4/5 (darthelp) → Option. Beide Quellen: letzter Dart zählt, Aufhören erlaubt. Deshalb die Taste „Fertig", „bester Dart" bleibt als Hausregel wählbar. Gleichstand regelt keine Quelle: Stechen über weitere Löcher.
  - Knockout: Darts Corner „Vorwerfer schlagen" gegen darts501 „höchste Runde bisher" → Option. Gleichstand = nicht geschafft.
  - Nine Lives: 3 Leben (darts501, darthelp) gegen 9 (Darts Corner) → Option. Sieg: zuerst durch oder letzter mit Leben (darthelp).
  - Blind Killer: ANNAHME „Zahlen verdeckt, aufdecken beim ersten Treffer" ersetzt: Zahlen im Spiel sichtbar, Besitzer verdeckt, Aufdecken beim Ausscheiden (darts501). Triple kostet 2 Leben (Tiny Monkey) → Option. „Meine Zahl ansehen" für den Werfer.
  - Mickey Mouse: Doppel-/Triple-Felder (darts501) ja/nein, der Reihe nach (Darts Corner) oder beliebig, mit Punkten (darts501) → Optionen. darts501 lässt bei D/T die Wahl zwischen Zahl und Doppel-Feld. Die Eingabe kennt keine Wahl: zuerst die offene Zahl, dann das Feld.
  - Bermuda Triangle: Folge bestätigt (darthelp). Runde 25 zählt 25 und Bull je 25, Runde Bull nur das Bull. KONFLIKT Tiny Monkey: anderes Spiel, nicht eingebaut. Rundung offen, Autor rundet ab → Abrunden voreingestellt. Halve-It bekommt dieselbe Rundungsoption.
  - Gotcha: ANNAHME Bust bestätigt (WDF, darthelp). Varianten „Rest zurück" (darthelp, Arachnid) und Double Out (WDF) → Optionen. Zurücksetzen gilt pro Dart und bleibt bei späterem Bust bestehen (Quellen: „during your turn").
  - Shove Ha'penny: ANNAHME „Überschuss verfällt" widerlegt: Überschuss geht an einen Gegner, der das Feld braucht (WDF, darts501). Bull ja (darts501) oder nein (WDF) → Option. Geschenk macht den Gegner fertig: er gewinnt, außer der Werfer schließt in derselben Runde selbst (WDF).
  - JDC Challenge: KONFLIKT 3 Darts je Zahl und 21 Doppel-Darts (WDF, GoDartsPro) gegen 5 Runden und 5 Doppel-Durchgänge (mydartpfeil) → Option. Doppel 50, Bull 100, Shanghai +100. Stufen White–Black (WDF, mydartpfeil). Eine offizielle JDC-Regelseite war nicht auffindbar.
  - Shooting Gallery: Punktetabelle 12/8/6/5/3/2/1 bestätigt (GoDartsPro). Überwerfen regelt die Quelle nicht: wie X01.

## Fertig
- Phase 1 + 2: X01 (301–1001, Single/Double/Master In/Out, Legs, Sets, Checkout-Vorschläge), Cricket (Standard, Cut-Throat), Profile, Revanche, Undo über Leg-/Matchgrenzen, Basis-Statistik, Backup-Erinnerung, Wake Lock.
- Phase 3 (teilweise): Filter nach Zeitraum und Modus, Verlauf je Match mit gleitendem Schnitt und Fadenkreuz, Trefferbild als Dartscheibe.
- Phase 4: Around the Clock, Shanghai, Killer (0.3.0). Bob's 27, Halve-It, 121 (0.4.0).
- 0.5.0: 15 neue Modi, Regeln für alle 23 Modi mit Glossar, Modusmenü in drei Gruppen, Statistik-Auswahlliste, eigene Schriften und Icons. Details in der Git-Historie (Commit „Oche 0.5.0").
- Erster Upload auf GitHub und Installation auf dem Tablet (12.11.2026).
- 0.6.0 (Wunschliste des Nutzers vom 12.11.2026, alle sieben Punkte):
  1. Querformat: zweispaltige Seiten (Start, Setup, Spieler, Statistik). Spielerkarten bei 1–2 Spielern skalieren mit der Kartengröße, der Leerraum ist weg.
  2. Profile: „Archivieren" (mit Spielen, umkehrbar unter „Archiviert") und „Löschen" (ohne Spiele, mit Lösch-Vermerk).
  3. „Runde" statt „Aufnahme" in Regeln, Glossar, Spielbrettern und Statistik.
  4. Cricket mit Zufallszahlen (6 + Bull, mit Standard und Cut-Throat), Around the Clock mit Reihenfolge aufsteigend, absteigend, zufällig.
  5. Teilen als `.txt`, damit Mail, WhatsApp und Drive im Teilen-Menü erscheinen.
  6. Statistik: Abschnitt „Spiele" mit „Nicht werten" / „Wieder werten" je Spiel, gilt für alle Spieler.
  7. Statistik: Zeitraum „Von – Bis" mit zwei Datumsfeldern, beide Tage eingeschlossen.
- Fehlerbehebungen 0.6.0 (Ursache → Fix):
  - Gelöschte Spiele und Profile kamen mit jeder älteren Sicherung zurück: spurloses Löschen plus Merge nach ID → Lösch-Vermerke.
  - Teilen erreichte nie das Teilen-Menü: Dateityp nicht auf Chromes Freigabeliste → `.txt`/`text/plain`.
  - Archivierte Profile mit Spielen erschienen weiter in der Statistik-Spielerliste: eigene Filterbedingung in `viewStats` → eine Funktion `visiblePlayers()` für alle Listen.
  - Toasts fingen Tipps auf Knöpfe darunter ab → Toasts ohne Knopf durchlässig.
  - Gleiche Ursache an anderer Stelle gesucht: `updatedAt` als Zeitpunkt in `gameTime` (s. Entscheidungen). Der Import zählte Lösch-Vermerke als unbekannten Modus → ausgenommen.
- Prüfung 0.6.0: 94 Regeltests grün (vorher 85), darunter Merge mit Lösch-Vermerken, Ausnehmen, freier Zeitraum, Zufallszahlen, ATC-Reihenfolge, Revanche lost neu aus. Build sauber (42 Dateien). Headless-Chrome: 10 Browser-Prüfungen (Nicht werten für beide Spieler, alle Spiele ausgenommen, Von–Bis, Archivieren und Zurückholen, Löschen gegen alte Sicherung, Spiel löschen mit Export, Random-Cricket-Partie bis Matchende und Revanche, Regeltext, ATC zufällig, Teilen als .txt). Regression aller 23 Modi mit 2 Spielern quer (1280×800) und hoch (800×1280): Start, 6 Darts, Rückgängig, Regeln, kein „Aufnahme" mehr im Text. Keine Konsolenfehler. Nicht auf dem Tablet geprüft.

## Offen
- Upload 0.6.0 durch den Nutzer, danach auf dem Tablet prüfen: Teilen-Menü zeigt Mail und WhatsApp, Querformat wie gewünscht. Ob das Querformat das trifft, was der Nutzer mit „Widescreen" meinte, ist UNSICHER: Das Spielbrett hatte schon vorher ein eigenes Querformat. Falls der Bildschirm auf dem Tablet gar nicht dreht: Android-Autodrehen prüfen, Manifest steht auf `"orientation": "any"`.
- Überzählige `deploy.yml` im Wurzelordner des Repositorys löschen (Komfort, wirkungslos).
- Killer mit „ganzes Feld": Ein Triple auf die eigene Zahl macht nur zum Killer, die übrigen Treffer verfallen. Entscheidung des Nutzers steht aus.
- Ein Dart, der unmittelbar vor dem Schließen der App eingegeben wird, kann fehlen: Das Speichern läuft nach dem Rendern im Hintergrund (bewusste UI-Regel). Im Test fehlte er nach sofortigem Reload, nach 500 ms Wartezeit war er gespeichert. Die Zeitspanne dazwischen ist nicht gemessen.
- Nicht eingebaut, weil eine Engine-Erweiterung oder die Eingabe fehlt: Unentschieden in Tic-Tac-Toe (Pub-Regel), Tic-Tac-Toe mit festen Feldern wie T9 oder D2 (darts501), „Big Single" in Follow the Leader, Abstandswertung beim Rollentausch in Hare and Hounds (darts501).
- Checkout-Wege gültig, aber nicht überall Profi-Tabelle (z. B. 130, 123 → T19 D13 D20). Betrifft X01, 121 und Shooting Gallery.
- Phase 3 Rest: Verlauf je Leg statt je Match, Trefferquote auf das angepeilte Feld in X01 (braucht Zielangabe bei der Eingabe).

## Spätere Phasen
4. Rest: Score-Ansage per Sprachausgabe.
5. Optional: Cloud-Sync (Supabase), APK über Capacitor.
