// Steeples (Tiny Monkey Games, einzige Quelle): Ein Kurs aus 1 bis 20 der Reihe nach, am Ende Bull.
// Ein Treffer aufs Ziel rückt eins vor. Double überspringt die nächste Zahl, Triple die nächsten zwei.
// Über Bull springt niemand hinweg, Bull muss selbst getroffen werden (wie Around the Clock).
// Wer eine Zahl außer der Reihe trifft, muss in seiner nächsten Runde auf die vorige Zahl zurück.
// Wer zuerst durch ist, gewinnt.
// Die Quelle lässt offen, was „vorige Zahl" heißt. Beide Lesarten als Option (cfg.back):
//   'one':   ein Ziel zurück (Standard)
//   'start': zurück auf das Ziel, mit dem die Runde begann. Fortschritt dieser Runde verfällt.
//   'none':  ohne Strafe (dann wie Around the Clock „D/T springt" mit Bull)
// ANNAHME: „Außer der Reihe" ist jeder Treffer auf eine andere Zahl des Kurses, auch auf Bull. Daneben zählt nicht.
// Mehrere Fehltreffer in einer Runde kosten nur einmal.
// Nicht dasselbe wie Steeplechase (darthelp, GLD Products, dartbase): Dort zählt nur das innere Single,
// Hürden verlangen ein Triple, und wer eine Hürde dreimal verfehlt, scheidet aus. Nicht eingebaut.

export const STEEPLE = [...Array.from({ length: 20 }, (_, i) => i + 1), 25];
export const steepleTarget = (leg, p) => STEEPLE[leg.pos[p]] ?? null;

export const steeples = {
  id: 'steeples',
  title: () => 'Steeples',
  subtitle: (cfg) => ({ one: 'Fehltreffer: ein Feld zurück', start: 'Fehltreffer: zurück auf Rundenbeginn', none: 'ohne Strafe' }[cfg.back]),
  defaults: { back: 'one' },

  initLeg: (cfg, n) => ({ pos: Array(n).fill(0), from: Array(n).fill(0), slip: Array(n).fill(false) }),

  score: (leg, p) => leg.pos[p],

  applyDart(leg, p, d, cfg, dartIdx) {
    if (dartIdx === 0) { leg.slip[p] = false; leg.from[p] = leg.pos[p]; }
    const pos = leg.pos[p], target = STEEPLE[pos];
    const info = { pts: 0, marks: 0, bust: false, won: false, target, hit: false, adv: 0 };
    if (d.s === target) {
      let adv = 1;
      if (target !== 25) while (adv < d.m && pos + adv < STEEPLE.length && STEEPLE[pos + adv] !== 25) adv++;
      leg.pos[p] += adv;
      info.hit = true;
      info.adv = adv;
      info.won = leg.pos[p] === STEEPLE.length;
      return info;
    }
    if (d.s > 0 && cfg.back !== 'none') {
      if (!leg.slip[p]) info.event = 'slip';
      leg.slip[p] = true;
      info.slip = true;
    }
    return info;
  },

  turnEnd(leg, p, cfg, turn) {
    if (!leg.slip[p]) return null;
    const before = leg.pos[p];
    leg.pos[p] = cfg.back === 'start' ? leg.from[p] : Math.max(0, leg.pos[p] - 1);
    leg.slip[p] = false;
    turn.back = before - leg.pos[p];
    return turn.back ? { event: 'back' } : null;
  },

  line(st, p) {
    const darts = st.darts.filter((x) => x.p === p);
    const hits = darts.filter((x) => x.hit).length;
    return { darts: darts.length, hits, hitRate: darts.length ? hits / darts.length : null, backs: st.turns.filter((t) => t.p === p && t.back).length };
  },
};
