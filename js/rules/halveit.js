// Halve-It: Jede Runde hat ein Ziel. Jeder Treffer aufs Ziel zählt seinen Feldwert.
// Trifft keiner der drei Darts, wird der Gesamtstand halbiert.
// Start bei 0, die erste Runde legt damit die Basis. Nach der letzten Runde gewinnt der höchste Stand.
// Gleichstand → Stechen auf Bull mit denselben Regeln.
// Ziele: '1'–'20' eine Zahl (S/D/T zählen 1-/2-/3-fach), 'D' jedes Doppel, 'T' jedes Triple, 'B' Bull (25 oder 50),
//        '25' Bull-Runde, in der 25 und Bull je 25 zählen, 'DB' nur das Bull (50).
// cfg.targets enthält die Zielfolge ausgeschrieben, damit das Replay auch bei „Zufall" deterministisch bleibt.
// cfg.round: 'up' (Standard, übliche Pub-Regel) oder 'down'. Bei ungeraden Ständen entscheidet die Runde.
//
// Bermuda Triangle (darthelp): 13 feste Runden 12, 13, 14, Doppel, 15, 16, 17, Triple, 18, 19, 20, 25, Bull.
// Gleiche Regel wie Halve-It, eigener Modus für Menü und Statistik. Die Quelle lässt die Rundung offen,
// der Autor rundet ab. Abrunden ist deshalb dort voreingestellt, Aufrunden wählbar.
import { roundsLeg, roundActive, settle } from './rounds.js';

export const HALVE_SETS = {
  std: ['20', 'D', '19', 'T', '18', '17', '16', '15', 'B'],
  short: ['20', '19', 'D', '18', 'T', 'B'],
};
export const BERMUDA = ['12', '13', '14', 'D', '15', '16', '17', 'T', '18', '19', '20', '25', 'DB'];

// Zufällige Folge: 6 verschiedene Zahlen, dazu Doppel und Triple an zufälliger Stelle, Bull am Ende
export function drawHalveTargets(rnd = Math.random) {
  const pool = Array.from({ length: 20 }, (_, i) => String(i + 1));
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const seq = pool.slice(0, 6);
  for (const x of ['D', 'T']) seq.splice(Math.floor(rnd() * (seq.length + 1)), 0, x);
  return [...seq, 'B'];
}

const HIT = {
  B: (d) => d.s === 25,
  25: (d) => d.s === 25,
  DB: (d) => d.s === 25 && d.m === 2,
  D: (d) => d.s > 0 && d.m === 2,
  T: (d) => d.m === 3,
};
export const halveHit = (t, d) => (HIT[t] ? HIT[t](d) : d.s === Number(t));
const halvePts = (t, d) => (t === '25' ? 25 : d.s * d.m);

// Ziel der nächsten Runde von p, im Stechen Bull
export const halveTarget = (leg, p, cfg) => (leg.contenders ? 'B' : cfg.targets[leg.rounds[p]] ?? 'B');

export const halveLabel = (t) => ({ B: 'Bull', D: 'Doppel', T: 'Triple', 25: '25', DB: 'Bull' }[t] || t);
// Zahl, die das Tastenfeld hervorhebt (null bei „jedes Doppel/Triple")
export const halveKey = (t) => (t === 'D' || t === 'T' ? null : /^\d+$/.test(t) && t !== '25' ? Number(t) : 25);

export const halveit = {
  id: 'halveit',
  title: () => 'Halve-It',
  subtitle: (cfg) => `${{ std: 'Standard', short: 'Kurz', random: 'Zufall' }[cfg.set] || 'Eigene Folge'} · ${cfg.targets.length} Runden${cfg.round === 'down' ? ' · abgerundet' : ''}`,
  defaults: { set: 'std', round: 'up' },
  // Nur „Zufall" lost je Leg neu. Bermuda erbt draw und hat kein set, bekommt also nichts Neues.
  draw: (cfg, n, rnd) => (cfg.set === 'random' ? { targets: drawHalveTargets(rnd) } : {}),

  initLeg: (cfg, n) => ({ ...roundsLeg(n, cfg.targets.length), score: Array(n).fill(0), turnHit: false }),

  score: (leg, p) => leg.score[p],
  active: roundActive,

  applyDart(leg, p, d, cfg, dartIdx) {
    if (dartIdx === 0) leg.turnHit = false;
    const target = halveTarget(leg, p, cfg);
    const info = { pts: 0, marks: 0, bust: false, won: false, target, hit: false };
    if (halveHit(target, d)) {
      info.hit = true;
      info.pts = halvePts(target, d);
      leg.score[p] += info.pts;
      leg.turnHit = true;
    }
    if (dartIdx === 2 && !leg.turnHit) {
      // Aufrunden: neuer Stand = aufgerundete Hälfte, abgezogen wird die abgerundete. Abrunden umgekehrt.
      const s = leg.score[p];
      const lost = cfg.round === 'down' ? Math.ceil(s / 2) : Math.floor(s / 2);
      leg.score[p] -= lost;
      info.pts -= lost;
      info.halved = true;
      info.lost = lost;
      if (lost) info.event = 'halved';
    }
    return info;
  },

  turnEnd(leg, p) {
    leg.rounds[p]++;
    return settle(leg, (q) => [leg.score[q]]);
  },

  line(st, p) {
    const darts = st.darts.filter((x) => x.p === p);
    const hits = darts.filter((x) => x.hit).length;
    return {
      darts: darts.length, hits, hitRate: darts.length ? hits / darts.length : null,
      score: st.leg.score[p], halved: darts.filter((x) => x.halved).length,
    };
  },
};

export const bermuda = {
  ...halveit,
  id: 'bermuda',
  title: () => 'Bermuda Triangle',
  subtitle: (cfg) => `13 Runden · ${cfg.round === 'down' ? 'abgerundet' : 'aufgerundet'}`,
  defaults: { round: 'down' },
};
