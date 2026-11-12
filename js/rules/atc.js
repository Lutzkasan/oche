// Zielfolgen-Spiele: Around the Clock, Doppel-Training, Chase the Dragon.
//
// Around the Clock: Jeder Spieler trifft die Zahlen 1 bis 20 der Reihe nach, optional danach Bull.
// Wer zuerst durch ist, gewinnt das Leg.
// zone: any    = jedes Feld der Zielzahl zählt
//       skip   = jedes Feld zählt, Double springt 2 und Triple 3 Ziele weiter (nie über Bull hinweg)
//       double = nur das Doppel zählt
//       triple = nur das Triple zählt, Bull dann als Bull (50)
// bull: true nimmt Bull als Ziel dazu.
// order (Around the Clock, dartcounter.net): asc = 1 bis 20, Bull am Ende. desc = Bull zuerst, dann 20 bis 1.
//       random = alle Ziele einschließlich Bull in ausgeloster Reihenfolge.
// targets: ausgeschriebene Zielfolge (absteigend, zufällig), beim Start festgelegt, damit das Replay
//       deterministisch bleibt. Ohne targets gilt aufsteigend (so speichern ältere Spiele).
//
// Doppel-Training: Around the Clock mit zone 'double' und wählbarer Reihenfolge. Eigener Modus,
// damit Menü und Statistik ihn getrennt führen. Kennzahl: Darts je Doppel.
//
// Chase the Dragon (Darts Corner, darts501): T10 bis T20 der Reihe nach, dann 25, dann Bull.
// Wer zuerst durch ist, gewinnt. laps: 3 = „Three-headed Dragon" (darts501), die Folge dreimal.

const ZONE = {
  any: { label: 'Jedes Feld', ok: () => true },
  skip: { label: 'D/T springt', ok: () => true },
  double: { label: 'Nur Doppel', ok: (d) => d.m === 2 },
  triple: { label: 'Nur Triple', ok: (d) => d.m === 3 || (d.s === 25 && d.m === 2) },
};

export const atcTargets = (cfg) => {
  if (cfg.targets) return cfg.targets;
  const t = Array.from({ length: 20 }, (_, i) => i + 1);
  if (cfg.bull) t.push(25);
  return t;
};

// Feld, das der Spieler als Nächstes treffen muss (null = fertig)
export const atcTarget = (leg, p, cfg) => atcTargets(cfg)[leg.pos[p]] ?? null;

// Reihenfolge fürs Doppel-Training. Bull steht immer am Ende.
export function dblTargets(order, bull, rnd = Math.random) {
  const t = Array.from({ length: 20 }, (_, i) => i + 1);
  if (order === 'desc') t.reverse();
  if (order === 'random') {
    for (let i = t.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [t[i], t[j]] = [t[j], t[i]];
    }
  }
  if (bull) t.push(25);
  return t;
}

// Zielfolge für Around the Clock nach Reihenfolge. Aufsteigend braucht keine ausgeschriebene Folge.
export function atcOrder(order, bull, rnd = Math.random) {
  if (order === 'desc') return [...(bull ? [25] : []), ...Array.from({ length: 20 }, (_, i) => 20 - i)];
  if (order !== 'random') return null;
  const t = Array.from({ length: 20 }, (_, i) => i + 1);
  if (bull) t.push(25);
  for (let i = t.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [t[i], t[j]] = [t[j], t[i]];
  }
  return t;
}

const posLeg = (cfg, n) => ({ pos: Array(n).fill(0) });

// Trefferquote: Anteil der Darts, die das jeweils angepeilte Ziel getroffen haben
function hitLine(st, p) {
  const darts = st.darts.filter((x) => x.p === p);
  const hits = darts.filter((x) => x.hit).length;
  return { darts: darts.length, hits, hitRate: darts.length ? hits / darts.length : null };
}

export const atc = {
  id: 'atc',
  title: () => 'Around the Clock',
  subtitle: (cfg) => ZONE[cfg.zone].label + (cfg.bull ? ' · mit Bull' : '') + (cfg.order === 'desc' ? ' · absteigend' : cfg.order === 'random' ? ' · zufällig' : ''),
  defaults: { zone: 'any', bull: false },

  initLeg: posLeg,

  // Anzahl erledigter Ziele
  score: (leg, p) => leg.pos[p],

  applyDart(leg, p, d, cfg) {
    const targets = atcTargets(cfg);
    const target = targets[leg.pos[p]];
    const info = { pts: 0, marks: 0, bust: false, won: false, target, hit: false, adv: 0 };
    if (d.s !== target || !ZONE[cfg.zone].ok(d)) return info;
    // Sprünge enden spätestens vor Bull, Bull muss selbst getroffen werden. Bull kann je nach Reihenfolge
    // an jeder Stelle stehen, deshalb zählt der Abstand zum nächsten Bull, nicht das Ende der Folge.
    const pos = leg.pos[p];
    let adv = 1;
    if (cfg.zone === 'skip' && target !== 25) {
      while (adv < d.m && pos + adv < targets.length && targets[pos + adv] !== 25) adv++;
    }
    leg.pos[p] += adv;
    info.hit = true;
    info.adv = adv;
    info.won = leg.pos[p] === targets.length;
    return info;
  },

  line: hitLine,
};

const ORDER = { asc: 'aufsteigend', desc: 'absteigend', random: 'zufällig' };

export const dbl = {
  ...atc,
  id: 'dbl',
  title: () => 'Doppel-Training',
  subtitle: (cfg) => ORDER[cfg.order] + (cfg.bull ? ' · mit Bull' : ''),
  defaults: { zone: 'double', order: 'asc', bull: false },
};

// ---------- Chase the Dragon ----------
const T = (s) => ({ s, m: 3 });
export const DRAGON = [...Array.from({ length: 11 }, (_, i) => T(10 + i)), { s: 25, m: 1 }, { s: 25, m: 2 }];
export const chaseTargets = (cfg) => Array.from({ length: cfg.laps || 1 }, () => DRAGON).flat();
export const chaseLabel = (t) => (t.s === 25 ? (t.m === 2 ? 'Bull' : '25') : 'T' + t.s);

export const chase = {
  id: 'chase',
  title: () => 'Chase the Dragon',
  subtitle: (cfg) => (cfg.laps > 1 ? 'Three-headed Dragon' : 'T10–T20, 25, Bull'),
  defaults: { laps: 1 },

  initLeg: posLeg,
  score: (leg, p) => leg.pos[p],

  applyDart(leg, p, d, cfg) {
    const seq = chaseTargets(cfg);
    const t = seq[leg.pos[p]];
    const info = { pts: 0, marks: 0, bust: false, won: false, target: t, hit: false, adv: 0 };
    if (!t || d.s !== t.s || d.m !== t.m) return info;
    leg.pos[p]++;
    info.hit = true;
    info.adv = 1;
    info.won = leg.pos[p] === seq.length;
    return info;
  },

  line: hitLine,
};
