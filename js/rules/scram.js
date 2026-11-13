// Scram (GLD Products, dolfdarts, china-tungsten-dart, dartspiks), bei darts501 und darts-uk „Scam":
// Zwei Spieler, einer ist Stopper, einer Scorer. Der Stopper wirft zuerst, dann abwechselnd je drei Darts.
// Jeder Treffer des Stoppers schließt die getroffene Zahl, egal welcher Ring (dolfdarts ausdrücklich).
// Der Scorer punktet nur auf offenen Zahlen: Feldwert mal Ring, 25 bzw. 50 auf Bull.
// Die Hälfte endet, sobald der Stopper die letzte offene Zahl schließt, auch mitten in seiner Runde.
// Dann tauschen beide die Rollen und spielen eine zweite Hälfte. Die höhere Scorer-Summe gewinnt.
// Abweichung der Quellen als Option:
//   bull true:  1–20 und Bull (GLD, dolfdarts, china-tungsten-dart). 25 und Bull schließen beide das Bull.
//   bull false: nur 1–20 (darts501, darts-uk, dartspiks)
// Gleichstand: dolfdarts lässt je einen Dart aufs Bull werfen, der nähere gewinnt. Die Eingabe kennt keinen
//   Abstand. ANNAHME: Bull schlägt 25, 25 schlägt alles andere. Gleich → nächster Dart.
// Wer ein Leg anwirft, ist in der ersten Hälfte Stopper (wie dolfdarts: Der Stopper wirft zuerst).
// Revanche und neues Leg tauschen deshalb die Rollen.

export const scramNums = (cfg) => [...Array.from({ length: 20 }, (_, i) => i + 1), ...(cfg.bull ? [25] : [])];
const valid = (d, cfg) => d.s > 0 && (d.s !== 25 || cfg.bull);

export const scram = {
  id: 'scram',
  title: () => 'Scram',
  subtitle: (cfg) => (cfg.bull ? '1–20 + Bull' : '1–20'),
  defaults: { bull: true },
  minPlayers: 2,
  maxPlayers: 2,

  initLeg: (cfg, n, starter = 0) => ({
    stopper: starter, half: 1, closed: {}, score: Array(n).fill(0),
    swapped: false, done: false, tb: null,
  }),

  score: (leg, p) => leg.score[p],
  active: (leg, p) => !leg.tb || leg.tb.rounds[p] < leg.tb.stage,

  applyDart(leg, p, d, cfg) {
    const info = { pts: 0, marks: 0, bust: false, won: false, hit: false, role: p === leg.stopper ? 'stopper' : 'scorer', half: leg.half };
    if (leg.tb) {
      leg.tb.value[p] = d.s === 25 ? d.m : 0;
      info.role = 'tiebreak';
      info.endTurn = true; // ein Dart je Spieler
      return info;
    }
    if (!valid(d, cfg) || leg.closed[d.s]) return info;
    if (p === leg.stopper) {
      leg.closed[d.s] = true;
      info.hit = true;
      info.closes = d.s;
      if (scramNums(cfg).every((x) => leg.closed[x])) {
        info.endTurn = true;
        if (leg.half === 1) {
          leg.half = 2;
          leg.stopper = 1 - p;
          leg.closed = {};
          leg.swapped = true;
        } else leg.done = true;
      }
      return info;
    }
    info.hit = true;
    info.pts = d.s === 25 ? (d.m === 2 ? 50 : 25) : d.s * d.m;
    leg.score[p] += info.pts;
    return info;
  },

  turnEnd(leg, p) {
    if (leg.tb) {
      const tb = leg.tb;
      tb.rounds[p]++;
      if (tb.rounds.some((r) => r < tb.stage)) return null;
      if (tb.value[0] !== tb.value[1]) return { winner: tb.value[0] > tb.value[1] ? 0 : 1 };
      tb.stage++;
      return { event: 'tiebreak' };
    }
    if (leg.swapped) { leg.swapped = false; return { event: 'swap' }; }
    if (!leg.done) return null;
    if (leg.score[0] !== leg.score[1]) return { winner: leg.score[0] > leg.score[1] ? 0 : 1 };
    leg.tb = { stage: 1, rounds: [0, 0], value: [0, 0] };
    return { event: 'tiebreak' };
  },

  line(st, p) {
    const darts = st.darts.filter((x) => x.p === p);
    const stop = darts.filter((x) => x.role === 'stopper');
    return {
      darts: darts.length, score: st.leg.score[p],
      stopDarts: stop.length, stopHits: stop.filter((x) => x.hit).length,
    };
  },
};
