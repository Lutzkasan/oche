// Shooting Gallery (GoDartsPro): Checkouts 121 bis 130 der Reihe nach, je höchstens 9 Darts (3 Aufnahmen),
// Finish mit Doppel. Punkte nach Darts bis zum Check: 3 = 12, 4 = 8, 5 = 6, 6 = 5, 7 = 3, 8 = 2, 9 = 1.
// Ohne Check in 9 Darts gibt es 0 Punkte, weiter geht es mit der nächsten Zahl.
// Überwerfen regelt die Quelle nicht. Hier wie in X01 und 121: zurück auf den Stand vor der Aufnahme,
// die Aufnahme endet.
// Mehrere Spieler werfen abwechselnd je eine Aufnahme. Höchste Summe gewinnt.
// Gleichstand → Stechen mit je einem weiteren Versuch auf die nächste Zahl (131, 132, …).
import { roundsLeg, roundActive, settle } from './rounds.js';
import { attemptLeg, attemptDart, nextAttempt } from './checks.js';

export const GALLERY_FROM = 121;
export const GALLERY_COUNT = 10;
export const GALLERY_TURNS = 3;
export const GALLERY_POINTS = { 3: 12, 4: 8, 5: 6, 6: 5, 7: 3, 8: 2, 9: 1 };
export const galleryPoints = (darts) => GALLERY_POINTS[Math.max(3, darts)] || 0;

export const gallery = {
  id: 'gallery',
  title: () => 'Shooting Gallery',
  subtitle: () => `${GALLERY_FROM}–${GALLERY_FROM + GALLERY_COUNT - 1} · max. 9 Darts`,
  defaults: {},

  initLeg: (cfg, n) => ({
    ...roundsLeg(n, GALLERY_COUNT),
    ...attemptLeg(n, GALLERY_FROM),
    score: Array(n).fill(0), checks: Array(n).fill(0),
  }),

  score: (leg, p) => leg.score[p],
  active: roundActive,

  applyDart(leg, p, d, cfg, dartIdx) {
    const { info, check, turnOver } = attemptDart(leg, p, d, dartIdx);
    if (!turnOver) return info;
    if (check) {
      const pts = galleryPoints(leg.attemptDarts[p]);
      leg.score[p] += pts;
      leg.checks[p]++;
      Object.assign(info, { checkout: true, endTurn: true, attemptDarts: leg.attemptDarts[p], event: 'check', gain: pts });
    } else if (leg.used[p] >= GALLERY_TURNS) {
      Object.assign(info, { fail: true, event: 'fail' });
    } else return info;
    nextAttempt(leg, p, leg.target[p] + 1);
    info.next = leg.target[p];
    return info;
  },

  turnEnd(leg) {
    return settle(leg, (q) => [leg.score[q]]);
  },

  line(st, p) {
    const darts = st.darts.filter((x) => x.p === p);
    const checks = darts.filter((x) => x.checkout);
    const attempts = checks.length + darts.filter((x) => x.fail).length;
    return {
      darts: darts.length, checks: checks.length, attempts, rate: attempts ? checks.length / attempts : null,
      score: st.leg.score[p], points: checks.reduce((a, x) => a + x.gain, 0),
    };
  },
};
