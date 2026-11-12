// Bob's 27 (Doppeltraining nach Bob Anderson): Start mit 27 Punkten. Runde 1 zielt auf D1, Runde 2 auf D2
// bis D20, optional danach Bull (50). Jeder Treffer auf das Ziel-Doppel bringt dessen Wert.
// Trifft keiner der drei Darts, wird der Wert des Doppels abgezogen.
// hard: true  = wer unter 0 fällt, scheidet aus. Genau 0 kommt nicht vor: 27 ist ungerade, alle Doppel gerade.
//       false = weiterspielen mit negativem Stand
// Mehrere Spieler: Wer weiter kommt, liegt vorn, bei gleicher Runde der höhere Stand.
// Gleichstand an der Spitze → Stechen auf Bull, dort zählt nur der Stand, niemand scheidet aus.
import { roundsLeg, roundActive, settle } from './rounds.js';

export const BOBS_START = 27;

// Zielfeld (Segment) der nächsten Runde: 1–20, danach und im Stechen Bull (25)
export const bobsTarget = (leg, p) => (leg.contenders || leg.rounds[p] >= 20 ? 25 : leg.rounds[p] + 1);

export const bobs = {
  id: 'bobs',
  title: () => "Bob's 27",
  subtitle: (cfg) => (cfg.bull ? 'D1–D20 + Bull' : 'D1–D20') + (cfg.hard ? '' : ' · ohne Ausscheiden'),
  defaults: { bull: true, hard: true },

  initLeg: (cfg, n) => ({
    ...roundsLeg(n, cfg.bull ? 21 : 20),
    score: Array(n).fill(BOBS_START),
    turnHit: false,
  }),

  score: (leg, p) => leg.score[p],
  active: roundActive,

  applyDart(leg, p, d, cfg, dartIdx) {
    if (dartIdx === 0) leg.turnHit = false;
    const target = bobsTarget(leg, p);
    const val = target * 2;
    const info = { pts: 0, marks: 0, bust: false, won: false, target, hit: false };
    if (d.s === target && d.m === 2) {
      info.hit = true;
      info.pts = val;
      leg.score[p] += val;
      leg.turnHit = true;
    }
    if (dartIdx === 2 && !leg.turnHit) {
      info.pts -= val;
      info.penalty = val;
      leg.score[p] -= val;
      if (cfg.hard && !leg.contenders && leg.score[p] < 0) {
        leg.out[p] = true;
        info.event = 'out';
        info.victim = p;
      }
    }
    return info;
  },

  turnEnd(leg, p) {
    leg.rounds[p]++;
    return settle(leg, (q) => [leg.rounds[q], leg.score[q]]);
  },

  // Stand im laufenden Leg, Doppelquote über das ganze Match
  line(st, p) {
    const darts = st.darts.filter((x) => x.p === p);
    const hits = darts.filter((x) => x.hit).length;
    return { darts: darts.length, hits, hitRate: darts.length ? hits / darts.length : null, score: st.leg.score[p] };
  },
};
