// SVG-Grafiken für die Statistik: Verlauf als Liniendiagramm, Trefferbild als Dartscheibe.
// Reine String-Funktionen ohne Bibliothek, damit die App offline und ohne Build-Schritt läuft.

const f = (v, d) => v.toFixed(d).replace('.', ',');
const day = (ts) => new Date(ts).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });

// ---------- Verlauf ----------
function niceStep(range) {
  const raw = range / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => raw <= s);
}

// entries: [{at, value, won}] chronologisch, roll: geglätteter Wert je Eintrag
export function lineChart(entries, roll, { decimals = 1, window = 5 } = {}) {
  const W = 640, H = 230, L = 46, R = 14, T = 12, B = 30;
  const n = entries.length;
  const vals = [...entries.map((e) => e.value), ...roll];
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (hi - lo < 1e-9) { lo -= 1; hi += 1; }
  const step = niceStep(hi - lo);
  lo = Math.floor(lo / step) * step;
  hi = Math.ceil(hi / step) * step;
  const x = (i) => (n === 1 ? L + (W - L - R) / 2 : L + (i * (W - L - R)) / (n - 1));
  const y = (v) => T + ((hi - v) * (H - T - B)) / (hi - lo);

  const ticks = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(v);
  const grid = ticks.map((v) => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="grid"/>
    <text x="${L - 8}" y="${y(v) + 4}" text-anchor="end" class="ax">${f(v, step < 1 ? 1 : 0)}</text>`).join('');

  const xi = n >= 5 ? [0, Math.floor((n - 1) / 2), n - 1] : n > 1 ? [0, n - 1] : [0];
  const xlab = xi.map((i, k) => `<text x="${x(i)}" y="${H - 8}" class="ax" text-anchor="${n === 1 ? 'middle' : k === 0 ? 'start' : k === xi.length - 1 ? 'end' : 'middle'}">${day(entries[i].at)}</text>`).join('');

  // Viele Matches: Einzelwerte als dünne Linie statt Punkte, sonst überdecken sich die Marker
  const dense = n > 60;
  const raw = dense
    ? `<polyline class="raw" points="${entries.map((e, i) => `${x(i)},${y(e.value)}`).join(' ')}"/>`
    : entries.map((e, i) => `<circle cx="${x(i)}" cy="${y(e.value)}" r="4.5" class="pt ${e.won ? 'won' : 'lost'}"/>`).join('');
  const trend = n > 1 ? `<polyline class="trend" points="${roll.map((v, i) => `${x(i)},${y(v)}`).join(' ')}"/>` : '';

  const data = { x: entries.map((_, i) => x(i)), y: entries.map((e) => y(e.value)), v: entries.map((e) => f(e.value, decimals)),
    r: roll.map((v) => f(v, decimals)), at: entries.map((e) => day(e.at)), won: entries.map((e) => e.won), W, T, B, H };
  return `<figure class="lchart">
    <div class="readout" aria-live="polite"></div>
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Verlauf über ${n} Matches" data-pts='${JSON.stringify(data)}'>
      ${grid}${xlab}${raw}${trend}
      <line class="cross" x1="0" x2="0" y1="${T}" y2="${H - B}" visibility="hidden"/>
      <circle class="sel" r="7" visibility="hidden"/>
      <rect class="hit" x="${L - 10}" y="0" width="${W - L - R + 20}" height="${H}"/>
    </svg>
    <figcaption class="legend">
      <span><svg viewBox="0 0 24 10"><line x1="1" x2="23" y1="5" y2="5" class="trend"/></svg>Schnitt der letzten ${window}</span>
      ${dense ? '<span><svg viewBox="0 0 24 10"><line x1="1" x2="23" y1="5" y2="5" class="raw"/></svg>einzelnes Match</span>'
        : '<span><svg viewBox="0 0 12 12"><circle cx="6" cy="6" r="4.5" class="pt won"/></svg>Sieg</span><span><svg viewBox="0 0 12 12"><circle cx="6" cy="6" r="4.5" class="pt lost"/></svg>Niederlage</span>'}
    </figcaption>
  </figure>`;
}

// Fadenkreuz: Tippen oder Ziehen springt zum nächstgelegenen Match. Ohne Berührung steht es auf dem letzten.
export function bindCharts(root) {
  root.querySelectorAll('.lchart').forEach((fig) => {
    const svg = fig.querySelector('svg');
    const d = JSON.parse(svg.dataset.pts);
    const cross = svg.querySelector('.cross'), sel = svg.querySelector('.sel'), out = fig.querySelector('.readout');
    const show = (i) => {
      cross.setAttribute('x1', d.x[i]); cross.setAttribute('x2', d.x[i]); cross.setAttribute('visibility', 'visible');
      sel.setAttribute('cx', d.x[i]); sel.setAttribute('cy', d.y[i]); sel.setAttribute('visibility', 'visible');
      out.innerHTML = `<b>${d.v[i]}</b><span>${d.at[i]} · ${d.won[i] ? 'Sieg' : 'Niederlage'}</span><span class="r">Schnitt <b>${d.r[i]}</b></span>`;
    };
    const pick = (ev) => {
      const box = svg.getBoundingClientRect();
      const px = ((ev.clientX - box.left) / box.width) * d.W;
      let best = 0;
      d.x.forEach((xx, i) => { if (Math.abs(xx - px) < Math.abs(d.x[best] - px)) best = i; });
      show(best);
    };
    const hit = svg.querySelector('.hit');
    hit.addEventListener('pointerdown', (ev) => { hit.setPointerCapture(ev.pointerId); pick(ev); });
    hit.addEventListener('pointermove', (ev) => { if (ev.buttons || ev.pointerType === 'mouse') pick(ev); });
    show(d.x.length - 1);
  });
}

// ---------- Trefferbild ----------
// Reihenfolge der Segmente im Uhrzeigersinn, oben beginnend
export const BOARD_ORDER = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];
// Radien in mm nach WDF/PDC-Maßen
const RAD = { bullIn: 6.35, bullOut: 15.9, tripleIn: 99, tripleOut: 107, doubleIn: 162, doubleOut: 170 };
const K = 180 / RAD.doubleOut;

export const fieldLabel = (key) => {
  const [s, m] = key.split('-').map(Number);
  if (s === 25) return m === 2 ? 'Bull' : '25';
  return (m === 3 ? 'T' : m === 2 ? 'D' : 'S') + s;
};

function sector(r1, r2, a1, a2) {
  const p = (r, a) => `${(r * Math.cos(a)).toFixed(2)},${(r * Math.sin(a)).toFixed(2)}`;
  return `M${p(r1, a1)}L${p(r2, a1)}A${r2},${r2} 0 0 1 ${p(r2, a2)}L${p(r1, a2)}A${r1},${r1} 0 0 0 ${p(r1, a1)}Z`;
}

// board: {counts, total, miss}, sel: ausgewählter Schlüssel
export function boardHeatmap(board, sel) {
  const max = Math.max(1, ...Object.values(board.counts));
  // Sequenziell, ein Farbton: mehr Treffer = kräftigeres Gold. Wurzel spreizt die seltenen Felder sichtbar.
  const fill = (key) => {
    const c = board.counts[key] || 0;
    return c ? `color-mix(in oklab, var(--gold) ${Math.round(18 + 82 * Math.sqrt(c / max))}%, var(--panel-2))` : 'var(--panel)';
  };
  const field = (key, d) => [key, `<path d="${d}" data-a="heatPick" data-v="${key}" class="${key === sel ? 'on' : ''}" style="fill:${fill(key)}"><title>${fieldLabel(key)}: ${board.counts[key] || 0}</title></path>`];
  const rings = [[RAD.bullOut, RAD.tripleIn, 1], [RAD.tripleIn, RAD.tripleOut, 3], [RAD.tripleOut, RAD.doubleIn, 1], [RAD.doubleIn, RAD.doubleOut, 2]];
  const paths = [];
  let nums = '';
  BOARD_ORDER.forEach((s, i) => {
    const mid = (-90 + i * 18) * (Math.PI / 180), h = 9 * (Math.PI / 180);
    for (const [r1, r2, m] of rings) paths.push(field(`${s}-${m}`, sector(r1 * K, r2 * K, mid - h, mid + h)));
    nums += `<text x="${(194 * Math.cos(mid)).toFixed(1)}" y="${(194 * Math.sin(mid) + 5).toFixed(1)}" class="bn">${s}</text>`;
  });
  paths.push(field('25-1', `M0,${-RAD.bullOut * K}A${RAD.bullOut * K},${RAD.bullOut * K} 0 1 1 0,${RAD.bullOut * K}A${RAD.bullOut * K},${RAD.bullOut * K} 0 1 1 0,${-RAD.bullOut * K}Z`));
  paths.push(field('25-2', `M0,${-RAD.bullIn * K}A${RAD.bullIn * K},${RAD.bullIn * K} 0 1 1 0,${RAD.bullIn * K}A${RAD.bullIn * K},${RAD.bullIn * K} 0 1 1 0,${-RAD.bullIn * K}Z`));
  // Ausgewähltes Feld zuletzt zeichnen, damit sein Rahmen nicht von Nachbarn verdeckt wird
  return `<svg viewBox="-208 -208 416 416" class="heat" role="img" aria-label="Trefferbild">
    <circle r="${RAD.doubleOut * K + 2}" class="rim"/>
    ${paths.filter(([k]) => k !== sel).map(([, h]) => h).join('')}${paths.filter(([k]) => k === sel).map(([, h]) => h).join('')}${nums}</svg>`;
}
