// 121 (Checkout-Training): Jeder Versuch startet beim aktuellen Ziel, anfangs 121. Für den Check mit Doppel
// stehen cfg.turns Aufnahmen zur Verfügung (Standard 3 = 9 Darts). Überwerfen setzt wie in X01 auf den
// Stand vor der Aufnahme zurück und beendet die Aufnahme.
//   Check   → nächstes Ziel +1
//   Kein Check → fail 'down':  nächstes Ziel −1
//                fail 'start': zurück auf den Startwert
// lock: true = ein Check in höchstens 3 Darts sichert dieses Ziel. Darunter fällt der Spieler nicht mehr.
// Nie unter den Startwert. Nach cfg.attempts Versuchen je Spieler wertet die Runde aus:
// höchstes gechecktes Ziel, dann Anzahl Checks. Gleichstand → Stechen mit je einem weiteren Versuch.
// Quellenlage zur Fehlversuch-Regel ist uneinheitlich (−1 oder zurück), deshalb beide als Option.
// Check-Logik: rules/checks.js (gemeinsam mit Shooting Gallery).
import { roundsLeg, roundActive, settle } from './rounds.js';
import { attemptLeg, attemptDart, nextAttempt } from './checks.js';

export const c121 = {
  id: 'c121',
  title: (cfg) => String(cfg.start),
  subtitle: (cfg) => `${cfg.turns * 3} Darts · ${cfg.attempts} Versuche · ${cfg.fail === 'start' ? 'zurück auf Start' : 'Fehlversuch −1'}${cfg.lock ? ' · 3-Dart-Check sichert' : ''}`,
  defaults: { start: 121, turns: 3, attempts: 10, fail: 'down', lock: true },

  initLeg(cfg, n) {
    const fill = (v) => Array(n).fill(v);
    return {
      ...roundsLeg(n, cfg.attempts), // rounds = abgeschlossene Versuche
      ...attemptLeg(n, cfg.start),
      floor: fill(cfg.start), // gesichertes Ziel
      best: fill(0), checks: fill(0),
    };
  },

  score: (leg, p) => leg.rem[p],
  active: roundActive,

  applyDart(leg, p, d, cfg, dartIdx) {
    const { info, check, turnOver } = attemptDart(leg, p, d, dartIdx);
    if (!turnOver) return info;
    if (check) {
      Object.assign(info, { checkout: true, endTurn: true, attemptDarts: leg.attemptDarts[p], event: 'check' });
      leg.checks[p]++;
      leg.best[p] = Math.max(leg.best[p], leg.target[p]);
      if (cfg.lock && leg.attemptDarts[p] <= 3) leg.floor[p] = Math.max(leg.floor[p], leg.target[p]);
      nextAttempt(leg, p, leg.target[p] + 1);
    } else if (leg.used[p] >= cfg.turns) {
      Object.assign(info, { fail: true, event: 'fail' });
      const back = cfg.fail === 'start' ? cfg.start : leg.target[p] - 1;
      nextAttempt(leg, p, Math.max(back, leg.floor[p], cfg.start));
    } else return info;
    info.next = leg.target[p];
    return info;
  },

  turnEnd(leg) {
    return settle(leg, (q) => [leg.best[q], leg.checks[q]]);
  },

  // Ziel, Bestes Ziel und Checks im laufenden Leg, Checkout-Quote je Versuch über das Match
  line(st, p) {
    const darts = st.darts.filter((x) => x.p === p);
    const checks = darts.filter((x) => x.checkout).length;
    const attempts = checks + darts.filter((x) => x.fail).length;
    return {
      darts: darts.length, checks, attempts, rate: attempts ? checks / attempts : null,
      best: st.leg.best[p], target: st.leg.target[p],
    };
  },
};
