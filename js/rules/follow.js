// Follow the Leader (darts501, Darts Corner): Ein Dart legt das Zielfeld fest (Zahl und Ring).
// Der Nächste muss genau dieses Feld mit einem seiner drei Darts treffen, sonst verliert er ein Leben.
//   Treffer mit Dart 1 oder 2: Der letzte der übrigen Darts legt das neue Ziel fest. Wer danach mit „Fertig"
//     aufhört, legt mit dem zuletzt geworfenen Dart fest. Ohne weiteren Dart bleibt das Ziel stehen.
//   Treffer mit Dart 3: Der Spieler wirft eine zusätzliche Aufnahme, deren letzter Dart das Ziel festlegt.
//   Ein festlegender Dart daneben kostet ein Leben. Dann legt der Nächste ein neues Ziel fest.
//   Kommt das Ziel zu seinem Setzer zurück (alle anderen haben verfehlt), darf er passen:
//     Er versucht es, verfehlt er, verliert er kein Leben (darts501).
// Wer keine Leben mehr hat, scheidet aus, der Letzte gewinnt.
// Grenze der Eingabe: Single innen und außen sind ein Feld. Darts Corner trennt sie („big single").

const same = (a, b) => a && b && a.s === b.s && a.m === b.m;
export const alive = (leg) => leg.lives.map((l, i) => (l > 0 ? i : -1)).filter((i) => i >= 0);

export const follow = {
  id: 'follow',
  title: () => 'Follow the Leader',
  subtitle: (cfg) => `${cfg.lives} Leben`,
  defaults: { lives: 3 },
  minPlayers: 2,

  initLeg: (cfg, n) => ({ lives: Array(n).fill(cfg.lives), target: null, setter: -1, mode: 'set', hitAt: -1, setDart: null }),

  score: (leg, p) => leg.lives[p],
  active: (leg, p) => leg.lives[p] > 0,

  applyDart(leg, p, d, cfg, dartIdx) {
    if (dartIdx === 0) {
      leg.mode = leg.target ? 'hit' : 'set';
      leg.hitAt = -1;
      leg.setDart = null;
    }
    const info = { pts: 0, marks: 0, bust: false, won: false, target: leg.target, mode: leg.mode, own: leg.setter === p, hit: false };
    if (leg.mode === 'hit' && leg.hitAt < 0) {
      if (same(d, leg.target)) {
        leg.hitAt = dartIdx;
        info.hit = true;
        info.event = 'match';
      }
      return info;
    }
    leg.setDart = { s: d.s, m: d.s ? d.m : 1 };
    info.sets = true;
    return info;
  },

  // Aufhören ist erlaubt, sobald es nichts mehr zu treffen gibt: beim Festlegen oder nach dem Treffer
  canStop: (leg, p, cfg, turn) => turn.darts.length > 0 && turn.darts.length < 3 && (leg.mode === 'set' || leg.hitAt >= 0),

  turnEnd(leg, p, cfg, turn) {
    const lose = () => {
      leg.lives[p]--;
      turn.lifeLost = true;
      const rest = alive(leg);
      return rest.length === 1 ? { winner: rest[0] } : { event: leg.lives[p] ? 'life' : 'out' };
    };
    const setFrom = (dart) => {
      if (!dart.s) { leg.target = null; leg.setter = -1; return lose(); }
      leg.target = dart;
      leg.setter = p;
      return null;
    };
    if (leg.mode === 'set') return setFrom(leg.setDart);
    if (leg.hitAt < 0) return leg.setter === p ? null : lose();
    turn.hitTarget = true;
    if (leg.hitAt === 2) { leg.target = null; leg.setter = p; return { again: true }; }
    if (leg.setDart) return setFrom(leg.setDart);
    leg.setter = p; // getroffen und aufgehört: Das Ziel bleibt, der Werfer gilt als Setzer
    return null;
  },

  line(st, p) {
    const turns = st.turns.filter((t) => t.p === p && t.infos[0]?.mode === 'hit' && !t.infos[0].own);
    const hits = turns.filter((t) => t.hitTarget).length;
    return { darts: st.darts.filter((x) => x.p === p).length, tries: turns.length, hits, hitRate: turns.length ? hits / turns.length : null };
  },
};
