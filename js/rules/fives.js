// Fives / Fifty-One by Fives: Die Summe der drei Darts zählt nur, wenn sie durch 5 teilbar ist.
// Dann bringt sie Summe ÷ 5 Punkte (45 → 9). Sonst zählt die Runde nicht (alle Quellen).
// Ein Dart daneben macht die ganze Runde ungültig (darts501, darthelp, dolfdarts). Die Taste „Daneben" ist
// genau dieser Fall: Sie steht für einen Dart, der kein Feld trifft.
// Abweichungen der Quellen als Option:
//   goal 51 (darthelp, dolfdarts, darting.com) oder 50 bzw. 100 (darts501, darts-uk)
//   over 'bust':  Wer über das Ziel käme, bekommt für die Runde nichts (darthelp, dolfdarts: genau 51)
//        'reach': Erreichen oder Überschreiten gewinnt. ANNAHME für darts501 und darts-uk, die nur
//                 „first to reach" schreiben und das Überwerfen nicht regeln.
//   dt 'full':   Double und Triple zählen ihren vollen Wert (darts501, darthelp)
//      'single': Double und Triple zählen wie das Single (darts-uk, eine der dort genannten Absprachen)
//   Bull zählt 25 bzw. 50 in beiden Einstellungen.
// Nicht eingebaut: feste Rundenzahl mit höchster Summe (Tiny Monkey), Strafpunkte (darthelp-Variante).
// Ausgewertet wird mit dem dritten Dart, eine Runde hat immer drei Darts.

export const fivesValue = (d, cfg) => (d.s === 0 ? 0 : cfg.dt === 'single' && d.s !== 25 ? d.s : d.s * d.m);

export const fives = {
  id: 'fives',
  title: () => 'Fives',
  subtitle: (cfg) => [`Ziel ${cfg.goal}`, cfg.over === 'reach' ? 'erreichen reicht' : 'genau', cfg.dt === 'single' ? 'D/T einfach' : ''].filter(Boolean).join(' · '),
  defaults: { goal: 51, over: 'bust', dt: 'full' },

  initLeg: (cfg, n) => ({ score: Array(n).fill(0), sum: 0, miss: false }),

  score: (leg, p) => leg.score[p],

  applyDart(leg, p, d, cfg, dartIdx) {
    if (dartIdx === 0) { leg.sum = 0; leg.miss = false; }
    const v = fivesValue(d, cfg);
    leg.sum += v;
    if (d.s === 0) leg.miss = true;
    const info = { pts: 0, marks: 0, bust: false, won: false, value: v, hit: d.s > 0 };
    if (dartIdx < 2) return info;
    // Dritter Dart: Runde auswerten
    info.sum = leg.sum;
    if (leg.miss || leg.sum === 0 || leg.sum % 5) {
      info.event = 'void';
      return info;
    }
    const gain = leg.sum / 5, next = leg.score[p] + gain;
    info.five = true;
    if (next > cfg.goal && cfg.over !== 'reach') {
      info.bust = true;
      return info;
    }
    leg.score[p] = next;
    info.pts = gain;
    info.won = next >= cfg.goal;
    return info;
  },

  line(st, p) {
    const turns = st.turns.filter((t) => t.p === p);
    const fives = turns.filter((t) => t.infos[2]?.five).length;
    return {
      darts: st.darts.filter((x) => x.p === p).length, turns: turns.length, fives,
      fiveRate: turns.length ? fives / turns.length : null,
      ppr: turns.length ? turns.reduce((a, t) => a + t.points, 0) / turns.length : null,
      score: st.leg.score[p],
    };
  },
};
