// Knockout (darts501, Darts Corner): Die erste Aufnahme des Legs gibt eine Punktzahl vor (3 Darts, Feldwerte).
// Jede weitere Aufnahme muss sie übertreffen, sonst gibt es einen Strich. Gleichstand übertrifft nicht.
// Nach cfg.lives Strichen scheidet der Spieler aus, der Letzte gewinnt.
// bar: 'prev' = zu schlagen ist die Aufnahme des Vorwerfers (Darts Corner)
//      'high' = zu schlagen ist die höchste Aufnahme des Legs bisher (darts501)
// Ausgeschiedene werfen nicht mehr, der Vorwerfer ist damit immer der zuletzt aktive Spieler.

export const alive = (leg) => leg.lives.map((l, i) => (l > 0 ? i : -1)).filter((i) => i >= 0);

export const knockout = {
  id: 'knockout',
  title: () => 'Knockout',
  subtitle: (cfg) => `${cfg.lives} Striche · ${cfg.bar === 'high' ? 'Höchstwert schlagen' : 'Vorwerfer schlagen'}`,
  defaults: { lives: 3, bar: 'prev' },
  minPlayers: 2,

  initLeg: (cfg, n) => ({ lives: Array(n).fill(cfg.lives), bar: null, turnPts: 0 }),

  score: (leg, p) => leg.lives[p],
  active: (leg, p) => leg.lives[p] > 0,

  applyDart(leg, p, d, cfg, dartIdx) {
    if (dartIdx === 0) leg.turnPts = 0;
    const pts = d.s * d.m;
    leg.turnPts += pts;
    return { pts, marks: 0, bust: false, won: false, bar: leg.bar };
  },

  turnEnd(leg, p, cfg, turn) {
    const pts = leg.turnPts, bar = leg.bar;
    leg.bar = bar === null || cfg.bar === 'prev' ? pts : Math.max(bar, pts);
    turn.bar = bar;
    if (bar === null || pts > bar) return null;
    leg.lives[p]--;
    turn.strike = true;
    const rest = alive(leg);
    return rest.length === 1 ? { winner: rest[0] } : { event: leg.lives[p] ? 'strike' : 'out' };
  },

  line(st, p) {
    const turns = st.turns.filter((t) => t.p === p);
    const pts = turns.reduce((a, t) => a + t.points, 0);
    return { darts: st.darts.filter((x) => x.p === p).length, ppr: turns.length ? pts / turns.length : null, strikes: turns.filter((t) => t.strike).length };
  },
};
