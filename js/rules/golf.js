// Golf: 9 oder 18 Löcher, Loch n = Zahl n. Jede Aufnahme spielt ein Loch, gewertet in Schlägen.
// Weniger ist besser, nach dem letzten Loch gewinnt die kleinste Summe.
// Schlagtabelle (Quellen weichen ab, deshalb Option):
//   'gld'      Doppel 1, Triple 2, Single 3, nicht getroffen 5 (GLD Products)
//   'darthelp' Doppel 1, Triple 3, Single 4, nicht getroffen 5 (darthelp)
// count: 'last' = der letzte Dart der Aufnahme zählt, Aufhören ist erlaubt (beide Quellen). Taste „Fertig".
//        'best' = der beste Dart der Aufnahme zählt (einfache Hausregel ohne Aufhören)
// Ein Doppel (Hole in One) beendet die Aufnahme sofort, besser geht es nicht.
// Gleichstand → Stechen über weitere Löcher (19, 20, danach Bull: Bull = Doppel, 25 = Single).
// Die Quellen regeln den Gleichstand nicht.
import { roundsLeg, roundActive, settle } from './rounds.js';

export const GOLF_TABLES = {
  gld: { 2: 1, 3: 2, 1: 3, miss: 5 },
  darthelp: { 2: 1, 3: 3, 1: 4, miss: 5 },
};
export const golfHole = (leg, p) => leg.rounds[p] + 1;
export const golfTarget = (hole) => (hole <= 20 ? hole : 25);

export const golf = {
  id: 'golf',
  title: () => 'Golf',
  subtitle: (cfg) => `${cfg.holes} Löcher · ${cfg.count === 'best' ? 'bester Dart' : 'letzter Dart'}${cfg.table === 'darthelp' ? ' · Tabelle 1/3/4/5' : ''}`,
  defaults: { holes: 9, table: 'gld', count: 'last' },

  initLeg: (cfg, n) => ({ ...roundsLeg(n, cfg.holes), strokes: Array(n).fill(0), cur: null }),

  score: (leg, p) => leg.strokes[p],
  active: roundActive,

  applyDart(leg, p, d, cfg, dartIdx) {
    if (dartIdx === 0) leg.cur = null;
    const tab = GOLF_TABLES[cfg.table];
    const target = golfTarget(golfHole(leg, p));
    const hit = d.s === target;
    const r = hit ? tab[d.m] : tab.miss;
    leg.cur = cfg.count === 'best' && leg.cur !== null ? Math.min(leg.cur, r) : r;
    return { pts: 0, marks: 0, bust: false, won: false, target, hit, strokes: r, cur: leg.cur, endTurn: hit && d.m === 2 };
  },

  canStop: (leg, p, cfg, turn) => cfg.count === 'last' && turn.darts.length > 0 && turn.darts.length < 3,

  turnEnd(leg, p, cfg, turn) {
    turn.strokes = leg.cur;
    leg.strokes[p] += leg.cur;
    leg.rounds[p]++;
    return settle(leg, (q) => [-leg.strokes[q]]);
  },

  line(st, p) {
    const turns = st.turns.filter((t) => t.p === p && t.setNo === st.setNo && t.legNo === st.legNo);
    const all = st.turns.filter((t) => t.p === p);
    return {
      darts: st.darts.filter((x) => x.p === p).length, strokes: turns.reduce((a, t) => a + t.strokes, 0),
      perHole: all.length ? all.reduce((a, t) => a + t.strokes, 0) / all.length : null,
      aces: all.filter((t) => t.strokes === 1).length,
    };
  },
};
