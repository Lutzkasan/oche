// X01 (301, 501, 701, 1001) mit Single/Double/Master In und Out.
// Ein Dart ist {s, m}: s = Segment (0 = daneben, 1-20, 25 = Bull), m = 1/2/3.

export const value = (d) => d.s * d.m;

// Regel, ob ein Dart das Leg eröffnen bzw. beenden darf
export const GATE = {
  single: (d) => d.s > 0,
  double: (d) => d.s > 0 && d.m === 2,
  master: (d) => d.s > 0 && (d.m === 2 || d.m === 3),
};

export const ALL_DARTS = (() => {
  const a = [];
  for (let s = 1; s <= 20; s++) for (const m of [1, 2, 3]) a.push({ s, m });
  a.push({ s: 25, m: 1 }, { s: 25, m: 2 });
  return a;
})();

// Restwerte, die sich mit genau einem Dart auschecken lassen (je Out-Regel)
export const FINISH1 = Object.fromEntries(
  Object.entries(GATE).map(([k, ok]) => [k, new Set(ALL_DARTS.filter(ok).map(value))])
);

export const x01 = {
  id: 'x01',
  title: (cfg) => String(cfg.start),
  subtitle: (cfg) => {
    const n = { single: 'Single', double: 'Double', master: 'Master' };
    return `${n[cfg.in]} In · ${n[cfg.out]} Out`;
  },
  defaults: { start: 501, in: 'single', out: 'double' },

  initLeg(cfg, n) {
    return {
      rem: Array(n).fill(cfg.start),
      opened: Array(n).fill(cfg.in === 'single'),
      turnRem: Array(n).fill(cfg.start),
      turnOpened: Array(n).fill(cfg.in === 'single'),
    };
  },

  score: (leg, p) => leg.rem[p],

  // Wendet einen Dart an. Gibt Annotationen für Anzeige und Statistik zurück.
  applyDart(leg, p, d, cfg, dartIdx) {
    if (dartIdx === 0) {
      leg.turnRem[p] = leg.rem[p];
      leg.turnOpened[p] = leg.opened[p];
    }
    const before = leg.rem[p];
    const info = {
      before,
      atDouble: leg.opened[p] && FINISH1[cfg.out].has(before),
      pts: 0, marks: 0, bust: false, won: false,
    };
    if (!leg.opened[p]) {
      if (!GATE[cfg.in](d)) return info;
      leg.opened[p] = true;
    }
    const after = before - value(d);
    const bust =
      after < 0 ||
      (after === 0 && !GATE[cfg.out](d)) ||
      (after === 1 && cfg.out !== 'single');
    if (bust) {
      leg.rem[p] = leg.turnRem[p];
      leg.opened[p] = leg.turnOpened[p];
      info.bust = true;
      return info;
    }
    leg.rem[p] = after;
    info.pts = value(d);
    info.won = after === 0;
    return info;
  },

  // Kennzahlen eines Spielers im laufenden Match (Anzeige). Busts zählen mit 0 Punkten.
  line(st, p) {
    const turns = st.turns.filter((t) => t.p === p);
    const darts = st.darts.filter((x) => x.p === p).length;
    const pts = turns.reduce((a, t) => a + t.points, 0);
    const turnDarts = turns.reduce((a, t) => a + t.darts.length, 0);
    return { darts, avg: turnDarts ? (pts / turnDarts) * 3 : 0, last: turns.length ? turns[turns.length - 1] : null };
  },
};
