// Baseball (GLD Products, darts501, dartspiks, getgamesgo): neun Innings, Inning n zählt nur die Zahl n.
// Single, Double und Triple der Zahl bringen 1, 2 und 3 Runs, höchstens 9 je Inning, 81 im Spiel.
// Die Runs werden nicht mit der Inning-Nummer multipliziert (GLD, darts501).
// Nach dem neunten Inning gewinnt die höchste Summe.
// Gleichstand → Extra-Innings, nur die Punktgleichen werfen, Auswertung in rounds.js. Die Quellen weichen ab:
//   extra 'bull': Ziel Bull, 25 = 1 Run, Bull = 2 Runs (darts501, dartspiks, GLD als eine Möglichkeit)
//   extra 'next': weiter mit 10, 11, … (GLD als andere Möglichkeit), nach der 20 Bull
// seventh: „7th Inning Catch" (darts501, getgamesgo): Wer im siebten Inning keinen Run holt, wird halbiert.
//   ANNAHME: abgerundet. Die Quellen nennen keine Rundung.
import { roundsLeg, roundActive, settle } from './rounds.js';

export const INNINGS = 9;

// Ziel im Inning i (1-basiert). Auch Bull bringt m Runs: 25 hat m = 1, Bull m = 2.
export const baseballTarget = (inning, cfg) => (inning <= INNINGS || (cfg.extra === 'next' && inning <= 20) ? inning : 25);

export const baseball = {
  id: 'baseball',
  title: () => 'Baseball',
  subtitle: (cfg) => [cfg.extra === 'next' ? 'Extra-Innings 10, 11 …' : 'Extra-Innings auf Bull', cfg.seventh ? '7. Inning halbiert' : ''].filter(Boolean).join(' · '),
  defaults: { extra: 'bull', seventh: false },

  initLeg: (cfg, n) => ({ ...roundsLeg(n, INNINGS), score: Array(n).fill(0), turnRuns: 0 }),

  score: (leg, p) => leg.score[p],
  active: roundActive,

  applyDart(leg, p, d, cfg, dartIdx) {
    if (dartIdx === 0) leg.turnRuns = 0;
    const target = baseballTarget(leg.rounds[p] + 1, cfg);
    const info = { pts: 0, marks: 0, bust: false, won: false, target, hit: false };
    if (d.s !== target) return info;
    info.hit = true;
    info.pts = d.m;
    leg.score[p] += d.m;
    leg.turnRuns += d.m;
    return info;
  },

  turnEnd(leg, p, cfg, turn) {
    leg.rounds[p]++;
    let halved = false;
    if (cfg.seventh && leg.rounds[p] === 7 && !leg.contenders && leg.turnRuns === 0 && leg.score[p] > 0) {
      turn.halved = leg.score[p] - Math.floor(leg.score[p] / 2);
      leg.score[p] -= turn.halved;
      halved = true;
    }
    return settle(leg, (q) => [leg.score[q]]) || (halved ? { event: 'halved' } : null);
  },

  line(st, p) {
    const darts = st.darts.filter((x) => x.p === p);
    const turns = st.turns.filter((t) => t.p === p);
    const hits = darts.filter((x) => x.hit).length;
    return {
      darts: darts.length, hits, hitRate: darts.length ? hits / darts.length : null,
      score: st.leg.score[p], ppi: turns.length ? turns.reduce((a, t) => a + t.points, 0) / turns.length : null,
    };
  },
};
