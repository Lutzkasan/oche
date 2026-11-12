// Hare and Hounds (Darts Corner, World Dolf Federation, darts501): Der Hase startet auf 20 und läuft im
// Uhrzeigersinn um die Scheibe (20, 1, 18, 4, …, 12, 5) zurück zur 20. Die Hunde starten hinter ihm und
// laufen dieselbe Strecke. Jeder Treffer auf das eigene nächste Feld rückt vor.
// Der Hase gewinnt nach 20 Feldern, ein Hund gewinnt, sobald er den Hasen einholt.
// Rollen: Wer das Leg anwirft, ist der Hase (Revanche und neues Leg tauschen die Rollen). Alle anderen sind Hunde.
// Optionen, weil die Quellen abweichen:
//   start: 5 (Darts Corner, World Dolf Federation) oder 12 (darts501) als Startfeld der Hunde
//   skip:  false = Double und Triple rücken nur ein Feld vor (World Dolf Federation)
//          true  = Double zwei, Triple drei Felder (Tiny Monkey Games)
//   catch: 'reach' = Einholen heißt das Feld des Hasen erreichen (World Dolf Federation)
//          'pass'  = der Hund muss den Hasen überholen (darts501)
import { BOARD_ORDER } from '../charts.js';

export const ROUTE = BOARD_ORDER;
const BEHIND = { 5: 1, 12: 2 };

// Feld, das Spieler q als Nächstes treffen muss
export const hareTarget = (leg, q) => ROUTE[((leg.pos[q] % 20) + 20) % 20];

export const hare = {
  id: 'hare',
  title: () => 'Hare and Hounds',
  subtitle: (cfg) => [`Hunde ab ${cfg.start}`, cfg.skip ? 'D/T springt' : '', cfg.catch === 'pass' ? 'überholen' : ''].filter(Boolean).join(' · '),
  defaults: { start: 5, skip: false, catch: 'reach' },
  minPlayers: 2,
  maxPlayers: 4,

  initLeg: (cfg, n, starter = 0) => ({
    hare: starter,
    pos: Array.from({ length: n }, (_, q) => (q === starter ? 0 : -BEHIND[cfg.start])),
  }),

  // Vorsprung des Hasen bzw. Fortschritt in Feldern
  score: (leg, p) => leg.pos[p],

  applyDart(leg, p, d, cfg) {
    const target = hareTarget(leg, p);
    const info = { pts: 0, marks: 0, bust: false, won: false, target, hit: false, adv: 0 };
    if (d.s !== target) return info;
    const adv = cfg.skip ? d.m : 1;
    info.hit = true;
    if (p === leg.hare) {
      leg.pos[p] = Math.min(20, leg.pos[p] + adv);
      info.adv = adv;
      info.won = leg.pos[p] >= 20;
      return info;
    }
    leg.pos[p] += adv;
    info.adv = adv;
    const h = leg.pos[leg.hare];
    info.won = cfg.catch === 'pass' ? leg.pos[p] > h : leg.pos[p] >= h;
    if (info.won) info.event = 'caught';
    return info;
  },

  line(st, p) {
    const darts = st.darts.filter((x) => x.p === p);
    const hits = darts.filter((x) => x.hit).length;
    return { darts: darts.length, hits, hitRate: darts.length ? hits / darts.length : null };
  },
};
