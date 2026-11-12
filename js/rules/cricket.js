// Felder-Spiele mit Marks: Cricket, Mickey Mouse, Shove Ha'penny.
// Jedes Feld (row) braucht NEED Marks. Ein Dart bringt row.hit(d) Marks (meist S = 1, D = 2, T = 3).
// Die gemeinsame Logik steht in applyMarks. Die drei Regeln unterscheiden sich nur in Feldliste,
// Reihenfolge, Umgang mit überzähligen Marks und Siegbedingung.
//
// Cricket: 15–20 und Bull. Mit Zufallszahlen (DARTSLIVE „Random Cricket"): sechs ausgeloste Zahlen und Bull,
//   sonst wie Standard Cricket. ANNAHME: Ausgelost wird aus 1–20, DARTSLIVE nennt keinen Bereich. Die Zahlen
//   stehen in config.numbers, beim Start einmal ausgelost, damit das Replay deterministisch bleibt.
//   standard:  Überzählige Marks zählen Punkte für dich, solange ein Gegner das Feld offen hat. Höchste Punktzahl gewinnt.
//   cutthroat: Überzählige Marks zählen für alle offenen Gegner. Niedrigste Punktzahl gewinnt.
// Mickey Mouse: 20 bis 12 und Bull, optional jedes Doppel und jedes Triple als eigene Felder.
//   Quellen: Darts Corner (der Reihe nach, ohne Punkte), darts501 (beliebige Reihenfolge, Doppel/Triple-Felder,
//   Variante mit Punkten). Alles drei ist deshalb Option.
// Shove Ha'penny: 1 bis 9, optional Bull (darts501 ja, World Dolf Federation nein). Überzählige Marks gehen
//   an einen Gegner, der das Feld noch braucht (beide Quellen). Wer zuerst alles zu hat, gewinnt.

export const NEED = 3;

const numRow = (n) => ({ key: String(n), label: String(n), hit: (d) => (d.s === n ? d.m : 0), value: n });
const BULL = { key: 'B', label: 'Bull', hit: (d) => (d.s === 25 ? d.m : 0), value: 25 };
const BULL_FLAT = { key: 'B', label: 'Bull', hit: (d) => (d.s === 25 ? 1 : 0), value: 25 }; // innen und außen gleich
const DBL = { key: 'D', label: 'D', hit: (d) => (d.s >= 1 && d.s <= 20 && d.m === 2 ? 1 : 0), value: 0 };
const TPL = { key: 'T', label: 'T', hit: (d) => (d.m === 3 ? 1 : 0), value: 0 };
const range = (a, b) => Array.from({ length: Math.abs(b - a) + 1 }, (_, i) => (a > b ? a - i : a + i));

export const CRICKET_ROWS = [...range(20, 15).map(numRow), BULL];
// Feldliste je Spiel: Zufallszahlen absteigend wie die Standardfelder, sonst 15–20
export const cricketRows = (cfg) => (cfg.numbers ? [...cfg.numbers].sort((a, b) => b - a).map(numRow).concat(BULL) : CRICKET_ROWS);
export function drawCricketNumbers(rnd = Math.random) {
  const pool = range(1, 20);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, 6).sort((a, b) => b - a);
}
export const mickeyRows = (cfg) => [...range(20, 12).map(numRow), ...(cfg.dt ? [DBL, TPL] : []), BULL];
export const shoveRows = (cfg) => [...range(1, 9).map(numRow), ...(cfg.bull ? [BULL_FLAT] : [])];

export const initMarks = (rows, n) => ({
  marks: Array.from({ length: n }, () => Object.fromEntries(rows.map((r) => [r.key, 0]))),
  score: Array(n).fill(0),
});

export const closedAll = (leg, rows, p) => rows.every((r) => leg.marks[p][r.key] >= NEED);

// Wählt das Feld für einen Dart.
// ordered: nur das erste noch offene Feld zählt.
// Sonst: das erste Feld, das den Dart annimmt und für den Werfer noch offen ist, ersatzweise das erste,
// das ihn annimmt (dann zählen nur überzählige Marks). Mickey Mouse: Ein D20 schließt damit zuerst die 20
// und geht erst danach auf das Doppel-Feld (darts501 lässt die Wahl, die Eingabe kennt keine).
function pickRow(leg, rows, p, d, ordered) {
  if (ordered) {
    const r = rows.find((x) => leg.marks[p][x.key] < NEED);
    return r && r.hit(d) ? r : null;
  }
  const take = rows.filter((r) => r.hit(d) > 0);
  return take.find((r) => leg.marks[p][r.key] < NEED) || take[0] || null;
}

// o.points: 'none' | 'standard' | 'cutthroat'   o.surplus: 'points' | 'gift'   o.ordered: bool
export function applyMarks(leg, p, d, rows, o) {
  const n = leg.score.length;
  const info = { pts: 0, marks: 0, bust: false, won: false, row: null };
  const r = d.s > 0 ? pickRow(leg, rows, p, d, o.ordered) : null;
  if (!r) return info;
  const h = r.hit(d);
  const before = leg.marks[p][r.key];
  const closing = Math.min(NEED - before, h);
  const extra = h - closing;
  leg.marks[p][r.key] = before + closing;
  info.row = r.key;
  info.marks = closing;
  if (extra > 0 && o.surplus === 'gift') {
    // An die Gegner in Wurfreihenfolge, die das Feld noch brauchen. Was keiner braucht, verfällt.
    let left = extra;
    for (let k = 1; k < n && left > 0; k++) {
      const q = (p + k) % n;
      const give = Math.min(NEED - leg.marks[q][r.key], left);
      if (give <= 0) continue;
      leg.marks[q][r.key] += give;
      left -= give;
      info.gift = (info.gift || 0) + give;
    }
  } else if (extra > 0 && o.points !== 'none' && r.value) {
    const open = [];
    for (let q = 0; q < n; q++) if (q !== p && leg.marks[q][r.key] < NEED) open.push(q);
    if (open.length) {
      const pts = extra * r.value;
      if (o.points === 'cutthroat') open.forEach((q) => (leg.score[q] += pts));
      else leg.score[p] += pts;
      info.pts = pts;
      info.marks += extra;
    }
  }
  if (closedAll(leg, rows, p)) {
    const others = leg.score.filter((_, i) => i !== p);
    info.won = o.points === 'none' || others.length === 0 ||
      (o.points === 'cutthroat' ? leg.score[p] <= Math.min(...others) : leg.score[p] >= Math.max(...others));
  }
  return info;
}

// Marks pro Runde über alle Darts des Matches, die laufende Aufnahme eingeschlossen
function mprLine(st, p) {
  const darts = st.darts.filter((x) => x.p === p);
  const marks = darts.reduce((a, x) => a + x.marks, 0);
  return { darts: darts.length, mpr: darts.length ? (marks / darts.length) * 3 : 0 };
}

export const cricket = {
  id: 'cricket',
  title: () => 'Cricket',
  subtitle: (cfg) => (cfg.variant === 'cutthroat' ? 'Cut-Throat' : 'Standard') + (cfg.numbers ? ' · Zufall ' + cfg.numbers.join(' ') : ''),
  defaults: { variant: 'standard' },
  rows: cricketRows,
  initLeg: (cfg, n) => initMarks(cricketRows(cfg), n),
  score: (leg, p) => leg.score[p],
  applyDart: (leg, p, d, cfg) => applyMarks(leg, p, d, cricketRows(cfg), { points: cfg.variant === 'cutthroat' ? 'cutthroat' : 'standard' }),
  line: mprLine,
};

export const mickey = {
  id: 'mickey',
  title: () => 'Mickey Mouse',
  subtitle: (cfg) => [cfg.dt ? 'mit Doppel/Triple' : '20–12 + Bull', cfg.ordered ? 'der Reihe nach' : '', cfg.points ? 'mit Punkten' : ''].filter(Boolean).join(' · '),
  defaults: { dt: true, ordered: false, points: false },
  rows: mickeyRows,
  initLeg: (cfg, n) => initMarks(mickeyRows(cfg), n),
  score: (leg, p) => leg.score[p],
  applyDart: (leg, p, d, cfg) => applyMarks(leg, p, d, mickeyRows(cfg), { ordered: cfg.ordered, points: cfg.points ? 'standard' : 'none' }),
  line: mprLine,
};

export const shove = {
  id: 'shove',
  title: () => "Shove Ha'penny",
  subtitle: (cfg) => (cfg.bull ? '1–9 + Bull' : '1–9'),
  defaults: { bull: true },
  rows: shoveRows,
  initLeg: (cfg, n) => initMarks(shoveRows(cfg), n),
  score: (leg, p) => shoveRows({ bull: true }).reduce((a, r) => a + Math.min(leg.marks[p][r.key] ?? 0, NEED), 0),
  applyDart: (leg, p, d, cfg) => applyMarks(leg, p, d, shoveRows(cfg), { surplus: 'gift', points: 'none' }),
  // Ein Geschenk kann einen Gegner fertig machen. Schließt der Werfer in derselben Aufnahme selbst alles,
  // hat er schon über won gewonnen (World Dolf Federation: der aktive Werfer gewinnt).
  turnEnd(leg, p, cfg) {
    const rows = shoveRows(cfg), n = leg.score.length;
    for (let k = 1; k < n; k++) {
      const q = (p + k) % n;
      if (closedAll(leg, rows, q)) return { winner: q };
    }
    return null;
  },
  line: mprLine,
};
