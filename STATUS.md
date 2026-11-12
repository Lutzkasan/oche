# Oche – Projektstand (Übergabe)

Stand: 12.11.2026, Version 0.5.0. Das ZIP `oche-0.5.0-komplett.zip` enthält den kompletten Ordner `oche` einschließlich `fonts/`, `icons/` und `.github/` für den ersten Upload in ein leeres Repository. Nach dem Upload ist das GitHub-Repository die maßgebliche Quelle. Im Projekt liegen nur die Textdateien.

Hosting-Stand: GitHub-Konto angelegt (12.11.2026). Repository und Pages noch nicht eingerichtet, noch nichts hochgeladen. Nächster Schritt mit dem Nutzer: README-Schritte für GitHub Pages durchgehen.

## Entscheidungen
- PWA statt nativer App: läuft in Chrome auf dem Android-Tablet, offline, ohne Build-Schritt im Code (ES-Module, kein Framework).
- Datenmodell: Ein Spiel speichert nur die Liste aller Einzeldarts `{s, m, t}`. Spielstand, Undo, Fortsetzen und Statistik entstehen per Replay (`engine.js`). Neue Kennzahlen gelten rückwirkend.
- Eingabe: jeder Dart einzeln (Segment + Double/Triple). Single innen/außen wird nicht unterschieden, das Trefferbild färbt beide Ringe gleich.
- Speicher: IndexedDB, `navigator.storage.persist()`, Export/Import als JSON (Merge nach ID, neuere `updatedAt` gewinnt).
- UI-Regel: erst Zustand ändern und rendern, dann im Hintergrund speichern.
- Hosting: GitHub Pages mit GitHub Actions (öffentliches Repository). Der Workflow testet, baut und stempelt die Cache-Version automatisch.
- Service Worker cache-first. `VERSION` (Inhalts-Hash) und `FILES` (Verzeichnis) setzt `tools/build.mjs`. Der Build bricht ab, wenn ein Import oder Verweis auf eine fehlende Datei zeigt.
- Regelvertrag: Pflicht `id, title, subtitle, initLeg(cfg, n, starter), score, applyDart, line`. Optional `active`, `turnEnd(leg, p, cfg, turn)` mit `{winner}`, `{event}` oder `{again}`, `canStop`, `minPlayers`, `maxPlayers`, im Dart-Ergebnis `endTurn` und `event`. Die Engine kennt keine Modi beim Namen.
- 0.5.0: `starter` in `initLeg` (Index des anwerfenden Spielers). Hare and Hounds macht ihn zum Hasen, damit Legwechsel und Revanche die Rollen tauschen.
- 0.5.0: Stopp-Eintrag `{s: 0, m: 0, stop: true}` in der Dartliste. Er beendet die Aufnahme, zählt nicht als Dart und erscheint nicht in `st.darts`. Erlaubt nur, wenn die Regel `canStop` meldet (Golf „letzter Dart", Follow the Leader). Undo nimmt ihn wie einen Dart zurück.
- 0.5.0: Rundenspiele mit Stechen teilen `rules/rounds.js` (Shanghai, Bob's 27, Halve-It, Bermuda, 121, Golf, JDC, Shooting Gallery). Golf negiert die Wertung in `rank()`.
- 0.5.0: Gemeinsame Bausteine statt Kopien: `rules/checks.js` (Double-Out-Versuch für 121 und Shooting Gallery), `rules/cricket.js` `applyMarks` (Cricket, Mickey Mouse, Shove Ha'penny), `rules/atc.js` (Around the Clock, Doppel-Training, Chase the Dragon), `halveit.js` (Halve-It, Bermuda Triangle). Doppel-Training und Bermuda sind eigene Modus-IDs mit geteilter Regel, damit Menü und Statistik sie getrennt führen.
- 0.5.0: Oberfläche aufgeteilt: `ui.js` (Zustand, Bausteine), `modes.js` (`MODES` je Modus mit Gruppe, deklarativen Optionen, Brett, Tasten, Overlay, Statistik-Abschnitt), `help.js` (Erklärtexte), `app.js` (Ansichten, Aktionen). Setup-Vorgaben entstehen aus den Optionen (`setupDefaults`).
- 0.5.0: `stats.js` mit Registry `STATS[mode] = {init, add, fin}` und Replay-Cache. `hasPlay(g, spieler)` ist die einzige Prüfung, ob ein Spiel für einen Spieler zählt (Filter und Kennzahlen).
- Zufallswerte (Killer-/Blind-Killer-Zahlen, Tic-Tac-Toe-Raster, Halve-It „Zufall", Doppel-Training „Zufällig") werden beim Start einmal ausgelost und in `config` gespeichert. Replay bleibt deterministisch. Revanche lost neu aus.
- Sicherungs-Schema 4 (0.5.0). Apps bis 0.3.0 prüfen nur die Schema-Nummer, deshalb steigt sie mit jedem neuen Modus. Ab 0.4.0 prüft der Import zusätzlich jeden Modus gegen `RULES`.
- Regelquellen 0.5.0 (vor dem Bau geprüft, Abweichungen als Setup-Option):
  - Tic-Tac-Toe: ANNAHME „3 Marks" ohne Quelle, ersetzt durch 1 Treffer (darts501, World Dolf Federation) oder 4 Marks (Phoenix, Granboard, Arachnid laut WDF). Volles Raster: mehr Felder gewinnt (Phoenix). Bei 9 Feldern und 2 Spielern immer eindeutig, das Stechen auf Bull entfällt.
  - Hare and Hounds: Laufweg im Uhrzeigersinn bestätigt (WDF, darts501, Darts Corner). ANNAHME „D/T rückt nur eins vor" bestätigt (WDF), Tiny Monkey: 2/3 Felder → Option. Hunde ab 5 oder 12 (darts501) → Option. Einholen (WDF) oder Überholen (darts501) → Option. 2–4 Spieler (darts501, Tiny Monkey).
  - Follow the Leader: Ablauf nach darts501 (Treffer mit Dart 1/2: übrige Darts legen fest, mit Dart 3: Extra-Aufnahme, festlegender Dart daneben kostet Leben, Setzer darf passen). Tiny Monkey beschreibt ein anderes Spiel (Strafpunkte), nicht eingebaut.
  - Chase the Dragon: T10–T20, 25, Bull bestätigt (Darts Corner, darts501). Tiny-Monkey-Variante (Punkte, ohne Fehlwurf) weggelassen. „Three-headed Dragon" (darts501) als Option.
  - Golf: KONFLIKT Schlagtabelle D1/T2/S3/5 (GLD) gegen D1/T3/S4/5 (darthelp) → Option. Beide Quellen: letzter Dart zählt, Aufhören erlaubt. Deshalb die Taste „Fertig", „bester Dart" bleibt als Hausregel wählbar. Gleichstand regelt keine Quelle: Stechen über weitere Löcher.
  - Knockout: Darts Corner „Vorwerfer schlagen" gegen darts501 „höchste Aufnahme bisher" → Option. Gleichstand = nicht geschafft.
  - Nine Lives: 3 Leben (darts501, darthelp) gegen 9 (Darts Corner) → Option. Sieg: zuerst durch oder letzter mit Leben (darthelp).
  - Blind Killer: ANNAHME „Zahlen verdeckt, aufdecken beim ersten Treffer" ersetzt: Zahlen im Spiel sichtbar, Besitzer verdeckt, Aufdecken beim Ausscheiden (darts501). Triple kostet 2 Leben (Tiny Monkey) → Option. „Meine Zahl ansehen" für den Werfer.
  - Mickey Mouse: Doppel-/Triple-Felder (darts501) ja/nein, der Reihe nach (Darts Corner) oder beliebig, mit Punkten (darts501) → Optionen. darts501 lässt bei D/T die Wahl zwischen Zahl und Doppel-Feld. Die Eingabe kennt keine Wahl: zuerst die offene Zahl, dann das Feld.
  - Bermuda Triangle: Folge bestätigt (darthelp). Runde 25 zählt 25 und Bull je 25, Runde Bull nur das Bull. KONFLIKT Tiny Monkey: anderes Spiel, nicht eingebaut. Rundung offen, Autor rundet ab → Abrunden voreingestellt. Halve-It bekommt dieselbe Rundungsoption.
  - Gotcha: ANNAHME Bust bestätigt (WDF, darthelp). Varianten „Rest zurück" (darthelp, Arachnid) und Double Out (WDF) → Optionen. Zurücksetzen gilt pro Dart und bleibt bei späterem Bust bestehen (Quellen: „during your turn").
  - Shove Ha'penny: ANNAHME „Überschuss verfällt" widerlegt: Überschuss geht an einen Gegner, der das Feld braucht (WDF, darts501). Bull ja (darts501) oder nein (WDF) → Option. Geschenk macht den Gegner fertig: er gewinnt, außer der Werfer schließt in derselben Aufnahme selbst (WDF).
  - JDC Challenge: KONFLIKT 3 Darts je Zahl und 21 Doppel-Darts (WDF, GoDartsPro) gegen 5 Aufnahmen und 5 Doppel-Durchgänge (mydartpfeil) → Option. Doppel 50, Bull 100, Shanghai +100. Stufen White–Black (WDF, mydartpfeil). Eine offizielle JDC-Regelseite war nicht auffindbar.
  - Shooting Gallery: Punktetabelle 12/8/6/5/3/2/1 bestätigt (GoDartsPro). Überwerfen regelt die Quelle nicht: wie X01.

## Fertig
- Phase 1 + 2: X01 (301–1001, Single/Double/Master In/Out, Legs, Sets, Checkout-Vorschläge), Cricket (Standard, Cut-Throat), Profile, Revanche, Undo über Leg-/Matchgrenzen, Basis-Statistik, Backup-Erinnerung, Wake Lock.
- Phase 3 (teilweise): Filter nach Zeitraum und Modus, Verlauf je Match mit gleitendem Schnitt und Fadenkreuz, Trefferbild als Dartscheibe.
- Phase 4: Around the Clock, Shanghai, Killer (0.3.0). Bob's 27, Halve-It, 121 (0.4.0).
- 0.5.0, Teil A: 15 neue Modi. Tic-Tac-Toe, Hare and Hounds, Follow the Leader, Chase the Dragon, Golf, Knockout, Nine Lives, Blind Killer, Mickey Mouse, Bermuda Triangle, Gotcha, Shove Ha'penny, Doppel-Training, JDC Challenge, Shooting Gallery. Je Modus Regeldatei, `MODES`-Eintrag, Statistik-Abschnitt und Regeltests.
- 0.5.0, Teil B: Regeln für alle 23 Modi in `help.js` (Ziel, Aufnahme, Wertung, Sieg, jede Option, Beispiel). Anzeige im Setup (Knopf „Regeln") und im Spielmenü (☰, mit den eingestellten Optionen). Begriffe (Aufnahme, Leg, Bust, Checkout, Marks …) erklärt ein Glossar unter jeder Regel. Die alten Kurzhinweise im Setup sind entfernt.
- 0.5.0, Teil C: Modusmenü als Kachelraster in drei Gruppen. Statistik-Filter als Auswahlliste mit denselben Gruppen. `maxPlayers` sperrt den Start (Tic-Tac-Toe 2, Hare and Hounds 4). `SCHEMA` 4. README und Manifest ohne vollständige Namensliste. Startkachel zählt Modi aus `MODES`.
- 0.5.0, Teil D: Schriften aus `@fontsource/barlow-condensed` und `@fontsource/inter` 5.3.0 (OFL-1.1, Lizenztexte in `fonts/`). Icons mit `tools/make-icons.py`.
- Fehlerbehebungen 0.5.0 (Ursache → Fix):
  - Statistik-Filter zeigte einen Modus schon ohne Darts: Filter und Kennzahlen prüften mit zwei verschiedenen Bedingungen (Spiel vorhanden gegen Darts vorhanden). Jetzt eine Prüfung `hasPlay` für beide.
  - Gleiche Ursache an anderen Stellen gesucht: Die Checkout-Regel von 121 hätte für Shooting Gallery kopiert werden müssen, die Halve-It-Logik für Bermuda, die Cricket-Logik für Mickey Mouse und Shove Ha'penny. Alle als gemeinsame Bausteine umgesetzt, damit keine zweite Kopie auseinanderlaufen kann.
  - `sw.js` führte für den ungebauten Betrieb eine handgepflegte Dateiliste. Sie veraltet bei jeder neuen Datei (derselbe Mechanismus, den der Build für den Deploy behebt) und ließ die Installation scheitern, sobald eine gelistete Datei fehlte. Jetzt nur noch Grunddateien, alles andere lädt aus dem Netz. Der Build ersetzt die Liste wie bisher.
- Prüfung 0.5.0: 85 Regeltests grün (vorher 46). Build sauber (42 Dateien). Headless-Chrome quer (1280×800) und hoch (800×1280) für jeden neuen Modus: Spielstand mitten im Spiel, Matchende, Rückgängig aus dem Matchende, erneutes Beenden, Revanche, Regeln im Spielmenü. Dazu: Regression der 8 alten Modi, Setup mit Regeln-Dialog, `maxPlayers` sperrt, Statistik-Auswahlliste und Abschnitte, Reload mitten im Spiel mit „Fertig" und Undo des Stopps. Keine Konsolenfehler.

## Offen
- Erster Upload auf GitHub mit dem kompletten ZIP. Schritte in README.md.
- Killer mit „ganzes Feld": Ein Triple auf die eigene Zahl macht nur zum Killer, die übrigen Treffer verfallen. Entscheidung des Nutzers steht aus.
- Nicht auf echter Android-Hardware getestet.
- Ein Dart, der unmittelbar vor dem Schließen der App eingegeben wird, kann fehlen: Das Speichern läuft nach dem Rendern im Hintergrund (bewusste UI-Regel). Im Test fehlte er nach sofortigem Reload, nach 500 ms Wartezeit war er gespeichert. Die Zeitspanne dazwischen ist nicht gemessen.
- Nicht eingebaut, weil eine Engine-Erweiterung oder die Eingabe fehlt: Unentschieden in Tic-Tac-Toe (Pub-Regel), Tic-Tac-Toe mit festen Feldern wie T9 oder D2 (darts501), „Big Single" in Follow the Leader, Abstandswertung beim Rollentausch in Hare and Hounds (darts501).
- Checkout-Wege gültig, aber nicht überall Profi-Tabelle (z. B. 130, 123 → T19 D13 D20). Betrifft X01, 121 und Shooting Gallery.
- Ein und zwei Spieler: Karten haben viel Leerraum, im Hochformat besonders bei Around the Clock, Chase the Dragon, Doppel-Training, Killer, 121, Shooting Gallery, JDC.
- Phase 3 Rest: Verlauf je Leg statt je Match, Trefferquote auf das angepeilte Feld in X01 (braucht Zielangabe bei der Eingabe).

## Spätere Phasen
4. Rest: Design-Feinschliff (Leerraum bei 1–2 Spielern), Score-Ansage per Sprachausgabe.
5. Optional: Cloud-Sync (Supabase), APK über Capacitor.
