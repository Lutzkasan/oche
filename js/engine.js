// Match-Engine. Der Spielstand wird immer aus der Liste aller Darts neu berechnet.
// Damit sind Undo, Fortsetzen und Statistik ein und derselbe Weg und können nicht auseinanderlaufen.
//
// Vertrag einer Regel (js/rules/*.js):
//   Pflicht:  id, title(cfg), subtitle(cfg), initLeg(cfg, n, starter), score(leg, p), line(st, p),
//             starter = Index des Spielers, der das Leg anwirft (Hare and Hounds vergibt danach die Rollen).
//             applyDart(leg, p, d, cfg, dartIdx) → { pts, marks, bust, won, endTurn?, event?, … }
//             won = der Werfer gewinnt das Leg sofort. endTurn = Aufnahme endet vor dem dritten Dart.
//             event = Ereignis dieses Darts für die Anzeige (z. B. 'shanghai', 'killer', 'out').
//   Optional: active(leg, p)       false = Spieler wird übersprungen (ausgeschieden, nicht im Stechen)
//             turnEnd(leg, p, cfg, turn)  nach jeder Aufnahme: { winner } beendet das Leg mit diesem Sieger,
//                                  der nicht der Werfer sein muss. { event } meldet ein Ereignis.
//                                  { again } lässt denselben Spieler noch einmal werfen.
//             canStop(leg, p, cfg, turn)  true = der Werfer darf die Aufnahme vor dem dritten Dart beenden.
//                                  Die App zeigt dann die Taste „Fertig". Sie speichert einen Stopp-Eintrag
//                                  { s: 0, m: 0, stop: true } in der Dartliste. Er zählt nicht als Dart.
//                                  Meldet canStop vor dem ersten Dart true, beendet der Stopp eine Aufnahme
//                                  ohne Dart (Passen in Follow the Leader, ab 0.8.1).
//             Ein Dart darf zusätzlich call tragen (Snooker „Mit Ansage“: angesagte Farbe, ab 0.9.0).
//             stops(cfg)           false = in dieser Einstellung gibt es kein Aufhören, die App blendet „Fertig“ aus
//             minPlayers, maxPlayers   Spielerzahl, die das Setup zum Start verlangt
//             draw(cfg, n, rnd)    Werte, die jedes Leg neu bekommt (Killer-Zahlen, TTT-Raster, Zielfolgen).
//                                  rnd ist ein Zufallsgenerator aus config.seed und der Leg-Nummer. Damit lost
//                                  jedes Leg neu aus, und das Replay ergibt trotzdem immer dasselbe Spiel.
//                                  Leg 1 steht zusätzlich ausgeschrieben in der config (Anzeige, Spielliste).
//                                  Spiele ohne seed (vor 0.6.1) behalten ihre Werte für alle Legs.
// Rundenspiele mit Stechen teilen sich die Auswertung in rules/rounds.js.
//
// Regelversion (config.rv, ab 0.8.1): Das Replay rechnet jedes Spiel mit dem Code der aktuellen App nach.
// Ändert sich eine Regel, würde ein altes Spiel ohne Vermerk anders ausgehen, als es gespielt wurde.
// Deshalb trägt jedes neue Spiel die Regelversion RV, mit der es angelegt wurde. Eine Regel, die ihr Verhalten
// ändert, prüft cfg.rv und behält für ältere Spiele den alten Zweig. Fehlt rv (Spiele bis 0.8.0), gilt 0.
//   1 (0.8.1): Fives Bust schon beim Dart, der über das Ziel bringt. War „1 Treffer“ mit Marks nach Ring.
//              Mickey Mouse mit Punkten: Doppel-/Triple-Feld zählt den Dartwert, Treffer wählt das punktende Feld.
//   2 (0.10.0): Anwurf im Satzmodus wechselt je Satz, innerhalb des Satzes je Leg (bis rv 1 je Leg über das ganze
//              Match). Cut-Throat-Cricket: Wer alles zu hat und durch fremde Würfe die wenigsten Punkte bekommt,
//              gewinnt sofort (bis rv 1 erst mit dem eigenen nächsten Treffer).
import { x01 } from './rules/x01.js';
import { cricket, mickey, shove } from './rules/cricket.js';
import { atc, dbl, chase } from './rules/atc.js';
import { shanghai } from './rules/shanghai.js';
import { killer } from './rules/killer.js';
import { bobs } from './rules/bobs.js';
import { halveit, bermuda } from './rules/halveit.js';
import { c121 } from './rules/c121.js';
import { ttt } from './rules/ttt.js';
import { hare } from './rules/hare.js';
import { follow } from './rules/follow.js';
import { golf } from './rules/golf.js';
import { knockout } from './rules/knockout.js';
import { ninelives } from './rules/ninelives.js';
import { blindkiller } from './rules/blindkiller.js';
import { gotcha } from './rules/gotcha.js';
import { jdc } from './rules/jdc.js';
import { gallery } from './rules/gallery.js';
import { baseball } from './rules/baseball.js';
import { fives } from './rules/fives.js';
import { steeples } from './rules/steeples.js';
import { war } from './rules/war.js';
import { scram } from './rules/scram.js';
import { countup } from './rules/countup.js';
import { highlow } from './rules/highlow.js';
import { snooker } from './rules/snooker.js';

export const RULES = {
  x01, cricket, atc, shanghai, killer, bobs, halveit, c121,
  ttt, hare, follow, chase, golf, knockout, ninelives, blindkiller, mickey, bermuda, gotcha, shove, dbl, jdc, gallery,
  baseball, fives, steeples, war, scram, countup, highlow, snooker,
};

export const RV = 2;
const zeros = (n) => Array(n).fill(0);

// ---------- Zufall je Leg ----------
export const newSeed = () => Math.floor(Math.random() * 2 ** 32) >>> 0;

// Deterministischer Zufallsgenerator (mulberry32) für Leg idx eines Spiels
function prng(seed, idx) {
  let a = (seed ^ Math.imul(idx + 1, 0x9e3779b9)) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Regelparameter für Leg idx (0 = erstes Leg des Matches)
export function legConfig(rule, cfg, n, idx) {
  return rule.draw && cfg.seed != null ? { ...cfg, ...rule.draw(cfg, n, prng(cfg.seed, idx)) } : cfg;
}

// Beim Start und bei der Revanche: aktuelle Regelversion, neuer seed, Werte des ersten Legs ausgeschrieben.
// Die Revanche eines alten Spiels spielt damit nach den aktuellen Regeln.
export function prepareConfig(mode, cfg, n, seed = newSeed()) {
  const rule = RULES[mode];
  const c = { ...cfg, rv: RV };
  return rule.draw ? legConfig(rule, { ...c, seed }, n, 0) : c;
}

export function replay(game) {
  const rule = RULES[game.mode];
  const base = game.config;
  const n = game.playerIds.length;
  const cfg = legConfig(rule, base, n, 0);
  const st = {
    rule, cfg, base, n, legIdx: 0,
    sets: zeros(n), legs: zeros(n),
    setNo: 1, legNo: 1,
    legStarter: 0, setStarter: 0, current: 0,
    round: zeros(n),          // Aufnahmen je Spieler im aktuellen Leg
    legDarts: zeros(n),       // Darts je Spieler im aktuellen Leg
    leg: rule.initLeg(cfg, n, 0),
    turn: null,
    turns: [],                // alle abgeschlossenen Aufnahmen des Matches
    darts: [],                // alle Darts mit Annotationen
    legResults: [],           // {winner, legNo, setNo, starter, darts: [je Spieler], scores: [rule.score je Spieler am Leg-Ende], cfg}
    finished: false, winner: null,
    lastEvent: null,          // Ergebnis der letzten abgeschlossenen Aufnahme
    dartEvent: null,          // Ereignis des letzten Darts (info.event)
  };
  st.turn = newTurn(st);
  for (const d of game.darts) step(st, d);
  return st;
}

function newTurn(st) {
  const p = st.current;
  return {
    p, setNo: st.setNo, legNo: st.legNo, round: st.round[p],
    before: st.rule.score(st.leg, p),
    darts: [], infos: [], points: 0, marks: 0, bust: false, won: false, stopped: false,
  };
}

function nextPlayer(st, p) {
  for (let k = 1; k <= st.n; k++) {
    const q = (p + k) % st.n;
    if (!st.rule.active || st.rule.active(st.leg, q)) return q;
  }
  return p;
}

// Darf der aktuelle Werfer seine Aufnahme jetzt beenden? Für die Taste „Fertig" in der App.
export const canStop = (st) => Boolean(!st.finished && st.turn && st.rule.canStop?.(st.leg, st.current, st.cfg, st.turn));

function step(st, d) {
  if (st.finished) return;
  const p = st.current;
  const t = st.turn;
  if (d.stop) {
    // Stopp-Eintrag: beendet die Aufnahme, zählt nicht als Dart. Ohne Dart in der Aufnahme nur, wenn die Regel
    // das Aufhören vor dem ersten Dart erlaubt (Passen). Sonst bleibt er folgenlos, wie bis 0.8.0.
    st.dartEvent = null;
    if (t.darts.length) { t.stopped = true; closeTurn(st, p, t.infos[t.infos.length - 1]); }
    else if (st.rule.canStop?.(st.leg, p, st.cfg, t)) { t.stopped = true; closeTurn(st, p, {}); }
    return;
  }
  const info = st.rule.applyDart(st.leg, p, d, st.cfg, t.darts.length);
  t.darts.push(d);
  t.infos.push(info);
  st.legDarts[p]++;
  st.darts.push({ p, d, setNo: st.setNo, legNo: st.legNo, round: t.round, ...info });
  st.lastEvent = null;
  st.dartEvent = info.event ? { type: info.event, p, info } : null;
  if (!(info.bust || info.won || info.endTurn || t.darts.length === 3)) return;
  closeTurn(st, p, info);
}

function closeTurn(st, p, info) {
  const t = st.turn;
  const end = (st.rule.turnEnd && st.rule.turnEnd(st.leg, p, st.cfg, t)) || {};
  const winner = info.won ? p : end.winner ?? null;
  t.bust = info.bust;
  t.won = winner === p;
  t.points = info.bust ? 0 : t.infos.reduce((a, i) => a + i.pts, 0);
  t.marks = t.infos.reduce((a, i) => a + i.marks, 0);
  st.turns.push(t);
  st.round[p]++;
  st.lastEvent = { type: winner !== null ? 'leg' : info.bust ? 'bust' : end.event || 'turn', turn: t, p: winner ?? p };

  if (winner !== null) return legWon(st, winner);
  st.current = end.again && (!st.rule.active || st.rule.active(st.leg, p)) ? p : nextPlayer(st, p);
  st.turn = newTurn(st);
}

function legWon(st, p) {
  const scores = Array.from({ length: st.n }, (_, q) => st.rule.score(st.leg, q));
  st.legResults.push({ winner: p, legNo: st.legNo, setNo: st.setNo, starter: st.legStarter, darts: [...st.legDarts], scores, cfg: st.cfg });
  st.legs[p]++;
  let newSet = false;
  if (st.legs[p] >= st.cfg.legs) {
    st.sets[p]++;
    if (st.sets[p] >= st.cfg.sets) {
      st.finished = true;
      st.winner = p;
      st.lastEvent.type = 'match';
      st.turn = null;
      return;
    }
    st.legs = zeros(st.n);
    st.setNo++;
    st.lastEvent.type = 'set';
    newSet = true;
  }
  st.legNo++;
  // Anwurf: Ab Regelversion 2 wirft jeden Satz der Nächste an, im Satz wechselt es je Leg (wie im Turnier).
  // Bis rv 1 wechselte der Anwurf je Leg über das ganze Match. Ging ein Satz mit gerader Leg-Zahl zu Ende,
  // warf dann derselbe Spieler auch den nächsten Satz an.
  if (newSet && st.base.rv >= 2) {
    st.setStarter = (st.setStarter + 1) % st.n;
    st.legStarter = st.setStarter;
  } else st.legStarter = (st.legStarter + 1) % st.n;
  st.current = st.legStarter;
  st.round = zeros(st.n);
  st.legDarts = zeros(st.n);
  st.legIdx++;
  st.cfg = legConfig(st.rule, st.base, st.n, st.legIdx);
  st.leg = st.rule.initLeg(st.cfg, st.n, st.legStarter);
  st.turn = newTurn(st);
}

// Kennzahlen eines Spielers im laufenden Match (für die Anzeige), je Modus aus der Regel
export const matchLine = (st, p) => st.rule.line(st, p);

export function dartLabel(d) {
  if (d.s === 0) return '–';
  if (d.s === 25) return d.m === 2 ? 'BULL' : '25';
  return (d.m === 3 ? 'T' : d.m === 2 ? 'D' : '') + d.s;
}
