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
//             minPlayers, maxPlayers   Spielerzahl, die das Setup zum Start verlangt
// Rundenspiele mit Stechen teilen sich die Auswertung in rules/rounds.js.
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

export const RULES = {
  x01, cricket, atc, shanghai, killer, bobs, halveit, c121,
  ttt, hare, follow, chase, golf, knockout, ninelives, blindkiller, mickey, bermuda, gotcha, shove, dbl, jdc, gallery,
};

const zeros = (n) => Array(n).fill(0);

export function replay(game) {
  const rule = RULES[game.mode];
  const cfg = game.config;
  const n = game.playerIds.length;
  const st = {
    rule, cfg, n,
    sets: zeros(n), legs: zeros(n),
    setNo: 1, legNo: 1,
    legStarter: 0, current: 0,
    round: zeros(n),          // Aufnahmen je Spieler im aktuellen Leg
    legDarts: zeros(n),       // Darts je Spieler im aktuellen Leg
    leg: rule.initLeg(cfg, n, 0),
    turn: null,
    turns: [],                // alle abgeschlossenen Aufnahmen des Matches
    darts: [],                // alle Darts mit Annotationen
    legResults: [],           // {winner, legNo, setNo, darts: [je Spieler], scores: [rule.score je Spieler am Leg-Ende]}
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
    // Stopp-Eintrag: beendet die Aufnahme, zählt nicht als Dart. Ohne Dart in der Aufnahme bleibt er folgenlos.
    st.dartEvent = null;
    if (t.darts.length) { t.stopped = true; closeTurn(st, p, t.infos[t.infos.length - 1]); }
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
  st.legResults.push({ winner: p, legNo: st.legNo, setNo: st.setNo, darts: [...st.legDarts], scores });
  st.legs[p]++;
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
  }
  st.legNo++;
  st.legStarter = (st.legStarter + 1) % st.n;
  st.current = st.legStarter;
  st.round = zeros(st.n);
  st.legDarts = zeros(st.n);
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
