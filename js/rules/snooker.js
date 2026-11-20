// Snooker in zwei Varianten (cfg.variant). Ring egal: Double und Triple zählen wie Single (Entscheidung des Nutzers).
//
// 'd501' (darts501): Rote 1–15 je 1 Punkt. Farben 16 Gelb 2, 17 Grün 3, 18 Braun 4, 19 Blau 5, 20 Rosa 6,
//   Bull (25 und 50) Schwarz 7. Erst Rot, dann eine Farbe, abwechselnd. Eine getroffene Rote ist eingelocht und
//   danach nicht mehr im Spiel, Farben kommen zurück, solange Rote liegen. Sind alle Roten weg (nach der Farbe
//   zur letzten Roten), folgen die Farben der Reihe nach Gelb bis Schwarz, jede einmal.
//   Das Break läuft über mehrere Runden weiter, bis ein Fehlwurf oder Foul es beendet. darts501 nennt dafür kein
//   Ende nach drei Darts (Darts holen „when their break ends“), Darts Corner ebenso (am 20.11.2026 geprüft).
//   Daneben, eine schon eingelochte Rote oder Rot statt Farbe: Break endet ohne Strafe.
//   Foul: Der Nächste in der Reihenfolge bekommt Strafpunkte, das Break endet.
//     Auf Rot und eine Farbe getroffen: 4, bei Blau, Rosa, Schwarz deren Wert.
//     cfg.call true („Mit Ansage“): Die Farbe wird vor dem Dart per Taste angesagt (Dart-Eintrag call).
//       Andere Farbe getroffen: der höhere Wert von angesagter und getroffener Farbe, mindestens 4.
//       In der Farbfolge ist die nächste Farbe angesagt, eine andere Farbe ist ein Foul wie oben.
//     cfg.call false („Ohne Ansage“): Jede Farbe nach einer Roten zählt. Foul nur, wenn auf Rot gezielt und eine
//       Farbe getroffen wird. ANNAHME: In der Farbfolge beendet eine falsche Farbe das Break ohne Strafe.
//   Ende, wenn alles eingelocht ist. Die höchste Summe gewinnt.
//   ANNAHME Gleichstand: Schwarz wird wieder aufgesetzt, nur die Punktgleichen werfen aufs Bull, beginnend mit dem
//     Nächsten nach dem, der Schwarz versenkt hat. Wer zuerst trifft, bekommt 7 und gewinnt. Daneben oder ein
//     anderes Feld beendet das Break ohne Strafe.
//   ANNAHME: Mit einem Spieler (Training) gehen Strafpunkte an niemanden, das Break endet trotzdem.
//
// 'tm' (Tiny Monkey, Kurz-Snooker): Rote 1–9 je 1, Farben 10 Gelb 2, 11 Grün 3, 12 Braun 4, 13 Blau 5, 14 Rosa 6,
//   15 Schwarz 7, Bull 8. Die Zuordnung von Bull hat der Nutzer festgelegt, die Quelle nennt keine.
//   ANNAHME: Auch 25 zählt als Bull (8), wie Schwarz in der darts501-Variante.
//   Abwechselnd Rot, Farbe. Jeder wirft drei Darts je Runde, cfg.rounds Runden (1, 3, 5, 10, 15, Wahl des
//   Nutzers, die Quelle sagt „vereinbart“). Die höchste Summe gewinnt, Gleichstand → Stechen (rounds.js).
//   ANNAHMEN (Nutzer hat am 20.11.2026 nicht geantwortet): Rote bleiben im Spiel. Ein Fehlwurf (daneben, 16–20,
//   Farbe statt Rot, Rot statt Farbe) zählt nicht, der nächste Dart muss wieder Rot sein. Keine Fouls.
//   Jede Runde beginnt auf Rot.
import { roundsLeg, roundActive, settle } from './rounds.js';

const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
export const SN_TABLES = {
  d501: { reds: range(1, 15), order: [16, 17, 18, 19, 20, 25], values: { 16: 2, 17: 3, 18: 4, 19: 5, 20: 6, 25: 7 } },
  tm: { reds: range(1, 9), order: [10, 11, 12, 13, 14, 15, 25], values: { 10: 2, 11: 3, 12: 4, 13: 5, 14: 6, 15: 7, 25: 8 } },
};
const NAMES = ['Gelb', 'Grün', 'Braun', 'Blau', 'Rosa', 'Schwarz', 'Bull'];
export const snTable = (cfg) => SN_TABLES[cfg.variant] || SN_TABLES.d501;
export const snIsRed = (cfg, s) => snTable(cfg).reds.includes(s);
export const snValue = (cfg, s) => snTable(cfg).values[s] ?? null;
export const snColourName = (cfg, s) => NAMES[snTable(cfg).order.indexOf(s)] || '';
const isTm = (cfg) => cfg.variant === 'tm';

// Was ist gerade dran? 'red', 'colour' (beliebige Farbe) oder die Zahl der nächsten Farbe in der Folge
export function snOn(leg) {
  if (leg.phase === 'respot') return 25;
  if (leg.phase === 'colours') return leg.order[leg.on];
  return leg.need;
}
// Muss der Werfer vor seinem nächsten Dart eine Farbe ansagen?
export const snNeedsCall = (leg, cfg) => !isTm(cfg) && Boolean(cfg.call) && leg.phase === 'reds' && leg.need === 'colour';
export const snRedsLeft = (leg) => Object.values(leg.reds || {}).filter(Boolean).length;

export const snooker = {
  id: 'snooker',
  title: () => 'Snooker',
  subtitle: (cfg) => (isTm(cfg)
    ? `Kurz · 9 Rote · ${cfg.rounds} ${cfg.rounds === 1 ? 'Runde' : 'Runden'}`
    : `15 Rote · ${cfg.call ? 'mit Ansage' : 'ohne Ansage'}`),
  defaults: { variant: 'd501', call: true },

  initLeg(cfg, n) {
    const t = snTable(cfg);
    if (isTm(cfg)) return { ...roundsLeg(n, cfg.rounds), score: Array(n).fill(0), need: 'red', best: Array(n).fill(0), brk: 0 };
    return {
      score: Array(n).fill(0), best: Array(n).fill(0),
      reds: Object.fromEntries(t.reds.map((r) => [r, true])), order: [...t.order],
      phase: 'reds', need: 'red', on: 0, brk: 0, ended: false, done: false, pool: null,
    };
  },

  score: (leg, p) => leg.score[p],
  active: (leg, p) => ('stage' in leg ? roundActive(leg, p) : leg.phase !== 'respot' || leg.pool.includes(p)),

  applyDart(leg, p, d, cfg, dartIdx) {
    if (isTm(cfg)) return tmDart(leg, p, d, cfg, dartIdx);
    const info = { pts: 0, marks: 0, bust: false, won: false, hit: false, on: snOn(leg) };
    const n = leg.score.length, s = d.s;
    const pot = (v) => {
      leg.score[p] += v;
      leg.brk += v;
      leg.best[p] = Math.max(leg.best[p], leg.brk);
      Object.assign(info, { pts: v, hit: true, brk: leg.brk });
    };
    const end = () => { leg.ended = true; info.endTurn = true; info.breakEnd = true; };
    const foul = (pen) => {
      const q = n > 1 ? (p + 1) % n : -1;
      if (q >= 0) leg.score[q] += pen;
      Object.assign(info, { foul: pen, foulTo: q, event: 'foul' });
      end();
    };
    const colour = snValue(cfg, s);

    if (leg.phase === 'respot') {
      if (s === 25) { pot(7); info.won = true; } else end();
      return info;
    }
    if (leg.phase === 'colours') {
      const on = leg.order[leg.on];
      if (s === on) {
        pot(colour);
        leg.on++;
        if (leg.on >= leg.order.length) { leg.done = true; info.endTurn = true; }
      } else if (colour !== null && cfg.call) foul(Math.max(4, snValue(cfg, on), colour));
      else end();
      return info;
    }
    if (leg.need === 'red') {
      if (snIsRed(cfg, s) && leg.reds[s]) { leg.reds[s] = false; pot(1); leg.need = 'colour'; }
      else if (colour !== null) foul(Math.max(4, colour));
      else end();
      return info;
    }
    // Farbe ist dran
    if (colour === null) { end(); return info; }
    if (cfg.call && d.call != null && d.call !== s) {
      info.call = d.call;
      foul(Math.max(4, snValue(cfg, d.call) ?? 0, colour));
      return info;
    }
    pot(colour);
    leg.need = 'red';
    if (!snRedsLeft(leg)) { leg.phase = 'colours'; leg.on = 0; }
    return info;
  },

  turnEnd(leg, p, cfg) {
    if (isTm(cfg)) {
      leg.rounds[p]++;
      return settle(leg, (q) => [leg.score[q]]);
    }
    if (leg.done) {
      leg.done = false;
      const best = Math.max(...leg.score);
      const top = leg.score.map((v, q) => (v === best ? q : -1)).filter((q) => q >= 0);
      if (top.length === 1) return { winner: top[0] };
      leg.phase = 'respot';
      leg.pool = top;
      leg.brk = 0;
      return { event: 'tiebreak' };
    }
    if (!leg.ended) return { again: true }; // Break läuft weiter
    leg.ended = false;
    leg.brk = 0;
    if (leg.phase === 'reds') {
      leg.need = 'red';
      // Farbe nach der letzten Roten verfehlt: Der Nächste beginnt mit der Farbfolge
      if (!snRedsLeft(leg)) { leg.phase = 'colours'; leg.on = 0; }
    }
    return null;
  },

  line(st, p) {
    const darts = st.darts.filter((x) => x.p === p);
    const pots = darts.filter((x) => x.hit).length;
    return {
      darts: darts.length, pots, hitRate: darts.length ? pots / darts.length : null,
      score: st.leg.score[p], best: st.leg.best[p], fouls: darts.filter((x) => x.foul).length,
    };
  },
};

// Kurz-Snooker: Runde beginnt auf Rot, Fehlwurf zählt nicht und setzt auf Rot zurück
function tmDart(leg, p, d, cfg, dartIdx) {
  if (dartIdx === 0) { leg.need = 'red'; leg.brk = 0; }
  const info = { pts: 0, marks: 0, bust: false, won: false, hit: false, on: leg.need };
  const colour = snValue(cfg, d.s);
  if (leg.need === 'red' && snIsRed(cfg, d.s)) { info.pts = 1; leg.need = 'colour'; }
  else if (leg.need === 'colour' && colour !== null) { info.pts = colour; leg.need = 'red'; }
  else { leg.need = 'red'; leg.brk = 0; return info; }
  leg.score[p] += info.pts;
  leg.brk += info.pts;
  leg.best[p] = Math.max(leg.best[p], leg.brk);
  info.hit = true;
  info.brk = leg.brk;
  return info;
}
