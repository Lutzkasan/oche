// Tic-Tac-Toe (Noughts and Crosses): 3×3-Raster, Bull in der Mitte, acht ausgeloste Zahlen außen
// (Darts Corner, Arachnid). Die Zahlen stehen in cfg.grid, jedes Leg neu ausgelost (draw).
// Ein Feld gehört dem Spieler, der zuerst genug Marks darauf hat. Drei Felder in einer Reihe gewinnen.
// need: 1 = ein Treffer nimmt das Feld (Pub-Regel nach darts501 und World Dolf Federation)
//       4 = vier Marks, S/D/T = 1/2/3, 25 = 1, Bull = 2 (Phoenix, Granboard, Arachnid)
// Raster voll ohne Reihe: Wer mehr Felder hat, gewinnt (Phoenix). Bei neun Feldern und zwei Spielern
// ist das immer eindeutig. Die Pub-Regel „Unentschieden" kennt die Engine nicht, ein Leg braucht einen Sieger.
// Genau zwei Spieler.
import { drawNumbers } from './killer.js';

export const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];

export const drawGrid = (rnd = Math.random) => {
  const nums = drawNumbers(8, rnd);
  return [...nums.slice(0, 4), 25, ...nums.slice(4)];
};

const markValue = (d, need) => (need === 1 ? 1 : d.s === 25 ? d.m : d.m);

export const ttt = {
  id: 'ttt',
  title: () => 'Tic-Tac-Toe',
  subtitle: (cfg) => (cfg.need === 1 ? '1 Treffer je Feld' : `${cfg.need} Marks je Feld`),
  defaults: { need: 1 },
  minPlayers: 2,
  maxPlayers: 2,

  draw: (cfg, n, rnd) => ({ grid: drawGrid(rnd) }),
  initLeg: (cfg, n) => ({ owner: Array(9).fill(-1), marks: Array.from({ length: n }, () => Array(9).fill(0)) }),

  score: (leg, p) => leg.owner.filter((o) => o === p).length,

  applyDart(leg, p, d, cfg) {
    const info = { pts: 0, marks: 0, bust: false, won: false, hit: false };
    const c = d.s > 0 ? cfg.grid.indexOf(d.s) : -1;
    if (c < 0 || leg.owner[c] >= 0) return info;
    const add = markValue(d, cfg.need);
    leg.marks[p][c] = Math.min(cfg.need, leg.marks[p][c] + add);
    info.hit = true;
    info.marks = add;
    if (leg.marks[p][c] >= cfg.need) {
      leg.owner[c] = p;
      info.claim = c;
      info.event = 'claim';
      info.won = LINES.some((l) => l.every((i) => leg.owner[i] === p));
    }
    return info;
  },

  turnEnd(leg) {
    if (leg.owner.some((o) => o < 0)) return null;
    const cnt = [0, 1].map((q) => leg.owner.filter((o) => o === q).length);
    return { winner: cnt[0] > cnt[1] ? 0 : 1 };
  },

  line(st, p) {
    const darts = st.darts.filter((x) => x.p === p);
    const hits = darts.filter((x) => x.hit).length;
    return { darts: darts.length, hits, hitRate: darts.length ? hits / darts.length : null, fields: st.leg.owner.filter((o) => o === p).length };
  },
};
