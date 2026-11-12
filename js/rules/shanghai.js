// Shanghai: Runde r zählt nur die Zahl r (S = r, D = 2r, T = 3r Punkte). Nach der letzten Runde gewinnt
// die höchste Punktzahl. Single, Double und Triple der Zielzahl in einer Aufnahme heißen „Shanghai".
// rounds: 7, 10 oder 20. instant: true = ein Shanghai gewinnt das Leg sofort.
// Gleichstand nach der letzten Runde: Stechen. Nur die Punktgleichen werfen weiter, Runde für Runde
// auf die nächste Zahl (nach 20 auf Bull), bis eine Runde einen Sieger hat. Auswertung in rounds.js.
import { roundsLeg, roundActive, settle } from './rounds.js';

export const shanghaiTarget = (round) => (round <= 20 ? round : 25);

export const shanghai = {
  id: 'shanghai',
  title: () => 'Shanghai',
  subtitle: (cfg) => `1–${cfg.rounds}` + (cfg.instant ? ' · Shanghai gewinnt' : ''),
  defaults: { rounds: 7, instant: true },

  initLeg(cfg, n) {
    return {
      ...roundsLeg(n, cfg.rounds),
      score: Array(n).fill(0),
      turnHits: [],               // Multiplikatoren der Treffer in der laufenden Aufnahme
    };
  },

  score: (leg, p) => leg.score[p],
  round: (leg, p) => leg.rounds[p] + 1,
  active: roundActive,

  applyDart(leg, p, d, cfg, dartIdx) {
    if (dartIdx === 0) leg.turnHits = [];
    const target = shanghaiTarget(leg.rounds[p] + 1);
    const info = { pts: 0, marks: 0, bust: false, won: false, target, hit: false };
    if (d.s !== target) return info;
    info.hit = true;
    info.pts = d.s * d.m;
    leg.score[p] += info.pts;
    leg.turnHits.push(d.m);
    if ([1, 2, 3].every((m) => leg.turnHits.includes(m))) {
      info.event = 'shanghai';
      info.won = Boolean(cfg.instant);
    }
    return info;
  },

  turnEnd(leg, p) {
    leg.rounds[p]++;
    return settle(leg, (q) => [leg.score[q]]);
  },

  // Punkte pro Aufnahme und Trefferquote auf die Zielzahl über das ganze Match
  line(st, p) {
    const darts = st.darts.filter((x) => x.p === p);
    const turns = st.turns.filter((t) => t.p === p);
    const points = darts.reduce((a, x) => a + x.pts, 0);
    const hits = darts.filter((x) => x.hit).length;
    return {
      darts: darts.length, points, hits,
      hitRate: darts.length ? hits / darts.length : null,
      ppr: turns.length ? turns.reduce((a, t) => a + t.points, 0) / turns.length : null,
    };
  },
};
