// High / Low (darthelp). Ein Modus mit Richtung (cfg.dir):
//   'high': Wer dran ist, muss die Vorgabe mit drei Darts übertreffen.
//   'low':  Wer dran ist, muss die Vorgabe unterbieten. Bull zählt −50, 25 zählt −25, daneben +25.
//           Die übrigen Felder zählen ihren Wert. Summen dürfen negativ sein.
// Gleich viel reicht in beiden Richtungen nicht. Wer scheitert, verliert ein Leben (cfg.lives, Quelle: 3).
// Das Ergebnis jeder Runde ist die neue Vorgabe, auch wenn sie gescheitert ist. Der Letzte mit Leben gewinnt.
// Der erste Spieler eines Legs legt mit zwei Darts vor, seine Runde endet nach dem zweiten Dart und kann nicht
// scheitern. ANNAHME: Vor legt, wer das Leg anwirft (wie Knockout). Die Engine wechselt den Anwurf je Leg.
// Varianten der Quelle als Optionen, beide aus als Vorgabe:
//   cfg.plusOne: Genau um 1 übertroffen (High) bzw. unterboten (Low) gibt ein Leben zurück.
//     ANNAHME: höchstens bis zur Startzahl der Leben.
//   cfg.ban180: Nur High. 180 kostet ein Leben, außer die Vorgabe ist 177. Dann ist 180 der einzige Wurf,
//     der sie schlägt (178 und 179 sind mit drei Darts nicht möglich).

export const alive = (leg) => leg.lives.map((l, i) => (l > 0 ? i : -1)).filter((i) => i >= 0);
const low = (cfg) => cfg.dir === 'low';

// Wert eines Darts in dieser Richtung
export function hlValue(d, cfg) {
  if (!low(cfg)) return d.s * d.m;
  if (d.s === 0) return 25;
  if (d.s === 25) return -25 * d.m;
  return d.s * d.m;
}

// Schafft die Summe pts die Vorgabe bar?
export const hlBeats = (pts, bar, cfg) => (low(cfg) ? pts < bar : pts > bar);

export const highlow = {
  id: 'highlow',
  title: (cfg) => (low(cfg) ? 'Low' : 'High'),
  subtitle: (cfg) => [`${cfg.lives} Leben`, cfg.plusOne ? 'genau 1 gibt Leben' : '', !low(cfg) && cfg.ban180 ? '180 kostet Leben' : ''].filter(Boolean).join(' · '),
  defaults: { dir: 'high', lives: 3, plusOne: false, ban180: false },
  minPlayers: 2,

  initLeg: (cfg, n) => ({ lives: Array(n).fill(cfg.lives), bar: null, turnPts: 0 }),

  score: (leg, p) => leg.lives[p],
  active: (leg, p) => leg.lives[p] > 0,

  applyDart(leg, p, d, cfg, dartIdx) {
    if (dartIdx === 0) leg.turnPts = 0;
    const pts = hlValue(d, cfg);
    leg.turnPts += pts;
    // Vorlage: zwei Darts, dann ist die Runde vorbei
    return { pts, marks: 0, bust: false, won: false, bar: leg.bar, endTurn: leg.bar === null && dartIdx === 1 };
  },

  turnEnd(leg, p, cfg, turn) {
    const pts = leg.turnPts, bar = leg.bar;
    leg.bar = pts;
    turn.bar = bar;
    if (bar === null) return null;
    let ok = hlBeats(pts, bar, cfg);
    if (!low(cfg) && cfg.ban180 && pts === 180 && bar !== 177) ok = false;
    if (ok) {
      if (cfg.plusOne && Math.abs(pts - bar) === 1 && leg.lives[p] < cfg.lives) {
        leg.lives[p]++;
        turn.lifeBack = true;
        return { event: 'lifeback' };
      }
      return null;
    }
    leg.lives[p]--;
    turn.strike = true;
    const rest = alive(leg);
    return rest.length === 1 ? { winner: rest[0] } : { event: leg.lives[p] ? 'life' : 'out' };
  },

  line(st, p) {
    const turns = st.turns.filter((t) => t.p === p && t.bar !== null && t.bar !== undefined);
    const ok = turns.filter((t) => !t.strike).length;
    return { darts: st.darts.filter((x) => x.p === p).length, tries: turns.length, ok, rate: turns.length ? ok / turns.length : null };
  },
};
