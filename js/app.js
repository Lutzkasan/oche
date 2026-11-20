import * as db from './db.js';
import { replay, RULES, matchLine, canStop, prepareConfig } from './engine.js';
import { playerStats, filterGames, rolling, hasPlay, hasDarts, gameTime, replayCached } from './stats.js';
import { lineChart, bindCharts, boardHeatmap, fieldLabel } from './charts.js';
import { HELP, TERMS } from './help.js';
import { GROUPS, setupDefaults } from './modes.js';
import {
  S, MODES, COLORS, esc, uid, num, pct, day, player, pcolor, pname,
  dialog, toast, flash, clearFlash, seg, stepper,
} from './ui.js';

export const APP_VERSION = '0.9.0';
export const BUILD = 'dev'; // setzt tools/build.mjs beim Deploy
const BACKUP_DAYS = 7;
// Alles, was die App außerhalb von IndexedDB ablegt. Zurücksetzen löscht genau diese Schlüssel.
const LOCAL_KEYS = ['oche.setup', 'oche.statsFilter'];
const RESET_WORD = 'LÖSCHEN';

const $app = document.getElementById('app');

// ---------- Hilfen ----------
function loadSetup() {
  const def = { mode: 'x01', legs: 1, sets: 1, players: [], ...setupDefaults() };
  try { return { ...def, ...JSON.parse(localStorage.getItem(LOCAL_KEYS[0]) || '{}') }; } catch { return def; }
}
function saveSetup() { try { localStorage.setItem(LOCAL_KEYS[0], JSON.stringify(S.setup)); } catch { /* nur Komfort */ } }
// Die eine Stelle, die entscheidet, welche Profile in Auswahllisten erscheinen (Start, Setup, Spieler, Statistik).
// Archivierte Profile fehlen dort und stehen nur unter „Daten" im Archiv. Ihre Spiele und Kennzahlen bleiben, auch für die Mitspieler.
const byName = (a, b) => a.name.localeCompare(b.name, 'de');
const visiblePlayers = () => S.players.filter((p) => !p.archived).sort(byName);
const archivedPlayers = () => S.players.filter((p) => p.archived).sort(byName);

// ---------- Ansichten ----------
const VIEWS = {
  home: viewHome, players: viewPlayers, setup: viewSetup, game: viewGame, stats: viewStats, data: viewData, results: viewResults,
};

function paint() {
  $app.innerHTML = VIEWS[S.view]();
  $app.dataset.view = S.view;
  if (S.view === 'stats') bindCharts($app);
}

// Fehlergrenze (ab 0.7.1). Bis 0.7.0 brach ein einziges Spiel, das sich nicht nachspielen oder anzeigen ließ,
// jede Ansicht ab, die es berührt, die Startseite eingeschlossen. Die App blieb dann bei jedem Start leer.
// Jetzt gilt: Scheitert das Zeichnen, werden die betroffenen Spiele beiseitegelegt (setAside) und die Ansicht
// neu gezeichnet. Liegt es an keinem Spiel, erscheint eine Fehlerseite mit Weg zur Sicherung.
// Die Form der Einträge prüft schon loadAll (db.js, validGame). Hier landet, was erst beim Nachspielen auffällt.
function render(quiet = false) {
  let err;
  // Höchstens drei Anläufe: Spiele aus der Prüfung beiseitelegen, dann notfalls das offene Spiel, dann aufgeben.
  for (let i = 0; i < 3; i++) {
    try { return paint(); } catch (e) {
      console.error(e);
      err = e;
      if (!setAside(true, quiet)) break;
    }
  }
  fatal(err);
}

// Lässt sich das Spiel nachspielen und in einer Liste anzeigen?
function gameOk(g) {
  try {
    const st = replay(g), rule = RULES[g.mode], ui = MODES[g.mode];
    rule.title(g.config); rule.subtitle(g.config);
    g.playerIds.forEach((_, i) => ui.homeScore(st, i));
    return true;
  } catch { return false; }
}

// Legt Spiele beiseite, die sich nicht lesen lassen. Sie bleiben im Speicher und in jeder Sicherung.
// painting: Das Zeichnen ist gescheitert. Findet die Prüfung dann kein Spiel und ist die Spielansicht offen,
// liegt es am Brett des offenen Spiels. Bei einem Fehler in einer Aktion gilt dieser Schluss nicht.
// quiet: ohne eigene Meldung, der Start meldet alles Übersprungene in einer Zeile.
// Liefert true, wenn etwas beiseitegelegt wurde.
function setAside(painting = false, quiet = false) {
  const bad = S.games.filter((g) => !gameOk(g));
  if (!bad.length && painting && S.view === 'game' && S.game) bad.push(S.game);
  if (!bad.length) return false;
  S.games = S.games.filter((g) => !bad.includes(g));
  S.broken.games.push(...bad.filter((g) => !S.broken.games.includes(g)));
  if (bad.includes(S.game)) { S.game = null; S.st = null; S.view = 'home'; wake(false); }
  if (!quiet) toast(`${bad.length === 1 ? '1 Spiel lässt' : bad.length + ' Spiele lassen'} sich nicht lesen und ${bad.length === 1 ? 'wird' : 'werden'} übersprungen. Mehr unter „Daten".`);
  return true;
}

function fatal(e) {
  $app.dataset.view = 'error';
  $app.innerHTML = `<main class="page"><h2>Diese Ansicht lässt sich nicht anzeigen</h2>
    <p class="muted">${esc(e?.message || e)}</p>
    <p>Deine Daten sind unverändert gespeichert. Zieh eine Sicherung, bevor du etwas anderes versuchst.</p>
    <div class="btn-row"><button class="btn primary" data-a="nav" data-v="home">Zur Startseite</button>
    <button class="btn" data-a="exportFile">Sicherung als Datei speichern</button></div>
    <footer class="foot">Oche ${APP_VERSION} · Build ${BUILD}</footer></main>`;
}

// Fehler in einer Aktion (Tippen auf einen Knopf): betroffene Spiele beiseitelegen, sonst den Fehler melden.
function failed(e) {
  console.error(e);
  if (setAside()) render(); else toast('Das hat nicht geklappt: ' + (e?.message || e));
}

function topbar(title, extra = '', back = 'home') {
  return `<header class="topbar"><button class="icon-btn" data-a="nav" data-v="${back}" aria-label="Zurück">‹</button><h2>${title}</h2>${extra}</header>`;
}

const swatches = (sel, action) => `<div class="swatches">${COLORS.map((c) => `<button type="button" class="sw ${c === sel ? 'on' : ''}" style="--pc:${c}" data-a="${action}" data-v="${c}" aria-label="Farbe"></button>`).join('')}</div>`;

// Neue Profile bekommen die erste Farbe, die kein sichtbares Profil trägt
const nextColor = () => { const used = new Set(visiblePlayers().map((p) => p.color)); return COLORS.find((c) => !used.has(c)) || COLORS[S.players.length % COLORS.length]; };

// Logo „Turnierscheibe". Die Geometrie steht nur in tools/make-icons.py, das icons/logo.svg und die App-Icons erzeugt.
const logo = () => '<img src="icons/logo.svg" class="logo" alt="">';

function backupBanner() {
  const finished = S.games.filter((g) => g.status === 'finished');
  if (!finished.length) return '';
  const newer = finished.filter((g) => !S.lastExport || g.finishedAt > S.lastExport).length;
  const old = !S.lastExport || Date.now() - S.lastExport > BACKUP_DAYS * 864e5;
  if (!newer || !old) return '';
  const since = S.lastExport ? `Letzte Sicherung am ${day(S.lastExport)}` : 'Noch keine Sicherung';
  return `<div class="banner"><div><b>${since}.</b> ${newer === 1 ? '1 neues Spiel ist' : newer + ' neue Spiele sind'} nur auf diesem Tablet gespeichert.</div>
    <button class="btn primary sm" data-a="nav" data-v="data">Sichern</button></div>`;
}

function gameTitle(g) {
  const r = RULES[g.mode];
  return `${esc(r.title(g.config))} <small>${esc(r.subtitle(g.config))}</small>`;
}

// Startseite: nur laufende Spiele. Beendete Spiele stehen unter „Ergebnisse".
function viewHome() {
  const running = S.games.filter((g) => g.status === 'active').sort((a, b) => b.updatedAt - a.updatedAt);
  const finished = S.games.filter((g) => g.status === 'finished').length;
  const more = Object.values(MODES).filter((u) => u.group !== 'classic').length;
  return `<main class="home"><div class="home-main">
    <header class="brand">${logo()}<div><h1>Oche</h1><span>Dart Counter</span></div></header>
    ${backupBanner()}
    <nav class="tiles">
      <button class="tile big" data-a="nav" data-v="setup"><span class="t-ico">▶</span><b>Neues Spiel</b><span>X01 · Cricket · ${more} Party- und Trainingsspiele</span></button>
      <button class="tile" data-a="nav" data-v="players"><b>Spieler</b><span>${visiblePlayers().length} ${visiblePlayers().length === 1 ? 'Profil' : 'Profile'}</span></button>
      <button class="tile" data-a="nav" data-v="stats"><b>Statistik</b><span>Averages, Doppel, Trefferquoten</span></button>
      <button class="tile" data-a="nav" data-v="data"><b>Daten</b><span>Sichern · Archiv · Zurücksetzen</span></button>
      <button class="tile" data-a="nav" data-v="results"><b>Ergebnisse</b><span>${finished === 1 ? '1 beendetes Spiel' : `${finished} beendete Spiele`}</span></button>
    </nav></div><div class="home-side">
    <section><h3 class="sec">Laufende Spiele</h3>${running.length ? `<div class="list">${running.map((g) => {
      const st = replay(g), ui = MODES[g.mode];
      return `<button class="row" data-a="resume" data-v="${g.id}">
        <span class="r-main">${gameTitle(g)}</span>
        <span class="r-sub">${g.playerIds.map((id, i) => `<i style="--pc:${player(id).color}">${esc(player(id).name)} ${ui.homeScore(st, i)}</i>`).join(' · ')}</span>
        <span class="r-go">Fortsetzen ›</span></button>`;
    }).join('')}</div>` : '<p class="muted">Kein Spiel offen. Beendete Spiele stehen unter „Ergebnisse".</p>'}</section>
    </div><footer class="foot">Version ${APP_VERSION} · Build ${BUILD}</footer>
  </main>`;
}

// Ergebnisse: alle beendeten Spiele, neueste zuerst. Je Spieler gewonnene Legs (bzw. Sets), der Sieger hervorgehoben.
function resultLine(g) {
  const st = replayCached(g);
  const multi = st.cfg.sets > 1 || st.cfg.legs > 1;
  const won = (p) => (st.cfg.sets > 1 ? st.sets[p] : st.legResults.filter((r) => r.winner === p).length);
  return g.playerIds.map((id, p) => `<i style="--pc:${player(id).color}" class="${id === g.winnerId ? 'win' : ''}">${esc(player(id).name)}${multi ? ` <b>${won(p)}</b>` : id === g.winnerId && g.playerIds.length > 1 ? ' ✓' : ''}</i>`).join(' · ');
}
function viewResults() {
  const list = S.games.filter((g) => g.status === 'finished').sort((a, b) => b.finishedAt - a.finishedAt);
  const shown = S.allResults ? list : list.slice(0, 30);
  return `${topbar('Ergebnisse')}<main class="page">
    ${list.length ? `<div class="list games-list">${shown.map((g) => `<div class="row static ${g.excluded ? 'excluded' : ''}">
      <span class="r-main">${gameTitle(g)}</span>
      <span class="r-sub">${resultLine(g)}${g.excluded ? ' <em>· nicht gewertet</em>' : ''}</span>
      <span class="r-date">${day(g.finishedAt)}</span></div>`).join('')}</div>
    ${list.length > shown.length || S.allResults ? `<button class="btn sm ghost more" data-a="allResults">${S.allResults ? 'Weniger zeigen' : `Alle ${list.length} zeigen`}</button>` : ''}`
    : '<p class="muted">Noch keine beendeten Spiele.</p>'}
  </main>`;
}

function viewPlayers() {
  const list = visiblePlayers();
  const count = (id) => S.games.filter((g) => g.playerIds.includes(id)).length;
  const games = (n) => (n === 1 ? '1 Spiel' : `${n} Spiele`);
  return `${topbar('Spieler')}<main class="page players">
    <form class="card add-player" data-form="addPlayer">
      <input name="name" placeholder="Name" maxlength="24" autocomplete="off" required>
      ${swatches(S.newColor, 'pickColor')}
      <button class="btn primary">Anlegen</button>
    </form>
    <div class="list cols">${list.map((p) => {
      const n = count(p.id);
      return `<div class="row static">
      <span class="dot" style="--pc:${p.color}"></span><span class="r-main">${esc(p.name)}</span>
      <span class="r-sub">${games(n)}</span>
      <span class="r-actions"><button class="btn sm" data-a="editPlayer" data-v="${p.id}">Bearbeiten</button>
      <button class="btn sm ghost" data-a="removePlayer" data-v="${p.id}">${n ? 'Archivieren' : 'Löschen'}</button></span></div>`;
    }).join('') || '<p class="muted">Noch keine Spieler. Leg oben das erste Profil an.</p>'}</div>
  </main>`;
}

// Gruppiertes Modusmenü: 23 Modi passen in keine Leiste. Gruppe je Modus steht in modes.js.
function modeGrid(cur) {
  return `<div class="modegrid">${GROUPS.map(([g, title]) => `<div class="mg"><h4>${title}</h4><div class="mtiles">${Object.entries(MODES).filter(([, u]) => u.group === g)
    .map(([k, u]) => `<button class="mtile ${k === cur ? 'on' : ''}" data-a="setup" data-k="mode" data-v="${k}">${esc(u.label)}</button>`).join('')}</div></div>`).join('')}</div>`;
}

function viewSetup() {
  const s = S.setup;
  if (!MODES[s.mode]) s.mode = 'x01';
  s.players = s.players.filter((id) => S.players.some((p) => p.id === id && !p.archived));
  const ui = MODES[s.mode], rule = RULES[s.mode];
  const minP = rule.minPlayers || 1, maxP = rule.maxPlayers || Infinity;
  const n = s.players.length;
  const why = n && n < minP ? `${ui.label} braucht mindestens ${minP} Spieler.` : n > maxP ? `${ui.label} geht mit höchstens ${maxP} Spielern.` : '';
  return `${topbar('Neues Spiel')}<main class="page setup">
    <section class="card modes"><label>Spiel</label>${modeGrid(s.mode)}</section>
    <div class="setup-side"><section class="card">
      <div class="opt-head"><h3>${esc(ui.label)}</h3><button class="btn sm" data-a="help" data-v="${s.mode}">Regeln</button></div>
      ${ui.opts.filter(([, , , , when]) => !when || when(s)).map(([k, label, choices]) => `<label>${label}</label>${seg(k, choices)}`).join('')}
      <div class="two"><div><label>Legs</label>${stepper('legs', 1, 11, (v) => `First to ${v}`)}</div>
      <div><label>Sets</label>${stepper('sets', 1, 7, (v) => (v === 1 ? 'Ohne Sets' : `First to ${v}`))}</div></div></section>
    <section class="card"><label>Spieler <small>in Wurfreihenfolge antippen${maxP < Infinity ? ` · höchstens ${maxP}` : ''}</small></label>
      <div class="chips">${visiblePlayers().map((p) => {
        const i = s.players.indexOf(p.id);
        return `<button class="chip ${i >= 0 ? 'on' : ''}" style="--pc:${p.color}" data-a="togglePlayer" data-v="${p.id}">${i >= 0 ? `<em>${i + 1}</em>` : ''}${esc(p.name)}</button>`;
      }).join('')}<button class="chip add" data-a="quickPlayer">+ Neuer Spieler</button></div></section>
    <button class="btn primary xl" data-a="start" ${n >= minP && n <= maxP ? '' : 'disabled'}>Spiel starten</button>
    ${why ? `<p class="muted hint center">${why}</p>` : ''}</div>
  </main>`;
}

// ---------- Regeln ----------
function helpHtml(mode, cfg) {
  const h = HELP[mode], ui = MODES[mode];
  const opts = ui.opts.filter(([k]) => h.opts[k]).map(([k, label, choices]) => `<dt>${label} <small>${choices.map(([, t]) => t).join(' · ')}</small></dt><dd>${h.opts[k]}</dd>`).join('');
  const text = [h.goal, h.turn, h.score, h.win, h.example, ...Object.values(h.opts)].join(' ');
  const terms = Object.entries(TERMS).filter(([t]) => new RegExp(`\\b${t}`, 'i').test(text) || t === 'Runde' || t === 'Leg');
  return `<div class="help">
    ${cfg ? `<p class="h-cfg">Eingestellt: ${esc(RULES[mode].subtitle(cfg))}</p>` : ''}
    <h4>Ziel</h4><p>${h.goal}</p>
    <h4>So läuft eine Runde</h4><p>${h.turn}</p>
    <h4>Wertung</h4><p>${h.score}</p>
    <h4>Sieg</h4><p>${h.win}</p>
    ${opts ? `<h4>Einstellungen</h4><dl>${opts}</dl>` : ''}
    <h4>Beispiel</h4><p>${h.example}</p>
    <h4>Begriffe</h4><dl class="terms">${terms.map(([t, d]) => `<dt>${t}</dt><dd>${d}</dd>`).join('')}</dl>
  </div>`;
}
const showHelp = (mode, cfg) => dialog({ title: `Regeln: ${MODES[mode].label}`, html: helpHtml(mode, cfg), cls: 'wide', buttons: [{ label: 'Schließen', value: 'ok', primary: true }] });

// ---------- Spielansicht ----------
function keypad(st) {
  const ui = MODES[st.rule.id];
  const tc = new Map((ui.targets ? ui.targets(st) : []).map(([n, c]) => [n, c]));
  const tgt = (v) => (tc.has(v) ? ` tgt" style="--tc:${tc.get(v)}` : '');
  const m = S.mult;
  const want = ui.mult ? ui.mult(st) : 0; // Ziel verlangt Doppel/Triple: Taste markieren, Eingabe bleibt frei
  const hint = (v) => (want === v ? ` want" style="--tc:${pcolor(st.current)}` : '');
  const nums = ui.nums ? ui.nums(st) : Array.from({ length: 20 }, (_, i) => i + 1);
  // Taste „Fertig“ nur, wenn die Regel in dieser Einstellung je aufhören lässt. Sonst wäre sie immer gesperrt.
  const stops = Boolean(st.rule.canStop) && (!st.rule.stops || st.rule.stops(st.cfg));
  return `<section class="pad ${m === 2 ? 'mode-d' : m === 3 ? 'mode-t' : ''} ${nums.length < 20 ? 'cricket' : ''}">
    <div class="mods ${stops ? 'three' : ''}"><button class="mod d ${m === 2 ? 'on' : ''}${hint(2)}" data-a="mult" data-v="2">Double</button>
      <button class="mod t ${m === 3 ? 'on' : ''}${hint(3)}" data-a="mult" data-v="3">Triple</button>
      ${stops ? `<button class="mod stop" data-a="stop" ${canStop(st) ? '' : 'disabled'}>${ui.stopLabel ? ui.stopLabel(st) : 'Fertig'}</button>` : ''}</div>
    <div class="nums">${nums.map((n) => `<button class="key${tgt(n)}" data-a="dart" data-v="${n}">${n}</button>`).join('')}</div>
    <div class="bottom"><button class="key miss" data-a="dart" data-v="0">Daneben</button>
      <button class="key bull25${tgt(25)}" data-a="dart" data-v="25">25</button>
      <button class="key bull${tgt(25)}" data-a="bull">Bull</button>
      <button class="key undo" data-a="undo" ${S.game.darts.length ? '' : 'disabled'} aria-label="Rückgängig">↶</button></div>
  </section>`;
}

function overlay(st) {
  const ev = st.lastEvent;
  if (!ev || !['leg', 'set', 'match'].includes(ev.type) || S.overlaySeen === S.game.darts.length) return '';
  const ui = MODES[st.rule.id];
  const pl = player(S.game.playerIds[ev.p]);
  const co = ui.overlaySub ? ui.overlaySub(st, ev) : '';
  const verb = st.n === 1 ? 'beendet' : 'gewonnen'; // allein gibt es keinen Gegner, das Leg ist nur zu Ende
  if (ev.type !== 'match') {
    return `<div class="overlay"><div class="ov-card" style="--pc:${pl.color}">
      <p class="ov-kicker">${ev.type === 'set' ? 'Set' : 'Leg'} ${verb}</p><h2>${esc(pl.name)}</h2>${co}
      <div class="ov-btns"><button class="btn" data-a="undo">Rückgängig</button><button class="btn primary" data-a="dismiss">Nächstes Leg</button></div></div></div>`;
  }
  const [colHead, colVal] = ui.col;
  const rows = S.game.playerIds.map((id, p) => {
    const ml = matchLine(st, p);
    return `<tr><td><span class="dot" style="--pc:${player(id).color}"></span>${esc(player(id).name)}</td>
      <td>${st.cfg.sets > 1 ? st.sets[p] : st.legResults.filter((r) => r.winner === p).length}</td>
      <td>${colVal(ml)}</td><td>${ml.darts}</td></tr>`;
  }).join('');
  return `<div class="overlay"><div class="ov-card match" style="--pc:${pl.color}">
    <p class="ov-kicker">Match ${verb}</p><h2>${esc(pl.name)}</h2>${co}
    <table class="ov-table"><tr><th></th><th>${st.cfg.sets > 1 ? 'Sets' : 'Legs'}</th><th>${colHead}</th><th>Darts</th></tr>${rows}</table>
    <div class="ov-btns"><button class="btn" data-a="undo">Rückgängig</button><button class="btn" data-a="nav" data-v="home">Menü</button>
    <button class="btn primary" data-a="rematch">Revanche</button></div></div></div>`;
}

function viewGame() {
  const st = S.st, g = S.game, ui = MODES[st.rule.id];
  const legInfo = st.cfg.sets > 1 ? `Set ${st.setNo} · Leg ${st.legNo}` : `Leg ${st.legNo}`;
  const target = `${st.cfg.sets > 1 ? `First to ${st.cfg.sets} Sets à ${st.cfg.legs} Legs` : `First to ${st.cfg.legs}`}`;
  const bar = ui.bar ? ui.bar(st) : '';
  return `<div class="game">
    <header class="g-bar"><button class="icon-btn" data-a="gameMenu" aria-label="Menü">☰</button>
      <div class="g-title">${gameTitle(g)}</div>${bar ? `<div class="g-round">${bar}</div>` : ''}<div class="g-leg">${legInfo}<small>${target}</small></div></header>
    <section class="board">${ui.board(st)}</section>
    ${keypad(st)}
    ${overlay(st)}
  </div>`;
}

// ---------- Statistik ----------
const RANGES = [['7', '7 Tage'], ['30', '30 Tage'], ['90', '90 Tage'], ['365', '1 Jahr'], ['all', 'Alles'], ['custom', 'Von – Bis']];
const isoDay = (ts) => { const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

function loadStatsFilter() {
  const def = { days: null, mode: 'all', custom: false, from: isoDay(Date.now() - 30 * 864e5), to: isoDay(Date.now()) };
  try { return { ...def, ...JSON.parse(localStorage.getItem(LOCAL_KEYS[1]) || '{}') }; } catch { return def; }
}
function saveStatsFilter() { try { localStorage.setItem(LOCAL_KEYS[1], JSON.stringify(S.statsFilter)); } catch { /* nur Komfort */ } }

// Auswahlliste nach Gruppen. Ein Modus erscheint, sobald der Spieler darin einen Dart geworfen hat (hasPlay,
// dieselbe Prüfung wie in den Kennzahlen). Der gewählte Eintrag bleibt sichtbar, auch wenn er leer ist.
function filterBar(playerGames) {
  const F = S.statsFilter;
  const played = playerGames.filter((g) => hasPlay(g, S.statsFor));
  const has = (m) => F.mode === m || played.some((g) => g.mode === m);
  const starts = [...new Set(played.filter((g) => g.mode === 'x01').map((g) => g.config.start))];
  if (/^\d+$/.test(F.mode) && !starts.includes(Number(F.mode))) starts.push(Number(F.mode));
  starts.sort((a, b) => a - b);
  const opt = (v, l) => `<option value="${v}" ${String(F.mode) === String(v) ? 'selected' : ''}>${esc(l)}</option>`;
  const groups = GROUPS.map(([g, title]) => {
    const items = Object.entries(MODES).filter(([m, u]) => u.group === g && (has(m) || (m === 'x01' && starts.length)));
    const html = items.map(([m, u]) => opt(m, u.label) + (m === 'x01' ? starts.map((v) => opt(v, `X01 · ${v}`)).join('') : '')).join('');
    return html ? `<optgroup label="${title}">${html}</optgroup>` : '';
  }).join('');
  const segs = (opts, cur, a) => `<div class="seg">${opts.map(([v, l]) => `<button class="${String(cur) === v ? 'on' : ''}" data-a="${a}" data-v="${v}">${l}</button>`).join('')}</div>`;
  const range = F.custom ? 'custom' : F.days ?? 'all';
  return `<div class="filters">${segs(RANGES, range, 'statsRange')}
    ${F.custom ? `<div class="dates"><label><span>Von</span><input type="date" value="${esc(F.from)}" max="${isoDay(Date.now())}" data-change="statsFrom"></label>
      <label><span>Bis</span><input type="date" value="${esc(F.to)}" max="${isoDay(Date.now())}" data-change="statsTo"></label></div>` : ''}
    <label class="select"><span>Spiel</span><select data-change="statsMode">${opt('all', 'Alle Spiele')}${groups}</select></label></div>`;
}

// Spiele im Filter, auch die nicht gewerteten. Hier nimmt man ein Spiel aus der Wertung oder holt es zurück.
// Grundlage ist hasDarts statt hasPlay, sonst verschwände ein ausgenommenes Spiel und ließe sich nicht zurückholen.
function gamesSection(games) {
  const list = games.filter((g) => hasDarts(g, S.statsFor)).sort((a, b) => gameTime(b) - gameTime(a));
  if (!list.length) return '';
  const shown = S.allGames ? list : list.slice(0, 8);
  const off = list.filter((g) => g.excluded).length;
  return `<h3 class="sec">Spiele <small>${list.length} im Filter${off ? `, ${off} nicht gewertet` : ''}</small></h3>
    <div class="list games-list">${shown.map((g) => `<div class="row static ${g.excluded ? 'excluded' : ''}">
      <span class="r-main">${gameTitle(g)}</span>
      <span class="r-sub">${g.playerIds.map((id) => `<i style="--pc:${player(id).color}" class="${id === g.winnerId ? 'win' : ''}">${esc(player(id).name)}</i>`).join(' · ')}
        <em>${day(gameTime(g))}${g.status === 'active' ? ' · läuft' : ''}${g.excluded ? ' · nicht gewertet' : ''}</em></span>
      <span class="r-actions"><button class="btn sm ${g.excluded ? 'primary' : 'ghost'}" data-a="toggleExclude" data-v="${g.id}">${g.excluded ? 'Wieder werten' : 'Nicht werten'}</button></span></div>`).join('')}</div>
    ${list.length > shown.length || S.allGames ? `<button class="btn sm ghost more" data-a="allGames">${S.allGames ? 'Weniger zeigen' : `Alle ${list.length} zeigen`}</button>` : ''}`;
}

function trend(history, label, decimals) {
  if (!history.length) return '';
  const win = 5;
  return `<h3 class="sec">Verlauf <small>${label} je Match</small></h3>
    <div class="card chart-card">${lineChart(history, rolling(history.map((e) => e.value), win), { decimals, window: win })}</div>`;
}

function heatSection(board) {
  const hits = Object.entries(board.counts).sort((a, b) => b[1] - a[1]);
  if (!board.total) return '';
  if (!S.heatSel || !board.counts[S.heatSel]) S.heatSel = hits[0]?.[0] || null;
  const share = (n) => pct(n / board.total);
  const sel = S.heatSel;
  const top = hits.slice(0, 8);
  return `<h3 class="sec">Trefferbild <small>${board.total} Darts im Filter, Feld antippen</small></h3>
    <div class="card heat-card">
      ${boardHeatmap(board, sel)}
      <div class="heat-side">
        ${sel ? `<div class="heat-read"><b>${fieldLabel(sel)}</b><span>${board.counts[sel]} Darts · ${share(board.counts[sel])}</span></div>` : ''}
        <div class="doubles one">${top.map(([k, v]) => `<button class="dbl ${k === sel ? 'on' : ''}" data-a="heatPick" data-v="${k}"><b>${fieldLabel(k)}</b>
          <span class="bar"><i style="width:${Math.round((v / top[0][1]) * 100)}%"></i></span><small>${v} · ${share(v)}</small></button>`).join('')}</div>
        <p class="muted small">Daneben: ${board.miss} · ${share(board.miss)}. Single innen und außen erfasst die Eingabe nicht getrennt, beide Ringe zeigen deshalb denselben Wert.</p>
      </div>
    </div>`;
}

const tile = (label, value, sub = '') => `<div class="stat"><span>${label}</span><b>${value}</b>${sub ? `<small>${sub}</small>` : ''}</div>`;
const STATS_H = {
  tile, trend,
  // Siege nur aus Spielen mit Gegner (stats.js). Spiele allein stehen als eigene Kachel ohne Sieg-Wertung.
  matchTiles: (s) => `${s.matches || s.vsLegs || !s.solo ? tile('Matches', `${s.won} / ${s.matches}`, `gewonnen · ${s.matches - s.won} verloren`) + tile('Legs', `${s.legsWon} / ${s.vsLegs}`, 'gewonnen') : ''}${s.solo ? tile('Solo-Spiele', s.solo, `${s.legs - s.vsLegs} ${s.legs - s.vsLegs === 1 ? 'Leg' : 'Legs'} ohne Gegner`) : ''}`,
  recent: (h, title, label, d, unit = '') => (h.length ? `<h3 class="sec">Letzte ${title}-Matches <small>${label}</small></h3><div class="list">${h.slice(-10).reverse().map((e) => `<div class="row static"><span class="r-main">${num(e.value, d)}${unit}</span><span class="r-sub">${e.won == null ? 'Solo' : e.won ? 'Sieg' : 'Niederlage'}</span><span class="r-date">${day(e.at)}</span></div>`).join('')}</div>` : ''),
};

// Gesamtbilanz über alle Modi im Filter. Gleiche Zähler wie matchTiles: Sieg und Niederlage nur gegen Gegner,
// Spiele allein getrennt. Nur beendete Spiele zählen. Bei einem einzelnen Modus im Filter stünde hier dasselbe
// wie in dessen Abschnitt, die Bilanz erscheint deshalb nur bei „Alle Spiele“.
function totalsSection(R) {
  const all = Object.keys(MODES).map((m) => R[m]);
  const sum = (k) => all.reduce((a, x) => a + x[k], 0);
  const matches = sum('matches'), won = sum('won'), solo = sum('solo');
  if (!matches && !solo) return '';
  return `<section class="mstats"><h3 class="sec">Gesamtbilanz <small>alle Spiele im Filter</small></h3><div class="stats">
    ${tile('Gespielt', matches, 'Matches mit Gegner')}
    ${tile('Gewonnen', won)}
    ${tile('Verloren', matches - won)}
    ${tile('Siegquote', pct(matches ? won / matches : null))}
    ${solo ? tile('Solo-Spiele', solo, 'ohne Sieg-Wertung') : ''}
  </div></section>`;
}

function viewStats() {
  const list = visiblePlayers();
  if (!S.statsFor || !list.some((p) => p.id === S.statsFor)) S.statsFor = list[0]?.id;
  if (!S.statsFor) return `${topbar('Statistik')}<main class="page"><p class="muted">Noch keine Spieler.</p></main>`;
  const F = S.statsFilter;
  const playerGames = S.games.filter((g) => g.playerIds.includes(S.statsFor));
  const games = filterGames(playerGames, F);
  const head = `${topbar('Statistik')}<main class="page" style="--pc:${player(S.statsFor).color}">
    <div class="chips">${list.map((p) => `<button class="chip ${p.id === S.statsFor ? 'on' : ''}" style="--pc:${p.color}" data-a="statsFor" data-v="${p.id}">${esc(p.name)}</button>`).join('')}</div>
    ${filterBar(playerGames)}`;
  if (!games.some((g) => hasPlay(g, S.statsFor))) {
    const any = games.some((g) => hasDarts(g, S.statsFor));
    return `${head}<p class="muted">${any ? 'Alle Spiele in diesem Zeitraum und Modus sind von der Wertung ausgenommen.' : 'Keine Spiele in diesem Zeitraum und Modus.'}</p>${gamesSection(games)}</main>`;
  }
  const R = playerStats(S.statsFor, games);
  // Abschnitt zeigen, wenn der Filter genau diesen Modus wählt, oder bei „Alle", sobald es Darts gibt
  const show = (id) => F.mode === id || (id === 'x01' && /^\d+$/.test(F.mode)) || (F.mode === 'all' && R[id].darts > 0);
  return `${head}
    ${F.mode === 'all' ? totalsSection(R) : ''}
    ${Object.entries(MODES).filter(([m]) => show(m)).map(([m, u]) => `<section class="mstats"><h3 class="sec">${esc(u.label)}</h3>${u.stats(R[m], STATS_H)}</section>`).join('')}
    ${heatSection(R.board)}
    ${gamesSection(games)}
  </main>`;
}

// ---------- Daten ----------
// Verwaltungsseite: Sichern, Wiederherstellen, Archiv der Profile, Speicher, Zurücksetzen
function archiveCard() {
  const arch = archivedPlayers();
  if (!arch.length) return '';
  const count = (id) => S.games.filter((g) => g.playerIds.includes(id)).length;
  return `<section class="card">
      <h3>Archiv</h3>
      <p class="muted">Archivierte Profile fehlen in Spielerauswahl und Statistik. Ihre Spiele zählen weiter, auch für die Mitspieler. „Vergessen" löscht das Profil endgültig.</p>
      <div class="list">${arch.map((p) => `<div class="row static archived">
        <span class="dot" style="--pc:${p.color}"></span><span class="r-main">${esc(p.name)}</span>
        <span class="r-sub">${count(p.id) === 1 ? '1 Spiel' : count(p.id) + ' Spiele'}</span>
        <span class="r-actions"><button class="btn sm" data-a="restorePlayer" data-v="${p.id}">Zurückholen</button>
        <button class="btn sm danger" data-a="forgetPlayer" data-v="${p.id}">Vergessen</button></span></div>`).join('')}</div>
    </section>`;
}

// Einträge, die die Prüfung (db.js) oder das Nachspielen nicht bestehen. Nur Zahl und Ausweg, keine Inhalte:
// Was hier liegt, ist ungeprüft und gehört nicht ins HTML.
function brokenCard() {
  const g = S.broken.games.length, p = S.broken.players.length;
  if (!g && !p) return '';
  const what = [g ? (g === 1 ? '1 Spiel' : `${g} Spiele`) : '', p ? (p === 1 ? '1 Profil' : `${p} Profile`) : ''].filter(Boolean).join(' und ');
  return `<section class="card">
      <h3>Nicht lesbare Einträge</h3>
      <p>${what} ${g + p === 1 ? 'lässt' : 'lassen'} sich mit dieser Version nicht lesen. Die App überspringt ${g + p === 1 ? 'den Eintrag' : 'sie'}, damit alles andere läuft.</p>
      <p class="muted">Die Einträge liegen weiter im Speicher und stehen in jeder Sicherung. Lag es an der App, erscheinen sie nach einem Update von selbst wieder.</p>
      <div class="btn-row"><button class="btn danger" data-a="dropBroken">Endgültig entfernen</button></div>
    </section>`;
}

function viewData() {
  const finished = S.games.filter((g) => g.status === 'finished').length;
  const persistText = S.persisted === true ? 'Dauerhaft. Android räumt die Daten nicht bei Speichermangel.'
    : S.persisted === false ? 'Nicht dauerhaft. Android darf die Daten bei Speichermangel löschen. Installiere die App auf dem Startbildschirm, dann gewährt Chrome den dauerhaften Speicher meist automatisch.'
    : 'Unbekannt.';
  return `${topbar('Daten')}<main class="page">
    <section class="card">
      <h3>Sichern</h3>
      <p class="muted">${S.players.length} Spieler · ${finished} beendete Spiele · Letzte Sicherung: ${S.lastExport ? day(S.lastExport) : 'nie'}</p>
      <p>Die Sicherung enthält jeden einzelnen Dart. Schick sie dir per Mail oder WhatsApp oder leg sie in Google Drive ab, dann ist sie auch bei Verlust des Tablets da.</p>
      <div class="btn-row"><button class="btn primary" data-a="exportShare">Teilen (Mail, WhatsApp, Drive …)</button>
      <button class="btn" data-a="exportFile">Als Datei speichern</button></div>
    </section>
    <section class="card">
      <h3>Wiederherstellen / Tablet wechseln</h3>
      <p>Auf dem neuen Tablet die App installieren, hier die Sicherungsdatei wählen (.txt aus „Teilen" oder .json aus „Als Datei speichern"). Vorhandene Daten bleiben erhalten. Gleiche Spiele werden nicht doppelt angelegt.</p>
      <label class="btn file">Sicherung importieren<input type="file" accept="application/json,.json,text/plain,.txt" data-change="import" hidden></label>
    </section>
    ${archiveCard()}
    ${brokenCard()}
    <section class="card"><h3>Speicher</h3><p class="muted">${persistText}</p></section>
    <section class="card danger-zone">
      <h3>Zurücksetzen</h3>
      <p>Löscht alle Spieler, Spiele und Einstellungen auf diesem Tablet. Danach startet Oche wie neu installiert. Eine Sicherung, die du danach importierst, holt alles zurück.</p>
      <div class="btn-row"><button class="btn danger" data-a="reset">Alles zurücksetzen</button></div>
    </section>
    <footer class="foot">Oche ${APP_VERSION} · Build ${BUILD}</footer>
  </main>`;
}

// ---------- Aktionen ----------
function recompute() { S.st = replay(S.game); }

// Übernimmt den frisch berechneten Stand (S.st) ins Spiel, zeichnet und speichert.
// Wer die Dartliste ändert, rechnet vorher neu: addEntry beim Wurf, recompute beim Zurücknehmen.
function saveGame() {
  const g = S.game;
  g.updatedAt = Date.now();
  if (S.st.finished) {
    g.status = 'finished';
    g.winnerId = g.playerIds[S.st.winner];
    g.finishedAt = g.finishedAt || Date.now();
  } else {
    g.status = 'active';
    g.winnerId = null;
    g.finishedAt = null;
  }
  render();
  persist('games', g);
}

// Ereignis des letzten Darts oder der letzten Aufnahme als Flash. Gilt für Darts und für „Fertig".
function announce() {
  const ev = S.st.lastEvent, de = S.st.dartEvent;
  const name = (p) => pname(p);
  if (ev?.type === 'tiebreak') return flash('STECHEN', 'ton');
  if (de) {
    const msg = {
      shanghai: ['SHANGHAI', 'max'],
      killer: ['KILLER', 'bust'],
      out: [`${name(de.info.victim)} raus`, 'bust msg'],
      halved: ['HALBIERT', 'bust msg'],
      check: [`CHECK ${de.info.target}${de.info.gain ? ' +' + de.info.gain : ''}`, 'max msg'],
      fail: [`Ziel ${de.info.next}`, 'bust msg'],
      caught: ['ERWISCHT', 'max msg'],
      gotcha: ['GOTCHA', 'max'],
      blindhit: ['TREFFER', 'bust msg'],
      life: ['−1 LEBEN', 'bust msg'],
      match: ['GETROFFEN', 'ton msg'],
      capture: ['EROBERT', 'max msg'],
      recapture: ['ZURÜCKEROBERT', 'max msg'],
      void: ['ZÄHLT NICHT', 'bust msg'],
      foul: [`FOUL +${de.info.foul}${de.info.foulTo >= 0 ? ' ' + name(de.info.foulTo) : ''}`, 'bust msg'],
    }[de.type];
    if (msg && !(de.type === 'match' && ev)) return flash(...msg);
  }
  if (!ev) return;
  if (ev.type === 'bust') return flash('BUST', 'bust');
  if (ev.type === 'strike') return flash('STRICH', 'bust msg');
  if (ev.type === 'life') return flash('−1 LEBEN', 'bust msg');
  if (ev.type === 'lifeback') return flash('+1 LEBEN', 'max msg');
  if (ev.type === 'out') return flash(`${name(ev.turn.p)} raus`, 'bust msg');
  if (ev.type === 'halved') return flash('HALBIERT', 'bust msg');
  if (ev.type === 'back') return flash('ZURÜCK', 'bust msg');
  if (ev.type === 'swap') return flash('ROLLENTAUSCH', 'ton msg');
  if (ev.type === 'turn' && S.st.rule.id === 'x01') {
    if (ev.turn.points === 180) flash('180', 'max');
    else if (ev.turn.points >= 100) flash(String(ev.turn.points), 'ton');
  }
}

// Hängt einen Dart oder Stopp-Eintrag an und rechnet neu. Wirft die Regel dabei einen Fehler, kommt der
// Eintrag wieder heraus: Sonst stünde er dauerhaft in der Dartliste, und das Spiel ließe sich nie mehr öffnen.
// Das fängt nur die Folge ab. Die Ursache wäre ein Fehler in der Regel, der über die Meldung auffällt.
function addEntry(entry) {
  S.game.darts.push(entry);
  try { recompute(); return true; } catch (e) {
    console.error(e);
    S.game.darts.pop();
    recompute();
    toast('Dieser Wurf ließ sich nicht verarbeiten und wurde nicht gezählt.');
    return false;
  }
}

function throwDart(s, mOverride) {
  if (!S.game || S.st.finished) return;
  let m = mOverride || (s === 0 ? 1 : S.mult);
  if (s === 25 && m === 3) m = 2; // kein Triple-Bull
  const extra = MODES[S.game.mode].entry?.(S.st, s, m) ?? {};
  if (typeof extra === 'string') { toast(extra); return; }
  if (!addEntry({ s, m, ...extra, t: Date.now() })) return;
  S.mult = 1;
  S.call = null;
  navigator.vibrate?.(12);
  saveGame();
  announce();
}

function startGame(mode, config, playerIds) {
  const now = Date.now();
  // Erst die modusspezifische Vorbereitung, dann seed und Zufallswerte des ersten Legs (engine.js, draw)
  const prepare = MODES[mode].prepare;
  const cfg = prepareConfig(mode, prepare ? prepare(config, playerIds.length) : config, playerIds.length);
  const g = { id: uid(), mode, config: cfg, playerIds, darts: [], status: 'active', winnerId: null, createdAt: now, updatedAt: now, finishedAt: null };
  S.games.push(g);
  openGame(g);
  persist('games', g);
}

function openGame(g) {
  S.game = g;
  S.mult = 1;
  S.call = null;
  S.overlaySeen = g.darts.length;
  recompute();
  clearFlash();
  S.view = 'game';
  render();
  wake(true);
}

// Zustand zuerst im Speicher ändern und anzeigen, dann im Hintergrund sichern.
// Würde erst nach dem Speichern neu gezeichnet, ersetzt das Rendern Eingaben, die in der Zwischenzeit getippt wurden.
function persist(store, obj) {
  db.put(store, obj).catch((e) => toast('Speichern fehlgeschlagen: ' + e.message));
}

// Umkehrbares Kennzeichen (archived, excluded). Das neue updatedAt sorgt dafür, dass der Import-Merge diesen
// Stand gegen jede ältere Sicherung behält. Archivieren und Ausnehmen laufen beide hierüber.
function setFlag(store, obj, key, on) {
  obj[key] = on;
  obj.updatedAt = Date.now();
  persist(store, obj);
}

function addPlayer(name, color) {
  const now = Date.now();
  const p = { id: uid(), name, color, archived: false, createdAt: now, updatedAt: now };
  S.players.push(p);
  persist('players', p);
  return p;
}

// Chrome teilt nur Dateien, deren Endung und Typ auf seiner Freigabeliste stehen. .json und application/json
// fehlen dort, .txt und text/plain sind erlaubt. Mit .json lehnte navigator.canShare jede Sicherung ab, und
// „Teilen" speicherte stillschweigend nur eine Datei. Deshalb geht die Sicherung zum Teilen als .txt hinaus.
// Der Inhalt ist dasselbe JSON, der Import liest beide Endungen.
// Liefert true, wenn die Sicherung hinausging, und false, wenn das Teilen abgebrochen wurde. Bis 0.7.0 gab es
// keine Rückmeldung, das Zurücksetzen lief deshalb auch nach einem Abbruch weiter.
// Grenze: Ein abgeschlossenes Teilen sagt nicht, ob die Datei am Ziel gespeichert wurde. Das meldet Android nicht.
async function doExport(share) {
  const data = await db.exportAll();
  const base = `oche-sicherung-${isoDay(Date.now())}`;
  const json = JSON.stringify(data);
  const file = share ? new File([json], base + '.txt', { type: 'text/plain' }) : new File([json], base + '.json', { type: 'application/json' });
  if (share && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'Oche-Sicherung', text: `Oche-Sicherung vom ${day(Date.now())}` }); }
    catch (e) { if (e.name === 'AbortError') return false; toast('Teilen fehlgeschlagen. Die Sicherung wird stattdessen als Datei gespeichert.'); download(file); }
  } else {
    if (share) toast('Dieser Browser kann keine Dateien teilen. Die Sicherung wird als Datei gespeichert.');
    download(file);
  }
  S.lastExport = Date.now();
  await db.setMeta('lastExport', S.lastExport);
  render();
  return true;
}

function download(file) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

const A = {
  nav: (v) => { S.view = v; clearFlash(); if (v !== 'game') wake(false); render(); window.scrollTo(0, 0); },
  resume: (id) => openGame(S.games.find((g) => g.id === id)),
  pickColor: (c) => { S.newColor = c; document.querySelectorAll('.add-player .sw').forEach((b) => b.classList.toggle('on', b.dataset.v === c)); },
  pickEditColor: (c) => { S.editColor = c; document.querySelectorAll('dialog .sw').forEach((b) => b.classList.toggle('on', b.dataset.v === c)); },
  setup: (v, el) => { const k = el.dataset.k; S.setup[k] = isNaN(v) ? v : Number(v); saveSetup(); render(); },
  step: (v, el) => { const k = el.dataset.k; S.setup[k] += Number(v); saveSetup(); render(); },
  help: (mode) => showHelp(mode),
  togglePlayer: (id) => {
    const l = S.setup.players, i = l.indexOf(id);
    if (i >= 0) l.splice(i, 1); else l.push(id);
    saveSetup(); render();
  },
  quickPlayer: async () => {
    const r = await dialog({ title: 'Neuer Spieler', input: '', buttons: [{ label: 'Abbrechen', value: 'x' }, { label: 'Anlegen', value: 'ok', primary: true }] });
    if (r.btn !== 'ok' || !r.value) return;
    const p = addPlayer(r.value, COLORS[S.players.length % COLORS.length]);
    S.setup.players.push(p.id); saveSetup(); render();
  },
  editPlayer: async (id) => {
    const p = player(id);
    S.editColor = p.color;
    const r = await dialog({ title: 'Spieler bearbeiten', cls: 'edit-player', html: swatches(p.color, 'pickEditColor'), input: p.name, buttons: [{ label: 'Abbrechen', value: 'x' }, { label: 'Speichern', value: 'ok', primary: true }] });
    if (r.btn !== 'ok' || !r.value) return;
    p.name = r.value; p.color = S.editColor; p.updatedAt = Date.now();
    render(); persist('players', p);
  },
  // Profil mit Spielen: archivieren (umkehrbar, alle Spiele bleiben, auch für Mitspieler).
  // Profil ohne Spiele: löschen. Gelöscht wird über einen Lösch-Vermerk, damit eine ältere Sicherung es nicht zurückbringt.
  removePlayer: async (id) => {
    const p = player(id);
    const used = S.games.some((g) => g.playerIds.includes(id));
    const r = await dialog({
      title: used ? `${p.name} archivieren?` : `${p.name} löschen?`,
      text: used ? 'Das Profil verschwindet aus Spielerauswahl und Statistik. Alle Spiele bleiben erhalten, auch in der Statistik der Mitspieler. Unter „Daten" im Archiv holst du es jederzeit zurück.' : 'Das Profil hat keine Spiele und wird gelöscht.',
      buttons: [{ label: 'Abbrechen', value: 'x' }, { label: used ? 'Archivieren' : 'Löschen', value: 'ok', danger: true }],
    });
    if (r.btn !== 'ok') return;
    S.setup.players = S.setup.players.filter((x) => x !== id);
    saveSetup();
    if (used) setFlag('players', p, 'archived', true);
    else { S.players = S.players.filter((x) => x.id !== id); db.remove('players', id).catch((e) => toast('Löschen fehlgeschlagen: ' + e.message)); }
    render();
  },
  restorePlayer: (id) => {
    setFlag('players', player(id), 'archived', false);
    render();
  },
  // Endgültig: Lösch-Vermerk statt Profil. Die Spiele bleiben, damit die Statistik der Mitspieler stimmt.
  // Dort steht statt des Namens „Vergessen" (FORGOTTEN in ui.js).
  forgetPlayer: async (id) => {
    const p = player(id);
    const r = await dialog({
      title: `${p.name} vergessen?`,
      text: 'Das Profil wird endgültig gelöscht und taucht nirgends mehr auf, auch nicht im Archiv. Gemeinsame Spiele bleiben in der Statistik der Mitspieler, dort steht dann „Vergessen" statt des Namens. Das lässt sich nicht rückgängig machen.',
      buttons: [{ label: 'Abbrechen', value: 'x' }, { label: 'Vergessen', value: 'ok', danger: true }],
    });
    if (r.btn !== 'ok') return;
    S.players = S.players.filter((x) => x.id !== id);
    db.remove('players', id).catch((e) => toast('Löschen fehlgeschlagen: ' + e.message));
    render();
  },
  // Spiel aus der Wertung nehmen oder zurückholen. Gilt für alle Spieler des Spiels.
  toggleExclude: (id) => {
    const g = S.games.find((x) => x.id === id);
    if (!g) return;
    setFlag('games', g, 'excluded', !g.excluded);
    toast(g.excluded ? 'Spiel zählt nicht mehr, für alle Spieler.' : 'Spiel zählt wieder.');
    render();
  },
  allGames: () => { S.allGames = !S.allGames; render(); },
  allResults: () => { S.allResults = !S.allResults; render(); },
  start: () => {
    const s = S.setup;
    startGame(s.mode, { ...MODES[s.mode].config(s), legs: s.legs, sets: s.sets }, [...s.players]);
  },
  // Revanche: nächster Spieler wirft an. startGame vergibt einen neuen seed, Zufallswerte werden neu ausgelost.
  rematch: () => {
    const g = S.game;
    startGame(g.mode, { ...g.config }, [...g.playerIds.slice(1), g.playerIds[0]]);
  },
  mult: (v) => { S.mult = S.mult === Number(v) ? 1 : Number(v); render(); },
  // Snooker „Mit Ansage“: Farbe vor dem Dart ansagen. Nochmal tippen hebt die Ansage auf.
  snCall: (v) => { S.call = S.call === Number(v) ? null : Number(v); render(); },
  dart: (v) => throwDart(Number(v)),
  bull: () => throwDart(25, 2),
  // „Fertig" bzw. „Passen": Aufnahme vor dem dritten Dart beenden (Golf, Follow the Leader). Gespeichert als Stopp-Eintrag.
  stop: () => {
    if (!S.game || !canStop(S.st)) return;
    if (!addEntry({ s: 0, m: 0, stop: true, t: Date.now() })) return;
    S.mult = 1;
    saveGame();
    announce();
  },
  // Blind Killer: Der Werfer sieht seine verdeckte Zahl, die anderen schauen weg.
  peek: async () => {
    const p = S.st.current;
    const r = await dialog({ title: `Nur ${pname(p)} schaut`, text: 'Die anderen schauen kurz weg.', buttons: [{ label: 'Abbrechen', value: 'x' }, { label: 'Zahl zeigen', value: 'ok', primary: true }] });
    if (r.btn !== 'ok') return;
    dialog({ title: `${pname(p)}, deine Zahl`, html: `<p class="peek-num" style="--pc:${pcolor(p)}">${S.st.cfg.numbers[p]}</p>`, buttons: [{ label: 'Verdecken', value: 'ok', primary: true }] });
  },
  undo: () => {
    if (!S.game.darts.length) return;
    S.game.darts.pop();
    S.mult = 1;
    S.call = null;
    S.overlaySeen = S.game.darts.length;
    recompute();
    saveGame();
  },
  dismiss: () => { S.overlaySeen = S.game.darts.length; render(); },
  gameMenu: async () => {
    const r = await dialog({
      title: 'Spiel', text: 'Das Spiel ist nach jedem Dart gespeichert und lässt sich jederzeit fortsetzen.',
      buttons: [{ label: 'Spiel löschen', value: 'del', danger: true }, { label: 'Regeln', value: 'help' }, { label: 'Weiterspielen', value: 'x' }, { label: 'Pause', value: 'home', primary: true }],
    });
    if (r.btn === 'home') A.nav('home');
    if (r.btn === 'help') showHelp(S.game.mode, S.game.config);
    if (r.btn === 'del') {
      const c = await dialog({ title: 'Spiel wirklich löschen?', text: 'Alle Würfe dieses Spiels verschwinden auch aus der Statistik.', buttons: [{ label: 'Abbrechen', value: 'x' }, { label: 'Löschen', value: 'ok', danger: true }] });
      if (c.btn !== 'ok') return;
      await db.remove('games', S.game.id);
      S.games = S.games.filter((g) => g.id !== S.game.id);
      S.game = null; A.nav('home');
    }
  },
  statsFor: (id) => { S.statsFor = id; S.heatSel = null; S.allGames = false; render(); },
  statsRange: (v) => {
    const F = S.statsFilter;
    F.custom = v === 'custom';
    if (!F.custom) F.days = v === 'all' ? null : Number(v);
    saveStatsFilter(); render();
  },
  heatPick: (v) => { S.heatSel = v; render(); },
  // Nicht lesbare Einträge endgültig entfernen: Lösch-Vermerk je Eintrag, wie jedes andere Löschen.
  dropBroken: async () => {
    const n = S.broken.games.length + S.broken.players.length;
    const r = await dialog({
      title: n === 1 ? 'Eintrag endgültig entfernen?' : `${n} Einträge endgültig entfernen?`,
      text: 'Zieh vorher eine Sicherung, wenn du die Einträge noch untersuchen lassen willst. Das Entfernen lässt sich nicht rückgängig machen.',
      buttons: [{ label: 'Abbrechen', value: 'x' }, { label: 'Entfernen', value: 'ok', danger: true }],
    });
    if (r.btn !== 'ok') return;
    try {
      for (const store of ['players', 'games']) for (const x of S.broken[store]) await db.remove(store, x.id);
      S.broken = { players: [], games: [] };
      toast('Entfernt.');
    } catch (e) { toast('Entfernen fehlgeschlagen: ' + e.message); }
    render();
  },
  exportShare: () => doExport(true),
  exportFile: () => doExport(false),
  // Zurücksetzen in drei Schritten: Sicherung anbieten, Wort eintippen, dann alles leeren.
  // Löscht IndexedDB (Spieler, Spiele, Lösch-Vermerke, Meta) und die Einstellungen in localStorage.
  reset: async () => {
    const r = await dialog({
      title: 'Alles zurücksetzen?',
      text: `${S.players.length} Spieler und ${S.games.length} Spiele werden gelöscht, dazu alle Einstellungen. Sichere vorher, wenn du die Daten behalten willst.`,
      buttons: [{ label: 'Abbrechen', value: 'x' }, { label: 'Teilen', value: 'share' }, { label: 'Als Datei', value: 'file' }, { label: 'Ohne Sicherung weiter', value: 'go', danger: true }],
    });
    if (!['share', 'file', 'go'].includes(r.btn)) return;
    const saved = r.btn !== 'go';
    if (saved && !(await doExport(r.btn === 'share'))) { toast('Nicht zurückgesetzt: Die Sicherung wurde abgebrochen.'); return; }
    const c = await dialog({
      title: 'Wirklich alles löschen?',
      text: `${saved ? 'Prüf zuerst, ob die Sicherung angekommen ist. ' : ''}Das lässt sich nicht rückgängig machen. Tippe ${RESET_WORD} ein, um zu bestätigen.`,
      input: '',
      buttons: [{ label: 'Abbrechen', value: 'x' }, { label: 'Endgültig zurücksetzen', value: 'ok', danger: true }],
    });
    if (c.btn !== 'ok') return;
    if ((c.value || '').toUpperCase() !== RESET_WORD) { toast('Nicht zurückgesetzt: Das Wort stimmte nicht.'); return; }
    try {
      await db.resetAll();
      for (const k of LOCAL_KEYS) { try { localStorage.removeItem(k); } catch { /* nur Komfort */ } }
      Object.assign(S, { game: null, st: null, statsFor: null, heatSel: null, allGames: false, allResults: false });
      S.setup = loadSetup();
      S.statsFilter = loadStatsFilter();
      await loadAll();
      S.view = 'home';
      render();
      toast('Oche ist zurückgesetzt.');
    } catch (e) {
      dialog({ title: 'Zurücksetzen fehlgeschlagen', text: esc(e.message) });
    }
  },
};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-a]');
  if (!el || el.disabled) return;
  e.preventDefault();
  try {
    const r = A[el.dataset.a]?.(el.dataset.v, el);
    if (r && typeof r.catch === 'function') r.catch(failed);
  } catch (err) { failed(err); }
});

document.addEventListener('submit', async (e) => {
  if (e.target.dataset.form !== 'addPlayer') return;
  e.preventDefault();
  const name = e.target.name.value.trim();
  if (!name) return;
  addPlayer(name, S.newColor);
  S.newColor = nextColor();
  render();
});

document.addEventListener('change', async (e) => {
  const what = e.target.dataset.change;
  if (what === 'statsMode') { S.statsFilter.mode = e.target.value; saveStatsFilter(); render(); return; }
  if (what === 'statsFrom' || what === 'statsTo') {
    if (e.target.value) S.statsFilter[what === 'statsFrom' ? 'from' : 'to'] = e.target.value;
    saveStatsFilter(); render(); return;
  }
  if (what !== 'import') return;
  const file = e.target.files[0];
  if (!file) return;
  try {
    const counts = await db.importAll(JSON.parse(await file.text()));
    await loadAll();
    render();
    dialog({ title: 'Import abgeschlossen', text: `${counts.players} Spieler und ${counts.games} Spiele übernommen oder aktualisiert.${counts.removed ? ` ${counts.removed} gelöschte Einträge entfernt.` : ''}${counts.skipped ? ` ${counts.skipped === 1 ? '1 Eintrag war' : counts.skipped + ' Einträge waren'} nicht lesbar und ${counts.skipped === 1 ? 'wurde' : 'wurden'} übersprungen.` : ''}` });
  } catch (err) {
    dialog({ title: 'Import fehlgeschlagen', text: esc(err.message) });
  }
});

// Bildschirm bleibt während eines Spiels an
let lock = null;
async function wake(on) {
  try {
    if (on && !lock && 'wakeLock' in navigator) { lock = await navigator.wakeLock.request('screen'); lock.addEventListener('release', () => (lock = null)); }
    if (!on && lock) { await lock.release(); lock = null; }
  } catch { /* Wake Lock ist Komfort */ }
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && S.view === 'game') wake(true); });

// ---------- Start ----------
// Dieselbe Prüfung wie beim Import (db.js): Nur Einträge mit gültiger Form kommen in die App.
// Der Rest wird übersprungen und unter „Daten" gemeldet. Damit gilt für alles in S.players und S.games,
// dass id, Farbe und config-Werte nur harmlose Zeichen enthalten. Die Ansichten verlassen sich darauf.
async function loadAll() {
  const [players, games] = await Promise.all([db.getLive('players'), db.getLive('games')]);
  S.players = players.filter(db.validPlayer);
  S.games = games.filter(db.validGame);
  S.broken = { players: players.filter((p) => !db.validPlayer(p)), games: games.filter((g) => !db.validGame(g)) };
  S.newColor = nextColor();
  S.lastExport = (await db.getMeta('lastExport')) || null;
}

async function boot() {
  S.setup = loadSetup();
  S.statsFilter = loadStatsFilter();
  try {
    await loadAll();
  } catch (e) {
    $app.innerHTML = `<main class="page"><h2>Speicher nicht verfügbar</h2><p>${esc(e.message)}</p><p>Im Inkognito-Modus oder mit blockierten Website-Daten kann die App nichts speichern.</p></main>`;
    return;
  }
  render(true);
  const unread = S.broken.games.length + S.broken.players.length;
  if (unread) toast(`${unread === 1 ? '1 Eintrag lässt' : unread + ' Einträge lassen'} sich nicht lesen und ${unread === 1 ? 'wird' : 'werden'} übersprungen. Mehr unter „Daten".`);
  S.persisted = await db.requestPersistence().catch(() => null);

  if ('serviceWorker' in navigator) {
    // controllerchange feuert auch, wenn der erste Worker die Seite per clients.claim() übernimmt.
    // Neu laden darf nur ein Update, also ein Wechsel von einem vorhandenen Worker zu einem neuen.
    const hadController = Boolean(navigator.serviceWorker.controller);
    const reg = await navigator.serviceWorker.register('./sw.js').catch(() => null);
    // Ein neuer Worker wartet, bis er übernehmen darf. Der Hinweis hing bis 0.7.0 nur an updatefound, also am
    // Moment der Installation. Lag der Worker beim Start schon bereit (Seite neu geladen, Hinweis nie angetippt),
    // kam kein Hinweis mehr, und die alte Version lief weiter. Deshalb prüft der Start auch reg.waiting.
    // Es gibt immer nur einen Hinweis. Ein neuerer Worker ersetzt den vorigen.
    let offered = null;
    const offer = (w) => {
      offered?.remove();
      offered = toast('Neue Version verfügbar.', { label: 'Aktualisieren', run: () => w.postMessage('skipWaiting') });
    };
    if (reg?.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
    reg?.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) offer(w);
      });
    });
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || reloading) return;
      reloading = true;
      location.reload();
    });
  }
}

boot();
