// Blind Killer (darts501, Darts Corner, Tiny Monkey Games): Jeder Spieler bekommt verdeckt eine Zahl 1–20.
// Die Zahlen im Spiel sind bekannt, ihre Besitzer nicht. Alle werfen auf beliebige Doppel.
// Jedes Doppel auf eine Zahl im Spiel kostet ihren Besitzer ein Leben, auch den Werfer selbst.
// Einen Killer-Status gibt es nicht. Wer keine Leben mehr hat, scheidet aus und seine Zahl wird aufgedeckt.
// Der Letzte gewinnt.
// lives: 3 (darts501, Darts Corner) oder 5 (Tiny Monkey Games)
// triple: true = ein Triple kostet zwei Leben (Tiny Monkey Games), false = nur Doppel zählen
import { alive, drawNumbers } from './killer.js';

export const blindkiller = {
  id: 'blindkiller',
  title: () => 'Blind Killer',
  subtitle: (cfg) => `${cfg.lives} Leben${cfg.triple ? ' · Triple −2' : ''}`,
  defaults: { lives: 3, triple: false },
  minPlayers: 2,

  draw: (cfg, n, rnd) => ({ numbers: drawNumbers(n, rnd) }),
  initLeg: (cfg, n) => ({ lives: Array(n).fill(cfg.lives) }),

  score: (leg, p) => leg.lives[p],
  active: (leg, p) => leg.lives[p] > 0,

  applyDart(leg, p, d, cfg) {
    const info = { pts: 0, marks: 0, bust: false, won: false, hit: false, taken: 0, lost: 0 };
    const owner = d.s >= 1 && d.s <= 20 ? cfg.numbers.indexOf(d.s) : -1;
    const hits = d.m === 2 ? 1 : d.m === 3 && cfg.triple ? 2 : 0;
    if (owner < 0 || !hits || leg.lives[owner] <= 0) return info;
    const lost = Math.min(hits, leg.lives[owner]);
    leg.lives[owner] -= lost;
    info.hit = true;
    info.number = d.s;
    if (owner === p) info.lost = lost;
    else info.taken = lost;
    if (leg.lives[owner] === 0) {
      info.event = 'out';
      info.victim = owner;
      if (owner === p) info.endTurn = true;
    } else info.event = 'blindhit';
    const rest = alive(leg);
    info.won = rest.length === 1 && rest[0] === p;
    return info;
  },

  turnEnd(leg) {
    const rest = alive(leg);
    return rest.length === 1 ? { winner: rest[0] } : null;
  },

  line(st, p) {
    const darts = st.darts.filter((x) => x.p === p);
    return { darts: darts.length, hits: darts.filter((x) => x.hit).length, taken: darts.reduce((a, x) => a + (x.taken || 0), 0) };
  },
};
