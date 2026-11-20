// Count-Up (DARTSLIVE, darthelp): 8 Runden, jeder Dart zählt seinen Wert (Double doppelt, Triple dreifach).
// Nach der letzten Runde gewinnt die höchste Summe.
// ANNAHME: 25 zählt 25, Bull 50 wie am Steeldart-Brett. DARTSLIVE spielt E-Dart und nennt keinen Wert.
// ANNAHME Gleichstand: Stechen wie in den anderen Rundenspielen, nur die Punktgleichen werfen je eine weitere
//   Runde, bis eine Runde einen Sieger hat (rounds.js). Die Quellen regeln das nicht.
import { roundsLeg, roundActive, settle } from './rounds.js';

export const COUNTUP_ROUNDS = 8;

export const countup = {
  id: 'countup',
  title: () => 'Count-Up',
  subtitle: () => `${COUNTUP_ROUNDS} Runden · jeder Dart zählt`,
  defaults: {},

  initLeg: (cfg, n) => ({ ...roundsLeg(n, COUNTUP_ROUNDS), score: Array(n).fill(0) }),

  score: (leg, p) => leg.score[p],
  active: roundActive,

  applyDart(leg, p, d) {
    const pts = d.s * d.m;
    leg.score[p] += pts;
    return { pts, marks: 0, bust: false, won: false, hit: d.s > 0 };
  },

  turnEnd(leg, p) {
    leg.rounds[p]++;
    return settle(leg, (q) => [leg.score[q]]);
  },

  line(st, p) {
    const turns = st.turns.filter((t) => t.p === p);
    return {
      darts: st.darts.filter((x) => x.p === p).length, score: st.leg.score[p],
      ppr: turns.length ? turns.reduce((a, t) => a + t.points, 0) / turns.length : null,
    };
  },
};
