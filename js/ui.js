// Gemeinsamer Zustand und Bausteine der Oberfläche. app.js (Ansichten, Aktionen) und modes.js (alles je Modus)
// greifen beide darauf zu. MODES füllt modes.js beim Laden, damit ui.js modes.js nicht importieren muss.
import { dartLabel } from './engine.js';

// 16 Spielerfarben, auf dem dunklen Hintergrund unterscheidbar. Die ersten acht sind die bisherigen.
export const COLORS = [
  '#e5484d', '#30a46c', '#f5b83d', '#3e9bff', '#b07cf5', '#ff8a3d', '#2ec5b6', '#e86fb0',
  '#9bd23c', '#4cc9f0', '#6e6bff', '#d63ce0', '#ffe066', '#b5835a', '#e8e8e8', '#8b9bb4',
];
export const MODES = {};

export const S = {
  view: 'home', players: [], games: [],
  game: null, st: null, mult: 1, overlaySeen: -1,
  setup: null, statsFor: null, newColor: COLORS[0],
  statsFilter: null, heatSel: null,
  persisted: null, lastExport: null,
};

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
export const num = (v, d = 1) => (v == null || isNaN(v) ? '–' : v.toFixed(d).replace('.', ','));
export const pct = (v) => (v == null ? '–' : Math.round(v * 100) + ' %');
export const day = (ts) => (ts ? new Date(ts).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '–');
export const tLabel = (t) => (t === 25 ? 'Bull' : String(t));
export const signed = (v) => (v > 0 ? '+' + v : v < 0 ? '−' + -v : '0');
export const sumBy = (t, k) => t.infos.reduce((a, x) => a + (x[k] || 0), 0);
export const ALL_NUMS = Array.from({ length: 20 }, (_, i) => i + 1);

// Ein vergessenes Profil gibt es nicht mehr. Seine Spiele bleiben für die Mitspieler, dort steht dieser Platzhalter.
export const FORGOTTEN = { name: 'Vergessen', color: '#5b6474' };
export const player = (id) => S.players.find((p) => p.id === id) || FORGOTTEN;
export const pcolor = (p) => player(S.game.playerIds[p]).color;
export const pname = (p) => player(S.game.playerIds[p]).name;

export function dialog({ title, text = '', html = '', input = null, cls = '', buttons = [{ label: 'OK', value: 'ok', primary: true }] }) {
  return new Promise((resolve) => {
    const d = document.createElement('dialog');
    d.className = 'dlg ' + cls;
    d.innerHTML = `<form method="dialog">
      <h3>${esc(title)}</h3>${text ? `<p>${text}</p>` : ''}${html}
      ${input !== null ? `<input name="v" value="${esc(input)}" maxlength="24" autocomplete="off">` : ''}
      <div class="dlg-btns">${buttons.map((b) => `<button value="${b.value}" class="${b.primary ? 'btn primary' : b.danger ? 'btn danger' : 'btn'}">${esc(b.label)}</button>`).join('')}</div>
    </form>`;
    document.body.append(d);
    d.addEventListener('close', () => {
      const v = d.querySelector('input')?.value.trim();
      resolve({ btn: d.returnValue, value: v });
      d.remove();
    });
    d.showModal();
    d.querySelector('input')?.select();
  });
}

// Meldungen stapeln sich in einer Spalte. Einzeln absolut positioniert lagen gleichzeitige Meldungen deckungsgleich übereinander.
export function toast(msg, action) {
  let box = document.querySelector('.toasts');
  if (!box) { box = document.createElement('div'); box.className = 'toasts'; document.body.append(box); }
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<span>${esc(msg)}</span>${action ? `<button class="btn primary sm">${esc(action.label)}</button>` : ''}`;
  if (action) el.querySelector('button').onclick = () => { action.run(); el.remove(); };
  box.append(el);
  if (!action) setTimeout(() => el.remove(), 3500);
}

// Es gibt immer nur einen Flash. Ein neues Ereignis ersetzt das vorige, statt sich darüberzulegen.
export const clearFlash = () => document.querySelectorAll('.flash').forEach((e) => e.remove());
export function flash(text, cls) {
  clearFlash();
  const el = document.createElement('div');
  el.className = 'flash ' + cls;
  el.textContent = text;
  document.body.append(el);
  setTimeout(() => el.remove(), 1300);
}

// ---------- Setup-Bausteine ----------
export function seg(key, options, cls = '') {
  return `<div class="seg ${cls}">${options.map(([v, label]) => `<button class="${String(S.setup[key]) === String(v) ? 'on' : ''}" data-a="setup" data-k="${key}" data-v="${v}">${label}</button>`).join('')}</div>`;
}

export function stepper(key, min, max, label) {
  return `<div class="stepper"><button data-a="step" data-k="${key}" data-v="-1" ${S.setup[key] <= min ? 'disabled' : ''}>−</button>
    <b>${label(S.setup[key])}</b><button data-a="step" data-k="${key}" data-v="1" ${S.setup[key] >= max ? 'disabled' : ''}>+</button></div>`;
}

// ---------- Spielbrett-Bausteine ----------
export const MARK_SVG = [
  '',
  '<svg viewBox="0 0 24 24"><path d="M6 18L18 6"/></svg>',
  '<svg viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12"/></svg>',
  '<svg viewBox="0 0 24 24"><path d="M7.5 16.5l9-9M7.5 7.5l9 9"/><circle cx="12" cy="12" r="9.5"/></svg>',
];

export function turnSlots(st) {
  const t = st.turn;
  const cells = [0, 1, 2].map((i) => `<span class="slot ${t && t.darts[i] ? 'filled' : ''}">${t && t.darts[i] ? dartLabel(t.darts[i]) : ''}</span>`).join('');
  return `<div class="slots">${cells}<span class="slot sum">${t ? MODES[st.rule.id].turnSum(t, st) : ''}</span></div>`;
}

export function legSetLine(st, p) {
  return st.cfg.sets > 1 ? `S ${st.sets[p]} · L ${st.legs[p]}` : st.cfg.legs > 1 ? `Legs ${st.legs[p]}` : '';
}

export function cardHead(st, p, pl, extra = '') {
  return `<div class="p-head"><span class="p-name">${esc(pl.name)}</span>${extra}<span class="p-ls">${legSetLine(st, p)}</span></div>`;
}

// Gemeinsames Raster der Spielerkarten. card(p, pl, active) liefert Klassen, Inhalt über und Inhalt unter den
// Aufnahme-Slots und optional eine Marke im Kopf (head).
export function playerGrid(st, card) {
  return `<div class="pgrid n${Math.min(st.n, 5)}">${S.game.playerIds.map((id, p) => {
    const pl = player(id), active = st.current === p && !st.finished;
    const { cls = '', body, after = '', head = '' } = card(p, pl, active);
    return `<article class="pcard ${active ? 'active' : ''} ${cls}" style="--pc:${pl.color}">${cardHead(st, p, pl, head)}${body}${active ? turnSlots(st) : ''}${after}</article>`;
  }).join('')}</div>`;
}

// Aufnahmen von p im laufenden Leg, je Runde getroffen oder nicht. Für Rundenleisten.
export const legTurns = (st, p) => st.turns.filter((t) => t.p === p && t.setNo === st.setNo && t.legNo === st.legNo);
export const roundTrack = (st, p, labels, ok = (t) => t?.infos.some((x) => x.hit)) => {
  const turns = legTurns(st, p), done = st.leg.rounds[p];
  const cells = labels.map((l, i) => {
    const cls = i < done ? (ok(turns[i]) ? 'on' : 'miss') : i === done && st.current === p && !st.finished ? 'cur' : '';
    return `<i class="${cls}">${l}</i>`;
  }).join('');
  return `<div class="track" style="--cnt:${labels.length}">${cells}</div>`;
};
// Zielleiste für Spiele mit Position (Around the Clock, Chase the Dragon, Nine Lives)
export const posTrack = (labels, pos) => `<div class="track" style="--cnt:${labels.length}">${labels.map((t, i) => `<i class="${i < pos ? 'on' : i === pos ? 'cur' : ''}">${t}</i>`).join('')}</div>`;
export const pips = (total, on) => `<div class="lives" aria-label="${on} Leben">${Array.from({ length: total }, (_, i) => `<i class="${i < on ? 'on' : ''}"></i>`).join('')}</div>`;
export const tiebreakNote = (st, p) => {
  const c = st.leg.contenders;
  return c ? (c.includes(p) ? '<div class="p-note">Im Stechen</div>' : '') : '';
};
export const checkoutHint = (co) => (co ? `<div class="checkout">${co.map((x) => `<span>${x}</span>`).join('')}</div>` : '');
