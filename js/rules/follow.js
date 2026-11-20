// Follow the Leader: Ein Dart legt das Zielfeld fest (Zahl und Ring).
// Der Nächste muss genau dieses Feld mit einem seiner drei Darts treffen, sonst verliert er ein Leben.
// Zwei Arten festzulegen (cfg.set):
// 'first' (Kneipenregel, Vorgabe des Nutzers, Standard ab 0.6.1): Der erste Treffer legt fest, die Runde endet damit.
//   Ziel ist auch hier das genaue Feld (Nutzer bestätigt: T20 festgelegt, nur T20 zählt).
//   Daneben legt nichts fest. Wer das Ziel trifft und noch Darts hat, legt mit seinem nächsten Treffer neu fest.
//   Trifft er das Ziel mit dem letzten Dart oder danach nur daneben, bleibt das Ziel stehen.
//   ANNAHME: Wirft der Setzer zu Beginn nur daneben, gibt es kein Ziel und kein Leben weniger.
//   Der Nächste legt fest. Der Nutzer hat diesen Fall nicht beschrieben.
// fehlt (Spiele vor 0.6.1) oder 'last' (darts501, Darts Corner):
//   Treffer mit Dart 1 oder 2: Der letzte der übrigen Darts legt das neue Ziel fest. Wer danach mit „Fertig"
//     aufhört, legt mit dem zuletzt geworfenen Dart fest. Ohne weiteren Dart bleibt das Ziel stehen.
//   Treffer mit Dart 3: Der Spieler wirft eine zusätzliche Aufnahme, deren letzter Dart das Ziel festlegt.
//   Ein festlegender Dart daneben kostet ein Leben. Dann legt der Nächste ein neues Ziel fest.
//   Kommt das Ziel zu seinem Setzer zurück (alle anderen haben verfehlt), darf er passen:
//     Er versucht es, verfehlt er, verliert er kein Leben (darts501).
// Passen (beide Arten, ab 0.8.1): Kommt das Ziel zu seinem Setzer zurück, darf er es versuchen oder passen
//   (darts501: „pass on their throw or try to hit it"). Bis 0.8.0 gab es dafür keine Taste: Die Anzeige bot
//   „treffen oder passen" an, „Fertig" war bei „erster Treffer" ausgeblendet und verlangte sonst einen Dart.
//   Jetzt erlaubt canStop dem Setzer das Aufhören vor dem ersten Dart und nach Fehlwürfen. Die Runde endet ohne
//   Leben weniger, das Ziel bleibt stehen, der Nächste muss es treffen. Ein Stopp ohne Dart war bis 0.8.0 nicht
//   möglich, alte Spiele enthalten keinen. Eine Regelversion braucht es deshalb nicht.
// Ohne Passen (cfg.pass === false, ab 0.9.0, Wunsch des Nutzers): Kommt das eigene Ziel zurück, muss der Setzer
//   werfen wie alle anderen. Verfehlt er, verliert er ein Leben, das Ziel bleibt stehen, bis es jemand trifft.
//   Keine Taste „Passen“. Fehlt pass (Spiele bis 0.8.1), ist Passen erlaubt wie bisher.
// Wer keine Leben mehr hat, scheidet aus, der Letzte gewinnt.
// Grenze der Eingabe: Single innen und außen sind ein Feld. Darts Corner trennt sie („big single").

const same = (a, b) => a && b && a.s === b.s && a.m === b.m;
export const passAllowed = (cfg) => cfg.pass !== false;
// Eigenes Ziel kam zurück und ist in dieser Runde noch nicht getroffen. Vor dem ersten Dart ist leg.mode noch
// der Stand der vorigen Runde, deshalb zählt dort nur das Ziel.
export const canPass = (leg, p, turn, cfg) => passAllowed(cfg) && Boolean(leg.target) && leg.setter === p
  && (turn.darts.length === 0 || (leg.mode === 'hit' && leg.hitAt < 0));
export const followTry = (t, cfg) => t.infos[0]?.mode === 'hit' && (!t.infos[0].own || !passAllowed(cfg));
export const alive = (leg) => leg.lives.map((l, i) => (l > 0 ? i : -1)).filter((i) => i >= 0);

export const follow = {
  id: 'follow',
  title: () => 'Follow the Leader',
  subtitle: (cfg) => `${cfg.lives} Leben${cfg.set === 'first' ? '' : ' · letzter Dart legt fest'}${passAllowed(cfg) ? '' : ' · ohne Passen'}`,
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
    if (cfg.set === 'first') {
      if (!d.s) return info; // daneben legt nichts fest
      leg.setDart = { s: d.s, m: d.m };
      info.sets = true;
      info.endTurn = true;
      return info;
    }
    leg.setDart = { s: d.s, m: d.s ? d.m : 1 };
    info.sets = true;
    return info;
  },

  // Aufhören ist erlaubt, sobald es nichts mehr zu treffen gibt: beim Festlegen oder nach dem Treffer.
  // Bei „erster Treffer" endet die Runde mit dem Festlegen von selbst, dort gibt es nur das Passen.
  // „erster Treffer“ ohne Passen kennt kein Aufhören, die Taste entfällt.
  stops: (cfg) => cfg.set !== 'first' || passAllowed(cfg),
  canStop: (leg, p, cfg, turn) => turn.darts.length < 3 && (canPass(leg, p, turn, cfg)
    || (cfg.set !== 'first' && turn.darts.length > 0 && (leg.mode === 'set' || leg.hitAt >= 0))),

  turnEnd(leg, p, cfg, turn) {
    // Gepasst vor dem ersten Dart: leg.mode und hitAt stammen noch aus der vorigen Runde, nichts ändert sich
    if (!turn.darts.length) return null;
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
    if (cfg.set === 'first') {
      if (leg.mode === 'set') {
        if (leg.setDart) { leg.target = leg.setDart; leg.setter = p; }
        return null;
      }
      if (leg.hitAt < 0) return leg.setter === p && passAllowed(cfg) ? null : lose();
      turn.hitTarget = true;
      if (leg.setDart) leg.target = leg.setDart; // sonst bleibt das Ziel stehen
      leg.setter = p;
      return null;
    }
    if (leg.mode === 'set') return setFrom(leg.setDart);
    if (leg.hitAt < 0) return leg.setter === p && passAllowed(cfg) ? null : lose();
    turn.hitTarget = true;
    if (leg.hitAt === 2) { leg.target = null; leg.setter = p; return { again: true }; }
    if (leg.setDart) return setFrom(leg.setDart);
    leg.setter = p; // getroffen und aufgehört: Das Ziel bleibt, der Werfer gilt als Setzer
    return null;
  },

  // Versuche aufs Ziel. Das eigene Ziel zählt nur ohne Passen mit, dort ist es ein Pflichtversuch.
  line(st, p) {
    const turns = st.turns.filter((t) => t.p === p && followTry(t, st.cfg));
    const hits = turns.filter((t) => t.hitTarget).length;
    return { darts: st.darts.filter((x) => x.p === p).length, tries: turns.length, hits, hitRate: turns.length ? hits / turns.length : null };
  },
};
