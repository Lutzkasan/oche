// Gotcha (World Dolf Federation, darthelp): Alle zählen von 0 hoch auf ein Ziel (cfg.goal). Wer das Ziel
// genau erreicht, gewinnt. Erreicht ein Dart genau den Stand eines Gegners (über 0), fällt dieser auf 0.
// Ein Dart kann mehrere Gegner treffen.
// over: 'bust' = Überwerfen macht die Aufnahme ungültig, Stand zurück auf den Beginn der Aufnahme (beide Quellen)
//       'back' = der Überschuss wird vom Ziel abgezogen, die Aufnahme geht weiter (Variante darthelp, Arachnid)
// out:  'any' = beliebiges Feld zum Beenden (Standard), 'double' = Doppel zum Beenden (Variante WDF)
// Zurückgesetzte Gegner bleiben bei 0, auch wenn die Aufnahme später überworfen wird. Die Quellen
// prüfen den Gleichstand während der Aufnahme („during your turn"), nicht an ihrem Ende.

export const gotcha = {
  id: 'gotcha',
  title: (cfg) => `Gotcha ${cfg.goal}`,
  subtitle: (cfg) => `${cfg.over === 'back' ? 'Überschuss zurück' : 'Überwerfen = Bust'}${cfg.out === 'double' ? ' · Double Out' : ''}`,
  defaults: { goal: 301, over: 'bust', out: 'any' },
  minPlayers: 2,

  initLeg: (cfg, n) => ({ score: Array(n).fill(0), turnStart: Array(n).fill(0) }),

  score: (leg, p) => leg.score[p],

  applyDart(leg, p, d, cfg, dartIdx) {
    if (dartIdx === 0) leg.turnStart[p] = leg.score[p];
    const before = leg.score[p];
    const info = { pts: 0, marks: 0, bust: false, won: false, before };
    let after = before + d.s * d.m;
    if (after > cfg.goal && cfg.over === 'back') after = cfg.goal - (after - cfg.goal);
    if (after > cfg.goal || (after === cfg.goal && cfg.out === 'double' && d.m !== 2)) {
      leg.score[p] = leg.turnStart[p];
      info.bust = true;
      return info;
    }
    leg.score[p] = after;
    info.pts = after - before;
    if (after === cfg.goal) { info.won = true; return info; }
    const kills = [];
    leg.score.forEach((v, q) => { if (q !== p && v > 0 && v === after) kills.push(q); });
    for (const q of kills) leg.score[q] = 0;
    if (kills.length) { info.kills = kills; info.event = 'gotcha'; info.victim = kills[0]; }
    return info;
  },

  line(st, p) {
    const turns = st.turns.filter((t) => t.p === p);
    const darts = st.darts.filter((x) => x.p === p);
    const pts = turns.reduce((a, t) => a + t.points, 0), td = turns.reduce((a, t) => a + t.darts.length, 0);
    return { darts: darts.length, avg: td ? (pts / td) * 3 : null, kills: darts.reduce((a, x) => a + (x.kills?.length || 0), 0) };
  },
};
