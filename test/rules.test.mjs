// Ausführen mit: node test/rules.test.mjs
import assert from 'node:assert/strict';
import { replay, matchLine, canStop, RULES, prepareConfig } from '../js/engine.js';
import { suggestCheckout } from '../js/checkout.js';
import { playerStats, filterGames, rolling, hasPlay, hasDarts, gameTime } from '../js/stats.js';
import { atcTarget, dblTargets, atcOrder, atcTargets } from '../js/rules/atc.js';
import { cricketRows, drawCricketNumbers, CRICKET_ROWS } from '../js/rules/cricket.js';
import { drawNumbers } from '../js/rules/killer.js';
import { bobsTarget } from '../js/rules/bobs.js';
import { drawHalveTargets, HALVE_SETS, BERMUDA } from '../js/rules/halveit.js';
import { drawGrid } from '../js/rules/ttt.js';
import { hareTarget } from '../js/rules/hare.js';
import { jdcPlan, jdcGrade } from '../js/rules/jdc.js';
import { galleryPoints } from '../js/rules/gallery.js';
import { outStep } from '../js/rules/checks.js';
import { importAll, mergeItems, tombstone, SCHEMA, sanitize, validGame, validPlayer, validConfig } from '../js/db.js';

// Schreibweise der Darts: 20, D20, T20, 25, BULL, - (daneben), X (Aufnahme beenden, Taste „Fertig")
const D = (txt) => txt.split(/\s+/).filter(Boolean).map((t) => {
  if (t === '-') return { s: 0, m: 1 };
  if (t === 'X') return { s: 0, m: 0, stop: true };
  if (t === 'BULL') return { s: 25, m: 2 };
  const m = t[0] === 'T' ? 3 : t[0] === 'D' ? 2 : 1;
  return { s: Number(m === 1 ? t : t.slice(1)), m };
});
const game = (mode, config, players, darts) => ({ mode, config: { legs: 1, sets: 1, ...config }, playerIds: Array(players).fill(0).map((_, i) => 'p' + i), darts: D(darts) });
const done = (g) => ({ ...g, status: 'finished', finishedAt: 1 });
// Asynchrone Tests werden gesammelt und vor der Schlusszeile abgewartet. Ein Fehler darin bricht den Lauf ab.
let n = 0; const pending = [];
const ok = (name, fn) => {
  const fin = () => { n++; console.log('✓', name); };
  const r = fn();
  if (r instanceof Promise) pending.push(r.then(fin)); else fin();
};

// ---------- X01 ----------
ok('501: 9-Darter', () => {
  const st = replay(game('x01', { start: 501, in: 'single', out: 'double' }, 1, 'T20 T20 T20 T20 T20 T20 T20 T19 D12'));
  assert.equal(st.finished, true); assert.equal(st.winner, 0);
  assert.equal(st.turns.length, 3); assert.equal(st.turns[2].before, 141);
});

ok('Bust bei Rest 1 und Überwerfen setzt auf Aufnahmebeginn zurück', () => {
  let st = replay(game('x01', { start: 41, in: 'single', out: 'double' }, 1, 'D20'));
  assert.equal(st.leg.rem[0], 41); assert.equal(st.turns[0].bust, true);
  st = replay(game('x01', { start: 41, in: 'single', out: 'double' }, 1, '1 T20'));
  assert.equal(st.leg.rem[0], 41); assert.equal(st.turns[0].points, 0);
});

ok('Finish nur mit Doppel, Single Out mit jedem Dart', () => {
  let st = replay(game('x01', { start: 40, in: 'single', out: 'double' }, 1, '20 20'));
  assert.equal(st.finished, false); assert.equal(st.leg.rem[0], 40);
  st = replay(game('x01', { start: 40, in: 'single', out: 'single' }, 1, '20 20'));
  assert.equal(st.finished, true);
  st = replay(game('x01', { start: 60, in: 'single', out: 'master' }, 1, 'T20'));
  assert.equal(st.finished, true);
});

ok('Double In: Darts zählen erst ab dem ersten Doppel', () => {
  const st = replay(game('x01', { start: 301, in: 'double', out: 'double' }, 1, 'T20 20 D10'));
  assert.equal(st.leg.rem[0], 281); assert.equal(st.turns[0].points, 20);
});

ok('Spielerwechsel, Legs und Sets', () => {
  // 2 Spieler, 41 Start, first to 2 Legs, 2 Sets. Spieler 0 checkt jedes Leg sofort.
  const g = game('x01', { start: 41, in: 'single', out: 'double', legs: 2, sets: 2 }, 2, '');
  const leg0 = D('1 D20');            // Starter 0 checkt
  const leg1 = D('- - - 1 D20');      // Starter 1 wirft 3 daneben, dann checkt 0
  g.darts = [...leg0, ...leg1, ...leg0, ...leg1];
  const st = replay(g);
  assert.equal(st.finished, true); assert.equal(st.winner, 0); assert.deepEqual(st.sets, [2, 0]);
  assert.equal(st.legResults.length, 4);
});

ok('X01-Anzeige: Ø aus abgeschlossenen Aufnahmen', () => {
  const st = replay(game('x01', { start: 501, in: 'single', out: 'double' }, 1, 'T20 T20 T20 20'));
  const ml = matchLine(st, 0);
  assert.equal(ml.avg, 180); assert.equal(ml.darts, 4); assert.equal(ml.last.points, 180);
});

ok('Stopp-Eintrag ist in Modi ohne Aufhören folgenlos und zählt nie als Dart', () => {
  const st = replay(game('x01', { start: 501, in: 'single', out: 'double' }, 1, 'X T20 X'));
  assert.equal(canStop(st), false);
  // X01 erlaubt kein Aufhören, die App zeigt die Taste nicht. Kommt der Eintrag trotzdem, beendet er die Aufnahme ohne Dart.
  assert.equal(st.darts.length, 1); assert.equal(st.turns.length, 1); assert.equal(st.turns[0].stopped, true);
});

// ---------- Cricket ----------
ok('Cricket Standard: Punkte nur auf offene Gegnerfelder, Sieg mit Punktführung', () => {
  const st = replay(game('cricket', { variant: 'standard' }, 2, 'T20 T20 - - - - T19 T18 T17 - - - T16 T15 BULL - - - BULL'));
  // Spieler 0: 20 zu + 60 Punkte, dann 19,18,17,16,15 zu, Bull mit 2+2 Marks
  assert.equal(st.leg.score[0], 60 + 25);
  assert.equal(st.finished, true); assert.equal(st.winner, 0);
});

ok('Cricket Cut-Throat: Punkte gehen an den Gegner', () => {
  const st = replay(game('cricket', { variant: 'cutthroat' }, 2, 'T20 T20'));
  assert.equal(st.leg.score[1], 60); assert.equal(st.leg.score[0], 0);
});

ok('Cricket-Anzeige: MPR schließt die laufende Aufnahme ein', () => {
  const st = replay(game('cricket', { variant: 'standard' }, 2, 'T20 T20 - D19'));
  assert.equal(matchLine(st, 0).mpr, 6); // 6 Marks in 3 Darts
  assert.equal(matchLine(st, 1).mpr, 6); // 2 Marks in 1 Dart
});

// ---------- Around the Clock ----------
const ATC = (cfg) => ({ zone: 'any', bull: false, ...cfg });

ok('Around the Clock: 1 bis 20 der Reihe nach, falsche Zahl zählt nicht', () => {
  let st = replay(game('atc', ATC(), 1, '2 1 1'));
  assert.equal(st.leg.pos[0], 1); assert.equal(atcTarget(st.leg, 0, st.cfg), 2);
  st = replay(game('atc', ATC(), 1, Array.from({ length: 20 }, (_, i) => String(i + 1)).join(' ')));
  assert.equal(st.finished, true); assert.equal(st.legResults[0].darts[0], 20);
  assert.equal(matchLine(st, 0).hitRate, 1);
});

ok('Around the Clock: D/T springt, nur Doppel, nur Triple', () => {
  let st = replay(game('atc', ATC({ zone: 'skip' }), 1, 'T1 D4 5'));
  assert.equal(st.leg.pos[0], 5); assert.equal(atcTarget(st.leg, 0, st.cfg), 6);
  st = replay(game('atc', ATC({ zone: 'double' }), 1, '1 T1 D1 2'));
  assert.equal(st.leg.pos[0], 1);
  st = replay(game('atc', ATC({ zone: 'triple' }), 1, 'D1 T1'));
  assert.equal(st.leg.pos[0], 1);
});

ok('Around the Clock: Sprünge enden vor Bull, Bull beendet das Leg', () => {
  let st = replay(game('atc', ATC({ zone: 'skip', bull: true }), 1, 'T1 T4 T7 T10 T13 T16 T19'));
  assert.equal(atcTarget(st.leg, 0, st.cfg), 25); assert.equal(st.finished, false);
  st = replay(game('atc', ATC({ zone: 'skip', bull: true }), 1, 'T1 T4 T7 T10 T13 T16 T19 25'));
  assert.equal(st.finished, true);
  st = replay(game('atc', ATC({ zone: 'triple', bull: true }), 1, 'T1 T2 T3 T4 T5 T6 T7 T8 T9 T10 T11 T12 T13 T14 T15 T16 T17 T18 T19 T20 25'));
  assert.equal(st.finished, false); // 25 zählt in „Nur Triple" nicht, nur Bull
});

ok('Around the Clock: Wer zuerst durch ist, gewinnt', () => {
  const st = replay(game('atc', ATC({ zone: 'skip' }), 2, 'T1 T4 T7 1 2 3 T10 T13 T16 4 5 6 T19 D20'));
  assert.equal(st.finished, true); assert.equal(st.winner, 0); assert.equal(st.leg.pos[1], 6);
});

// ---------- Shanghai ----------
const SH = (cfg) => ({ rounds: 7, instant: true, ...cfg });
const rounds = (k, fn) => Array.from({ length: k }, (_, i) => fn(i + 1)).join(' ');

ok('Shanghai: Nur die Zahl der Runde zählt, Punkte = Feldwert', () => {
  const st = replay(game('shanghai', SH(), 1, '1 D1 5 T2 20 -'));
  assert.equal(st.leg.score[0], 3 + 6); assert.equal(st.turns.length, 2);
});

ok('Shanghai: S+D+T in einer Aufnahme gewinnt sofort, abschaltbar', () => {
  let st = replay(game('shanghai', SH(), 2, 'T1 1 D1'));
  assert.equal(st.finished, true); assert.equal(st.winner, 0); assert.equal(st.dartEvent.type, 'shanghai');
  st = replay(game('shanghai', SH({ instant: false }), 2, 'T1 1 D1'));
  assert.equal(st.finished, false); assert.equal(st.leg.score[0], 6);
});

ok('Shanghai: Nach der letzten Runde gewinnt die höchste Punktzahl, auch wenn sie nicht zuletzt geworfen hat', () => {
  const st = replay(game('shanghai', SH(), 2, rounds(7, (r) => `${r} - - - - -`)));
  assert.equal(st.finished, true); assert.equal(st.winner, 0); assert.equal(st.turns.length, 14);
  assert.equal(st.turns.at(-1).p, 1); assert.equal(st.lastEvent.p, 0);
});

ok('Shanghai: Gleichstand führt ins Stechen nur der Punktgleichen', () => {
  const tie = rounds(7, (r) => `${r} - - - - - ${r} - -`);
  let st = replay(game('shanghai', SH(), 3, tie));
  assert.equal(st.finished, false); assert.equal(st.lastEvent.type, 'tiebreak');
  assert.deepEqual(st.leg.contenders, [0, 2]); assert.equal(st.current, 0);
  st = replay(game('shanghai', SH(), 3, tie + ' 8 8 -'));
  assert.equal(st.current, 2); // Spieler 1 wird übersprungen
  st = replay(game('shanghai', SH(), 3, tie + ' 8 8 - 8 - -'));
  assert.equal(st.finished, true); assert.equal(st.winner, 0);
  assert.equal(st.turns.filter((t) => t.p === 1).length, 7);
});

ok('Shanghai: Leg-Sieger wechselt den Anwurf, Match über Legs', () => {
  const st = replay(game('shanghai', SH({ rounds: 1, legs: 2 }), 2, '1 - - - - -  1 - - - - -  1 1 - 1 - -'));
  assert.deepEqual(st.legResults.map((r) => r.winner), [0, 1, 0]);
  assert.equal(st.finished, true); assert.equal(st.winner, 0);
});

// ---------- Killer ----------
const K = (cfg) => ({ numbers: [20, 19, 18], lives: 3, zone: 'double', selfHit: true, ...cfg });

ok('Killer: Erst das eigene Doppel macht zum Killer, vorher zählen fremde Zahlen nicht', () => {
  let st = replay(game('killer', K(), 2, 'D19 - -'));
  assert.deepEqual(st.leg.lives, [3, 3]); assert.equal(st.leg.killer[0], false);
  st = replay(game('killer', K(), 2, 'D20 D19 19'));
  assert.deepEqual(st.leg.lives, [3, 2]); assert.equal(st.leg.killer[0], true);
});

ok('Killer: Letzter mit Leben gewinnt', () => {
  const st = replay(game('killer', K(), 2, 'D20 D19 D19 - - - D19'));
  assert.equal(st.finished, true); assert.equal(st.winner, 0); assert.equal(st.dartEvent.type, 'out');
});

ok('Killer: Eigentreffer wirft raus, der Gegner gewinnt ohne zu werfen', () => {
  let st = replay(game('killer', K({ lives: 1 }), 2, 'D20 D20'));
  assert.equal(st.finished, true); assert.equal(st.winner, 1); assert.equal(st.turns[0].darts.length, 2);
  st = replay(game('killer', K({ lives: 1, selfHit: false }), 2, 'D20 D20 -'));
  assert.deepEqual(st.leg.lives, [1, 1]); assert.equal(st.finished, false);
});

ok('Killer: Ausgeschiedene werden übersprungen', () => {
  let st = replay(game('killer', K({ lives: 1 }), 3, 'D20 D19 -'));
  assert.deepEqual(st.leg.lives, [1, 0, 1]); assert.equal(st.current, 2);
  st = replay(game('killer', K({ lives: 1 }), 3, 'D20 D19 - - - - D18'));
  assert.equal(st.finished, true); assert.equal(st.winner, 0);
});

ok('Killer: Ganzes Feld zählt S/D/T als 1/2/3 Treffer', () => {
  const st = replay(game('killer', K({ zone: 'segment' }), 2, '20 T19'));
  assert.equal(st.finished, true); assert.equal(st.winner, 0); assert.equal(matchLine(st, 0).taken, 3);
});

ok('Killer: Zahlen sind verschieden', () => {
  let i = 0; const seq = [0.9, 0.1, 0.5, 0.3, 0.7, 0.2];
  const nums = drawNumbers(8, () => seq[i++ % seq.length]);
  assert.equal(new Set(nums).size, 8); assert.ok(nums.every((x) => x >= 1 && x <= 20));
});

// ---------- Bob's 27 ----------
const BO = (cfg) => ({ bull: true, hard: true, ...cfg });
const miss = (turns) => Array(turns * 3).fill('-').join(' ');

ok("Bob's 27: Treffer bringen den Doppelwert, eine Runde ohne Treffer zieht ihn ab", () => {
  let st = replay(game('bobs', BO(), 1, 'D1 - - - - - - - -'));
  assert.equal(st.leg.score[0], 27 + 2 - 4 - 6); assert.equal(bobsTarget(st.leg, 0), 4);
  st = replay(game('bobs', BO(), 1, 'D1 - - D2 D2 D2 2 T3 D4'));
  assert.equal(st.leg.score[0], 27 + 2 + 12 - 6); // 2, T3 und D4 treffen das Ziel D3 nicht
  assert.equal(st.turns[1].points, 12); assert.equal(st.turns[2].points, -6);
});

ok("Bob's 27: unter 0 scheidet aus, ohne Ausscheiden geht es negativ weiter", () => {
  let st = replay(game('bobs', BO(), 1, miss(5))); // 27 − 2 − 4 − 6 − 8 − 10 = −3
  assert.equal(st.leg.score[0], -3); assert.equal(st.finished, true); assert.equal(st.dartEvent.type, 'out');
  assert.equal(st.legResults[0].scores[0], -3);
  st = replay(game('bobs', BO({ hard: false }), 1, miss(5)));
  assert.equal(st.finished, false); assert.equal(st.leg.score[0], -3); assert.equal(bobsTarget(st.leg, 0), 6);
});

ok("Bob's 27: 20 oder 21 Runden, Bull zählt nur als Bull (50)", () => {
  const allHit = (k) => Array.from({ length: k }, (_, i) => (i < 20 ? `D${i + 1} - -` : 'BULL 25 -')).join(' ');
  let st = replay(game('bobs', BO(), 1, allHit(21)));
  assert.equal(st.finished, true); assert.equal(st.leg.score[0], 27 + 420 + 50);
  st = replay(game('bobs', BO({ bull: false }), 1, allHit(20)));
  assert.equal(st.finished, true); assert.equal(st.turns.length, 20);
});

ok("Bob's 27: Ausgeschiedene werden übersprungen, wer weiter kommt, gewinnt", () => {
  const darts = [];
  for (let r = 1; r <= 21; r++) {
    darts.push(r <= 20 ? `D${r} - -` : 'BULL - -');
    if (r <= 5) darts.push('- - -');
  }
  let st = replay(game('bobs', BO(), 2, darts.slice(0, 10).join(' ')));
  assert.deepEqual(st.leg.out, [false, true]); assert.equal(st.current, 0);
  st = replay(game('bobs', BO(), 2, darts.join(' ')));
  assert.equal(st.finished, true); assert.equal(st.winner, 0); assert.equal(st.turns.length, 26);
});

ok("Bob's 27: Gleichstand → Stechen auf Bull, dort scheidet niemand aus", () => {
  let st = replay(game('bobs', BO(), 2, miss(10)));
  assert.equal(st.lastEvent.type, 'tiebreak'); assert.deepEqual(st.leg.contenders, [0, 1]);
  assert.equal(bobsTarget(st.leg, 0), 25); assert.equal(st.current, 0);
  st = replay(game('bobs', BO(), 2, miss(10) + ' - - - - - -'));
  assert.equal(st.finished, false); assert.equal(st.lastEvent.type, 'tiebreak'); // beide −53, weiter
  st = replay(game('bobs', BO(), 2, miss(10) + ' BULL - - - - -'));
  assert.equal(st.finished, true); assert.equal(st.winner, 0); assert.deepEqual(st.leg.score, [47, -53]);
});

// ---------- Halve-It ----------
const HV = (targets, cfg) => ({ set: 'custom', targets, ...cfg });

ok('Halve-It: Zahl, jedes Doppel, jedes Triple, Bull', () => {
  const st = replay(game('halveit', HV(['20', 'D', 'T', 'B']), 1, '20 T20 5  D10 BULL 20  T5 T20 D3  25 BULL -'));
  assert.deepEqual(st.turns.map((t) => t.points), [80, 70, 75, 75]);
  assert.equal(st.leg.score[0], 300); assert.equal(st.finished, true);
});

ok('Halve-It: Runde ohne Treffer halbiert, ungerade aufgerundet', () => {
  const st = replay(game('halveit', HV(['19', '20']), 1, '19 - -  - - -'));
  assert.equal(st.leg.score[0], 10); assert.equal(st.turns[1].points, -9);
  assert.equal(st.dartEvent.type, 'halved');
  const z = replay(game('halveit', HV(['19']), 1, '- - -'));
  assert.equal(z.leg.score[0], 0); assert.equal(z.dartEvent, null); // bei 0 gibt es nichts zu halbieren
});

ok('Halve-It: Höchster Stand gewinnt, Gleichstand → Stechen auf Bull', () => {
  let st = replay(game('halveit', HV(['20']), 2, '20 - - 20 - -'));
  assert.equal(st.lastEvent.type, 'tiebreak'); assert.equal(st.finished, false);
  st = replay(game('halveit', HV(['20']), 2, '20 - - 20 - - BULL - - - - -'));
  assert.equal(st.finished, true); assert.equal(st.winner, 0); assert.deepEqual(st.leg.score, [70, 10]);
  st = replay(game('halveit', HV(['20']), 2, '20 - - T20 - -'));
  assert.equal(st.winner, 1); assert.equal(st.turns.at(-1).p, 1);
});

ok('Halve-It: Zielfolgen', () => {
  let i = 0; const seq = [0.13, 0.77, 0.42, 0.95, 0.05, 0.61, 0.28];
  const t = drawHalveTargets(() => seq[i++ % seq.length]);
  assert.equal(t.length, 9); assert.equal(t.at(-1), 'B');
  assert.equal(t.filter((x) => x === 'D').length, 1); assert.equal(t.filter((x) => x === 'T').length, 1);
  const nums = t.filter((x) => /^\d+$/.test(x));
  assert.equal(new Set(nums).size, 6);
  assert.equal(HALVE_SETS.std.length, 9); assert.equal(HALVE_SETS.short.length, 6);
});

ok('Halve-It: Abrunden als Option', () => {
  const st = replay(game('halveit', HV(['19', '20'], { round: 'down' }), 1, '19 - -  - - -'));
  assert.equal(st.leg.score[0], 9); assert.equal(st.turns[1].points, -10);
});

// ---------- 121 ----------
const C = (cfg) => ({ start: 121, turns: 3, attempts: 10, fail: 'down', lock: true, ...cfg });

ok('121: Check mit Doppel → Ziel +1, Check beendet die Aufnahme', () => {
  const st = replay(game('c121', C(), 1, 'T20 T19 -  2 D1'));
  assert.equal(st.leg.target[0], 122); assert.equal(st.leg.rem[0], 122);
  assert.equal(st.leg.checks[0], 1); assert.equal(st.leg.best[0], 121); assert.equal(st.leg.rounds[0], 1);
  assert.equal(st.turns.length, 2); assert.equal(st.turns[1].darts.length, 2);
  assert.equal(st.leg.floor[0], 121); // 5 Darts sichern nicht
  assert.equal(st.dartEvent.type, 'check'); assert.equal(st.darts.at(-1).attemptDarts, 5);
});

ok('121: Fehlversuch −1, nie unter Start, Überwerfen wie X01', () => {
  let st = replay(game('c121', C(), 1, 'T20 T11 D14 ' + miss(3)));
  assert.equal(st.leg.target[0], 121); // 122 verfehlt → 121
  st = replay(game('c121', C(), 1, 'T20 T20'));
  assert.equal(st.leg.rem[0], 121); assert.equal(st.turns[0].bust, true); // Rest 1 ist Bust und beendet die Aufnahme
  assert.equal(st.turns[0].darts.length, 2);
  st = replay(game('c121', C(), 1, 'T20 T20  - 1 -  - - -'));
  assert.equal(st.dartEvent.type, 'fail'); assert.equal(st.leg.target[0], 121); assert.equal(st.leg.rounds[0], 1);
  st = replay(game('c121', C({ turns: 1 }), 1, 'T20 T20 T20'));
  assert.equal(st.turns[0].bust, true); assert.equal(st.leg.rounds[0], 1); // Bust in der letzten Aufnahme beendet den Versuch
});

ok('121: Check in 3 Darts sichert das Ziel, Fehlversuch-Regel wählbar', () => {
  const two = 'T20 T11 D14  T20 T14 D10 ';            // 121 und 122 jeweils in 3 Darts
  const darts = two + miss(3) + ' ' + miss(3);          // dann zweimal verfehlt
  const run = (cfg) => replay(game('c121', C(cfg), 1, darts)).leg.target[0];
  assert.equal(run({}), 122);                            // 123 → 122 → bleibt 122 (gesichert)
  assert.equal(run({ lock: false }), 121);               // 123 → 122 → 121
  assert.equal(run({ fail: 'start' }), 122);             // zurück auf das gesicherte Ziel
  assert.equal(run({ fail: 'start', lock: false }), 121);
});

ok('121: Mehrere Spieler, Fertige werden übersprungen, Wertung nach bestem Ziel', () => {
  let st = replay(game('c121', C({ attempts: 1 }), 2, 'T20 T11 D14  - - -'));
  assert.equal(st.current, 1); assert.equal(st.finished, false);
  st = replay(game('c121', C({ attempts: 1 }), 2, 'T20 T11 D14 ' + miss(3)));
  assert.equal(st.finished, true); assert.equal(st.winner, 0);
  st = replay(game('c121', C({ attempts: 1 }), 2, miss(6)));
  assert.equal(st.lastEvent.type, 'tiebreak'); assert.deepEqual(st.leg.contenders, [0, 1]);
  // Stechen: je ein weiterer Versuch. Spieler 1 checkt, Spieler 0 wirft seinen Versuch allein zu Ende.
  st = replay(game('c121', C({ attempts: 1 }), 2, miss(6) + ' - - -  T20 T11 D14  - - -'));
  assert.equal(st.finished, false); assert.equal(st.current, 0);
  st = replay(game('c121', C({ attempts: 1 }), 2, miss(6) + ' - - -  T20 T11 D14  - - -  - - -'));
  assert.equal(st.finished, true); assert.equal(st.winner, 1);
});

ok('Gemeinsame Checkout-Regel: Bull zählt als Doppel, Rest 1 ist Bust', () => {
  assert.deepEqual(outStep(50, { s: 25, m: 2 }), { after: 0, bust: false, check: true, atDouble: true });
  assert.equal(outStep(41, { s: 20, m: 2 }).bust, true);
  assert.equal(outStep(40, { s: 20, m: 1 }).bust, false);
  assert.equal(outStep(20, { s: 20, m: 1 }).bust, true);
});

// ---------- Tic-Tac-Toe ----------
const TT = (cfg) => ({ grid: [1, 2, 3, 4, 25, 5, 6, 7, 8], need: 1, ...cfg });

ok('Tic-Tac-Toe: Ein Treffer nimmt das Feld, drei in einer Reihe gewinnen', () => {
  let st = replay(game('ttt', TT(), 2, '1 2 -  4 - -  3'));
  assert.equal(st.finished, true); assert.equal(st.winner, 0); assert.deepEqual(st.leg.owner.slice(0, 3), [0, 0, 0]);
  st = replay(game('ttt', TT(), 2, '1 - -  1 - -'));
  assert.equal(st.leg.owner[0], 0); // besetztes Feld bleibt beim ersten Besitzer
  assert.equal(RULES.ttt.minPlayers, 2); assert.equal(RULES.ttt.maxPlayers, 2);
});

ok('Tic-Tac-Toe: Vier Marks je Feld, Bull 25 = 1 und 50 = 2', () => {
  let st = replay(game('ttt', TT({ need: 4 }), 2, 'T1 - -'));
  assert.equal(st.leg.owner[0], -1); assert.equal(st.leg.marks[0][0], 3);
  st = replay(game('ttt', TT({ need: 4 }), 2, 'T1 1 -'));
  assert.equal(st.leg.owner[0], 0);
  st = replay(game('ttt', TT({ need: 4 }), 2, 'BULL 25 25'));
  assert.equal(st.leg.owner[4], 0);
});

ok('Tic-Tac-Toe: Volles Raster ohne Reihe → mehr Felder gewinnt', () => {
  const st = replay(game('ttt', TT(), 2, '1 2 -  3 4 -  5 6 -  25 7 -  8 - -'));
  assert.equal(st.finished, true); assert.equal(st.winner, 0); assert.equal(st.legResults[0].scores[0], 5);
});

ok('Tic-Tac-Toe: Raster aus 8 verschiedenen Zahlen, Bull in der Mitte', () => {
  const g = drawGrid();
  assert.equal(g.length, 9); assert.equal(g[4], 25); assert.equal(new Set(g).size, 9);
});

// ---------- Hare and Hounds ----------
const HH = (cfg) => ({ start: 5, skip: false, catch: 'reach', ...cfg });
const ROUTE = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];

ok('Hare and Hounds: Laufweg im Uhrzeigersinn, Hund startet hinter dem Hasen', () => {
  const st = replay(game('hare', HH(), 2, '20 1 -  5 - -'));
  assert.equal(hareTarget(st.leg, 0), 18); assert.equal(hareTarget(st.leg, 1), 20);
  assert.deepEqual(st.leg.pos, [2, 0]); assert.equal(st.finished, false);
});

ok('Hare and Hounds: Hund gewinnt beim Erreichen, Option Überholen', () => {
  let st = replay(game('hare', HH(), 2, '- - -  5'));
  assert.equal(st.finished, true); assert.equal(st.winner, 1); assert.equal(st.dartEvent.type, 'caught');
  st = replay(game('hare', HH({ catch: 'pass' }), 2, '- - -  5'));
  assert.equal(st.finished, false);
  st = replay(game('hare', HH({ catch: 'pass' }), 2, '- - -  5 20'));
  assert.equal(st.finished, true); assert.equal(st.winner, 1);
});

ok('Hare and Hounds: Hase gewinnt nach 20 Feldern, Doppel rückt nur eins vor', () => {
  const hits = ROUTE.map(String);
  const darts = [];
  for (let i = 0; i < hits.length; i += 3) darts.push(hits.slice(i, i + 3).join(' '), '- - -');
  const st = replay(game('hare', HH(), 2, darts.join(' ')));
  assert.equal(st.finished, true); assert.equal(st.winner, 0);
  const d = replay(game('hare', HH(), 2, 'D20'));
  assert.equal(d.leg.pos[0], 1);
});

ok('Hare and Hounds: Optionen Start 12 und D/T springt', () => {
  let st = replay(game('hare', HH({ start: 12 }), 2, ''));
  assert.deepEqual(st.leg.pos, [0, -2]); assert.equal(hareTarget(st.leg, 1), 12);
  st = replay(game('hare', HH({ skip: true }), 2, 'T20'));
  assert.equal(st.leg.pos[0], 3); assert.equal(hareTarget(st.leg, 0), 4);
});

ok('Hare and Hounds: Neues Leg tauscht die Rollen', () => {
  const st = replay(game('hare', HH({ legs: 2 }), 2, '- - -  5'));
  assert.equal(st.legResults.length, 1); assert.equal(st.leg.hare, 1); assert.equal(st.current, 1);
});

// ---------- Follow the Leader ----------
const FL = (cfg) => ({ lives: 3, ...cfg });

ok('Follow the Leader: Festlegen, nachwerfen, neues Ziel mit dem letzten Dart', () => {
  let st = replay(game('follow', FL(), 2, 'T20 X'));
  assert.deepEqual(st.leg.target, { s: 20, m: 3 }); assert.equal(st.leg.setter, 0); assert.equal(st.current, 1);
  st = replay(game('follow', FL(), 2, 'T20 X  20 T20 D5'));
  assert.deepEqual(st.leg.target, { s: 5, m: 2 }); assert.equal(st.leg.setter, 1); assert.deepEqual(st.leg.lives, [3, 3]);
  st = replay(game('follow', FL(), 2, 'T20 X  20 T20 D5  - - -'));
  assert.deepEqual(st.leg.lives, [2, 3]); assert.equal(st.lastEvent.type, 'life');
});

ok('Follow the Leader: Treffer mit dem dritten Dart gibt eine Extra-Aufnahme zum Festlegen', () => {
  const st = replay(game('follow', FL(), 2, 'T20 X  - - T20'));
  assert.equal(st.current, 1); assert.equal(st.leg.target, null);
  assert.equal(canStop(st), false);
  const s2 = replay(game('follow', FL(), 2, 'T20 X  - - T20  19'));
  assert.equal(canStop(s2), true);
});

ok('Follow the Leader: Setzer darf passen, Festlegen daneben kostet ein Leben', () => {
  let st = replay(game('follow', FL(), 2, 'T20 X  - - -  - - -'));
  assert.deepEqual(st.leg.lives, [3, 2]); assert.deepEqual(st.leg.target, { s: 20, m: 3 });
  st = replay(game('follow', FL(), 2, '20 -'));
  assert.equal(st.turns.length, 0);
  st = replay(game('follow', FL(), 2, '20 - -'));
  assert.deepEqual(st.leg.lives, [2, 3]); assert.equal(st.leg.target, null);
});

// Regel des Nutzers: erster Treffer legt fest, Runde endet. Ziel getroffen und Darts übrig: nächster Treffer legt neu fest.
const FLF = (o = {}) => FL({ set: 'first', ...o });
ok('Follow the Leader (erster Treffer): erster Treffer legt fest und beendet die Runde, daneben zählt nicht', () => {
  let st = replay(game('follow', FLF(), 2, '- T20'));
  assert.deepEqual(st.leg.target, { s: 20, m: 3 }); assert.equal(st.current, 1); assert.equal(st.leg.lives[0], 3);
  // Nur daneben: kein Ziel, kein Leben weniger (ANNAHME), der Nächste legt fest
  st = replay(game('follow', FLF(), 2, '- - -'));
  assert.equal(st.leg.target, null); assert.equal(st.current, 1); assert.deepEqual(st.leg.lives, [3, 3]);
  assert.equal(canStop(replay(game('follow', FLF(), 2, '-'))), false);
  assert.equal(canStop(replay(game('follow', FL(), 2, '-'))), true); // darts501: Fertig nach dem festlegenden Dart
});

ok('Follow the Leader (erster Treffer): Ziel getroffen, nächster Treffer legt neu fest', () => {
  // Ben trifft T20 mit Dart 1, Dart 2 daneben, Dart 3 trifft D5: D5 ist das neue Ziel
  let st = replay(game('follow', FLF(), 2, 'T20  T20 - D5'));
  assert.deepEqual(st.leg.target, { s: 5, m: 2 }); assert.equal(st.leg.setter, 1); assert.equal(st.current, 0);
  // Ben trifft mit Dart 1 und gleich mit Dart 2 neu: Runde endet nach 2 Darts
  st = replay(game('follow', FLF(), 2, 'T20  T20 19'));
  assert.deepEqual(st.leg.target, { s: 19, m: 1 }); assert.equal(st.current, 0); assert.equal(st.turns.at(-1).darts.length, 2);
});

ok('Follow the Leader (erster Treffer): Treffer mit dem letzten Dart oder danach nur daneben, Ziel bleibt', () => {
  let st = replay(game('follow', FLF(), 2, 'T20  - - T20'));
  assert.deepEqual(st.leg.target, { s: 20, m: 3 }); assert.equal(st.current, 0); assert.equal(st.leg.setter, 1);
  st = replay(game('follow', FLF(), 2, 'T20  T20 - -'));
  assert.deepEqual(st.leg.target, { s: 20, m: 3 }); assert.equal(st.current, 0);
  // Anna muss jetzt ihr eigenes altes Ziel treffen (Ben gilt als Setzer): Fehlwurf kostet Leben
  st = replay(game('follow', FLF(), 2, 'T20  - - T20  - - -'));
  assert.equal(st.leg.lives[0], 2);
});

ok('Follow the Leader (erster Treffer): verfehlt kostet ein Leben, Ziel bleibt für den Nächsten', () => {
  const st = replay(game('follow', FLF(), 3, 'T20  - - -'));
  assert.equal(st.leg.lives[1], 2); assert.deepEqual(st.leg.target, { s: 20, m: 3 }); assert.equal(st.current, 2);
  const w = replay(game('follow', FLF({ lives: 1 }), 2, 'T20  - - -'));
  assert.equal(w.finished, true); assert.equal(w.winner, 0);
});

// Entscheidung des Nutzers (12.11.2026): Das Ziel ist das genaue Feld. Legt jemand T20 fest, zählt nur T20.
ok('Follow the Leader (erster Treffer): Ziel ist das genaue Feld, eine einfache 20 trifft T20 nicht', () => {
  let st = replay(game('follow', FLF(), 2, 'T20  20 D20 -'));
  assert.equal(st.leg.lives[1], 2);
  st = replay(game('follow', FLF(), 2, 'T20  T20'));
  assert.equal(st.leg.hitAt, 0); assert.equal(st.leg.lives[1], 3);
});

ok('Follow the Leader: Letzter mit Leben gewinnt', () => {
  const st = replay(game('follow', FL({ lives: 1 }), 2, 'T20 X  - - -'));
  assert.equal(st.finished, true); assert.equal(st.winner, 0);
});

// ---------- Chase the Dragon ----------
ok('Chase the Dragon: T10 bis T20, 25, Bull der Reihe nach', () => {
  const seq = 'T10 T11 T12 T13 T14 T15 T16 T17 T18 T19 T20 25 BULL';
  let st = replay(game('chase', { laps: 1 }, 1, seq));
  assert.equal(st.finished, true); assert.equal(st.legResults[0].darts[0], 13);
  st = replay(game('chase', { laps: 1 }, 1, '10 D10 T11'));
  assert.equal(st.leg.pos[0], 0); // nur das Triple zählt, die Reihenfolge auch
  st = replay(game('chase', { laps: 3 }, 1, seq));
  assert.equal(st.finished, false); assert.equal(st.leg.pos[0], 13);
});

// ---------- Golf ----------
const GO = (cfg) => ({ holes: 3, table: 'gld', count: 'last', ...cfg });

ok('Golf: Letzter Dart zählt, Aufhören mit „Fertig", Doppel beendet das Loch', () => {
  let st = replay(game('golf', GO(), 1, '1 X  D2  - - -'));
  assert.deepEqual(st.turns.map((t) => t.strokes), [3, 1, 5]);
  assert.equal(st.finished, true); assert.equal(st.legResults[0].scores[0], 9);
  st = replay(game('golf', GO(), 1, 'T1 - -'));
  assert.equal(st.turns[0].strokes, 5); // ohne Aufhören zählt der letzte Dart
  st = replay(game('golf', GO(), 1, 'T1'));
  assert.equal(canStop(st), true);
});

ok('Golf: Bester Dart und zweite Schlagtabelle als Option', () => {
  let st = replay(game('golf', GO({ count: 'best' }), 1, '1 T1 -'));
  assert.equal(st.turns[0].strokes, 2); assert.equal(canStop(st), false);
  st = replay(game('golf', GO({ table: 'darthelp' }), 1, 'T1 X  2 X'));
  assert.deepEqual(st.turns.map((t) => t.strokes), [3, 4]);
});

ok('Golf: Wenigste Schläge gewinnt, Gleichstand → Stechen auf dem nächsten Loch', () => {
  let st = replay(game('golf', GO({ holes: 1 }), 2, 'D1  1 X'));
  assert.equal(st.finished, true); assert.equal(st.winner, 0);
  st = replay(game('golf', GO({ holes: 1 }), 2, 'D1  D1'));
  assert.equal(st.lastEvent.type, 'tiebreak'); assert.equal(st.finished, false);
  st = replay(game('golf', GO({ holes: 1 }), 2, 'D1  D1  2 X  D2'));
  assert.equal(st.finished, true); assert.equal(st.winner, 1);
});

// ---------- Knockout ----------
const KO = (cfg) => ({ lives: 3, bar: 'prev', ...cfg });

ok('Knockout: Vorwerfer übertreffen, Gleichstand reicht nicht', () => {
  let st = replay(game('knockout', KO(), 2, '20 20 20  20 20 19'));
  assert.deepEqual(st.leg.lives, [3, 2]); assert.equal(st.lastEvent.type, 'strike');
  st = replay(game('knockout', KO(), 2, '20 20 20  20 20 19  20 20 20'));
  assert.deepEqual(st.leg.lives, [3, 2]); // 60 schlägt den Vorwerfer mit 59
  st = replay(game('knockout', KO(), 2, '20 20 20  20 20 20'));
  assert.deepEqual(st.leg.lives, [3, 2]);
});

ok('Knockout: Option Höchstwert, Letzter gewinnt', () => {
  let st = replay(game('knockout', KO({ bar: 'high' }), 2, '20 20 20  20 20 19  20 20 20'));
  assert.deepEqual(st.leg.lives, [2, 2]); // 60 schlägt den Höchstwert 60 nicht
  st = replay(game('knockout', KO(), 3, '20 - -  - - -  5 - -'));
  assert.deepEqual(st.leg.lives, [3, 2, 3]); // Vorwerfer-Regel: 5 schlägt die 0 davor
  st = replay(game('knockout', KO({ lives: 1 }), 3, '20 - -  - - -  - - -'));
  assert.deepEqual(st.leg.lives, [1, 0, 0]); assert.equal(st.finished, true); assert.equal(st.winner, 0);
});

// ---------- Nine Lives ----------
ok('Nine Lives: Mehrere Treffer je Aufnahme, Aufnahme ohne Treffer kostet ein Leben', () => {
  let st = replay(game('ninelives', { lives: 3 }, 1, '1 2 3  - 5 -'));
  assert.equal(st.leg.pos[0], 3); assert.equal(st.leg.lives[0], 2);
  st = replay(game('ninelives', { lives: 1 }, 1, '- - -'));
  assert.equal(st.finished, true); // allein endet das Leg mit dem letzten Leben
  st = replay(game('ninelives', { lives: 1 }, 2, '1 - -  - - -'));
  assert.equal(st.finished, true); assert.equal(st.winner, 0);
  st = replay(game('ninelives', { lives: 9 }, 1, rounds(20, (r) => String(r))));
  assert.equal(st.finished, true); assert.equal(st.leg.lives[0], 9);
});

// ---------- Blind Killer ----------
const BK = (cfg) => ({ numbers: [20, 19, 18], lives: 3, triple: false, ...cfg });

ok('Blind Killer: Jedes Doppel auf eine Zahl im Spiel kostet ihren Besitzer ein Leben, auch den Werfer', () => {
  let st = replay(game('blindkiller', BK(), 3, 'D19 19 D20'));
  assert.deepEqual(st.leg.lives, [2, 2, 3]);
  st = replay(game('blindkiller', BK(), 3, 'T19 D5 -'));
  assert.deepEqual(st.leg.lives, [3, 3, 3]);
  st = replay(game('blindkiller', BK({ triple: true }), 3, 'T19'));
  assert.deepEqual(st.leg.lives, [3, 1, 3]);
});

ok('Blind Killer: Ausscheiden und Letzter gewinnt', () => {
  let st = replay(game('blindkiller', BK({ lives: 1 }), 3, 'D19 D18'));
  assert.equal(st.finished, true); assert.equal(st.winner, 0);
  st = replay(game('blindkiller', BK({ lives: 1 }), 2, 'D20'));
  assert.equal(st.finished, true); assert.equal(st.winner, 1); // Eigentreffer wirft raus
});

// ---------- Mickey Mouse ----------
const MM = (cfg) => ({ dt: true, ordered: false, points: false, ...cfg });

ok('Mickey Mouse: 20 bis 12, Doppel, Triple, Bull. D/T schließt zuerst die Zahl', () => {
  let st = replay(game('mickey', MM(), 2, 'D20 20 D20'));
  assert.equal(st.leg.marks[0]['20'], 3); assert.equal(st.leg.marks[0].D, 1);
  st = replay(game('mickey', MM(), 2, 'D5 T5 BULL'));
  assert.equal(st.leg.marks[0].D, 1); assert.equal(st.leg.marks[0].T, 1); assert.equal(st.leg.marks[0].B, 2);
  st = replay(game('mickey', MM({ dt: false }), 2, 'D5'));
  assert.equal(st.leg.marks[0].D, undefined);
});

ok('Mickey Mouse: der Reihe nach und mit Punkten als Option', () => {
  let st = replay(game('mickey', MM({ ordered: true }), 2, '19 T20 19'));
  assert.equal(st.leg.marks[0]['19'], 1); assert.equal(st.leg.marks[0]['20'], 3);
  st = replay(game('mickey', MM({ points: true, dt: false }), 2, 'T20 T20'));
  assert.equal(st.leg.score[0], 60);
  const all = 'T20 T19 T18 T17 T16 T15 T14 T13 T12 D1 D2 D3 T1 T2 T3 BULL 25';
  const darts = all.split(' ');
  const seq = [];
  for (let i = 0; i < darts.length; i += 3) seq.push(darts.slice(i, i + 3).join(' '), '- - -');
  st = replay(game('mickey', MM(), 2, seq.join(' ')));
  assert.equal(st.finished, true); assert.equal(st.winner, 0);
});

// ---------- Shove Ha'penny ----------
ok("Shove Ha'penny: Überzählige Marks gehen an den Gegner, Bull optional", () => {
  let st = replay(game('shove', { bull: true }, 2, 'T1 1 -'));
  assert.equal(st.leg.marks[0]['1'], 3); assert.equal(st.leg.marks[1]['1'], 1);
  st = replay(game('shove', { bull: true }, 2, 'BULL 25'));
  assert.equal(st.leg.marks[0].B, 2);
  st = replay(game('shove', { bull: false }, 2, 'BULL'));
  assert.equal(st.leg.marks[0].B, undefined); assert.equal(st.darts[0].marks, 0);
});

ok("Shove Ha'penny: Wer zuerst alles zu hat, gewinnt, auch durch ein Geschenk", () => {
  let st = replay(game('shove', { bull: false }, 1, 'T1 T2 T3 T4 T5 T6 T7 T8 T9'));
  assert.equal(st.finished, true);
  // Spieler 1 braucht nur noch die 9 und bekommt sie geschenkt
  const p1 = 'T1 T2 T3  T4 T5 T6  T7 T8 -';
  st = replay(game('shove', { bull: false }, 2, `- - -  ${p1.split('  ')[0]}  - - -  ${p1.split('  ')[1]}  - - -  ${p1.split('  ')[2]}  T9 T9 -`));
  assert.equal(st.finished, true); assert.equal(st.winner, 1);
});

// ---------- Bermuda Triangle ----------
ok('Bermuda Triangle: 13 feste Runden, 25-Runde zählt Bull als 25, letzte Runde nur Bull', () => {
  assert.equal(BERMUDA.length, 13);
  const cfg = { targets: BERMUDA, round: 'down' };
  const pre = '12 - -  13 - -  14 - -  D1 - -  15 - -  16 - -  17 - -  T1 - -  18 - -  19 - -  20 - -';
  let st = replay(game('bermuda', cfg, 1, pre + '  BULL 25 -  25 - -'));
  assert.equal(st.turns[11].points, 50); assert.equal(st.finished, true);
  const before = st.turns.slice(0, 12).reduce((a, t) => a + t.points, 0);
  assert.equal(st.leg.score[0], before - Math.ceil(before / 2)); // 25 trifft in Runde 13 nicht, Halbierung abgerundet
});

// ---------- Gotcha ----------
const GT = (cfg) => ({ goal: 301, over: 'bust', out: 'any', ...cfg });

ok('Gotcha: Gleichstand setzt den Gegner auf 0', () => {
  const st = replay(game('gotcha', GT(), 2, '20 20 -  20 - 20'));
  assert.deepEqual(st.leg.score, [0, 40]); assert.equal(st.dartEvent.type, 'gotcha');
});

ok('Gotcha: Genau das Ziel gewinnt, Überwerfen ist Bust, Varianten', () => {
  let st = replay(game('gotcha', GT({ goal: 60 }), 2, 'T20'));
  assert.equal(st.finished, true);
  st = replay(game('gotcha', GT({ goal: 60 }), 2, '20 T20'));
  assert.equal(st.leg.score[0], 0); assert.equal(st.turns[0].bust, true);
  st = replay(game('gotcha', GT({ goal: 60, over: 'back' }), 2, '20 T20 -'));
  assert.equal(st.leg.score[0], 40); // 80 ist 20 zu viel, zurück auf 40
  st = replay(game('gotcha', GT({ goal: 60, out: 'double' }), 2, 'T20'));
  assert.equal(st.finished, false); assert.equal(st.turns[0].bust, true);
  st = replay(game('gotcha', GT({ goal: 60, out: 'double' }), 2, '20 D20'));
  assert.equal(st.finished, true);
});

// ---------- Doppel-Training ----------
ok('Doppel-Training: nur Doppel, Reihenfolge wählbar', () => {
  assert.deepEqual(dblTargets('desc', true).slice(0, 2), [20, 19]);
  assert.equal(dblTargets('desc', true).at(-1), 25);
  let i = 0; const r = dblTargets('random', false, () => [0.3, 0.8, 0.1][i++ % 3]);
  assert.equal(new Set(r).size, 20);
  const st = replay(game('dbl', { zone: 'double', order: 'desc', bull: false, targets: dblTargets('desc', false) }, 1, '20 D20 D19'));
  assert.equal(st.leg.pos[0], 2);
});

// ---------- JDC Challenge ----------
ok('JDC Challenge: Aufbau und Wertung', () => {
  assert.equal(jdcPlan(1).length, 19); assert.equal(jdcPlan(5).length, 30 + 35 + 30);
  let st = replay(game('jdc', { reps: 1 }, 1, '10 D10 T10'));
  assert.equal(st.leg.score[0], 160); assert.equal(st.dartEvent.type, 'shanghai');
  const p1 = '- - -  '.repeat(6);
  st = replay(game('jdc', { reps: 1 }, 1, p1 + 'D1 D2 3  - - -  - - -  - - -  - - -  - - -  D19 D20 BULL'));
  assert.equal(st.leg.score[0], 50 + 50 + 50 + 50 + 100); assert.deepEqual(st.leg.parts[0], [0, 0, 300, 0]);
  assert.equal(jdcGrade(160), 'Purple'); assert.equal(jdcGrade(900), 'Black');
});

ok('JDC Challenge: Mehrspieler nach Summe, Gleichstand → Stechen auf Bull', () => {
  const all = '- - -  '.repeat(19 * 2);
  let st = replay(game('jdc', { reps: 1 }, 2, all));
  assert.equal(st.lastEvent.type, 'tiebreak');
  st = replay(game('jdc', { reps: 1 }, 2, all + 'BULL - -  25 - -'));
  assert.equal(st.finished, true); assert.equal(st.winner, 0);
});

// ---------- Shooting Gallery ----------
ok('Shooting Gallery: Punkte nach Darts, Fehlversuch 0, weiter mit der nächsten Zahl', () => {
  assert.deepEqual([3, 4, 5, 6, 7, 8, 9].map(galleryPoints), [12, 8, 6, 5, 3, 2, 1]);
  let st = replay(game('gallery', {}, 1, 'T20 T11 D14'));
  assert.equal(st.leg.score[0], 12); assert.equal(st.leg.target[0], 122);
  st = replay(game('gallery', {}, 1, miss(3)));
  assert.equal(st.leg.score[0], 0); assert.equal(st.leg.target[0], 122); assert.equal(st.dartEvent.type, 'fail');
  st = replay(game('gallery', {}, 1, 'T20 T11 -  D14'));
  assert.equal(st.leg.score[0], 8);
});

ok('Shooting Gallery: Finish-Optionen, alte Spiele ohne Angabe bleiben bei Double Out auf genau 0', () => {
  // ohne Angabe (bis 0.7.1): 121 − 60 − 57 = 4, die 4 als Single ist ein Bust, Rest wieder 121
  let st = replay(game('gallery', {}, 1, 'T20 T19 4'));
  assert.equal(st.leg.score[0], 0); assert.equal(st.leg.rem[0], 121); assert.equal(st.turns[0].bust, true);
  // ohne Angabe: Überwerfen ist ein Bust
  st = replay(game('gallery', {}, 1, 'T20 T19 D20'));
  assert.equal(st.leg.rem[0], 121); assert.equal(st.turns[0].bust, true);
  // 0 oder drunter, beliebig: der dritte Dart bringt auf −1 und checkt, 12 Punkte, weiter mit 122
  st = replay(game('gallery', { over: 'under', out: 'single' }, 1, 'T20 T20 2'));
  assert.equal(st.leg.score[0], 12); assert.equal(st.leg.target[0], 122); assert.equal(st.leg.rem[0], 122);
  assert.equal(st.dartEvent.type, 'check');
  // 0 oder drunter, Double Out: Single unter 0 ist ein Bust, Doppel unter 0 checkt, Rest 1 bleibt spielbar
  st = replay(game('gallery', { over: 'under', out: 'double' }, 1, 'T20 T20 5'));
  assert.equal(st.leg.score[0], 0); assert.equal(st.leg.rem[0], 121); assert.equal(st.turns[0].bust, true);
  st = replay(game('gallery', { over: 'under', out: 'double' }, 1, 'T20 T20 -  D20'));
  assert.equal(st.leg.score[0], 8); // Rest 1 nach zwei Darts, vierter Dart D20 checkt
  // genau 0, beliebig: Single auf 0 checkt, Überwerfen bleibt Bust, Rest 1 ist kein Bust
  st = replay(game('gallery', { over: 'exact', out: 'single' }, 1, 'T20 T20 1'));
  assert.equal(st.leg.score[0], 12);
  st = replay(game('gallery', { over: 'exact', out: 'single' }, 1, 'T20 T20 2'));
  assert.equal(st.leg.score[0], 0); assert.equal(st.turns[0].bust, true);
  st = replay(game('gallery', { over: 'exact', out: 'single' }, 1, 'T20 T20 -'));
  assert.equal(st.leg.rem[0], 1); assert.equal(st.turns[0].bust, false);
  // Master Out: Triple checkt, auf genau 0 und darunter
  st = replay(game('gallery', { over: 'exact', out: 'master' }, 1, 'T20 T20 -  -  -  -'));
  assert.equal(st.turns[0].bust, true); // Rest 1 lässt sich mit Master Out nicht checken
  st = replay(game('gallery', { over: 'exact', out: 'master' }, 1, 'T20 19 T14'));
  assert.equal(st.leg.score[0], 12);
  st = replay(game('gallery', { over: 'under', out: 'master' }, 1, 'T20 T20 T1'));
  assert.equal(st.leg.score[0], 12);
  // 121 rechnet unverändert mit Double Out auf genau 0
  st = replay(game('c121', { start: 121, turns: 3, attempts: 10, fail: 'down', lock: true }, 1, 'T20 T19 4'));
  assert.equal(st.turns[0].bust, true); assert.equal(st.leg.rem[0], 121);
});

// ---------- Baseball ----------
const BB = (cfg) => ({ extra: 'bull', seventh: false, ...cfg });
const innings = (fn) => Array.from({ length: 9 }, (_, i) => fn(i + 1)).join('  ');

ok('Baseball: Inning n zählt nur die n, Single/Double/Triple = 1/2/3 Runs', () => {
  const st = replay(game('baseball', BB(), 1, '1 D1 T1  3 D3 20'));
  assert.equal(st.leg.score[0], 6); assert.deepEqual(st.turns.map((t) => t.points), [6, 0]);
  const p = replay(game('baseball', BB(), 1, innings((i) => `T${i} T${i} T${i}`)));
  assert.equal(p.finished, true); assert.equal(p.legResults[0].scores[0], 81);
});

ok('Baseball: Höchste Summe nach 9 Innings gewinnt, auch wenn sie nicht zuletzt geworfen hat', () => {
  const st = replay(game('baseball', BB(), 2, innings((i) => `${i} - -  - - -`)));
  assert.equal(st.finished, true); assert.equal(st.winner, 0); assert.equal(st.turns.length, 18);
});

ok('Baseball: Gleichstand → Extra-Innings auf Bull (25 = 1, Bull = 2) oder auf 10, 11 …', () => {
  const tie = innings((i) => `${i} - -  ${i} - -`);
  let st = replay(game('baseball', BB(), 2, tie));
  assert.equal(st.lastEvent.type, 'tiebreak'); assert.deepEqual(st.leg.contenders, [0, 1]);
  st = replay(game('baseball', BB(), 2, tie + '  25 - -  BULL - -'));
  assert.equal(st.finished, true); assert.equal(st.winner, 1); assert.deepEqual(st.leg.score, [10, 11]);
  st = replay(game('baseball', BB({ extra: 'next' }), 2, tie + '  25 - -  10 - -'));
  assert.equal(st.finished, true); assert.equal(st.winner, 1);
});

ok('Baseball: 7. Inning ohne Run halbiert (abgerundet), nur mit Option', () => {
  const six = Array.from({ length: 6 }, (_, i) => `${i + 1} - -`).join('  ') + '  T1 - -'; // 6 Runs + 3 auf die 1 bringt in Inning 7 nichts
  let st = replay(game('baseball', BB({ seventh: true }), 1, six));
  assert.equal(st.leg.score[0], 3); assert.equal(st.lastEvent.type, 'halved'); assert.equal(st.turns.at(-1).halved, 3);
  st = replay(game('baseball', BB({ seventh: true }), 1, Array.from({ length: 6 }, (_, i) => `${i + 1} - -`).join('  ') + '  7 - -'));
  assert.equal(st.leg.score[0], 7);
  st = replay(game('baseball', BB(), 1, six));
  assert.equal(st.leg.score[0], 6);
});

// ---------- Fives ----------
const FV = (cfg) => ({ goal: 51, over: 'bust', dt: 'full', ...cfg });

ok('Fives: Summe durch 5 teilbar bringt Summe/5, sonst nichts, Daneben macht die Runde ungültig', () => {
  let st = replay(game('fives', FV(), 1, 'T20 20 5'));
  assert.equal(st.leg.score[0], 17); assert.equal(st.turns[0].points, 17);
  st = replay(game('fives', FV(), 1, '20 20 3'));
  assert.equal(st.leg.score[0], 0); assert.equal(st.dartEvent.type, 'void');
  st = replay(game('fives', FV(), 1, '20 - 5'));
  assert.equal(st.leg.score[0], 0);
  st = replay(game('fives', FV(), 1, 'BULL 25 5'));
  assert.equal(st.leg.score[0], 16);
});

ok('Fives: Genau das Ziel gewinnt, Überwerfen ist Bust, Erreichen reicht als Option', () => {
  // 3 × T20 = 180 → 36, dann 75 → 15: genau 51
  let st = replay(game('fives', FV(), 2, 'T20 T20 T20  - - -  T20 5 10'));
  assert.equal(st.finished, true); assert.equal(st.winner, 0);
  st = replay(game('fives', FV(), 2, 'T20 T20 T20  - - -  T20 T20 T20'));
  assert.equal(st.finished, false); assert.equal(st.leg.score[0], 36); assert.equal(st.turns.at(-1).bust, true);
  st = replay(game('fives', FV({ over: 'reach' }), 2, 'T20 T20 T20  - - -  T20 T20 T20'));
  assert.equal(st.finished, true); assert.equal(st.leg.score[0], 72);
});

ok('Fives: Double und Triple wie Single als Option, Bull bleibt 25/50', () => {
  const st = replay(game('fives', FV({ dt: 'single' }), 1, 'T20 D10 BULL'));
  assert.equal(st.leg.score[0], 16); // 20 + 10 + 50 = 80
});

// ---------- Steeples ----------
ok('Steeples: Kurs 1–20 und Bull, Double überspringt eins, Triple zwei, nie über Bull', () => {
  let st = replay(game('steeples', { back: 'one' }, 1, '1 D2 T4'));
  assert.equal(st.leg.pos[0], 6); // 1 → 2, D2 → 4, T4 → 7 (Index 6)
  st = replay(game('steeples', { back: 'one' }, 1, '1 2 3  4 5 6  7 8 9  10 11 12  13 14 15  16 17 T18'));
  assert.equal(st.leg.pos[0], 20); // T18 springt bis vor Bull
  st = replay(game('steeples', { back: 'one' }, 1, '1 2 3  4 5 6  7 8 9  10 11 12  13 14 15  16 17 18  19 20 BULL'));
  assert.equal(st.finished, true); assert.equal(st.legResults[0].darts[0], 21);
});

ok('Steeples: Treffer außer der Reihe → nach der Runde zurück, Varianten', () => {
  let st = replay(game('steeples', { back: 'one' }, 1, '1 2 20'));
  assert.equal(st.leg.pos[0], 1); assert.equal(st.turns[0].back, 1); assert.equal(st.lastEvent.type, 'back');
  st = replay(game('steeples', { back: 'start' }, 1, '1 2 3  4 20 5'));
  assert.equal(st.leg.pos[0], 3); // zurück auf das Ziel zu Rundenbeginn (4)
  st = replay(game('steeples', { back: 'none' }, 1, '1 20 2'));
  assert.equal(st.leg.pos[0], 2); assert.equal(st.turns[0].back, undefined);
  st = replay(game('steeples', { back: 'one' }, 1, '20 20 -'));
  assert.equal(st.leg.pos[0], 0); // nie unter den Start
  st = replay(game('steeples', { back: 'one' }, 1, '- - 1'));
  assert.equal(st.leg.pos[0], 1); // daneben zählt nicht als Fehltreffer
});

ok('Steeples „Runde ohne Treffer": ein Treffer reicht, ohne Treffer ein Feld zurück', () => {
  // Treffer plus zwei andere Kurszahlen: kein Rückschritt
  let st = replay(game('steeples', { back: 'miss' }, 1, '1 20 5'));
  assert.equal(st.leg.pos[0], 1); assert.equal(st.turns[0].back, undefined); assert.equal(st.lastEvent.type, 'turn');
  assert.equal(st.darts.some((d) => d.slip), false);
  // mehrere Treffer rücken mehrfach vor, Double springt
  st = replay(game('steeples', { back: 'miss' }, 1, '1 D2 4'));
  assert.equal(st.leg.pos[0], 4);
  // Runde ohne Treffer: ein Feld zurück, egal ob daneben oder andere Zahl
  st = replay(game('steeples', { back: 'miss' }, 1, '1 2 20  20 5 -'));
  assert.equal(st.leg.pos[0], 1); assert.equal(st.turns[1].back, 1); assert.equal(st.lastEvent.type, 'back');
  st = replay(game('steeples', { back: 'miss' }, 1, '1 2 20  - - -'));
  assert.equal(st.leg.pos[0], 1);
  // nie unter den Start
  st = replay(game('steeples', { back: 'miss' }, 1, '- - -'));
  assert.equal(st.leg.pos[0], 0); assert.equal(st.turns[0].back, 0); assert.equal(st.lastEvent.type, 'turn');
  // zwei Spieler: der Treffer des einen schützt den anderen nicht
  st = replay(game('steeples', { back: 'miss' }, 2, '1 2 3  1 - -  - - -  2 - -'));
  assert.equal(st.leg.pos[0], 2); assert.equal(st.leg.pos[1], 2);
});

ok('Steeples: kein Rückschritt in der Siegrunde', () => {
  const run = '1 2 3  4 5 6  7 8 9  10 11 12  13 14 15  16 17 18  ';
  // 19, dann außer der Reihe die 5, dann T20 … Bull fehlt noch: normale Runde mit Rückschritt
  let st = replay(game('steeples', { back: 'one' }, 1, run + '19 5 20'));
  assert.equal(st.leg.pos[0], 19);
  // Siegrunde mit Fehltreffer davor: Sieg zählt, kein „Zurück"
  st = replay(game('steeples', { back: 'one' }, 1, run + '19 20 -  5 BULL'));
  assert.equal(st.finished, true); assert.equal(st.turns.at(-1).back, undefined);
  assert.equal(st.legResults[0].scores[0], 21);
});

// ---------- War ----------
const WR = (cfg) => ({ set: 'cricket', need: 3, ...cfg });

ok('War: Drei Marks erobern, Marks sammeln sich über Runden', () => {
  let st = replay(game('war', WR(), 2, 'T20'));
  assert.equal(st.leg.owner[20], 0); assert.equal(st.leg.strength[20], 3); assert.equal(st.dartEvent.type, 'capture');
  st = replay(game('war', WR(), 2, '19 19 -  - - -  19'));
  assert.equal(st.leg.owner[19], 0); assert.equal(st.leg.prog[0][19], 0);
  st = replay(game('war', WR({ need: 1 }), 2, '15'));
  assert.equal(st.leg.owner[15], 0);
});

ok('War: Eine Runde zum Zurückerobern, mehr Marks als der Halter, danach gesichert', () => {
  let st = replay(game('war', WR(), 2, 'T20 - -  T20 - -'));
  assert.equal(st.leg.owner[20], 0); assert.equal(st.leg.locked[20], true); // 3 Marks reichen nicht gegen Stärke 3
  st = replay(game('war', WR(), 2, 'T20 - -  T20 20'));
  assert.equal(st.leg.owner[20], 1); assert.equal(st.leg.strength[20], 4); assert.equal(st.dartEvent.type, 'recapture');
  st = replay(game('war', WR(), 2, 'T20 - -  T20 20 -  T20 D20 -'));
  assert.equal(st.leg.owner[20], 0); // Gegenangriff in der nächsten Runde: 5 schlägt 4
  st = replay(game('war', WR(), 2, 'T20 20 -  - - -  T20 T20'));
  assert.equal(st.leg.owner[20], 0); assert.equal(st.leg.strength[20], 4); // Stärke wächst nur in der Eroberungsrunde
});

ok('War: Alle Felder gesichert → meiste Felder gewinnt, Gleichstand → Stechen auf Bull', () => {
  let st = replay(game('war', WR(), 2, 'T20 T19 T18  - - -  T17 T16 T15  - - -  BULL 25 -  - - -'));
  assert.equal(st.finished, true); assert.equal(st.winner, 0); assert.equal(st.legResults[0].scores[0], 7);
  // 3 Spieler, 3 : 3 : 1. Das Bull ist erst nach den Runden von Spieler 1 und 2 gesichert.
  const tie = 'T20 T19 T18  T17 T16 T15  BULL 25 -  - - -  - - -';
  st = replay(game('war', WR(), 3, tie));
  assert.equal(st.finished, false); assert.equal(st.lastEvent.type, 'tiebreak'); assert.deepEqual(st.leg.tb.pool, [0, 1]);
  assert.equal(st.current, 0); // Spieler 3 ist im Stechen nicht dabei
  st = replay(game('war', WR(), 3, tie + '  25 - -  25 - -'));
  assert.equal(st.finished, false); assert.equal(st.lastEvent.type, 'tiebreak');
  st = replay(game('war', WR(), 3, tie + '  25 - -  25 - -  BULL - -  25 - -'));
  assert.equal(st.finished, true); assert.equal(st.winner, 0);
  assert.equal(RULES.war.minPlayers, 2);
});

// ---------- Scram ----------
const SC = (cfg) => ({ bull: false, ...cfg });
const stopAll = (nums) => { const out = []; for (let i = 0; i < nums.length; i += 3) out.push(nums.slice(i, i + 3).join(' ')); return out; };

ok('Scram: Stopper schließt mit jedem Treffer, Scorer punktet nur auf offenen Zahlen', () => {
  const st = replay(game('scram', SC(), 2, '20 T19 -  T20 T19 T18'));
  assert.equal(st.leg.closed[20], true); assert.equal(st.leg.closed[19], true);
  assert.equal(st.leg.score[1], 54); assert.equal(st.leg.score[0], 0);
  assert.equal(RULES.scram.minPlayers, 2); assert.equal(RULES.scram.maxPlayers, 2);
});

ok('Scram: Letzte Zahl beendet die Hälfte mitten in der Runde, Rollentausch, höhere Summe gewinnt', () => {
  const nums = Array.from({ length: 20 }, (_, i) => String(20 - i)); // 20 … 1
  const half = (scorerTurn) => stopAll(nums).flatMap((s, k) => (k < 6 ? [s, scorerTurn] : [s])); // nach der 7. Stopper-Runde ist alles zu
  // Hälfte 1: Spieler 0 stoppt von 20 abwärts, Spieler 1 wirft als Scorer immer auf die 1, die bis zuletzt offen bleibt
  let darts = half('1 1 1');
  let st = replay(game('scram', SC(), 2, darts.join('  ')));
  assert.equal(st.leg.half, 2); assert.equal(st.leg.stopper, 1); assert.equal(st.current, 1); assert.equal(st.lastEvent.type, 'swap');
  assert.equal(st.leg.score[1], 18); assert.equal(st.turns.at(-1).darts.length, 2); // 20 Zahlen in 7 Runden: die letzte endet nach 2 Darts
  darts = [...darts, ...half('2 2 2')];
  st = replay(game('scram', SC(), 2, darts.join('  ')));
  assert.equal(st.finished, true); assert.equal(st.winner, 0); assert.deepEqual(st.legResults[0].scores, [36, 18]);
});

ok('Scram: Bull als Option, Gleichstand → je ein Dart aufs Bull', () => {
  let st = replay(game('scram', SC({ bull: true }), 2, '25'));
  assert.equal(st.leg.closed[25], true);
  st = replay(game('scram', SC(), 2, 'BULL'));
  assert.equal(st.leg.closed[25], undefined);
  const nums = Array.from({ length: 20 }, (_, i) => String(20 - i));
  const half = stopAll(nums).flatMap((s, k) => (k < 6 ? [s, '- - -'] : [s]));
  const both = [...half, ...half].join('  ');
  st = replay(game('scram', SC(), 2, both));
  assert.equal(st.lastEvent.type, 'tiebreak'); assert.equal(st.finished, false);
  st = replay(game('scram', SC(), 2, both + '  25  BULL'));
  assert.equal(st.finished, true); assert.equal(st.winner, 1);
  st = replay(game('scram', SC(), 2, both + '  25  25'));
  assert.equal(st.finished, false);
});

ok('Scram: Neues Leg tauscht die Rollen der ersten Hälfte', () => {
  const nums = Array.from({ length: 20 }, (_, i) => String(20 - i));
  const half = (sc) => stopAll(nums).flatMap((s, k) => (k < 6 ? [s, sc] : [s]));
  const st = replay(game('scram', SC({ legs: 2 }), 2, [...half('1 1 1'), ...half('- - -')].join('  ')));
  assert.equal(st.legResults.length, 1); assert.equal(st.leg.stopper, 1); assert.equal(st.current, 1);
});

ok('Statistik: Baseball, Fives, Steeples, War, Scram', () => {
  const bb = playerStats('p0', [done(game('baseball', BB(), 1, innings((i) => `T${i} T${i} T${i}`)))]).baseball;
  assert.equal(bb.bestScore, 81); assert.equal(bb.perfect, 9); assert.equal(bb.ppi, 9);
  const fv = playerStats('p0', [done(game('fives', FV(), 2, 'T20 T20 T20  - - -  T20 5 10'))]).fives;
  assert.equal(fv.turns, 2); assert.equal(fv.fives, 2); assert.equal(fv.ppr, 25.5);
  const sp = playerStats('p0', [done(game('steeples', { back: 'one' }, 1, '1 2 20  2 3 4'))]).steeples;
  assert.equal(sp.backs, 1); assert.equal(sp.hits, 5);
  const wr = playerStats('p0', [done(game('war', WR(), 2, 'T20 T19 T18  - - -  T17 T16 T15  - - -  BULL 25 -  - - -'))]).war;
  assert.equal(wr.captures, 7); assert.equal(wr.fieldsPerLeg, 7);
  const nums = Array.from({ length: 20 }, (_, i) => String(20 - i));
  const half = (sc) => stopAll(nums).flatMap((s, k) => (k < 6 ? [s, sc] : [s]));
  const sc = playerStats('p0', [done(game('scram', SC(), 2, [...half('1 1 1'), ...half('2 2 2')].join('  ')))]).scram;
  assert.equal(sc.avgScore, 36); assert.equal(sc.stopPerLeg, 20);
});

// ---------- Engine-Erweiterungen ----------
ok('Spielerzahl je Modus', () => {
  assert.equal(RULES.hare.maxPlayers, 4); assert.equal(RULES.gotcha.minPlayers, 2);
  for (const r of Object.values(RULES)) assert.ok(r.title && r.subtitle && r.initLeg && r.applyDart && r.score && r.line, r.id);
});

ok('Sicherung: unbekannter Modus oder neueres Schema wird abgelehnt', async () => {
  const base = { app: 'oche', players: [], games: [] };
  assert.equal(SCHEMA, 8);
  await assert.rejects(importAll({ ...base, schema: 99 }), /neueren App-Version/);
  await assert.rejects(importAll({ ...base, schema: 8, games: [{ id: 'g', mode: 'darts9000' }] }), /darts9000/);
});

// Ein Lösch-Vermerk hat keinen Modus. Er darf nicht als „unbekannter Modus" gelten, sonst lehnte der Import jede
// Sicherung mit gelöschten Spielen ab. Die Ablehnung kommt vor jedem Speicherzugriff, im Test ohne IndexedDB
// bricht der Import deshalb erst danach mit einem anderen Fehler ab.
ok('Sicherung: Lösch-Vermerke gelten nicht als unbekannter Modus', async () => {
  const data = { app: 'oche', schema: 5, players: [], games: [tombstone('g1', 5)] };
  await assert.rejects(importAll(data), (e) => !/neueren App-Version/.test(e.message));
});

ok('Sicherung: Lösch-Vermerk schlägt ältere Kopie, neuere Kopie schlägt Vermerk', () => {
  const live = { id: 'g1', mode: 'x01', updatedAt: 100 };
  // Hier gelöscht (Vermerk 200), alte Sicherung bringt das Spiel (100) zurück: bleibt gelöscht
  let r = mergeItems([tombstone('g1', 200)], [live]);
  assert.equal(r.puts.length, 0); assert.equal(r.added, 0);
  // Sicherung vom anderen Tablet enthält den Vermerk (200), hier lebt das Spiel noch (100): wird entfernt
  r = mergeItems([live], [tombstone('g1', 200)]);
  assert.equal(r.puts.length, 1); assert.equal(r.removed, 1); assert.equal(r.puts[0].deleted, true);
  // Vermerk für etwas, das es hier nie gab: wird gespeichert, zählt aber nicht als entfernt
  r = mergeItems([], [tombstone('g2', 50)]);
  assert.equal(r.puts.length, 1); assert.equal(r.removed, 0); assert.equal(r.added, 0);
  // Gleicher Stand doppelt importiert: nichts zu tun
  r = mergeItems([live], [live]);
  assert.equal(r.puts.length, 0);
  // Archiviert (neueres updatedAt) gewinnt gegen das ältere, nicht archivierte Profil aus der Sicherung
  r = mergeItems([{ id: 'p', archived: true, updatedAt: 300 }], [{ id: 'p', archived: false, updatedAt: 100 }]);
  assert.equal(r.puts.length, 0);
});

ok('Statistik: ausgenommenes Spiel zählt nirgends, bleibt aber für die Spieleliste sichtbar', () => {
  const g = done(game('x01', { start: 501, in: 'single', out: 'double' }, 1, 'T20 T20 T20'));
  const ex = { ...g, excluded: true };
  assert.equal(hasPlay(ex, 'p0'), false); assert.equal(hasDarts(ex, 'p0'), true);
  assert.equal(playerStats('p0', [ex]).x01.darts, 0);
  assert.equal(playerStats('p0', [g, ex]).x01.darts, 3);
  assert.equal(playerStats('p0', [ex]).board.total, 0);
});

ok('Statistik: freier Zeitraum schließt beide Tage ein, vertauschte Eingabe gilt umgekehrt', () => {
  const at = (y, m, d, h) => new Date(y, m - 1, d, h).getTime();
  const g = (ts) => ({ mode: 'x01', config: { start: 501 }, finishedAt: ts });
  const games = [g(at(2026, 11, 1, 0)), g(at(2026, 11, 5, 23)), g(at(2026, 11, 6, 0)), g(at(2026, 10, 31, 23))];
  const F = { custom: true, from: '2026-11-01', to: '2026-11-05', mode: 'all' };
  assert.equal(filterGames(games, F).length, 2);
  assert.equal(filterGames(games, { ...F, from: '2026-11-05', to: '2026-11-01' }).length, 2);
  assert.equal(filterGames(games, { ...F, to: '' }).length, 3);
  // Zeitraum-Knöpfe gelten weiter, solange custom aus ist
  assert.equal(filterGames(games, { ...F, custom: false, days: null }).length, 4);
});

ok('Statistik: Zeitpunkt eines laufenden Spiels ist der letzte Wurf, nicht updatedAt', () => {
  const g = { createdAt: 10, updatedAt: 999, darts: [{ s: 20, m: 1, t: 50 }] };
  assert.equal(gameTime(g), 50);
  assert.equal(gameTime({ ...g, finishedAt: 70 }), 70);
  assert.equal(gameTime({ createdAt: 10, updatedAt: 999, darts: [] }), 10);
});

// ---------- Zufallszahlen ----------
ok('Cricket mit Zufallszahlen: 6 verschiedene aus 1–20 plus Bull, Spiel läuft nur auf diesen Feldern', () => {
  for (let k = 0; k < 50; k++) {
    const nums = drawCricketNumbers();
    assert.equal(new Set(nums).size, 6);
    assert.ok(nums.every((x) => x >= 1 && x <= 20));
  }
  const cfg = { variant: 'standard', numbers: [3, 11, 7, 20, 1, 14] };
  assert.deepEqual(cricketRows(cfg).map((r) => r.key), ['20', '14', '11', '7', '3', '1', 'B']);
  assert.equal(cricketRows({ variant: 'standard' }), CRICKET_ROWS);
  // T3 schließt die 3, 15 zählt nicht, T3 danach bringt 9 Punkte, solange der Gegner die 3 offen hat
  let st = replay(game('cricket', cfg, 2, 'T3 15 -  - - -  T3'));
  assert.equal(st.leg.marks[0]['3'], 3); assert.equal(st.leg.score[0], 9); assert.equal(st.leg.marks[0]['15'], undefined);
  // Alles zu gewinnt
  st = replay(game('cricket', cfg, 1, 'T20 T14 T11  T7 T3 T1  BULL 25'));
  assert.equal(st.finished, true);
  assert.equal(RULES.cricket.subtitle(cfg), 'Standard · Zufall 3 11 7 20 1 14');
});

ok('Around the Clock: Reihenfolge absteigend (Bull zuerst) und zufällig (Bull irgendwo)', () => {
  assert.deepEqual(atcOrder('desc', true).slice(0, 3), [25, 20, 19]);
  assert.equal(atcOrder('asc', true), null);
  const r = atcOrder('random', true);
  assert.equal(r.length, 21); assert.deepEqual([...r].sort((a, b) => a - b), [...Array.from({ length: 20 }, (_, i) => i + 1), 25]);
  // Absteigend ohne Bull: 20 zuerst
  const cfg = { zone: 'any', bull: false, targets: atcOrder('desc', false) };
  const st = replay(game('atc', cfg, 1, '1 20 19'));
  assert.equal(st.leg.pos[0], 2); assert.equal(atcTargets(cfg)[st.leg.pos[0]], 18);
});

ok('Revanche lost Cricket-Zahlen und ATC-Reihenfolge neu aus, Standard bleibt ohne Zufallswerte', () => {
  const first = prepareConfig('cricket', { variant: 'standard', random: true }, 2);
  assert.equal(first.numbers.length, 6); assert.equal(typeof first.seed, 'number');
  const draws = new Set(Array.from({ length: 20 }, () => prepareConfig('cricket', { ...first }, 2).numbers.join()));
  assert.ok(draws.size > 1);
  assert.equal(prepareConfig('cricket', { variant: 'standard', random: false }, 2).numbers, undefined);
  assert.equal(prepareConfig('atc', { zone: 'any', bull: false, order: 'asc' }, 1).targets, undefined);
  assert.equal(prepareConfig('atc', { zone: 'any', bull: false, order: 'random' }, 1).targets.length, 20);
  // Gleicher seed, gleiche Werte: Grundlage dafür, dass das Replay deterministisch bleibt
  assert.deepEqual(prepareConfig('killer', { lives: 3 }, 3, 42).numbers, prepareConfig('killer', { lives: 3 }, 3, 42).numbers);
});

// Jede Regel mit Auslosung muss mit ihren Setup-Vorgaben ein Leg vorbereiten und starten können.
// Fängt fehlende Importe und Felder in draw ab (Blind Killer startete beim Umbau auf Zufall je Leg nicht mehr).
ok('Zufall je Leg: jede Regel mit draw startet mit ihren Vorgaben, auch im zweiten Leg', async () => {
  const { MODES } = await import('../js/modes.js');
  const withDraw = Object.entries(RULES).filter(([, r]) => r.draw);
  assert.ok(withDraw.length >= 8);
  for (const [mode, rule] of withDraw) {
    const opts = Object.fromEntries((MODES[mode].opts || []).map(([k, , vals]) => [k, vals.at(-1)[0]]));
    const base = { ...MODES[mode].config(opts), legs: 2, sets: 1 };
    const cfg = prepareConfig(mode, MODES[mode].prepare ? MODES[mode].prepare(base, 3) : base, 3);
    const n = rule.maxPlayers ? Math.min(3, rule.maxPlayers) : 3;
    const st = replay({ mode, config: cfg, playerIds: Array.from({ length: n }, (_, i) => 'p' + i), darts: [] });
    assert.ok(st.leg, mode);
    assert.ok(rule.subtitle(cfg).length, mode);
  }
});

// Bisher galt die Auslosung für das ganze Match, jedes Leg startete mit denselben Zahlen.
ok('Zufall je Leg: Tic-Tac-Toe-Raster wechselt, Replay bleibt gleich, alte Spiele ohne seed behalten ihr Raster', () => {
  const cfg = prepareConfig('ttt', { need: 1, legs: 5, sets: 1 }, 2, 12345);
  // Leg für Leg: Wer anwirft, nimmt die obere Reihe. Leg 1 wirft Spieler 1 an, Leg 2 Spieler 2.
  let darts = '';
  const grids = [];
  for (let k = 0; k < 4; k++) {
    const st = replay(game('ttt', cfg, 2, darts));
    assert.equal(st.legResults.length, k);
    grids.push(st.cfg.grid.join());
    const g = st.cfg.grid;
    darts += (k % 2 === 0 ? `${g[0]} ${g[1]} ${g[2]}` : `${g[0]} ${g[1]} ${g[2]}`) + '  ';
  }
  assert.equal(grids[0], cfg.grid.join()); // Leg 1 = ausgeschriebene Werte
  assert.ok(new Set(grids).size > 1, 'alle Legs hatten dasselbe Raster');
  const a = replay(game('ttt', cfg, 2, darts)), b = replay(game('ttt', cfg, 2, darts));
  assert.equal(a.legResults.length, 4);
  assert.deepEqual(a.legResults.map((r) => r.cfg.grid.join()), b.legResults.map((r) => r.cfg.grid.join()));
  assert.deepEqual(a.legResults.map((r) => r.cfg.grid.join()), grids);
  // Altes Spiel ohne seed: dasselbe Raster in jedem Leg
  const { seed, ...old } = cfg;
  const g = old.grid;
  const o = replay(game('ttt', old, 2, `${g[0]} ${g[1]} ${g[2]}`));
  assert.equal(o.legResults.length, 1); assert.equal(o.cfg.grid.join(), g.join());
});

ok('Zufall je Leg: Killer-Zahlen wechseln im zweiten Leg', () => {
  const cfg = prepareConfig('killer', { lives: 1, zone: 'segment', selfHit: true, legs: 2, sets: 1 }, 2, 777);
  const [a, b] = cfg.numbers;
  // Spieler 1 wird Killer (Triple auf die eigene Zahl) und nimmt Spieler 2 das einzige Leben
  const st = replay(game('killer', cfg, 2, `T${a} ${b}`));
  assert.equal(st.legResults.length, 1);
  assert.equal(st.legResults[0].cfg.numbers.join(), cfg.numbers.join());
  assert.notEqual(st.cfg.numbers.join(), cfg.numbers.join());
});

ok('Around the Clock: D/T springt nie über ein Bull mitten in der Folge', () => {
  const cfg = { zone: 'skip', bull: true, targets: [5, 25, 9, 2] };
  let st = replay(game('atc', cfg, 1, 'T5'));
  assert.equal(st.leg.pos[0], 1); // stoppt vor Bull
  st = replay(game('atc', cfg, 1, 'T5 BULL T9'));
  assert.equal(st.leg.pos[0], 4); assert.equal(st.finished, true); // T9 springt bis ans Ende, nicht darüber hinaus
});

// ---------- Checkout ----------
ok('Checkout-Vorschläge', () => {
  assert.deepEqual(suggestCheckout(170, 3, 'double'), ['T20', 'T20', 'BULL']);
  assert.deepEqual(suggestCheckout(100, 3, 'double'), ['T20', 'D20']);
  assert.deepEqual(suggestCheckout(40, 1, 'double'), ['D20']);
  assert.equal(suggestCheckout(169, 3, 'double'), null);
  assert.equal(suggestCheckout(101, 1, 'double'), null);
  assert.deepEqual(suggestCheckout(57, 1, 'master'), ['T19']);
  assert.deepEqual(suggestCheckout(61, 2, 'double'), ['T15', 'D8']);
  assert.deepEqual(suggestCheckout(167, 3, 'double'), ['T20', 'T19', 'BULL']);
});

// ---------- Statistik ----------
ok('Statistik: Filter nach Zeitraum und Modus', () => {
  const now = Date.UTC(2026, 10, 11);
  const g = (mode, start, daysAgo) => ({ mode, config: { start }, finishedAt: now - daysAgo * 864e5 });
  const games = [g('x01', 501, 1), g('x01', 301, 20), g('cricket', undefined, 3), g('x01', 501, 200), g('killer', undefined, 2), g('atc', undefined, 40)];
  assert.equal(filterGames(games, { days: null, mode: 'all' }, now).length, 6);
  assert.equal(filterGames(games, { days: 7, mode: 'all' }, now).length, 3);
  assert.equal(filterGames(games, { days: 30, mode: 'x01' }, now).length, 2);
  assert.equal(filterGames(games, { days: null, mode: '501' }, now).length, 2);
  assert.equal(filterGames(games, { days: null, mode: 'cricket' }, now).length, 1);
  assert.equal(filterGames(games, { days: null, mode: 'killer' }, now).length, 1);
  assert.equal(filterGames(games, { days: 30, mode: 'atc' }, now).length, 0);
});

ok('Statistik: Ein Spiel zählt für einen Spieler erst mit einem eigenen Dart (Filter und Kennzahlen gleich)', () => {
  const g = game('x01', { start: 501, in: 'single', out: 'double' }, 2, 'T20');
  assert.equal(hasPlay(g, 'p0'), true); assert.equal(hasPlay(g, 'p1'), false);
  assert.equal(hasPlay(game('golf', GO(), 1, ''), 'p0'), false);
  assert.equal(playerStats('p1', [g]).x01.matches, 0);
});

ok('Statistik: gleitender Mittelwert', () => {
  assert.deepEqual(rolling([10, 20, 30, 40], 2), [10, 15, 25, 35]);
});

ok('Statistik: Trefferbild zählt nur die Darts des Spielers', () => {
  const gm = { ...game('x01', { start: 501, in: 'single', out: 'double' }, 2, 'T20 20 - T19 T19 5'), status: 'active' };
  const b0 = playerStats('p0', [gm]).board, b1 = playerStats('p1', [gm]).board;
  assert.deepEqual(b0, { counts: { '20-3': 1, '20-1': 1 }, total: 3, miss: 1 });
  assert.deepEqual(b1, { counts: { '19-3': 2, '5-1': 1 }, total: 3, miss: 0 });
});

ok('Statistik: Around the Clock Trefferquote und bestes Leg', () => {
  const g = done(game('atc', ATC(), 1, '1 - 2 ' + Array.from({ length: 18 }, (_, i) => String(i + 3)).join(' ')));
  const a = playerStats('p0', [g]).atc;
  assert.equal(a.darts, 21); assert.equal(a.hits, 20); assert.equal(a.bestLeg, 21);
  assert.equal(a.history.length, 1); assert.ok(Math.abs(a.history[0].value - (20 / 21) * 100) < 1e-9);
});

ok('Statistik: Shanghai Punkte je Runde und Shanghais', () => {
  const g = { ...game('shanghai', SH({ instant: false }), 1, 'T1 1 D1 2 - -'), status: 'active' };
  const s = playerStats('p0', [g]).shanghai;
  assert.equal(s.points, 8); assert.equal(s.ppr, 4); assert.equal(s.shanghais, 1); assert.equal(s.hits, 4);
});

ok('Statistik: Killer Darts bis Killer und genommene Leben', () => {
  const g = { ...game('killer', K({ numbers: [20, 19] }), 2, '- D20 D19 - - D19'), status: 'active' };
  const k0 = playerStats('p0', [g]).killer, k1 = playerStats('p1', [g]).killer;
  assert.equal(k0.avgToKiller, 2); assert.equal(k0.taken, 1);
  assert.equal(k1.avgToKiller, 3); assert.equal(k1.taken, 0);
});

ok('Statistik: Bob\'s 27, Halve-It, 121', () => {
  const b = done(game('bobs', BO(), 1, miss(5)));
  const bo = playerStats('p0', [b]).bobs;
  assert.equal(bo.avgScore, -3); assert.equal(bo.survived, 0); assert.equal(bo.finishedLegs, 1); assert.equal(bo.hitRate, 0);
  const h = done(game('halveit', HV(['19', '20']), 1, '19 - -  - - -'));
  const hv = playerStats('p0', [h]).halveit;
  assert.equal(hv.bestScore, 10); assert.equal(hv.halved, 1); assert.equal(hv.hits, 1); assert.equal(hv.turns, 2);
  const c = done(game('c121', C({ attempts: 2 }), 1, 'T20 T19 -  2 D1 ' + miss(3)));
  const cc = playerStats('p0', [c]).c121;
  assert.equal(cc.checks, 1); assert.equal(cc.attempts, 2); assert.equal(cc.rate, 0.5);
  assert.equal(cc.dartsPerCheck, 5); assert.equal(cc.best, 121); assert.equal(cc.history[0].value, 50);
});

ok('Statistik: neue Modi (Golf, Gallery, JDC, Follow, Hare, Doppel-Training, Knockout, Gotcha)', () => {
  const gf = playerStats('p0', [done(game('golf', GO(), 1, '1 X  D2  - - -'))]).golf;
  assert.equal(gf.perHole, 3); assert.equal(gf.aces, 1); assert.equal(gf.best[3], 9); assert.equal(gf.history[0].value, 3);
  const ga = playerStats('p0', [done(game('gallery', {}, 1, 'T20 T11 D14 ' + miss(27)))]).gallery;
  assert.equal(ga.checks, 1); assert.equal(ga.attempts, 10); assert.equal(ga.avgScore, 12); assert.equal(ga.dartsPerCheck, 3);
  const jd = playerStats('p0', [done(game('jdc', { reps: 1 }, 1, '10 D10 T10 ' + miss(18)))]).jdc;
  assert.equal(jd.bestScore, 160); assert.equal(jd.shanghais, 1); assert.deepEqual(jd.partAvg.slice(1), [160, 0, 0]);
  const fl = playerStats('p1', [done(game('follow', FL({ lives: 1 }), 2, 'T20 X  - - -'))]).follow;
  assert.equal(fl.tries, 1); assert.equal(fl.hits, 0); assert.equal(fl.lost, 1);
  const hh = playerStats('p1', [done(game('hare', HH(), 2, '- - -  5'))]).hare;
  assert.equal(hh.houndWins, 1); assert.equal(hh.hareLegs, 0);
  const db = playerStats('p0', [done(game('dbl', { zone: 'double', order: 'asc', bull: false, targets: dblTargets('asc', false) }, 1, '- D1 - D2'))]).dbl;
  assert.equal(db.perDouble, 2);
  const ko = playerStats('p1', [done(game('knockout', KO({ lives: 1 }), 2, '20 - -  - - -'))]).knockout;
  assert.equal(ko.strikes, 1); assert.equal(ko.ppr, 0);
  const gt = playerStats('p1', [{ ...game('gotcha', GT(), 2, '20 20 -  20 - 20'), status: 'active' }]).gotcha;
  assert.equal(gt.kills, 1); assert.equal(gt.avg, 40);
});

// ---------- 0.7.1: Sieg-Wertung nur gegen Gegner ----------
// Bis 0.7.0 galt der einzige Spieler eines Spiels als Sieger. Trainingsmodi zeigten „12 / 12 gewonnen".
ok('Statistik: Spiele allein zählen als Solo, Siege nur gegen Gegner', () => {
  const X = { start: 40, in: 'single', out: 'double' };
  const solo = done(game('x01', X, 1, 'D20'));
  const win = done(game('x01', X, 2, 'D20'));
  const loss = done(game('x01', X, 2, '- - -  D20'));
  const s = playerStats('p0', [solo, win, loss]).x01;
  assert.equal(s.solo, 1); assert.equal(s.matches, 2); assert.equal(s.won, 1);
  assert.equal(s.legs, 3); assert.equal(s.vsLegs, 2); assert.equal(s.legsWon, 1);
  assert.equal(s.bestLeg, 1); // das beste Leg zählt auch allein, es ist eine Dartzahl und kein Sieg
  assert.deepEqual(s.history.map((e) => e.won).sort(), [false, null, true].sort());
  const a = playerStats('p0', [done(game('atc', ATC(), 1, Array.from({ length: 20 }, (_, i) => String(i + 1)).join(' ')))]).atc;
  assert.equal(a.solo, 1); assert.equal(a.matches, 0); assert.equal(a.won, 0); assert.equal(a.legsWon, 0); assert.equal(a.history[0].won, null);
});

// ---------- 0.7.1: Prüfung der Einträge ----------
const PL = (over = {}) => ({ id: 'p0', name: 'Anna', color: '#e5484d', archived: false, createdAt: 1, updatedAt: 1, ...over });
const GM = (over = {}) => ({ id: 'g1', mode: 'x01', config: { start: 501, in: 'single', out: 'double', legs: 1, sets: 1 }, playerIds: ['p0', 'p1'],
  darts: [{ s: 20, m: 3, t: 5 }, { s: 0, m: 1, t: 6 }], status: 'active', winnerId: null, createdAt: 1, updatedAt: 2, finishedAt: null, ...over });

ok('Prüfung: gültige Profile und Spiele bestehen, auch in der Form älterer Versionen', () => {
  assert.equal(validPlayer(PL()), true);
  assert.equal(validPlayer({ id: 'p0', name: 'Anna', color: '#E5484D' }), true); // ohne archived und Zeitstempel
  assert.equal(validPlayer(PL({ id: '3f2c1a9e-8b7d-4c6e-9f10-aabbccddeeff', name: 'Jürgen "The Power" <Müller>' })), true); // Namen sind frei
  assert.equal(validGame(GM()), true);
  assert.equal(validGame(GM({ darts: [{ s: 20, m: 1 }, { s: 0, m: 0, stop: true }], excluded: true, status: 'finished', winnerId: 'p1', finishedAt: 9 })), true);
  const { winnerId, finishedAt, createdAt, ...old } = GM();
  assert.equal(validGame(old), true);
});

ok('Prüfung: beschädigte und manipulierte Einträge fallen durch', () => {
  for (const bad of [null, 'x', [], PL({ id: 5 }), PL({ id: 'a"b' }), PL({ name: '' }), PL({ name: '   ' }), PL({ name: undefined }), PL({ name: 7 }),
    PL({ color: 'red' }), PL({ color: '#fff' }), PL({ color: '#e5484d" onclick="x' }), PL({ color: '#e5484d;background:url(x)' }), PL({ updatedAt: 'gestern' })]) {
    assert.equal(validPlayer(bad), false, JSON.stringify(bad));
  }
  for (const bad of [null, [], GM({ id: '<img>' }), GM({ mode: 'darts9000' }), GM({ mode: 'constructor' }), GM({ mode: undefined }), GM({ config: null }), GM({ config: [] }),
    GM({ config: { start: 501, hook: { a: 1 } } }), GM({ config: { targets: ['20', '<img src=x onerror=alert(1)>'] } }), GM({ config: { start: '501"><script>' } }),
    GM({ playerIds: [] }), GM({ playerIds: 'p0' }), GM({ playerIds: ['p0', 3] }), GM({ playerIds: ['p0', 'a b'] }), GM({ darts: null }), GM({ darts: [{ s: 21, m: 1 }] }),
    GM({ darts: [{ s: 20, m: 4 }] }), GM({ darts: [{ s: '20', m: 1 }] }), GM({ darts: [{ s: 20.5, m: 1 }] }), GM({ darts: [{ s: 20, m: 1, t: 'x' }] }), GM({ darts: [{ s: 5, m: 0, stop: true }] }),
    GM({ darts: [null] }), GM({ status: 'kaputt' }), GM({ winnerId: '"><b>' }), GM({ updatedAt: '2' }), GM({ excluded: 'ja' })]) {
    assert.equal(validGame(bad), false, JSON.stringify(bad));
  }
});

// Die Prüfung der config ist bewusst allgemein gehalten. Dieser Test sichert, dass sie kein echtes Spiel abweist:
// jede Kombination der Setup-Optionen jedes Modus, so wie die App sie beim Start anlegt, mit ein paar Darts.
ok('Prüfung: jede Einstellung jedes Modus besteht, so wie die App sie anlegt', async () => {
  const { MODES } = await import('../js/modes.js');
  assert.deepEqual(Object.keys(MODES).sort(), Object.keys(RULES).sort());
  const product = (lists) => lists.reduce((acc, l) => acc.flatMap((a) => l.map((v) => [...a, v])), [[]]);
  let count = 0;
  for (const [mode, ui] of Object.entries(MODES)) {
    const rule = RULES[mode];
    const n = Math.max(rule.minPlayers || 1, Math.min(3, rule.maxPlayers || 3));
    for (const combo of product(ui.opts.map(([, , choices]) => choices.map(([v]) => v)))) {
      const setup = Object.fromEntries(ui.opts.map(([k], i) => [k, combo[i]]));
      const base = { ...ui.config(setup), legs: 2, sets: 1 };
      const config = JSON.parse(JSON.stringify(prepareConfig(mode, ui.prepare ? ui.prepare(base, n) : base, n))); // wie nach Speichern und Laden
      assert.equal(validConfig(config), true, `${mode} ${JSON.stringify(config)}`);
      const g = GM({ mode, config, playerIds: Array.from({ length: n }, (_, i) => 'p' + i), darts: D('T20 D5 - 25 BULL 1 19 7 3').map((d, i) => ({ ...d, t: i })) });
      assert.equal(validGame(g), true, mode);
      assert.equal(sanitize({ players: [], games: [g] }).games.length, 1, `${mode} lässt sich nicht nachspielen: ${JSON.stringify(config)}`);
      count++;
    }
  }
  assert.ok(count > 150, String(count));
});

ok('Sicherung: nicht lesbare Einträge werden übersprungen und gezählt, der Rest bleibt', () => {
  const noNumbers = GM({ id: 'g3', mode: 'killer', config: { lives: 3, zone: 'double', selfHit: true, legs: 1, sets: 1 }, darts: [{ s: 20, m: 2, t: 1 }] }); // gültige Form, wirft beim Nachspielen
  const data = {
    players: [PL(), PL({ id: 'p1', color: 'javascript:alert(1)' }), tombstone('p2', 5), { id: 'x y', deleted: true, updatedAt: 1 }],
    games: [GM(), GM({ id: 'g2', config: null }), noNumbers, tombstone('g4', 7), 'Unsinn'],
  };
  const r = sanitize(data);
  assert.deepEqual(r.players.map((p) => p.id), ['p0', 'p2']);
  assert.deepEqual(r.games.map((g) => g.id), ['g1', 'g4']);
  assert.equal(r.skipped, 5);
  assert.equal(sanitize({ players: [PL()], games: [GM()] }).skipped, 0);
});

await Promise.all(pending);
console.log(`\n${n} Tests bestanden`);
