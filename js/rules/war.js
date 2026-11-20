// War (Tiny Monkey Games, einzige Quelle): Die Spieler vereinbaren Felder, die erobert werden können.
// Ein Feld erobert, wer es zuerst oft genug trifft. Danach haben die anderen Spieler eine Runde Zeit, es
// zurückzuerobern, indem sie es öfter treffen als der Halter. Sind alle Felder vergeben, gewinnt, wer die
// meisten hält.
// Die Quelle lässt vieles offen. Umgesetzt so:
//   set 'cricket': 15–20 und Bull (7 Felder, Standard).  'all': 1–20 und Bull (21 Felder).
//     Die Quelle nennt auch „jedes Doppel" oder „jedes Triple" als Feld. Nicht eingebaut.
//   need 3: drei Marks wie in Cricket (Single 1, Double 2, Triple 3, 25 = 1, Bull = 2). need 1: ein Treffer.
//     Bis zur Eroberung sammelt jeder Spieler seine Marks auf einem Feld über mehrere Runden.
//   Marks nach Ring auch bei need 1 (ab Regelversion 1, 0.8.1, Wunsch des Nutzers): Jeder Treffer erobert ein
//     freies Feld, Stärke und Rückeroberung zählen aber Single 1, Double 2, Triple 3. Bis Regelversion 0 zählte
//     bei need 1 jeder Treffer eins, Stärke und Rückeroberung hingen dann nur an der Zahl der Treffer.
//   ANNAHME Stärke: Der Halter hält ein Feld mit den Marks, die er bis zum Ende seiner Eroberungsrunde darauf
//     hat. Zurückerobern heißt, in der eigenen nächsten Runde mehr Marks darauf zu werfen. Wer zurückerobert,
//     wird Halter, und die anderen (auch der alte Halter) bekommen wieder je eine Runde.
//   ANNAHME Ende: Ein Feld ist sicher, wenn alle anderen ihre Runde nach der Eroberung gehabt haben.
//     Das Leg endet, wenn alle Felder sicher sind.
//   ANNAHME Gleichstand: Stechen auf Bull, eine Runde je Gleichplatziertem, mehr Marks (25 = 1, Bull = 2)
//     gewinnt, sonst weiter. Die Quelle regelt das nicht.
// Spielart (cfg.style, ab 0.9.0). 'hold' = Erobern und Halten wie oben, gilt auch, wenn style fehlt (bis 0.8.1).
// 'rounds' (Regel des Nutzers vom 20.11.2026): Jeder wirft cfg.rounds Runden. Auf jedem Feld sammelt jeder Spieler
//   über das ganze Spiel Treffer. cfg.count 'marks' zählt S1, D2, T3, 25 = 1, Bull = 2, 'hits' jeden Treffer eins.
//   Das Feld gehört dem, der darauf am meisten hat. Wer gleichzieht, muss überbieten, der Halter behält es.
//   Nach der letzten Runde gewinnt, wer die meisten Felder hält. Gleichstand: Extra-Runden mit je drei Darts, nur
//   die Spieler mit gleich vielen Feldern an der Spitze werfen, bis nach einer Runde einer vorn liegt (rounds.js).
//   ANNAHME (nicht gefragt): In den Extra-Runden zählen Treffer weiter auf die Felder wie im Spiel.
import { roundsLeg, roundActive, settle } from './rounds.js';

export const WAR_SETS = { cricket: [20, 19, 18, 17, 16, 15, 25], all: [...Array.from({ length: 20 }, (_, i) => i + 1), 25] };
export const warFields = (cfg) => WAR_SETS[cfg.set] || WAR_SETS.cricket;
const unit = (d, cfg) => (cfg.need === 1 && !(cfg.rv >= 1) ? 1 : d.m);

// Kann p dieses Feld gerade erobern oder zurückerobern? Für Brett und Tastenfeld.
export const warOpen = (leg, f, p) => leg.owner[f] < 0 || (!leg.locked[f] && leg.owner[f] !== p && leg.window[f].includes(p));
export const warCount = (leg, p) => Object.values(leg.owner).filter((o) => o === p).length;
export const warRounds = (cfg) => cfg.style === 'rounds';
const COUNT_LABEL = { marks: 'Marks', hits: 'Treffer' };

export const war = {
  id: 'war',
  title: () => 'War',
  subtitle: (cfg) => `${cfg.set === 'all' ? '1–20 + Bull' : '15–20 + Bull'} · ${warRounds(cfg)
    ? `${cfg.rounds} Runden · zählt ${COUNT_LABEL[cfg.count] || 'Marks'}` : cfg.need === 1 ? '1 Treffer' : '3 Marks'}`,
  defaults: { set: 'cricket', need: 3, style: 'hold' },
  minPlayers: 2,

  initLeg(cfg, n) {
    const fields = warFields(cfg), by = (v) => Object.fromEntries(fields.map((f) => [f, typeof v === 'function' ? v() : v]));
    if (warRounds(cfg)) return { ...roundsLeg(n, cfg.rounds), owner: by(-1), prog: Array.from({ length: n }, () => by(0)) };
    return {
      owner: by(-1), strength: by(0), locked: by(false), window: by(() => []),
      prog: Array.from({ length: n }, () => by(0)),   // Marks je Spieler auf noch freien Feldern
      turnMarks: by(0),                                // Marks des Werfers in dieser Runde auf fremden Feldern
      capturedIn: by(-1),                              // Werfer der Runde, in der das Feld zuletzt erobert wurde
      tb: null,                                        // Stechen: { pool, stage, rounds, marks }
    };
  },

  score: (leg, p) => warCount(leg, p),
  active: (leg, p) => ('stage' in leg ? roundActive(leg, p) : !leg.tb || (leg.tb.pool.includes(p) && leg.tb.rounds[p] < leg.tb.stage)),

  applyDart(leg, p, d, cfg, dartIdx) {
    const info = { pts: 0, marks: 0, bust: false, won: false, hit: false };
    if (warRounds(cfg)) return roundsDart(leg, p, d, cfg, info);
    if (dartIdx === 0) for (const f of Object.keys(leg.turnMarks)) leg.turnMarks[f] = 0;
    if (leg.tb) {
      if (d.s === 25) { leg.tb.marks[p] += d.m; info.hit = true; info.marks = d.m; }
      return info;
    }
    const f = d.s;
    if (!(f in leg.owner)) return info;
    const u = unit(d, cfg);
    const n = leg.prog.length;
    const others = () => Array.from({ length: n }, (_, q) => q).filter((q) => q !== p);
    if (leg.owner[f] < 0) {
      leg.prog[p][f] += u;
      info.hit = true;
      info.marks = u;
      if (leg.prog[p][f] >= cfg.need) {
        leg.owner[f] = p;
        leg.strength[f] = leg.prog[p][f];
        leg.window[f] = others();
        leg.capturedIn[f] = p;
        leg.prog.forEach((pr) => { pr[f] = 0; });
        info.capture = f;
        info.event = 'capture';
      }
      return info;
    }
    if (leg.locked[f]) return info;
    if (leg.owner[f] === p) {
      // Eigene Eroberungsrunde: weitere Treffer machen das Feld stärker
      if (leg.capturedIn[f] === p) { leg.strength[f] += u; info.hit = true; info.marks = u; }
      return info;
    }
    if (!leg.window[f].includes(p)) return info;
    leg.turnMarks[f] += u;
    info.hit = true;
    info.marks = u;
    if (leg.turnMarks[f] > leg.strength[f]) {
      leg.owner[f] = p;
      leg.strength[f] = leg.turnMarks[f];
      leg.window[f] = others();
      leg.capturedIn[f] = p;
      leg.turnMarks[f] = 0;
      info.capture = f;
      info.recapture = true;
      info.event = 'recapture';
    }
    return info;
  },

  turnEnd(leg, p, cfg) {
    if (warRounds(cfg)) {
      leg.rounds[p]++;
      return settle(leg, (q) => [warCount(leg, q)]);
    }
    if (leg.tb) return tiebreakEnd(leg, p);
    for (const f of Object.keys(leg.owner)) {
      if (leg.capturedIn[f] === p) leg.capturedIn[f] = -1; // Eroberungsrunde vorbei, Stärke steht fest
      if (leg.owner[f] < 0 || leg.locked[f]) continue;
      leg.window[f] = leg.window[f].filter((q) => q !== p);
      if (!leg.window[f].length) leg.locked[f] = true;
    }
    if (!Object.values(leg.locked).every(Boolean)) return null;
    const n = leg.prog.length;
    const counts = Array.from({ length: n }, (_, q) => warCount(leg, q));
    const best = Math.max(...counts);
    const top = counts.map((c, q) => (c === best ? q : -1)).filter((q) => q >= 0);
    if (top.length === 1) return { winner: top[0] };
    leg.tb = { pool: top, stage: 1, rounds: Array(n).fill(0), marks: Array(n).fill(0) };
    return { event: 'tiebreak' };
  },

  line(st, p) {
    const darts = st.darts.filter((x) => x.p === p);
    const hits = darts.filter((x) => x.hit).length;
    return {
      darts: darts.length, hits, hitRate: darts.length ? hits / darts.length : null,
      fields: warCount(st.leg, p), captures: darts.filter((x) => x.capture !== undefined).length,
    };
  },
};

// Spielart „Runden“: Treffer sammeln sich je Spieler und Feld. Halter ist, wer am meisten hat, Gleichziehen reicht nicht.
function roundsDart(leg, p, d, cfg, info) {
  const f = d.s;
  if (!(f in leg.owner)) return info;
  const u = cfg.count === 'hits' ? 1 : d.m;
  leg.prog[p][f] += u;
  info.hit = true;
  info.marks = u;
  const o = leg.owner[f];
  if (o !== p && leg.prog[p][f] > (o < 0 ? 0 : leg.prog[o][f])) {
    leg.owner[f] = p;
    info.capture = f;
    if (o >= 0) { info.recapture = true; info.event = 'recapture'; } else info.event = 'capture';
  }
  return info;
}

function tiebreakEnd(leg, p) {
  const tb = leg.tb;
  tb.rounds[p]++;
  if (tb.pool.some((q) => tb.rounds[q] < tb.stage)) return null;
  const best = Math.max(...tb.pool.map((q) => tb.marks[q]));
  const top = tb.pool.filter((q) => tb.marks[q] === best);
  if (top.length === 1) return { winner: top[0] };
  tb.pool = top;
  tb.stage++;
  top.forEach((q) => { tb.marks[q] = 0; });
  return { event: 'tiebreak' };
}
