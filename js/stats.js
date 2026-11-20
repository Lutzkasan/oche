// Statistiken entstehen aus denselben Replays wie das Spiel selbst. Neue Kennzahlen gelten damit rückwirkend.
// Je Modus ein Eintrag in STATS: init() legt die Zähler an, add(acc, ctx) zählt ein Spiel, fin(acc) rechnet Quoten.
// Gemeinsam für alle: matches, won, solo, legs, vsLegs, legsWon, darts, history (Verlauf je Match), optional bestLeg.
// Sieg-Wertung nur gegen Gegner (ab 0.7.1): matches, won, vsLegs und legsWon zählen Spiele mit mindestens zwei
// Spielern. Ein Spiel allein hat keinen Gegner, es zählt als solo. Bis 0.7.0 galt der einzige Spieler als Sieger,
// Trainingsmodi zeigten deshalb „12 / 12 gewonnen". legs bleibt die Zahl aller Legs (Nenner für Werte je Leg).
import { replay } from './engine.js';
import { followTry } from './rules/follow.js';

const base = () => ({ matches: 0, won: 0, solo: 0, legs: 0, vsLegs: 0, legsWon: 0, darts: 0, history: [] });
const legKey = (x) => x.setNo + '-' + x.legNo;
const rate = (a, b) => (b ? a / b : null);
const hitsOf = (ctx) => ctx.myDarts.filter((d) => d.hit).length;
const push = (acc, ctx, value) => { if (ctx.finished && value != null && !Number.isNaN(value)) acc.history.push({ at: ctx.g.finishedAt, value, won: ctx.won }); };

// Replays je Spiel zwischenspeichern: Filterleiste und Kennzahlen fragen dieselben Spiele ab.
const cache = new WeakMap();
export function replayCached(g) {
  const c = cache.get(g);
  if (c && c.len === g.darts.length) return c.st;
  const st = replay(g);
  cache.set(g, { len: g.darts.length, st });
  return st;
}

// Hat der Spieler in diesem Spiel mindestens einen eigenen Dart geworfen? Unabhängig von der Wertung.
// Die Spieleliste der Statistik braucht das, um auch nicht gewertete Spiele zum Zurückholen zu zeigen.
export function hasDarts(g, playerId) {
  const p = g.playerIds.indexOf(playerId);
  if (p < 0 || !g.darts.some((d) => !d.stop)) return false;
  return replayCached(g).darts.some((x) => x.p === p);
}

// Zählt ein Spiel für diesen Spieler? Erst mit mindestens einem eigenen Dart, und nur, wenn es nicht von der
// Wertung ausgenommen ist (g.excluded). Filterleiste und Kennzahlen nutzen dieselbe Prüfung. Vorher zählte die
// Filterleiste jedes gestartete Spiel, die Kennzahlen nur Spiele mit Darts. Deshalb erschien ein Modus im Filter,
// ohne dass es etwas zu zeigen gab. Die Ausnahme steht deshalb auch nur hier.
export function hasPlay(g, playerId) {
  return !g.excluded && hasDarts(g, playerId);
}

// Spiele mit Endstand: Wertung ist der Stand am Leg-Ende (legResults.scores)
const ends = () => ({ ...base(), hits: 0, turns: 0, finishedLegs: 0, scoreSum: 0, bestScore: null });
function addEnds(e, ctx) {
  const { st, p } = ctx;
  e.hits += hitsOf(ctx);
  e.turns += ctx.myTurns.length;
  let sum = 0;
  for (const r of st.legResults) {
    sum += r.scores[p];
    e.bestScore = Math.max(e.bestScore ?? -Infinity, r.scores[p]);
  }
  e.finishedLegs += st.legResults.length;
  e.scoreSum += sum;
  push(e, ctx, st.legResults.length ? sum / st.legResults.length : null);
}
const finEnds = (e) => { e.hitRate = rate(e.hits, e.darts); e.avgScore = rate(e.scoreSum, e.finishedLegs); };

// Treffer aufs Ziel als Quote (Around the Clock, Chase the Dragon, Nine Lives, Hare and Hounds, Tic-Tac-Toe)
const hitMode = (extra = {}) => ({
  init: () => ({ ...base(), hits: 0, bestLeg: null, ...(extra.init ? extra.init() : {}) }),
  add(a, ctx) {
    const h = hitsOf(ctx);
    a.hits += h;
    extra.add?.(a, ctx);
    push(a, ctx, ctx.myDarts.length ? (h / ctx.myDarts.length) * 100 : null);
  },
  fin(a) { a.hitRate = rate(a.hits, a.darts); extra.fin?.(a); },
});

// MPR-Spiele (Cricket, Mickey Mouse, Shove Ha'penny)
const mprMode = {
  init: () => ({ ...base(), marks: 0 }),
  add(c, ctx) {
    const marks = ctx.myDarts.reduce((k, d) => k + d.marks, 0);
    c.marks += marks;
    push(c, ctx, (marks / ctx.myDarts.length) * 3);
  },
  fin(c) { c.mpr = c.darts ? (c.marks / c.darts) * 3 : null; },
};

export const STATS = {
  x01: {
    ownDarts: false, // X01 zählt nur Darts abgeschlossener Aufnahmen
    init: () => ({ ...base(), points: 0, f9Pts: 0, f9Darts: 0, atDouble: 0, checkouts: 0, highOut: 0, bestLeg: null, t180: 0, t140: 0, t100: 0, high: 0, doubles: {} }),
    add(x, { st, p, myDarts, ...ctx }) {
      let gPts = 0, gDarts = 0;
      for (const t of st.turns) {
        if (t.p !== p) continue;
        gPts += t.points;
        gDarts += t.darts.length;
        if (t.round < 3) { x.f9Pts += t.points; x.f9Darts += t.darts.length; }
        if (t.points === 180) x.t180++;
        else if (t.points >= 140) x.t140++;
        else if (t.points >= 100) x.t100++;
        x.high = Math.max(x.high, t.points);
        if (t.won) { x.checkouts++; x.highOut = Math.max(x.highOut, t.before); }
      }
      x.points += gPts;
      x.darts += gDarts;
      for (const d of myDarts) {
        if (!d.atDouble) continue;
        x.atDouble++;
        if (st.cfg.out === 'double') {
          const key = d.before === 50 ? 'BULL' : 'D' + d.before / 2;
          const e = (x.doubles[key] ||= { tries: 0, hits: 0 });
          e.tries++;
          if (d.won) e.hits++;
        }
      }
      if (gDarts) push(x, { ...ctx, st, p, myDarts }, (gPts / gDarts) * 3);
    },
    fin(x) {
      x.avg = x.darts ? (x.points / x.darts) * 3 : null;
      x.f9 = x.f9Darts ? (x.f9Pts / x.f9Darts) * 3 : null;
      x.coRate = x.atDouble ? x.checkouts / x.atDouble : null;
    },
  },

  cricket: mprMode,
  mickey: mprMode,
  shove: mprMode,

  atc: hitMode(),
  chase: hitMode(),
  dbl: {
    init: () => ({ ...base(), hits: 0, bestLeg: null }),
    add(a, ctx) {
      const h = hitsOf(ctx);
      a.hits += h;
      push(a, ctx, h ? ctx.myDarts.length / h : null);
    },
    fin(a) { a.perDouble = rate(a.darts, a.hits); a.hitRate = rate(a.hits, a.darts); },
  },
  ninelives: hitMode({
    init: () => ({ lost: 0 }),
    add: (a, ctx) => { a.lost += ctx.myDarts.filter((d) => d.lifeLost).length; },
    fin: (a) => { a.lostPerLeg = rate(a.lost, a.legs); },
  }),
  ttt: hitMode({
    init: () => ({ fields: 0 }),
    add: (a, ctx) => { a.fields += ctx.myDarts.filter((d) => d.claim !== undefined).length; },
    fin: (a) => { a.fieldsPerLeg = rate(a.fields, a.legs); },
  }),
  hare: hitMode({
    init: () => ({ hareLegs: 0, hareWins: 0, houndLegs: 0, houndWins: 0 }),
    add(a, { st, p }) {
      // Hase ist, wer das Leg anwirft. Der Anwurf wechselt mit jedem Leg (Engine: legStarter + 1).
      st.legResults.forEach((r, i) => {
        const isHare = i % st.n === p;
        if (isHare) { a.hareLegs++; if (r.winner === p) a.hareWins++; } else { a.houndLegs++; if (r.winner === p) a.houndWins++; }
      });
    },
  }),

  shanghai: {
    init: () => ({ ...base(), hits: 0, points: 0, turns: 0, shanghais: 0, bestScore: null }),
    add(sh, ctx) {
      const pts = ctx.myTurns.reduce((k, t) => k + t.points, 0);
      sh.points += pts;
      sh.turns += ctx.myTurns.length;
      sh.hits += hitsOf(ctx);
      sh.shanghais += ctx.myDarts.filter((d) => d.event === 'shanghai').length;
      for (const r of ctx.st.legResults) sh.bestScore = Math.max(sh.bestScore ?? -Infinity, r.scores[ctx.p]);
      if (ctx.myTurns.length) push(sh, ctx, pts / ctx.myTurns.length);
    },
    fin(sh) { sh.ppr = rate(sh.points, sh.turns); sh.hitRate = rate(sh.hits, sh.darts); },
  },

  killer: {
    init: () => ({ ...base(), taken: 0, toKiller: 0, killerLegs: 0 }),
    add(k, ctx) {
      k.taken += ctx.myDarts.reduce((m, d) => m + (d.taken || 0), 0);
      // Darts bis zum Killer-Status, je Leg gezählt
      const seen = new Map();
      let gDarts = 0, gLegs = 0;
      for (const d of ctx.myDarts) {
        const key = legKey(d);
        if (seen.get(key) === 'done') continue;
        const cnt = (seen.get(key) || 0) + 1;
        if (d.event === 'killer') { gDarts += cnt; gLegs++; seen.set(key, 'done'); }
        else seen.set(key, cnt);
      }
      k.toKiller += gDarts;
      k.killerLegs += gLegs;
      if (gLegs) push(k, ctx, gDarts / gLegs);
    },
    fin(k) { k.avgToKiller = rate(k.toKiller, k.killerLegs); k.takenPerLeg = rate(k.taken, k.legs); },
  },

  blindkiller: {
    init: () => ({ ...base(), hits: 0, taken: 0, lost: 0 }),
    add(b, ctx) {
      b.hits += hitsOf(ctx);
      const t = ctx.myDarts.reduce((m, d) => m + (d.taken || 0), 0);
      b.taken += t;
      b.lost += ctx.myDarts.reduce((m, d) => m + (d.lost || 0), 0);
      push(b, ctx, ctx.st.legResults.length ? t / ctx.st.legResults.length : null);
    },
    fin(b) { b.hitRate = rate(b.hits, b.darts); b.takenPerLeg = rate(b.taken, b.legs); },
  },

  bobs: {
    init: () => ({ ...ends(), survived: 0 }),
    add(bo, ctx) {
      addEnds(bo, ctx);
      for (const r of ctx.st.legResults) if (!ctx.myDarts.some((d) => d.event === 'out' && legKey(d) === legKey(r))) bo.survived++;
    },
    fin: finEnds,
  },
  halveit: {
    init: () => ({ ...ends(), halved: 0 }),
    add(hv, ctx) { addEnds(hv, ctx); hv.halved += ctx.myDarts.filter((d) => d.halved).length; },
    fin: finEnds,
  },
  bermuda: {
    init: () => ({ ...ends(), halved: 0 }),
    add(hv, ctx) { addEnds(hv, ctx); hv.halved += ctx.myDarts.filter((d) => d.halved).length; },
    fin: finEnds,
  },
  jdc: {
    init: () => ({ ...ends(), shanghais: 0, parts: [0, 0, 0, 0], full: 0 }),
    add(j, ctx) {
      addEnds(j, ctx);
      j.shanghais += ctx.myDarts.filter((d) => d.shanghai).length;
      // Teilsummen nur aus fertigen Legs, damit der Schnitt je Teil zur Zahl der Legs passt
      const fin = new Set(ctx.st.legResults.map(legKey));
      for (const d of ctx.myDarts) if (fin.has(legKey(d))) j.parts[d.part] += d.pts;
      if (ctx.st.cfg.reps === 1) j.full += ctx.st.legResults.length;
    },
    fin(j) { finEnds(j); j.partAvg = j.parts.map((v) => rate(v, j.finishedLegs)); },
  },

  golf: {
    init: () => ({ ...base(), holes: 0, strokes: 0, aces: 0, best: {} }),
    add(gf, ctx) {
      const holes = ctx.myTurns;
      const s = holes.reduce((k, t) => k + t.strokes, 0);
      gf.holes += holes.length;
      gf.strokes += s;
      gf.aces += holes.filter((t) => t.strokes === 1).length;
      const h = ctx.st.cfg.holes;
      for (const r of ctx.st.legResults) gf.best[h] = Math.min(gf.best[h] ?? Infinity, r.scores[ctx.p]);
      push(gf, ctx, holes.length ? s / holes.length : null);
    },
    fin(gf) { gf.perHole = rate(gf.strokes, gf.holes); },
  },

  knockout: {
    init: () => ({ ...base(), turns: 0, points: 0, strikes: 0 }),
    add(k, ctx) {
      const pts = ctx.myTurns.reduce((m, t) => m + t.points, 0);
      k.turns += ctx.myTurns.length;
      k.points += pts;
      k.strikes += ctx.myTurns.filter((t) => t.strike).length;
      if (ctx.myTurns.length) push(k, ctx, pts / ctx.myTurns.length);
    },
    fin(k) { k.ppr = rate(k.points, k.turns); k.strikesPerLeg = rate(k.strikes, k.legs); },
  },

  follow: {
    init: () => ({ ...base(), tries: 0, hits: 0, lost: 0 }),
    add(f, ctx) {
      const tries = ctx.myTurns.filter((t) => followTry(t, ctx.st.cfg));
      const hits = tries.filter((t) => t.hitTarget).length;
      f.tries += tries.length;
      f.hits += hits;
      f.lost += ctx.myTurns.filter((t) => t.lifeLost).length;
      if (tries.length) push(f, ctx, (hits / tries.length) * 100);
    },
    fin(f) { f.hitRate = rate(f.hits, f.tries); f.lostPerLeg = rate(f.lost, f.legs); },
  },

  gotcha: {
    init: () => ({ ...base(), points: 0, turnDarts: 0, kills: 0 }),
    add(gt, ctx) {
      const pts = ctx.myTurns.reduce((m, t) => m + t.points, 0), td = ctx.myTurns.reduce((m, t) => m + t.darts.length, 0);
      gt.points += pts;
      gt.turnDarts += td;
      gt.kills += ctx.myDarts.reduce((m, d) => m + (d.kills?.length || 0), 0);
      if (td) push(gt, ctx, (pts / td) * 3);
    },
    fin(gt) { gt.avg = gt.turnDarts ? (gt.points / gt.turnDarts) * 3 : null; },
  },

  c121: {
    init: () => ({ ...base(), checks: 0, attempts: 0, checkDarts: 0, best: 0 }),
    add(cc, ctx) {
      const checks = ctx.myDarts.filter((d) => d.checkout);
      const att = checks.length + ctx.myDarts.filter((d) => d.fail).length;
      cc.checks += checks.length;
      cc.attempts += att;
      cc.checkDarts += checks.reduce((m, d) => m + d.attemptDarts, 0);
      for (const d of checks) cc.best = Math.max(cc.best, d.target);
      if (att) push(cc, ctx, (checks.length / att) * 100);
    },
    fin(cc) { cc.rate = rate(cc.checks, cc.attempts); cc.dartsPerCheck = rate(cc.checkDarts, cc.checks); },
  },

  gallery: {
    init: () => ({ ...ends(), checks: 0, attempts: 0, checkDarts: 0 }),
    add(ga, ctx) {
      addEnds(ga, ctx);
      const checks = ctx.myDarts.filter((d) => d.checkout);
      ga.checks += checks.length;
      ga.attempts += checks.length + ctx.myDarts.filter((d) => d.fail).length;
      ga.checkDarts += checks.reduce((m, d) => m + d.attemptDarts, 0);
    },
    fin(ga) { finEnds(ga); ga.rate = rate(ga.checks, ga.attempts); ga.dartsPerCheck = rate(ga.checkDarts, ga.checks); },
  },

  baseball: {
    init: () => ({ ...ends(), runs: 0, perfect: 0 }),
    add(b, ctx) {
      addEnds(b, ctx);
      b.runs += ctx.myTurns.reduce((m, t) => m + t.points, 0);
      b.perfect += ctx.myTurns.filter((t) => t.points === 9).length;
    },
    fin(b) { finEnds(b); b.ppi = rate(b.runs, b.turns); },
  },

  fives: {
    init: () => ({ ...base(), turns: 0, points: 0, fives: 0, busts: 0 }),
    add(f, ctx) {
      const pts = ctx.myTurns.reduce((m, t) => m + t.points, 0);
      f.turns += ctx.myTurns.length;
      f.points += pts;
      f.fives += ctx.myTurns.filter((t) => t.infos[2]?.five).length;
      f.busts += ctx.myTurns.filter((t) => t.bust).length;
      if (ctx.myTurns.length) push(f, ctx, pts / ctx.myTurns.length);
    },
    fin(f) { f.ppr = rate(f.points, f.turns); f.fiveRate = rate(f.fives, f.turns); },
  },

  steeples: hitMode({
    init: () => ({ backs: 0 }),
    add: (a, ctx) => { a.backs += ctx.myTurns.filter((t) => t.back).length; },
    fin: (a) => { a.backsPerLeg = rate(a.backs, a.legs); },
  }),

  war: {
    init: () => ({ ...base(), hits: 0, fields: 0, finishedLegs: 0, captures: 0, recaptures: 0 }),
    add(w, ctx) {
      w.hits += hitsOf(ctx);
      w.captures += ctx.myDarts.filter((d) => d.capture !== undefined && !d.recapture).length;
      w.recaptures += ctx.myDarts.filter((d) => d.recapture).length;
      const f = ctx.st.legResults.reduce((m, r) => m + r.scores[ctx.p], 0);
      w.fields += f;
      w.finishedLegs += ctx.st.legResults.length;
      push(w, ctx, ctx.st.legResults.length ? f / ctx.st.legResults.length : null);
    },
    fin(w) { w.hitRate = rate(w.hits, w.darts); w.fieldsPerLeg = rate(w.fields, w.finishedLegs); },
  },

  countup: {
    init: () => ({ ...ends(), points: 0 }),
    add(c, ctx) { addEnds(c, ctx); c.points += ctx.myTurns.reduce((m, t) => m + t.points, 0); },
    fin(c) { finEnds(c); c.ppr = rate(c.points, c.turns); },
  },

  // Runden nach der Vorlage: geschafft oder Leben weg
  highlow: {
    init: () => ({ ...base(), tries: 0, ok: 0, lost: 0 }),
    add(k, ctx) {
      const tries = ctx.myTurns.filter((t) => t.bar !== null && t.bar !== undefined);
      const ok = tries.filter((t) => !t.strike).length;
      k.tries += tries.length;
      k.ok += ok;
      k.lost += tries.length - ok;
      if (tries.length) push(k, ctx, (ok / tries.length) * 100);
    },
    fin(k) { k.rate = rate(k.ok, k.tries); k.lostPerLeg = rate(k.lost, k.legs); },
  },

  // Punkte je Leg aus dem Leg-Ende, höchstes Break aus den Darts, Fouls des Spielers
  snooker: {
    init: () => ({ ...ends(), bestBreak: 0, fouls: 0 }),
    add(sn, ctx) {
      addEnds(sn, ctx);
      for (const d of ctx.myDarts) if (d.brk) sn.bestBreak = Math.max(sn.bestBreak, d.brk);
      sn.fouls += ctx.myDarts.filter((d) => d.foul).length;
    },
    fin(sn) { finEnds(sn); sn.foulsPerLeg = rate(sn.fouls, sn.legs); },
  },

  // Scorer-Summe je Leg aus dem Leg-Ende, Stopper-Darts nur aus fertigen Legs
  scram: {
    init: () => ({ ...base(), scoreSum: 0, finishedLegs: 0, bestScore: null, stopDarts: 0 }),
    add(s, ctx) {
      const fin = new Set(ctx.st.legResults.map(legKey));
      let sum = 0;
      for (const r of ctx.st.legResults) { sum += r.scores[ctx.p]; s.bestScore = Math.max(s.bestScore ?? -Infinity, r.scores[ctx.p]); }
      s.scoreSum += sum;
      s.finishedLegs += ctx.st.legResults.length;
      s.stopDarts += ctx.myDarts.filter((d) => d.role === 'stopper' && fin.has(legKey(d))).length;
      push(s, ctx, ctx.st.legResults.length ? sum / ctx.st.legResults.length : null);
    },
    fin(s) { s.avgScore = rate(s.scoreSum, s.finishedLegs); s.stopPerLeg = rate(s.stopDarts, s.finishedLegs); },
  },
};

export function playerStats(playerId, games) {
  const out = Object.fromEntries(Object.entries(STATS).map(([m, s]) => [m, s.init()]));
  // Trefferbild über alle übergebenen Spiele. Schlüssel 's-m', z. B. '20-3' = T20. Daneben zählt extra.
  const board = { counts: {}, total: 0, miss: 0 };

  for (const g of games) {
    const p = g.playerIds.indexOf(playerId);
    const def = STATS[g.mode];
    if (!def || !hasPlay(g, playerId)) continue;
    const s = out[g.mode];
    const st = replayCached(g);
    const finished = g.status === 'finished';
    const solo = g.playerIds.length === 1;
    const won = solo ? null : st.winner === p; // null = ohne Gegner, weder Sieg noch Niederlage
    if (finished) {
      if (solo) s.solo++;
      else { s.matches++; if (won) s.won++; }
    }
    for (const r of st.legResults) {
      s.legs++;
      if (!solo) s.vsLegs++;
      if (r.winner === p) {
        if (!solo) s.legsWon++;
        if ('bestLeg' in s && (s.bestLeg === null || r.darts[p] < s.bestLeg)) s.bestLeg = r.darts[p];
      }
    }
    const myDarts = st.darts.filter((d) => d.p === p);
    if (def.ownDarts !== false) s.darts += myDarts.length;
    for (const { d } of myDarts) {
      board.total++;
      if (d.s === 0) board.miss++;
      else board.counts[d.s + '-' + d.m] = (board.counts[d.s + '-' + d.m] || 0) + 1;
    }
    def.add(s, { g, st, p, myDarts, myTurns: st.turns.filter((t) => t.p === p), finished, won });
  }

  for (const [m, def] of Object.entries(STATS)) {
    def.fin(out[m]);
    out[m].history.sort((u, v) => u.at - v.at);
  }
  return { ...out, board };
}

// Zeitpunkt, zu dem ein Spiel für Zeitraum-Filter zählt: Ende, sonst letzter Wurf.
// updatedAt taugt dafür nicht: Es ist der Versionsstand für den Import und ändert sich auch, wenn ein Spiel
// von der Wertung ausgenommen wird.
export const gameTime = (g) => g.finishedAt || g.darts?.at(-1)?.t || g.createdAt || g.updatedAt || 0;

// Kalendertag 'JJJJ-MM-TT' als Zeitspanne in Ortszeit: Beginn des Tages bis Ende des Tages
const dayStart = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d).getTime(); };
export function rangeOf(filter, now = Date.now()) {
  if (filter.custom) {
    const from = filter.from ? dayStart(filter.from) : -Infinity;
    const to = filter.to ? dayStart(filter.to) + 864e5 - 1 : Infinity;
    return from <= to ? [from, to] : [to - 864e5 + 1, from + 864e5 - 1]; // vertauschte Eingabe gilt umgekehrt
  }
  return [filter.days ? now - filter.days * 864e5 : -Infinity, Infinity];
}

// filter: { days: Zahl oder null, custom: true mit from/to ('JJJJ-MM-TT', beide Tage eingeschlossen),
//           mode: 'all' | Modus-ID | X01-Startwert ('301', '501', …) }
export function filterGames(games, filter, now = Date.now()) {
  const [from, to] = rangeOf(filter, now);
  return games.filter((g) => {
    const t = gameTime(g);
    if (t < from || t > to) return false;
    if (filter.mode === 'all' || !filter.mode) return true;
    if (/^\d+$/.test(filter.mode)) return g.mode === 'x01' && String(g.config.start) === filter.mode;
    return g.mode === filter.mode;
  });
}

// Gleitender Mittelwert über die letzten n Werte (am Anfang über die vorhandenen)
export function rolling(values, n) {
  return values.map((_, i) => {
    const w = values.slice(Math.max(0, i - n + 1), i + 1);
    return w.reduce((a, v) => a + v, 0) / w.length;
  });
}
