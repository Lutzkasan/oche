// Gemeinsame Checkout-Logik für Trainingsspiele mit Double Out (121, Shooting Gallery).
// Vorher stand sie nur in 121. Shooting Gallery braucht dieselbe Regel, deshalb liegt sie hier einmal.
//
// outStep(before, d): Ergebnis eines Darts auf den Rest before.
//   bust:  Überworfen, Rest 1 oder 0 ohne Doppel. Der Rest springt wie in X01 auf den Stand vor der Aufnahme.
//   check: genau 0 mit Doppel (Bull zählt als Doppel).
import { FINISH1 } from './x01.js';

export function outStep(before, d) {
  const after = before - d.s * d.m;
  const bust = after < 0 || after === 1 || (after === 0 && d.m !== 2);
  return { after, bust, check: !bust && after === 0, atDouble: FINISH1.double.has(before) };
}

// Leg-Felder für Spiele mit Versuchen: Rest, Stand vor der Aufnahme, Aufnahmen und Darts im Versuch
export const attemptLeg = (n, start) => {
  const fill = (v) => Array(n).fill(v);
  return { target: fill(start), rem: fill(start), turnRem: fill(start), used: fill(0), attemptDarts: fill(0) };
};

// Einen Dart in einem Versuch anwenden. Liefert die Basis-Annotation und ob die Aufnahme jetzt endet.
export function attemptDart(leg, p, d, dartIdx) {
  if (dartIdx === 0) leg.turnRem[p] = leg.rem[p];
  const before = leg.rem[p];
  leg.attemptDarts[p]++;
  const r = outStep(before, d);
  const info = { pts: 0, marks: 0, bust: false, won: false, before, target: leg.target[p], atDouble: r.atDouble };
  if (r.bust) {
    leg.rem[p] = leg.turnRem[p];
    info.bust = true;
  } else {
    leg.rem[p] = r.after;
    info.pts = d.s * d.m;
  }
  // Die Aufnahme endet hier genau dann, wenn die Engine sie beendet: Bust, Check (endTurn) oder dritter Dart
  const turnOver = r.check || r.bust || dartIdx === 2;
  if (turnOver) leg.used[p]++;
  return { info, check: r.check, turnOver };
}

// Nächster Versuch für p mit neuem Ziel
export function nextAttempt(leg, p, target) {
  leg.target[p] = target;
  leg.rem[p] = target;
  leg.used[p] = 0;
  leg.attemptDarts[p] = 0;
  leg.rounds[p]++;
}
