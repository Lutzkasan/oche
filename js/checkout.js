// Checkout-Vorschläge: Weg mit den wenigsten Darts, bei Gleichstand der Weg mit dem beliebtesten Doppel
// und den sichersten Setup-Darts. Ergebnisse werden je (Rest, Darts, Out-Regel) zwischengespeichert.
import { ALL_DARTS, GATE, value } from './rules/x01.js';
import { dartLabel } from './engine.js';

const DOUBLE_PREF = [20, 16, 8, 18, 12, 10, 4, 25, 14, 6, 2, 19, 17, 15, 13, 11, 9, 7, 5, 3, 1];

function finishCost(d) {
  if (d.m === 2) return DOUBLE_PREF.indexOf(d.s);
  if (d.m === 3) return 30 + (20 - d.s);   // Master Out: Triple als Finish
  return 60 + (d.s === 25 ? 0 : 20 - d.s); // Single Out
}

function setupCost(d) {
  if (d.m === 3) return d.s === 20 ? 0 : d.s === 19 ? 1 : d.s === 18 ? 3 : d.s === 17 ? 4 : d.s >= 15 ? 5 : 8 + (20 - d.s);
  if (d.m === 1) return d.s === 25 ? 7 : 2 + (20 - d.s) / 10;
  return d.s === 25 ? 10 : 15; // Doppel als Setup nur notfalls
}

const cache = new Map();

export function suggestCheckout(rem, dartsLeft, out) {
  const key = `${rem}|${dartsLeft}|${out}`;
  if (cache.has(key)) return cache.get(key);
  let best = null;
  if (rem > 0 && rem <= 180) {
    const finishers = ALL_DARTS.filter(GATE[out]);
    for (let k = 1; k <= dartsLeft && !best; k++) {
      for (const f of finishers) {
        const rest = rem - value(f);
        if (k === 1) {
          if (rest === 0) best = pick(best, [f]);
          continue;
        }
        for (const a of ALL_DARTS) {
          const r2 = rest - value(a);
          if (k === 2) {
            if (r2 === 0) best = pick(best, [a, f]);
            continue;
          }
          if (r2 <= 0) continue;
          for (const b of ALL_DARTS) if (value(b) === r2 && value(b) <= value(a)) best = pick(best, [a, b, f]);
        }
      }
    }
  }
  const res = best ? best.path.map(dartLabel) : null;
  cache.set(key, res);
  return res;
}

function pick(cur, path) {
  const f = path[path.length - 1];
  const cost = finishCost(f) * 4 + path.slice(0, -1).reduce((a, d) => a + setupCost(d), 0);
  return !cur || cost < cur.cost ? { path, cost } : cur;
}
