import * as db from './db.js';
import { replay, RULES, matchLine, canStop } from './engine.js';
import { playerStats, filterGames, rolling, hasPlay } from './stats.js';
import { lineChart, bindCharts, boardHeatmap, fieldLabel } from './charts.js';
import { HELP, TERMS } from './help.js';
import { GROUPS, setupDefaults } from './modes.js';
import {
  S, MODES, COLORS, esc, uid, num, pct, day, player, pcolor, pname,
  dialog, toast, flash, clearFlash, seg, stepper,
} from './ui.js';

export const APP_VERSION = '0.5.0';
export const BUILD = 'dev'; // setzt tools/build.mjs beim Deploy
const BACKUP_DAYS = 7;

const $app = document.getElementById('app');

// ---------- Hilfen ----------
function loadSetup() {
  const def = { mode: 'x01', legs: 1, sets: 1, players: [], ...setupDefaults() };
  try { return { ...def, ...JSON.parse(localStorage.getItem('oche.setup') || '{}') }; } catch { return def; }
}
function saveSetup() { try { localStorage.setItem('oche.setup', JSON.stringify(S.setup)); } catch { /* nur Komfort */ } }
const activePlayers = () => S.players.filter((p) => !p.archived).sort((a, b) => a.name.localeCompare(b.name, 'de'));

// ---------- Ansichten ----------
const VIEWS = {
  home: viewHome, players: viewPlayers, setup: viewSetup, game: viewGame, stats: viewStats, data: viewData,
};

function render() {
  $app.innerHTML = VIEWS[S.view]();
  $app.dataset.view = S.view;
  if (S.view === 'stats') bindCharts($app);
}

function topbar(title, extra = '') {
  return `<header class="topbar"><button class="icon-btn" data-a="nav" data-v="home" aria-label="Zurück">‹</button><h2>${title}</h2>${extra}</header>`;
}

function logo() {
  return `<svg viewBox="0 0 48 48" class="logo" aria-hidden="true">
    <circle cx="24" cy="24" r="22" fill="var(--board-dark)"/>
    <circle cx="24" cy="24" r="17" fill="none" stroke="var(--red)" stroke-width="3"/>
    <circle cx="24" cy="24" r="10.5" fill="none" stroke="var(--green)" stroke-width="3"/>
    <circle cx="24" cy="24" r="4" fill="var(--red)"/><circle cx="24" cy="24" r="1.6" fill="var(--cream)"/></svg>`;
}

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

function viewHome() {
  const running = S.games.filter((g) => g.status === 'active').sort((a, b) => b.updatedAt - a.updatedAt);
  const recent = S.games.filter((g) => g.status === 'finished').sort((a, b) => b.finishedAt - a.finishedAt).slice(0, 6);
  const more = Object.values(MODES).filter((u) => u.group !== 'classic').length;
  return `<main class="home">
    <header class="brand">${logo()}<div><h1>Oche</h1><span>Dart Counter</span></div></header>
    ${backupBanner()}
    <nav class="tiles">
      <button class="tile big" data-a="nav" data-v="setup"><span class="t-ico">▶</span><b>Neues Spiel</b><span>X01 · Cricket · ${more} Party- und Trainingsspiele</span></button>
      <button class="tile" data-a="nav" data-v="players"><b>Spieler</b><span>${activePlayers().length} ${activePlayers().length === 1 ? 'Profil' : 'Profile'}</span></button>
      <button class="tile" data-a="nav" data-v="stats"><b>Statistik</b><span>Averages, Doppel, Trefferquoten</span></button>
      <button class="tile" data-a="nav" data-v="data"><b>Daten</b><span>Sichern · Tablet wechseln</span></button>
    </nav>
    ${running.length ? `<section><h3 class="sec">Laufende Spiele</h3><div class="list">${running.map((g) => {
      const st = replay(g), ui = MODES[g.mode];
      return `<button class="row" data-a="resume" data-v="${g.id}">
        <span class="r-main">${gameTitle(g)}</span>
        <span class="r-sub">${g.playerIds.map((id, i) => `<i style="--pc:${player(id).color}">${esc(player(id).name)} ${ui.homeScore(st, i)}</i>`).join(' · ')}</span>
        <span class="r-go">Fortsetzen ›</span></button>`;
    }).join('')}</div></section>` : ''}
    ${recent.length ? `<section><h3 class="sec">Zuletzt gespielt</h3><div class="list">${recent.map((g) => `
      <div class="row static"><span class="r-main">${gameTitle(g)}</span>
      <span class="r-sub">${g.playerIds.map((id) => `<i style="--pc:${player(id).color}" class="${id === g.winnerId ? 'win' : ''}">${esc(player(id).name)}</i>`).join(' · ')}</span>
      <span class="r-date">${day(g.finishedAt)}</span></div>`).join('')}</div></section>` : ''}
    <footer class="foot">Version ${APP_VERSION} · Build ${BUILD}</footer>
  </main>`;
}

function viewPlayers() {
  const list = activePlayers();
  const count = (id) => S.games.filter((g) => g.playerIds.includes(id)).length;
  return `${topbar('Spieler')}<main class="page">
    <form class="card add-player" data-form="addPlayer">
      <input name="name" placeholder="Name" maxlength="24" autocomplete="off" required>
      <div class="swatches">${COLORS.map((c) => `<button type="button" class="sw ${c === S.newColor ? 'on' : ''}" style="--pc:${c}" data-a="pickColor" data-v="${c}" aria-label="Farbe"></button>`).join('')}</div>
      <button class="btn primary">Anlegen</button>
    </form>
    <div class="list">${list.map((p) => `<div class="row static">
      <span class="dot" style="--pc:${p.color}"></span><span class="r-main">${esc(p.name)}</span>
      <span class="r-sub">${count(p.id)} Spiele</span>
      <span class="r-actions"><button class="btn sm" data-a="renamePlayer" data-v="${p.id}">Umbenennen</button>
      <button class="btn sm ghost" data-a="removePlayer" data-v="${p.id}">Entfernen</button></span></div>`).join('') || '<p class="muted">Noch keine Spieler. Leg oben das erste Profil an.</p>'}</div>
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
    <section class="card"><label>Spiel</label>${modeGrid(s.mode)}</section>
    <section class="card">
      <div class="opt-head"><h3>${esc(ui.label)}</h3><button class="btn sm" data-a="help" data-v="${s.mode}">Regeln</button></div>
      ${ui.opts.map(([k, label, choices]) => `<label>${label}</label>${seg(k, choices)}`).join('')}
      <div class="two"><div><label>Legs</label>${stepper('legs', 1, 11, (v) => `First to ${v}`)}</div>
      <div><label>Sets</label>${stepper('sets', 1, 7, (v) => (v === 1 ? 'Ohne Sets' : `First to ${v}`))}</div></div></section>
    <section class="card"><label>Spieler <small>in Wurfreihenfolge antippen${maxP < Infinity ? ` · höchstens ${maxP}` : ''}</small></label>
      <div class="chips">${activePlayers().map((p) => {
        const i = s.players.indexOf(p.id);
        return `<button class="chip ${i >= 0 ? 'on' : ''}" style="--pc:${p.color}" data-a="togglePlayer" data-v="${p.id}">${i >= 0 ? `<em>${i + 1}</em>` : ''}${esc(p.name)}</button>`;
      }).join('')}<button class="chip add" data-a="quickPlayer">+ Neuer Spieler</button></div></section>
    <button class="btn primary xl" data-a="start" ${n >= minP && n <= maxP ? '' : 'disabled'}>Spiel starten</button>
    ${why ? `<p class="muted hint center">${why}</p>` : ''}
  </main>`;
}

// ---------- Regeln ----------
function helpHtml(mode, cfg) {
  const h = HELP[mode], ui = MODES[mode];
  const opts = ui.opts.filter(([k]) => h.opts[k]).map(([k, label, choices]) => `<dt>${label} <small>${choices.map(([, t]) => t).join(' · ')}</small></dt><dd>${h.opts[k]}</dd>`).join('');
  const text = [h.goal, h.turn, h.score, h.win, h.example, ...Object.values(h.opts)].join(' ');
  const terms = Object.entries(TERMS).filter(([t]) => new RegExp(`\\b${t}`, 'i').test(text) || t === 'Aufnahme' || t === 'Leg');
  return `<div class="help">
    ${cfg ? `<p class="h-cfg">Eingestellt: ${esc(RULES[mode].subtitle(cfg))}</p>` : ''}
    <h4>Ziel</h4><p>${h.goal}</p>
    <h4>So läuft eine Aufnahme</h4><p>${h.turn}</p>
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
  const stops = Boolean(st.rule.canStop);
  return `<section class="pad ${m === 2 ? 'mode-d' : m === 3 ? 'mode-t' : ''} ${nums.length < 20 ? 'cricket' : ''}">
    <div class="mods ${stops ? 'three' : ''}"><button class="mod d ${m === 2 ? 'on' : ''}${hint(2)}" data-a="mult" data-v="2">Double</button>
      <button class="mod t ${m === 3 ? 'on' : ''}${hint(3)}" data-a="mult" data-v="3">Triple</button>
      ${stops ? `<button class="mod stop" data-a="stop" ${canStop(st) ? '' : 'disabled'}>Fertig</button>` : ''}</div>
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
const RANGES = [['7', '7 Tage'], ['30', '30 Tage'], ['90', '90 Tage'], ['365', '1 Jahr'], ['all', 'Alles']];

function loadStatsFilter() {
  const def = { days: null, mode: 'all' };
  try { return { ...def, ...JSON.parse(localStorage.getItem('oche.statsFilter') || '{}') }; } catch { return def; }
}
function saveStatsFilter() { try { localStorage.setItem('oche.statsFilter', JSON.stringify(S.statsFilter)); } catch { /* nur Komfort */ } }

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
  return `<div class="filters">${segs(RANGES, F.days ?? 'all', 'statsRange')}
    <label class="select"><span>Spiel</span><select data-change="statsMode">${opt('all', 'Alle Spiele')}${groups}</select></label></div>`;
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
  matchTiles: (s) => `${tile('Matches', `${s.won} / ${s.matches}`, 'gewonnen')}${tile('Legs', `${s.legsWon} / ${s.legs}`, 'gewonnen')}`,
  recent: (h, title, label, d, unit = '') => (h.length ? `<h3 class="sec">Letzte ${title}-Matches <small>${label}</small></h3><div class="list">${h.slice(-10).reverse().map((e) => `<div class="row static"><span class="r-main">${num(e.value, d)}${unit}</span><span class="r-sub">${e.won ? 'Sieg' : 'Niederlage'}</span><span class="r-date">${day(e.at)}</span></div>`).join('')}</div>` : ''),
};

function viewStats() {
  const list = S.players.filter((p) => !p.archived || S.games.some((g) => g.playerIds.includes(p.id)));
  if (!S.statsFor || !list.some((p) => p.id === S.statsFor)) S.statsFor = list[0]?.id;
  if (!S.statsFor) return `${topbar('Statistik')}<main class="page"><p class="muted">Noch keine Spieler.</p></main>`;
  const F = S.statsFilter;
  const playerGames = S.games.filter((g) => g.playerIds.includes(S.statsFor));
  const games = filterGames(playerGames, F);
  const head = `${topbar('Statistik')}<main class="page" style="--pc:${player(S.statsFor).color}">
    <div class="chips">${list.map((p) => `<button class="chip ${p.id === S.statsFor ? 'on' : ''}" style="--pc:${p.color}" data-a="statsFor" data-v="${p.id}">${esc(p.name)}</button>`).join('')}</div>
    ${filterBar(playerGames)}`;
  if (!games.some((g) => hasPlay(g, S.statsFor))) return `${head}<p class="muted">Keine Spiele in diesem Zeitraum und Modus.</p></main>`;
  const R = playerStats(S.statsFor, games);
  // Abschnitt zeigen, wenn der Filter genau diesen Modus wählt, oder bei „Alle", sobald es Darts gibt
  const show = (id) => F.mode === id || (id === 'x01' && /^\d+$/.test(F.mode)) || (F.mode === 'all' && R[id].darts > 0);
  return `${head}
    ${Object.entries(MODES).filter(([m]) => show(m)).map(([m, u]) => `<h3 class="sec">${esc(u.label)}</h3>${u.stats(R[m], STATS_H)}`).join('')}
    ${heatSection(R.board)}
  </main>`;
}

// ---------- Daten ----------
function viewData() {
  const finished = S.games.filter((g) => g.status === 'finished').length;
  const persistText = S.persisted === true ? 'Dauerhaft. Android räumt die Daten nicht bei Speichermangel.'
    : S.persisted === false ? 'Nicht dauerhaft. Android darf die Daten bei Speichermangel löschen. Installiere die App auf dem Startbildschirm, dann gewährt Chrome den dauerhaften Speicher meist automatisch.'
    : 'Unbekannt.';
  return `${topbar('Daten')}<main class="page">
    <section class="card">
      <h3>Sichern</h3>
      <p class="muted">${S.players.length} Spieler · ${finished} beendete Spiele · Letzte Sicherung: ${S.lastExport ? day(S.lastExport) : 'nie'}</p>
      <p>Die Sicherung enthält jeden einzelnen Dart. Leg sie in Google Drive ab, dann ist sie auch bei Verlust des Tablets da.</p>
      <div class="btn-row"><button class="btn primary" data-a="exportShare">Teilen (z. B. Google Drive)</button>
      <button class="btn" data-a="exportFile">Als Datei speichern</button></div>
    </section>
    <section class="card">
      <h3>Wiederherstellen / Tablet wechseln</h3>
      <p>Auf dem neuen Tablet die App installieren, hier die Sicherungsdatei wählen. Vorhandene Daten bleiben erhalten. Gleiche Spiele werden nicht doppelt angelegt.</p>
      <label class="btn file">Sicherung importieren<input type="file" accept="application/json,.json" data-change="import" hidden></label>
    </section>
    <section class="card"><h3>Speicher</h3><p class="muted">${persistText}</p></section>
    <footer class="foot">Oche ${APP_VERSION} · Build ${BUILD}</footer>
  </main>`;
}

// ---------- Aktionen ----------
function recompute() { S.st = replay(S.game); }

async function saveGame() {
  const g = S.game;
  recompute();
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
    }[de.type];
    if (msg && !(de.type === 'match' && ev)) return flash(...msg);
  }
  if (!ev) return;
  if (ev.type === 'bust') return flash('BUST', 'bust');
  if (ev.type === 'strike') return flash('STRICH', 'bust msg');
  if (ev.type === 'life') return flash('−1 LEBEN', 'bust msg');
  if (ev.type === 'out') return flash(`${name(ev.turn.p)} raus`, 'bust msg');
  if (ev.type === 'turn' && S.st.rule.id === 'x01') {
    if (ev.turn.points === 180) flash('180', 'max');
    else if (ev.turn.points >= 100) flash(String(ev.turn.points), 'ton');
  }
}

async function throwDart(s, mOverride) {
  if (!S.game || S.st.finished) return;
  let m = mOverride || (s === 0 ? 1 : S.mult);
  if (s === 25 && m === 3) m = 2; // kein Triple-Bull
  S.game.darts.push({ s, m, t: Date.now() });
  S.mult = 1;
  navigator.vibrate?.(12);
  await saveGame();
  announce();
}

function startGame(mode, config, playerIds) {
  const now = Date.now();
  const prepare = MODES[mode].prepare;
  const cfg = prepare ? prepare(config, playerIds.length) : config;
  const g = { id: uid(), mode, config: cfg, playerIds, darts: [], status: 'active', winnerId: null, createdAt: now, updatedAt: now, finishedAt: null };
  S.games.push(g);
  openGame(g);
  persist('games', g);
}

function openGame(g) {
  S.game = g;
  S.mult = 1;
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

function addPlayer(name, color) {
  const now = Date.now();
  const p = { id: uid(), name, color, archived: false, createdAt: now, updatedAt: now };
  S.players.push(p);
  persist('players', p);
  return p;
}

async function doExport(share) {
  const data = await db.exportAll();
  const name = `oche-sicherung-${new Date().toISOString().slice(0, 10)}.json`;
  const file = new File([JSON.stringify(data)], name, { type: 'application/json' });
  if (share && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); }
    catch (e) { if (e.name === 'AbortError') return; toast('Teilen fehlgeschlagen. Ich speichere stattdessen als Datei.'); download(file); }
  } else {
    if (share) toast('Teilen wird hier nicht unterstützt. Datei wird gespeichert.');
    download(file);
  }
  S.lastExport = Date.now();
  await db.setMeta('lastExport', S.lastExport);
  render();
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
  pickColor: (c) => { S.newColor = c; document.querySelectorAll('.sw').forEach((b) => b.classList.toggle('on', b.dataset.v === c)); },
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
  renamePlayer: async (id) => {
    const p = player(id);
    const r = await dialog({ title: 'Umbenennen', input: p.name, buttons: [{ label: 'Abbrechen', value: 'x' }, { label: 'Speichern', value: 'ok', primary: true }] });
    if (r.btn !== 'ok' || !r.value) return;
    p.name = r.value; p.updatedAt = Date.now();
    render(); persist('players', p);
  },
  removePlayer: async (id) => {
    const p = player(id);
    const used = S.games.some((g) => g.playerIds.includes(id));
    const r = await dialog({
      title: `${p.name} entfernen?`,
      text: used ? 'Die Spiele und Statistiken bleiben erhalten. Das Profil erscheint nur nicht mehr bei der Spielerauswahl.' : 'Das Profil hat keine Spiele und wird gelöscht.',
      buttons: [{ label: 'Abbrechen', value: 'x' }, { label: 'Entfernen', value: 'ok', danger: true }],
    });
    if (r.btn !== 'ok') return;
    if (used) { p.archived = true; p.updatedAt = Date.now(); persist('players', p); }
    else { S.players = S.players.filter((x) => x.id !== id); db.del('players', id).catch((e) => toast(e.message)); }
    render();
  },
  start: () => {
    const s = S.setup;
    startGame(s.mode, { ...MODES[s.mode].config(s), legs: s.legs, sets: s.sets }, [...s.players]);
  },
  // Revanche: nächster Spieler wirft an. prepare() läuft erneut, Zufallswerte werden also neu ausgelost.
  rematch: () => {
    const g = S.game;
    startGame(g.mode, { ...g.config }, [...g.playerIds.slice(1), g.playerIds[0]]);
  },
  mult: (v) => { S.mult = S.mult === Number(v) ? 1 : Number(v); render(); },
  dart: (v) => throwDart(Number(v)),
  bull: () => throwDart(25, 2),
  // „Fertig": Aufnahme vor dem dritten Dart beenden (Golf, Follow the Leader). Gespeichert als Stopp-Eintrag.
  stop: async () => {
    if (!S.game || !canStop(S.st)) return;
    S.game.darts.push({ s: 0, m: 0, stop: true, t: Date.now() });
    S.mult = 1;
    await saveGame();
    announce();
  },
  // Blind Killer: Der Werfer sieht seine verdeckte Zahl, die anderen schauen weg.
  peek: async () => {
    const p = S.st.current;
    const r = await dialog({ title: `Nur ${pname(p)} schaut`, text: 'Die anderen schauen kurz weg.', buttons: [{ label: 'Abbrechen', value: 'x' }, { label: 'Zahl zeigen', value: 'ok', primary: true }] });
    if (r.btn !== 'ok') return;
    dialog({ title: `${pname(p)}, deine Zahl`, html: `<p class="peek-num" style="--pc:${pcolor(p)}">${S.st.cfg.numbers[p]}</p>`, buttons: [{ label: 'Verdecken', value: 'ok', primary: true }] });
  },
  undo: async () => {
    if (!S.game.darts.length) return;
    S.game.darts.pop();
    S.mult = 1;
    S.overlaySeen = S.game.darts.length;
    await saveGame();
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
      await db.del('games', S.game.id);
      S.games = S.games.filter((g) => g.id !== S.game.id);
      S.game = null; A.nav('home');
    }
  },
  statsFor: (id) => { S.statsFor = id; S.heatSel = null; render(); },
  statsRange: (v) => { S.statsFilter.days = v === 'all' ? null : Number(v); saveStatsFilter(); render(); },
  heatPick: (v) => { S.heatSel = v; render(); },
  exportShare: () => doExport(true),
  exportFile: () => doExport(false),
};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-a]');
  if (!el || el.disabled) return;
  e.preventDefault();
  A[el.dataset.a]?.(el.dataset.v, el);
});

document.addEventListener('submit', async (e) => {
  if (e.target.dataset.form !== 'addPlayer') return;
  e.preventDefault();
  const name = e.target.name.value.trim();
  if (!name) return;
  addPlayer(name, S.newColor);
  S.newColor = COLORS[S.players.length % COLORS.length];
  render();
});

document.addEventListener('change', async (e) => {
  const what = e.target.dataset.change;
  if (what === 'statsMode') { S.statsFilter.mode = e.target.value; saveStatsFilter(); render(); return; }
  if (what !== 'import') return;
  const file = e.target.files[0];
  if (!file) return;
  try {
    const counts = await db.importAll(JSON.parse(await file.text()));
    await loadAll();
    render();
    dialog({ title: 'Import abgeschlossen', text: `${counts.players} Spieler und ${counts.games} Spiele übernommen oder aktualisiert.` });
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
async function loadAll() {
  [S.players, S.games] = await Promise.all([db.getAll('players'), db.getAll('games')]);
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
  render();
  S.persisted = await db.requestPersistence().catch(() => null);

  if ('serviceWorker' in navigator) {
    // controllerchange feuert auch, wenn der erste Worker die Seite per clients.claim() übernimmt.
    // Neu laden darf nur ein Update, also ein Wechsel von einem vorhandenen Worker zu einem neuen.
    const hadController = Boolean(navigator.serviceWorker.controller);
    const reg = await navigator.serviceWorker.register('./sw.js').catch(() => null);
    reg?.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) {
          toast('Neue Version verfügbar.', { label: 'Aktualisieren', run: () => w.postMessage('skipWaiting') });
        }
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
