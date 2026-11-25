// Shooting Gallery (GoDartsPro): Checkouts 121 bis 130 der Reihe nach, je höchstens 9 Darts (3 Aufnahmen).
// Punkte nach Darts bis zum Check: 3 = 12, 4 = 8, 5 = 6, 6 = 5, 7 = 3, 8 = 2, 9 = 1.
// Finish (ab 0.8.0 als Option, Wunsch des Nutzers nach dem Tablet-Test):
//   cfg.over: 'under' = 0 oder darunter reicht (Vorgabe im Setup), 'exact' = genau 0.
//     Ab 0.9.0 heißt die Option in der App „Überwerfen: Checkt / Bust“ (Wunsch des Nutzers), die Werte bleiben.
//   cfg.out:  'single' = jeder Dart (Vorgabe im Setup), 'double', 'master'
// Spiele bis 0.7.1 speichern keine der beiden Angaben. Für sie gilt weiter genau 0 mit Doppel (galleryOut).
// UNSICHER: Ob die Quelle ein Doppel verlangt, ließ sich am 14.11.2026 nicht nachprüfen.
// Ohne Check in 9 Darts gibt es 0 Punkte, weiter geht es mit der nächsten Zahl.
// Überwerfen regelt die Quelle nicht. Hier wie in X01 und 121: zurück auf den Stand vor der Aufnahme,
// die Aufnahme endet.
// Mehrere Spieler werfen abwechselnd je eine Aufnahme. Höchste Summe gewinnt.
// Gleichstand → Stechen mit je einem weiteren Versuch auf die nächste Zahl (131, 132, …).
// Eigene Ziele (ab 0.10.0, Wunsch des Nutzers): cfg.targets ist eine Liste von 1 bis 20 Zahlen (2 bis 501), gespielt
// in dieser Reihenfolge. Jede Zahl ist mit 9 Darts nach jeder Finish-Regel zu checken (höchstens 530 bei Double Out).
// ANNAHME: Das Stechen geht mit dem letzten Ziel + 1 weiter, wie nach 130. Ohne targets gilt 121 bis 130.
import { roundsLeg, roundActive, settle } from './rounds.js';
import { attemptLeg, attemptDart, nextAttempt } from './checks.js';

export const GALLERY_FROM = 121;
export const GALLERY_COUNT = 10;
export const GALLERY_TURNS = 3;
export const GALLERY_POINTS = { 3: 12, 4: 8, 5: 6, 6: 5, 7: 3, 8: 2, 9: 1 };
export const galleryPoints = (darts) => GALLERY_POINTS[Math.max(3, darts)] || 0;
// Finish-Regel eines Spiels. Fehlende Angaben = Stand bis 0.7.1.
export const TARGETS_MIN = 2, TARGETS_MAX = 501, TARGETS_COUNT = 20;
export const galleryTargets = (cfg) => (cfg.targets?.length ? cfg.targets : Array.from({ length: GALLERY_COUNT }, (_, i) => GALLERY_FROM + i));
export const galleryOwn = (cfg) => Boolean(cfg.targets?.length);
export const galleryOut = (cfg) => ({ out: cfg.out ?? 'double', over: cfg.over ?? 'exact' });
const OUT_LABEL = { single: 'Finish beliebig', double: 'Double Out', master: 'Master Out' };

export const gallery = {
  id: 'gallery',
  title: () => 'Shooting Gallery',
  subtitle: (cfg) => {
    const { out, over } = galleryOut(cfg);
    const t = cfg.targets || [];
    const own = t.length ? `Eigene Ziele ${t.slice(0, 5).join(' ')}${t.length > 5 ? ` +${t.length - 5}` : ''}` : `${GALLERY_FROM}–${GALLERY_FROM + GALLERY_COUNT - 1}`;
    return `${own} · max. 9 Darts · ${OUT_LABEL[out]} · Überwerfen ${over === 'under' ? 'checkt' : 'ist Bust'}`;
  },
  defaults: { over: 'under', out: 'single' },

  initLeg: (cfg, n) => ({
    ...roundsLeg(n, galleryTargets(cfg).length),
    ...attemptLeg(n, galleryTargets(cfg)[0]),
    score: Array(n).fill(0), checks: Array(n).fill(0),
  }),

  score: (leg, p) => leg.score[p],
  active: roundActive,

  applyDart(leg, p, d, cfg, dartIdx) {
    const { out, over } = galleryOut(cfg);
    const { info, check, turnOver } = attemptDart(leg, p, d, dartIdx, out, over);
    if (!turnOver) return info;
    if (check) {
      const pts = galleryPoints(leg.attemptDarts[p]);
      leg.score[p] += pts;
      leg.checks[p]++;
      Object.assign(info, { checkout: true, endTurn: true, attemptDarts: leg.attemptDarts[p], event: 'check', gain: pts });
    } else if (leg.used[p] >= GALLERY_TURNS) {
      Object.assign(info, { fail: true, event: 'fail' });
    } else return info;
    // Nächstes Ziel aus der Liste, im Stechen das letzte + 1
    const list = galleryTargets(cfg), i = leg.rounds[p] + 1;
    nextAttempt(leg, p, i < list.length ? list[i] : leg.target[p] + 1);
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
