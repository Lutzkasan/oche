// JDC Challenge (Junior Darts Corporation, nach World Dolf Federation und GoDartsPro):
//   Teil 1  Shanghai 10–15: je eine Aufnahme (3 Darts) pro Zahl, Feldwert zählt.
//   Teil 2  Doppel: je ein Dart auf D1 bis D20, dann Bull (21 Darts in 7 Aufnahmen). Doppel = 50, Bull = 100.
//   Teil 3  Shanghai 15–20 wie Teil 1.
//   Shanghai (Single, Double und Triple der Zahl in einer Aufnahme) bringt 100 Punkte extra.
// reps: 1 = wie oben (WDF, GoDartsPro). 5 = fünf Aufnahmen je Zahl und fünf Doppel-Durchgänge (mydartpfeil).
//   Die Quellen widersprechen sich, deshalb Option. Die Stufen (White bis Black) gelten nur für reps 1.
// Mehrere Spieler werfen abwechselnd je eine Aufnahme, höchste Summe gewinnt.
// Gleichstand → Stechen mit je einer Aufnahme auf Bull (25/50 nach Feldwert). Die Quellen regeln das nicht.
import { roundsLeg, roundActive, settle } from './rounds.js';

export const JDC_GRADES = [[850, 'Black'], [700, 'Red'], [600, 'Blue'], [450, 'Green'], [300, 'Yellow'], [150, 'Purple'], [0, 'White']];
export const jdcGrade = (score) => JDC_GRADES.find(([min]) => score >= min)[1];

const DOUBLES = [...Array.from({ length: 20 }, (_, i) => i + 1), 25];

// Aufnahmeplan: { part: 1|2|3, kind: 'sh' | 'dbl', n (Shanghai-Zahl) | dbl: [Ziel je Dart] }
const plans = new Map();
export function jdcPlan(reps = 1) {
  if (plans.has(reps)) return plans.get(reps);
  const sh = (part, from, to) => Array.from({ length: to - from + 1 }, (_, i) => Array(reps).fill({ part, kind: 'sh', n: from + i })).flat();
  const lap = Array.from({ length: 7 }, (_, v) => ({ part: 2, kind: 'dbl', dbl: DOUBLES.slice(v * 3, v * 3 + 3) }));
  const plan = [...sh(1, 10, 15), ...Array(reps).fill(lap).flat(), ...sh(3, 15, 20)];
  plans.set(reps, plan);
  return plan;
}
const TIEBREAK = { part: 0, kind: 'tb' };
export const jdcVisit = (leg, p, cfg) => (leg.contenders ? TIEBREAK : jdcPlan(cfg.reps)[leg.rounds[p]] || TIEBREAK);
// Zielfeld eines Darts als { s, m } (m 0 = jedes Feld der Zahl)
export function jdcDartTarget(v, dartIdx) {
  if (v.kind === 'sh') return { s: v.n, m: 0 };
  if (v.kind === 'dbl') return { s: v.dbl[dartIdx], m: 2 };
  return { s: 25, m: 0 };
}

export const jdc = {
  id: 'jdc',
  title: () => 'JDC Challenge',
  subtitle: (cfg) => (cfg.reps > 1 ? 'Lang (5 Durchgänge)' : 'Standard'),
  defaults: { reps: 1 },

  initLeg: (cfg, n) => ({
    ...roundsLeg(n, jdcPlan(cfg.reps).length),
    score: Array(n).fill(0), parts: Array.from({ length: n }, () => [0, 0, 0, 0]), turnHits: [], turnSh: false,
  }),

  score: (leg, p) => leg.score[p],
  active: roundActive,

  applyDart(leg, p, d, cfg, dartIdx) {
    if (dartIdx === 0) { leg.turnHits = []; leg.turnSh = false; }
    const v = jdcVisit(leg, p, cfg);
    const t = jdcDartTarget(v, dartIdx);
    const info = { pts: 0, marks: 0, bust: false, won: false, part: v.part, target: t, hit: false };
    if (v.kind === 'dbl') {
      if (d.s === t.s && d.m === 2) { info.hit = true; info.pts = t.s === 25 ? 100 : 50; }
    } else if (d.s === t.s && d.m > 0) {
      info.hit = true;
      info.pts = d.s * d.m;
      if (v.kind === 'sh') {
        leg.turnHits.push(d.m);
        if (!leg.turnSh && [1, 2, 3].every((m) => leg.turnHits.includes(m))) {
          leg.turnSh = true;
          info.pts += 100;
          info.event = 'shanghai';
          info.shanghai = true;
        }
      }
    }
    leg.score[p] += info.pts;
    leg.parts[p][v.part] += info.pts;
    return info;
  },

  turnEnd(leg, p) {
    leg.rounds[p]++;
    return settle(leg, (q) => [leg.score[q]]);
  },

  line(st, p) {
    const darts = st.darts.filter((x) => x.p === p);
    const hits = darts.filter((x) => x.hit).length;
    return { darts: darts.length, hits, hitRate: darts.length ? hits / darts.length : null, score: st.leg.score[p], parts: st.leg.parts[p] };
  },
};
