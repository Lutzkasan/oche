// Killer: Jeder Spieler hat eine eigene Zahl (cfg.numbers, je Spielerindex) und cfg.lives Leben.
// Ein Treffer auf die eigene Zahl macht den Spieler zum Killer. Erst Killer dürfen die Zahlen
// der anderen treffen. Jeder Treffer kostet den Besitzer der Zahl ein Leben. Wer 0 Leben hat, ist raus.
// Der letzte Spieler mit Leben gewinnt das Leg.
// zone: double  = nur das Doppel zählt, als ein Treffer
//       segment = jedes Feld zählt, S = 1, D = 2, T = 3 Treffer
// selfHit: true = trifft ein Killer die eigene Zahl, verliert er selbst ein Leben je Treffer.

export const alive = (leg) => leg.lives.map((l, i) => (l > 0 ? i : -1)).filter((i) => i >= 0);

export const killer = {
  id: 'killer',
  title: () => 'Killer',
  subtitle: (cfg) => `${cfg.lives} Leben · ${cfg.zone === 'double' ? 'Doppel' : 'ganzes Feld'}${cfg.selfHit ? '' : ' · ohne Eigentreffer'}`,
  defaults: { lives: 3, zone: 'double', selfHit: true },
  minPlayers: 2,

  initLeg(cfg, n) {
    return { lives: Array(n).fill(cfg.lives), killer: Array(n).fill(false) };
  },

  score: (leg, p) => leg.lives[p],
  active: (leg, p) => leg.lives[p] > 0,

  applyDart(leg, p, d, cfg) {
    const info = { pts: 0, marks: 0, bust: false, won: false, hit: false, taken: 0, lost: 0 };
    const owner = d.s >= 1 && d.s <= 20 ? cfg.numbers.indexOf(d.s) : -1;
    const hits = cfg.zone === 'double' ? (d.m === 2 ? 1 : 0) : d.m;
    if (owner < 0 || !hits || leg.lives[owner] <= 0) return info;
    if (owner === p && !leg.killer[p]) {
      leg.killer[p] = true;
      info.hit = true;
      info.event = 'killer';
      return info;
    }
    if (!leg.killer[p] || (owner === p && !cfg.selfHit)) return info;
    const lost = Math.min(hits, leg.lives[owner]);
    leg.lives[owner] -= lost;
    info.hit = true;
    if (owner === p) info.lost = lost;
    else info.taken = lost;
    if (leg.lives[owner] === 0) {
      info.event = 'out';
      info.victim = owner;
      if (owner === p) info.endTurn = true; // wer sich selbst rauswirft, wirft nicht weiter
    }
    const rest = alive(leg);
    info.won = rest.length === 1 && rest[0] === p;
    return info;
  },

  // Fällt der Werfer durch Eigentreffer raus, gewinnt der letzte Übrige, obwohl er nicht geworfen hat
  turnEnd(leg) {
    const rest = alive(leg);
    return rest.length === 1 ? { winner: rest[0] } : null;
  },

  line(st, p) {
    const darts = st.darts.filter((x) => x.p === p);
    return { darts: darts.length, taken: darts.reduce((a, x) => a + (x.taken || 0), 0) };
  },
};

// Zufällige, verschiedene Zahlen 1–20 für n Spieler
export function drawNumbers(n, rnd = Math.random) {
  const pool = Array.from({ length: 20 }, (_, i) => i + 1);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, n);
}
