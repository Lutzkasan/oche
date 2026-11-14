// Gemeinsame Checkout-Logik für Trainingsspiele mit Checkout (121, Shooting Gallery).
// Vorher stand sie nur in 121. Shooting Gallery braucht dieselbe Regel, deshalb liegt sie hier einmal.
//
// outStep(before, d, out, over): Ergebnis eines Darts auf den Rest before.
//   out:  Finish-Regel wie in X01 ('single', 'double', 'master'). Die Prüfung ist GATE aus x01.js, nicht eine Kopie.
//   over: 'exact' = genau 0. Überworfen, Rest 0 ohne gültigen Finish-Dart oder ein Rest, der sich nicht mehr
//                   checken lässt (1 bei Double/Master Out), ist ein Bust.
//         'under' = 0 oder darunter reicht (ab 0.8.0, Shooting Gallery). Der Dart, der auf 0 oder darunter bringt,
//                   muss die Finish-Regel erfüllen, sonst Bust. Rest 1 bleibt spielbar (D1 bringt auf −1).
//   Bei Bust springt der Rest wie in X01 auf den Stand vor der Aufnahme.
// Ohne out und over gilt Double Out auf genau 0. So rechnen 121 und alle Shooting-Gallery-Spiele bis 0.7.1.
import { FINISH1, GATE } from './x01.js';

export function outStep(before, d, out = 'double', over = 'exact') {
  const after = before - d.s * d.m;
  const fin = GATE[out](d);
  if (over === 'under') {
    return { after, bust: after <= 0 && !fin, check: after <= 0 && fin, atDouble: FINISH1[out].has(before) };
  }
  const bust = after < 0 || (after === 0 && !fin) || (after === 1 && out !== 'single');
  return { after, bust, check: !bust && after === 0, atDouble: FINISH1[out].has(before) };
}

// Leg-Felder für Spiele mit Versuchen: Rest, Stand vor der Aufnahme, Aufnahmen und Darts im Versuch
export const attemptLeg = (n, start) => {
  const fill = (v) => Array(n).fill(v);
  return { target: fill(start), rem: fill(start), turnRem: fill(start), used: fill(0), attemptDarts: fill(0) };
};

// Einen Dart in einem Versuch anwenden. Liefert die Basis-Annotation und ob die Aufnahme jetzt endet.
export function attemptDart(leg, p, d, dartIdx, out, over) {
  if (dartIdx === 0) leg.turnRem[p] = leg.rem[p];
  const before = leg.rem[p];
  leg.attemptDarts[p]++;
  const r = outStep(before, d, out, over);
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
