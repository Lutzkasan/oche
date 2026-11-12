// Nine Lives (darts501, darthelp): 1 bis 20 der Reihe nach. Jeder Treffer aufs Ziel rückt eine Zahl vor,
// Double und Triple bringen nichts extra. Eine Aufnahme ohne Treffer kostet ein Leben.
// Wer zuerst die 20 trifft, gewinnt. Wer keine Leben mehr hat, scheidet aus. Bleibt einer übrig, gewinnt er.
// lives: 3 (darts501, darthelp) oder 9 (Darts Corner). Allein endet das Leg auch mit dem letzten Leben.

export const alive = (leg) => leg.lives.map((l, i) => (l > 0 ? i : -1)).filter((i) => i >= 0);

export const ninelives = {
  id: 'ninelives',
  title: () => 'Nine Lives',
  subtitle: (cfg) => `${cfg.lives} Leben`,
  defaults: { lives: 3 },

  initLeg: (cfg, n) => ({ pos: Array(n).fill(0), lives: Array(n).fill(cfg.lives), turnHit: false }),

  score: (leg, p) => leg.pos[p],
  active: (leg, p) => leg.lives[p] > 0,

  applyDart(leg, p, d, cfg, dartIdx) {
    if (dartIdx === 0) leg.turnHit = false;
    const target = leg.pos[p] + 1;
    const info = { pts: 0, marks: 0, bust: false, won: false, target, hit: false };
    if (d.s === target) {
      leg.pos[p]++;
      leg.turnHit = true;
      info.hit = true;
      info.won = leg.pos[p] === 20;
      return info;
    }
    if (dartIdx === 2 && !leg.turnHit) {
      leg.lives[p]--;
      info.lifeLost = true;
      info.event = leg.lives[p] ? 'life' : 'out';
      info.victim = p;
    }
    return info;
  },

  turnEnd(leg, p) {
    const rest = alive(leg);
    if (leg.lives.length === 1) return rest.length ? null : { winner: 0 };
    return rest.length === 1 ? { winner: rest[0] } : null;
  },

  line(st, p) {
    const darts = st.darts.filter((x) => x.p === p);
    const hits = darts.filter((x) => x.hit).length;
    return { darts: darts.length, hits, hitRate: darts.length ? hits / darts.length : null, lost: darts.filter((x) => x.lifeLost).length };
  },
};
