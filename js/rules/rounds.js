// Gemeinsame Auswertung für Spiele mit fester Rundenzahl und Stechen: Shanghai, Bob's 27, Halve-It,
// Bermuda Triangle, 121, Golf, JDC Challenge, Shooting Gallery.
//
// Felder im Leg:
//   rounds[p]   abgeschlossene Runden (bei 121: Versuche) je Spieler
//   stage       Runde, nach der ausgewertet wird. Im Stechen wächst sie um eins.
//   contenders  null = alle, sonst die Spieler im Stechen
//   out[p]      ausgeschieden (Bob's 27). Gilt im Stechen nicht, dort entscheidet nur die Wertung.

export const roundsLeg = (n, stage) => ({
  rounds: Array(n).fill(0),
  stage,
  contenders: null,
  out: Array(n).fill(false),
});

// Wirft p noch? Wer fertig oder ausgeschieden ist, überspringt die Engine.
export function roundActive(leg, p) {
  if (leg.contenders) return leg.contenders.includes(p) && leg.rounds[p] < leg.stage;
  return !leg.out[p] && leg.rounds[p] < leg.stage;
}

const cmp = (a, b) => {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
};

// Wertet aus, sobald niemand mehr werfen muss. rank(q) liefert eine Zahlenliste, größer ist besser,
// verglichen von vorn nach hinten. Mehrere Beste → Stechen: nur sie werfen eine weitere Runde.
// Die Wertung muss für alle Gleichplatzierten dieselbe Rundenzahl ergeben (bei Bob's 27 steht die
// Rundenzahl deshalb vorn in der Wertung), sonst passt die neue stage nicht zu allen.
// Spiele, in denen weniger besser ist (Golf), negieren ihren Wert in rank().
export function settle(leg, rank) {
  const pool = leg.contenders || leg.rounds.map((_, i) => i);
  if (pool.some((q) => roundActive(leg, q))) return null;
  const ranks = pool.map((q) => [q, rank(q)]);
  const best = ranks.reduce((m, r) => (cmp(r[1], m) > 0 ? r[1] : m), ranks[0][1]);
  const top = ranks.filter((r) => cmp(r[1], best) === 0).map((r) => r[0]);
  if (top.length === 1) return { winner: top[0] };
  leg.contenders = top;
  leg.stage = leg.rounds[top[0]] + 1;
  return { event: 'tiebreak' };
}
