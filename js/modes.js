// Alles, was die Oberfläche je Modus braucht, an einer Stelle. Spielregeln liegen in js/rules/, Erklärtexte in help.js.
//   label, group      Name und Gruppe im Modusmenü (classic, party, training)
//   opts              Setup-Optionen [Schlüssel, Beschriftung, [[Wert, Text], …], Vorgabe]. Ohne Vorgabe gilt der erste Wert.
//   config(setup)     Regelparameter                  prepare(cfg, n)  Vorbereitung je Match (optional). Zufall je Leg: draw in der Regel
//   board(st)         Spielbrett                      nums(st)         Zahlentasten
//   targets(st)       hervorgehobene Tasten [[Zahl, Farbe]]            mult(st) Doppel/Triple-Taste markieren (2/3)
//   turnSum(turn, st) Summenfeld der Runde (3 Darts)         homeScore(st, p) Stand in „Laufende Spiele"
//   col               [Kopf, Wert(matchLine)] im Match-Overlay          overlaySub(st, ev), bar(st)  optional
//   stats(s, h)       Abschnitt in der Statistik (s = Zähler aus stats.js, h = Bausteine aus app.js)
import { matchLine, dartLabel } from './engine.js';
import { suggestCheckout } from './checkout.js';
import { atcTargets, chaseTargets, chaseLabel } from './rules/atc.js';
import { shanghaiTarget } from './rules/shanghai.js';
import { bobsTarget } from './rules/bobs.js';
import { HALVE_SETS, BERMUDA, halveTarget, halveLabel, halveKey } from './rules/halveit.js';
import { NEED, cricketRows } from './rules/cricket.js';
import { ROUTE, hareTarget } from './rules/hare.js';
import { golfHole, golfTarget } from './rules/golf.js';
import { jdcVisit, jdcDartTarget, jdcGrade } from './rules/jdc.js';
import { GALLERY_COUNT } from './rules/gallery.js';
import {
  S, MODES, esc, num, pct, tLabel, signed, sumBy, ALL_NUMS, player, pcolor, pname,
  MARK_SVG, turnSlots, legSetLine, playerGrid, legTurns, roundTrack, posTrack, pips, tiebreakNote, checkoutHint,
} from './ui.js';

export const GROUPS = [['classic', 'Klassiker'], ['party', 'Party'], ['training', 'Training']];
const B = [[1, 'Ja'], [0, 'Nein']];

// ---------- Bretter ----------
function boardX01(st) {
  return playerGrid(st, (p, pl, active) => {
    const ml = matchLine(st, p);
    const rem = st.leg.rem[p];
    const hint = active && st.leg.opened[p] ? checkoutHint(suggestCheckout(rem, 3 - st.turn.darts.length, st.cfg.out)) : '';
    const last = ml.last ? (ml.last.bust ? 'Bust' : ml.last.points) : '–';
    return {
      body: `<div class="p-rem">${rem}</div>
      <div class="p-meta"><span>Ø <b>${num(ml.avg)}</b></span><span>Letzte <b>${last}</b></span><span>Darts <b>${st.legDarts[p]}</b></span></div>`,
      after: `${hint}
      ${!st.leg.opened[p] && st.cfg.in !== 'single' ? `<div class="p-note">${st.cfg.in === 'double' ? 'Doppel' : 'Doppel/Triple'} zum Einstieg</div>` : ''}`,
    };
  });
}

// Felder-Brett für Cricket, Mickey Mouse und Shove Ha'penny. Zeilen aus der Regel (rule.rows).
function boardMarks(st) {
  const g = S.game, rows = st.rule.rows(st.cfg), leg = st.leg;
  const scored = st.rule.id === 'cricket' || st.cfg.points;
  const closed = (p) => rows.filter((r) => leg.marks[p][r.key] >= NEED).length;
  const allClosed = (r) => leg.marks.every((m) => m[r.key] >= NEED);
  return `<div class="cboard" style="--cols:${st.n}">
    <div class="c-row c-head"><span></span>${g.playerIds.map((id, p) => {
      const pl = player(id), active = st.current === p && !st.finished;
      return `<span class="c-player ${active ? 'active' : ''}" style="--pc:${pl.color}"><b>${esc(pl.name)}</b><em>${scored ? leg.score[p] : `${closed(p)}/${rows.length}`}</em><small>${legSetLine(st, p)} MPR ${num(matchLine(st, p).mpr, 2)}</small></span>`;
    }).join('')}</div>
    ${rows.map((r) => `<div class="c-row ${allClosed(r) ? 'closed' : ''}"><span class="c-num">${r.label}</span>
      ${g.playerIds.map((_, p) => `<span class="c-mark m${Math.min(leg.marks[p][r.key], 3)} ${st.current === p ? 'active' : ''}">${MARK_SVG[Math.min(leg.marks[p][r.key], 3)]}</span>`).join('')}</div>`).join('')}
    ${st.turn ? `<div class="c-turn" style="--pc:${pcolor(st.current)}"><span>${esc(pname(st.current))}</span>${turnSlots(st)}</div>` : ''}
  </div>`;
}

// Zielfolge mit Position: Around the Clock, Doppel-Training, Chase the Dragon
function boardSeq(labels, fmtCur) {
  return (st) => playerGrid(st, (p) => {
    const pos = st.leg.pos[p], ml = matchLine(st, p), lab = labels(st.cfg);
    return {
      body: `<div class="p-rem">${pos < lab.length ? `<span class="p-lbl">Ziel</span>${fmtCur(st.cfg, pos)}` : '✓'}</div>
      ${posTrack(lab, pos)}
      <div class="p-meta"><span>Quote <b>${pct(ml.hitRate)}</b></span><span>Geschafft <b>${pos}/${lab.length}</b></span><span>Darts <b>${st.legDarts[p]}</b></span></div>`,
    };
  });
}
const atcLabels = (cfg) => atcTargets(cfg).map((t) => (t === 25 ? 'B' : t));
const boardAtc = boardSeq(atcLabels, (cfg, pos) => tLabel(atcTargets(cfg)[pos]));
const boardDbl = boardSeq(atcLabels, (cfg, pos) => { const t = atcTargets(cfg)[pos]; return t === 25 ? 'Bull' : 'D' + t; });
const boardChase = boardSeq((cfg) => chaseTargets(cfg).map(chaseLabel), (cfg, pos) => chaseLabel(chaseTargets(cfg)[pos]));

function boardShanghai(st) {
  const cont = st.leg.contenders;
  return playerGrid(st, (p) => {
    const ml = matchLine(st, p), out = cont && !cont.includes(p);
    return {
      cls: out ? 'out' : '',
      body: `<div class="p-rem">${st.leg.score[p]}</div>
      <div class="p-meta"><span>Runden <b>${st.leg.rounds[p]}</b></span><span>Ø/Runde <b>${num(ml.ppr)}</b></span><span>Quote <b>${pct(ml.hitRate)}</b></span></div>
      ${cont && !out ? '<div class="p-note">Im Stechen</div>' : ''}`,
    };
  });
}

function boardKiller(st) {
  const cfg = st.cfg;
  return playerGrid(st, (p) => {
    const lives = st.leg.lives[p], out = lives <= 0, ml = matchLine(st, p);
    const need = cfg.zone === 'double' ? 'D' + cfg.numbers[p] : cfg.numbers[p];
    return {
      cls: out ? 'out' : '',
      body: `<div class="p-rem"><span class="p-lbl">Zahl</span>${cfg.numbers[p]}</div>
      ${pips(cfg.lives, lives)}
      <div class="p-note">${out ? 'Raus' : st.leg.killer[p] ? '<span class="badge">Killer</span>' : `Braucht ${need} zum Killer`}</div>
      <div class="p-meta"><span>Leben genommen <b>${ml.taken}</b></span><span>Darts <b>${st.legDarts[p]}</b></span></div>`,
    };
  });
}

// Blind Killer: Die Zahlen im Spiel sind sichtbar, ihre Besitzer nicht. Aufsteigend sortiert, damit die
// Reihenfolge nichts über die Spielerreihenfolge verrät. Ausgeschiedene Zahlen zeigen ihren Besitzer.
function boardBlind(st) {
  const cfg = st.cfg, leg = st.leg;
  const order = cfg.numbers.map((nr, q) => [nr, q]).sort((a, b) => a[0] - b[0]);
  const nums = order.map(([nr, q]) => {
    const out = leg.lives[q] <= 0;
    return `<div class="bk-num ${out ? 'out' : ''}" style="${out ? `--pc:${pcolor(q)}` : ''}"><b>${nr}</b>${pips(cfg.lives, leg.lives[q])}<small>${out ? esc(pname(q)) : '?'}</small></div>`;
  }).join('');
  return `<div class="bk"><div class="bk-nums" style="--cnt:${order.length}">${nums}</div>
    ${playerGrid(st, (p, pl, active) => {
      const out = leg.lives[p] <= 0;
      return {
        cls: out ? 'out' : '',
        body: `<div class="p-note">${out ? `Raus · Zahl ${cfg.numbers[p]}` : 'Im Spiel'}</div>
        <div class="p-meta"><span>Leben genommen <b>${matchLine(st, p).taken}</b></span><span>Darts <b>${st.legDarts[p]}</b></span></div>`,
        after: active ? '<button class="btn sm peek" data-a="peek">Meine Zahl ansehen</button>' : '',
      };
    })}</div>`;
}

function boardBobs(st) {
  const labels = Array.from({ length: st.cfg.bull ? 21 : 20 }, (_, i) => (i < 20 ? i + 1 : 'B'));
  return playerGrid(st, (p) => {
    const leg = st.leg, ml = matchLine(st, p);
    const out = leg.contenders ? !leg.contenders.includes(p) : leg.out[p];
    const t = bobsTarget(leg, p);
    return {
      cls: out ? 'out' : '',
      body: `<div class="p-rem">${leg.score[p]}</div>
      ${roundTrack(st, p, labels)}
      <div class="p-meta"><span>Ziel <b>${leg.rounds[p] < leg.stage ? (t === 25 ? 'Bull' : 'D' + t) : '✓'}</b></span><span>Quote <b>${pct(ml.hitRate)}</b></span><span>Darts <b>${st.legDarts[p]}</b></span></div>
      ${leg.out[p] && !leg.contenders ? '<div class="p-note">Raus, unter 0</div>' : tiebreakNote(st, p)}`,
    };
  });
}

function boardHalveit(st) {
  const labels = st.cfg.targets.map((t) => (t === 'B' || t === 'DB' ? 'B' : t));
  return playerGrid(st, (p) => {
    const leg = st.leg, ml = matchLine(st, p);
    const out = leg.contenders && !leg.contenders.includes(p);
    return {
      cls: out ? 'out' : '',
      body: `<div class="p-rem">${leg.score[p]}</div>
      ${roundTrack(st, p, labels)}
      <div class="p-meta"><span>Ziel <b>${leg.rounds[p] < leg.stage ? halveLabel(halveTarget(leg, p, st.cfg)) : '✓'}</b></span><span>Quote <b>${pct(ml.hitRate)}</b></span><span>Halbiert <b>${ml.halved}</b></span></div>
      ${tiebreakNote(st, p)}`,
    };
  });
}

function boardC121(st) {
  return playerGrid(st, (p, pl, active) => {
    const leg = st.leg, cfg = st.cfg;
    const done = leg.rounds[p] >= leg.stage;
    const lock = leg.floor[p] > cfg.start ? ` · gesichert ${leg.floor[p]}` : '';
    return {
      cls: leg.contenders && !leg.contenders.includes(p) ? 'out' : '',
      body: `<div class="p-rem">${done ? '✓' : `<span class="p-lbl">Ziel ${leg.target[p]}${lock}</span>${leg.rem[p]}`}</div>
      <div class="p-meta"><span>Versuch <b>${Math.min(leg.rounds[p] + 1, leg.stage)}/${leg.stage}</b></span><span>Darts <b>${leg.attemptDarts[p]}/${cfg.turns * 3}</b></span><span>Bestes <b>${leg.best[p] || '–'}</b></span><span>Checks <b>${leg.checks[p]}</b></span></div>
      ${tiebreakNote(st, p)}`,
      after: active ? checkoutHint(suggestCheckout(leg.rem[p], 3 - st.turn.darts.length, 'double')) : '',
    };
  });
}

function boardGallery(st) {
  return playerGrid(st, (p, pl, active) => {
    const leg = st.leg, ml = matchLine(st, p);
    const done = leg.rounds[p] >= leg.stage;
    return {
      cls: leg.contenders && !leg.contenders.includes(p) ? 'out' : '',
      body: `<div class="p-rem">${done ? '✓' : `<span class="p-lbl">Ziel ${leg.target[p]}</span>${leg.rem[p]}`}</div>
      <div class="p-meta"><span>Punkte <b>${leg.score[p]}</b></span><span>Versuch <b>${Math.min(leg.rounds[p] + 1, leg.stage)}/${leg.stage}</b></span><span>Darts <b>${leg.attemptDarts[p]}/9</b></span><span>Checks <b>${ml.checks}</b></span></div>
      ${tiebreakNote(st, p)}`,
      after: active ? checkoutHint(suggestCheckout(leg.rem[p], 3 - st.turn.darts.length, 'double')) : '',
    };
  });
}

function boardTtt(st) {
  const g = st.cfg.grid, leg = st.leg, sym = ['✕', '◯'];
  const heads = S.game.playerIds.map((id, p) => {
    const pl = player(id), active = st.current === p && !st.finished;
    return `<span class="c-player ${active ? 'active' : ''}" style="--pc:${pl.color}"><b>${sym[p]} ${esc(pl.name)}</b><em>${leg.owner.filter((o) => o === p).length}</em><small>${legSetLine(st, p) || 'Felder'}</small></span>`;
  }).join('');
  const cells = g.map((v, i) => {
    const o = leg.owner[i];
    const prog = st.cfg.need > 1 && o < 0 ? S.game.playerIds.map((_, p) => (leg.marks[p][i] ? `<i style="--pc:${pcolor(p)}">${leg.marks[p][i]}/${st.cfg.need}</i>` : '')).join('') : '';
    return `<div class="t-cell ${o >= 0 ? 'own' : ''}" ${o >= 0 ? `style="--pc:${pcolor(o)}"` : ''}><b>${v === 25 ? 'Bull' : v}</b>${o >= 0 ? `<span>${sym[o]}</span>` : ''}${prog ? `<small>${prog}</small>` : ''}</div>`;
  }).join('');
  return `<div class="ttt"><div class="tt-heads">${heads}</div><div class="tt-grid">${cells}</div>
    ${st.turn ? `<div class="c-turn" style="--pc:${pcolor(st.current)}"><span>${esc(pname(st.current))}</span>${turnSlots(st)}</div>` : ''}</div>`;
}

const ring = (pos) => ((pos % 20) + 20) % 20;
function boardHare(st) {
  const leg = st.leg;
  const race = ROUTE.map((nr, i) => {
    const here = S.game.playerIds.map((_, q) => q).filter((q) => leg.pos[q] < 20 && ring(leg.pos[q]) === i);
    return `<i class="${here.length ? 'occ' : ''}"><b>${nr}</b>${here.map((q) => `<em style="--pc:${pcolor(q)}">${q === leg.hare ? 'H' : '●'}</em>`).join('')}</i>`;
  }).join('');
  return `<div class="hare"><div class="race">${race}</div>${playerGrid(st, (p) => {
    const isHare = p === leg.hare, gap = leg.pos[leg.hare] - leg.pos[p];
    return {
      head: `<span class="role ${isHare ? 'h' : ''}">${isHare ? 'Hase' : 'Hund'}</span>`,
      body: `<div class="p-rem"><span class="p-lbl">Ziel</span>${leg.pos[p] >= 20 ? '✓' : hareTarget(leg, p)}</div>
      <div class="p-meta">${isHare ? `<span>Geschafft <b>${leg.pos[p]}/20</b></span>` : `<span>Abstand <b>${gap}</b></span>`}<span>Quote <b>${pct(matchLine(st, p).hitRate)}</b></span></div>`,
    };
  })}</div>`;
}

// Muss der Werfer gerade das Ziel treffen? Vor dem ersten Dart stammen mode und hitAt noch aus der Vor-Aufnahme.
const hunting = (st) => Boolean(st.turn && st.leg.target && (st.turn.darts.length === 0 || (st.leg.mode === 'hit' && st.leg.hitAt < 0)));
function boardFollow(st) {
  const leg = st.leg;
  const t = leg.target;
  const head = t ? `<span class="p-lbl">Ziel</span><b>${dartLabel(t)}</b><small>von ${esc(pname(leg.setter))}</small>` : '<span class="p-lbl">Ziel</span><b>?</b><small>wird festgelegt</small>';
  return `<div class="follow"><div class="ftarget">${head}</div>${playerGrid(st, (p, pl, active) => {
    const out = leg.lives[p] <= 0;
    let note = out ? 'Raus' : '';
    if (active && !out) {
      note = !hunting(st) ? 'Dein letzter Dart legt das neue Ziel fest' : leg.setter === p ? 'Dein Ziel kam zurück: treffen oder passen' : `Triff ${dartLabel(leg.target)}`;
    }
    return {
      cls: out ? 'out' : '',
      body: `${pips(st.cfg.lives, leg.lives[p])}<div class="p-note">${note}</div>
      <div class="p-meta"><span>Getroffen <b>${pct(matchLine(st, p).hitRate)}</b></span><span>Darts <b>${st.legDarts[p]}</b></span></div>`,
    };
  })}</div>`;
}

function boardGolf(st) {
  return playerGrid(st, (p) => {
    const leg = st.leg, turns = legTurns(st, p), done = leg.rounds[p];
    const cnt = Math.max(leg.stage, done + (st.current === p ? 1 : 0));
    const cells = Array.from({ length: cnt }, (_, i) => {
      if (i < done) { const s = turns[i]?.strokes; return `<i class="${s === 1 ? 'ace' : s <= 3 ? 'on' : 'miss'}">${s}</i>`; }
      return `<i class="${i === done && st.current === p && !st.finished ? 'cur' : ''}">${tLabel(golfTarget(i + 1))}</i>`;
    }).join('');
    const out = leg.contenders && !leg.contenders.includes(p);
    return {
      cls: out ? 'out' : '',
      body: `<div class="p-rem">${leg.strokes[p]}<span class="p-unit">Schläge</span></div>
      <div class="track" style="--cnt:${cnt}">${cells}</div>
      <div class="p-meta"><span>Loch <b>${done < leg.stage || leg.contenders ? tLabel(golfTarget(golfHole(leg, p))) : '✓'}</b></span><span>Ø/Loch <b>${num(matchLine(st, p).perHole)}</b></span><span>Hole in One <b>${matchLine(st, p).aces}</b></span></div>
      ${tiebreakNote(st, p)}`,
    };
  });
}

function boardKnockout(st) {
  const leg = st.leg;
  return playerGrid(st, (p) => {
    const out = leg.lives[p] <= 0, turns = legTurns(st, p), last = turns.at(-1);
    return {
      cls: out ? 'out' : '',
      body: `<div class="p-rem">${last ? last.points : '–'}<span class="p-unit">zuletzt</span></div>
      ${pips(st.cfg.lives, leg.lives[p])}
      <div class="p-meta"><span>Ø Runde <b>${num(matchLine(st, p).ppr)}</b></span><span>Striche <b>${st.cfg.lives - leg.lives[p]}</b></span></div>
      ${out ? '<div class="p-note">Raus</div>' : ''}`,
    };
  });
}

function boardNine(st) {
  const labels = ALL_NUMS;
  return playerGrid(st, (p) => {
    const leg = st.leg, out = leg.lives[p] <= 0, ml = matchLine(st, p);
    return {
      cls: out ? 'out' : '',
      body: `<div class="p-rem">${leg.pos[p] >= 20 ? '✓' : `<span class="p-lbl">Ziel</span>${leg.pos[p] + 1}`}</div>
      ${posTrack(labels, leg.pos[p])}
      ${pips(st.cfg.lives, leg.lives[p])}
      <div class="p-meta"><span>Quote <b>${pct(ml.hitRate)}</b></span><span>Darts <b>${st.legDarts[p]}</b></span></div>
      ${out ? '<div class="p-note">Raus</div>' : ''}`,
    };
  });
}

function boardGotcha(st) {
  return playerGrid(st, (p) => {
    const s = st.leg.score[p], ml = matchLine(st, p);
    return {
      body: `<div class="p-rem">${s}</div>
      <div class="p-meta"><span>Noch <b>${st.cfg.goal - s}</b></span><span>Ø <b>${num(ml.avg)}</b></span><span>Gotchas <b>${ml.kills}</b></span></div>`,
    };
  });
}

const jdcVisitLabel = (v) => (v.kind === 'sh' ? String(v.n) : v.kind === 'dbl' ? v.dbl.map((t) => (t === 25 ? 'Bull' : 'D' + t)).join(' ') : 'Bull');
function boardJdc(st) {
  return playerGrid(st, (p) => {
    const leg = st.leg, ml = matchLine(st, p), done = leg.rounds[p] >= leg.stage && !leg.contenders;
    const v = jdcVisit(leg, p, st.cfg);
    return {
      cls: leg.contenders && !leg.contenders.includes(p) ? 'out' : '',
      body: `<div class="p-rem">${leg.score[p]}</div>
      <div class="p-meta"><span>Teil <b>${done ? '✓' : v.part || 'Stechen'}</b></span><span>Ziel <b>${done ? '–' : jdcVisitLabel(v)}</b></span><span>Runde <b>${Math.min(leg.rounds[p] + 1, leg.stage)}/${leg.stage}</b></span></div>
      <div class="p-meta"><span>Teil 1 <b>${leg.parts[p][1]}</b></span><span>Teil 2 <b>${leg.parts[p][2]}</b></span><span>Teil 3 <b>${leg.parts[p][3]}</b></span>${st.cfg.reps === 1 ? `<span>Stufe <b>${jdcGrade(leg.score[p])}</b></span>` : ''}</div>
      ${tiebreakNote(st, p)}`,
    };
  });
}

// ---------- Leisten über dem Brett ----------
const roundBar = (st, r, of, target) => `${st.leg.contenders ? 'Stechen' : `Runde ${r}<small>von ${of}</small>`} · Ziel <b>${target}</b>`;
const one = (st, n) => (st.turn ? [[n, pcolor(st.current)]] : []);

// ---------- Statistik-Abschnitte ----------
const endsStats = (title, label) => (e, h) => `<div class="stats">
    ${h.tile('Ø Endstand', num(e.avgScore, 0), `${e.finishedLegs} Legs`)}
    ${h.tile('Bester Endstand', e.bestScore ?? '–')}
    ${h.tile('Trefferquote', pct(e.hitRate), `${e.hits} von ${e.darts} Darts aufs Ziel`)}
    ${'halved' in e ? h.tile('Halbiert', e.halved, `in ${e.turns} Runden`) : ''}
    ${h.matchTiles(e)}
  </div>${h.trend(e.history, label, 0)}${h.recent(e.history, title, label, 0)}`;
const hitStats = (title, extra = () => '') => (a, h) => `<div class="stats">
    ${h.tile('Trefferquote', pct(a.hitRate), `${a.hits} von ${a.darts} Darts aufs Ziel`)}
    ${'bestLeg' in a ? h.tile('Bestes Leg', a.bestLeg ? a.bestLeg + ' Darts' : '–') : ''}
    ${extra(a, h)}${h.matchTiles(a)}
  </div>${h.trend(a.history, 'Trefferquote in %', 1)}${h.recent(a.history, title, 'Trefferquote', 1, ' %')}`;
const mprStats = (title) => (c, h) => `<div class="stats">${h.tile('MPR', num(c.mpr, 2), `${c.darts} Darts`)}${h.matchTiles(c)}</div>
  ${h.trend(c.history, 'MPR', 2)}${h.recent(c.history, title, 'MPR', 2)}`;

// ---------- Modi ----------
const marksSum = (t) => sumBy(t, 'marks') + ' M';
const ptsSum = (t) => String(sumBy(t, 'pts'));
const advSum = (t) => '+' + sumBy(t, 'adv');

Object.assign(MODES, {
  x01: {
    label: 'X01', group: 'classic',
    opts: [
      ['start', 'Startpunkte', [[301, '301'], [501, '501'], [701, '701'], [1001, '1001']], 501],
      ['in', 'Einstieg', [['single', 'Single In'], ['double', 'Double In'], ['master', 'Master In']]],
      ['out', 'Finish', [['single', 'Single Out'], ['double', 'Double Out'], ['master', 'Master Out']], 'double'],
    ],
    config: (s) => ({ start: s.start, in: s.in, out: s.out }),
    board: boardX01,
    turnSum: ptsSum,
    homeScore: (st, p) => st.leg.rem[p],
    col: ['Ø', (ml) => num(ml.avg)],
    overlaySub: (st, ev) => `<p class="ov-sub">Checkout ${ev.turn.before} mit ${ev.turn.darts.map(dartLabel).join(' ')}</p>`,
    stats: (x, h) => {
      const doubles = Object.entries(x.doubles).sort((u, v) => v[1].tries - u[1].tries).slice(0, 12);
      return `<div class="stats">
      ${h.tile('3-Dart-Ø', num(x.avg, 2), `${x.darts} Darts`)}
      ${h.tile('First 9 Ø', num(x.f9, 2))}
      ${h.tile('Checkout-Quote', pct(x.coRate), `${x.checkouts} von ${x.atDouble} Darts`)}
      ${h.tile('Höchstes Finish', x.highOut || '–')}
      ${h.tile('Bestes Leg', x.bestLeg ? x.bestLeg + ' Darts' : '–')}
      ${h.matchTiles(x)}
      ${h.tile('180 · 140+ · 100+', `${x.t180} · ${x.t140} · ${x.t100}`)}
    </div>
    ${h.trend(x.history, '3-Dart-Ø', 1)}
    ${doubles.length ? `<h3 class="sec">Doppelquote <small>Darts mit Ein-Dart-Finish (Double Out)</small></h3>
      <div class="doubles">${doubles.map(([key, v]) => `<div class="dbl"><b>${key}</b><span class="bar"><i style="width:${Math.round((v.hits / v.tries) * 100)}%"></i></span><small>${v.hits}/${v.tries} · ${pct(v.hits / v.tries)}</small></div>`).join('')}</div>` : ''}
    ${h.recent(x.history, 'X01', '3-Dart-Ø', 2)}`;
    },
  },
  cricket: {
    label: 'Cricket', group: 'classic',
    opts: [
      ['variant', 'Variante', [['standard', 'Standard'], ['cutthroat', 'Cut-Throat']]],
      ['crNums', 'Zahlen', [['std', '15–20 + Bull'], ['random', 'Zufall: 6 + Bull']]],
    ],
    config: (s) => ({ variant: s.variant, random: s.crNums === 'random' }),
    // Revanche übernimmt die alte config. Ohne Zufall darf keine alte Zahlenliste mitreisen.
    prepare: (cfg) => { const { numbers, ...rest } = cfg; return rest; },
    board: boardMarks,
    nums: (st) => cricketRows(st.cfg).filter((r) => r.value && r.value !== 25).map((r) => r.value),
    turnSum: marksSum,
    homeScore: (st, p) => st.leg.score[p],
    col: ['MPR', (ml) => num(ml.mpr, 2)],
    stats: mprStats('Cricket'),
  },

  // ---------- Party ----------
  killer: {
    label: 'Killer', group: 'party',
    opts: [
      ['kLives', 'Leben', [[1, '1'], [3, '3'], [5, '5']], 3],
      ['kZone', 'Treffer', [['double', 'Nur Doppel'], ['segment', 'Ganzes Feld']]],
      ['kSelf', 'Eigene Zahl als Killer', [[1, 'Kostet Leben'], [0, 'Zählt nicht']]],
    ],
    config: (s) => ({ lives: s.kLives, zone: s.kZone, selfHit: Boolean(s.kSelf) }),
    board: boardKiller,
    targets: (st) => {
      if (!st.turn) return [];
      const p = st.current;
      if (!st.leg.killer[p]) return [[st.cfg.numbers[p], pcolor(p)]];
      return st.cfg.numbers.map((nr, q) => [nr, pcolor(q), q]).filter(([, , q]) => q !== p && st.leg.lives[q] > 0);
    },
    mult: (st) => (st.turn && st.cfg.zone === 'double' ? 2 : 0),
    turnSum: (t) => { const k = sumBy(t, 'taken'); return k ? '−' + k : '0'; },
    homeScore: (st, p) => (st.leg.lives[p] > 0 ? st.leg.lives[p] + ' ♥' : 'raus'),
    col: ['−Leben', (ml) => ml.taken],
    stats: (k, h) => `<div class="stats">
      ${h.tile('Ø Darts bis Killer', num(k.avgToKiller, 1), `${k.killerLegs} Legs`)}
      ${h.tile('Leben genommen', k.taken, `${num(k.takenPerLeg, 1)} je Leg`)}
      ${h.matchTiles(k)}
    </div>${h.trend(k.history, 'Darts bis Killer', 1)}${h.recent(k.history, 'Killer', 'Darts bis Killer', 1)}`,
  },
  blindkiller: {
    label: 'Blind Killer', group: 'party',
    opts: [
      ['bkLives', 'Leben', [[3, '3'], [5, '5']]],
      ['bkTriple', 'Triple', [[0, 'Zählt nicht'], [1, 'Kostet 2 Leben']]],
    ],
    config: (s) => ({ lives: s.bkLives, triple: Boolean(s.bkTriple) }),
    board: boardBlind,
    targets: (st) => (st.turn ? st.cfg.numbers.filter((nr, q) => st.leg.lives[q] > 0).map((nr) => [nr, 'var(--gold)']) : []),
    mult: (st) => (st.turn ? 2 : 0),
    turnSum: (t) => { const k = sumBy(t, 'taken') + sumBy(t, 'lost'); return k ? '−' + k : '0'; },
    homeScore: (st, p) => (st.leg.lives[p] > 0 ? 'im Spiel' : 'raus'),
    col: ['−Leben', (ml) => ml.taken],
    // Am Leg-Ende ist st.cfg schon das nächste Leg. Die aufgedeckten Zahlen stehen beim beendeten Leg.
    overlaySub: (st) => `<p class="ov-sub">Zahlen: ${S.game.playerIds.map((_, q) => `${esc(pname(q))} ${st.legResults.at(-1).cfg.numbers[q]}`).join(' · ')}</p>`,
    stats: (b, h) => `<div class="stats">
      ${h.tile('Doppeltreffer', pct(b.hitRate), `${b.hits} von ${b.darts} Darts auf Zahlen im Spiel`)}
      ${h.tile('Leben genommen', b.taken, `${num(b.takenPerLeg, 1)} je Leg`)}
      ${h.tile('Eigentreffer', b.lost)}
      ${h.matchTiles(b)}
    </div>${h.trend(b.history, 'Leben genommen je Leg', 1)}${h.recent(b.history, 'Blind-Killer', 'Leben genommen je Leg', 1)}`,
  },
  ttt: {
    label: 'Tic-Tac-Toe', group: 'party',
    opts: [['tNeed', 'Feld nehmen mit', [[1, '1 Treffer'], [4, '4 Marks']]]],
    config: (s) => ({ need: s.tNeed }),
    board: boardTtt,
    nums: (st) => st.cfg.grid.filter((v) => v !== 25).sort((a, b) => a - b),
    targets: (st) => (st.turn ? st.cfg.grid.filter((v, i) => st.leg.owner[i] < 0 && v !== 25).map((v) => [v, pcolor(st.current)]) : []),
    turnSum: (t) => '+' + t.infos.filter((x) => x.claim !== undefined).length,
    homeScore: (st, p) => st.leg.owner.filter((o) => o === p).length + ' Felder',
    col: ['Felder', (ml) => ml.fields],
    stats: hitStats('Tic-Tac-Toe', (a, h) => h.tile('Ø Felder je Leg', num(a.fieldsPerLeg, 1))),
  },
  hare: {
    label: 'Hare and Hounds', group: 'party',
    opts: [
      ['hhStart', 'Hunde starten auf', [[5, '5'], [12, '12']]],
      ['hhSkip', 'Double/Triple', [[0, '1 Feld'], [1, '2 bzw. 3 Felder']]],
      ['hhCatch', 'Hund gewinnt beim', [['reach', 'Einholen'], ['pass', 'Überholen']]],
    ],
    config: (s) => ({ start: s.hhStart, skip: Boolean(s.hhSkip), catch: s.hhCatch }),
    board: boardHare,
    targets: (st) => one(st, hareTarget(st.leg, st.current)),
    turnSum: advSum,
    homeScore: (st, p) => (p === st.leg.hare ? 'Hase ' : 'Hund ') + Math.max(0, st.leg.pos[p]) + '/20',
    col: ['Quote', (ml) => pct(ml.hitRate)],
    overlaySub: (st, ev) => `<p class="ov-sub">${ev.turn.infos.some((i) => i.event === 'caught') ? 'Hase eingeholt' : 'Der Hase ist durch'}</p>`,
    stats: hitStats('Hare-and-Hounds', (a, h) => `${h.tile('Als Hase', `${a.hareWins} / ${a.hareLegs}`, 'Legs gewonnen')}${h.tile('Als Hund', `${a.houndWins} / ${a.houndLegs}`, 'Legs gewonnen')}`),
  },
  follow: {
    label: 'Follow the Leader', group: 'party',
    opts: [
      ['flSet', 'Ziel festlegen', [['first', 'Erster Treffer'], ['last', 'Letzter Dart (darts501)']]],
      ['flLives', 'Leben', [[3, '3'], [5, '5']]],
    ],
    config: (s) => ({ lives: s.flLives, set: s.flSet }),
    board: boardFollow,
    targets: (st) => (hunting(st) ? one(st, st.leg.target.s) : []),
    mult: (st) => (hunting(st) && st.leg.target.m > 1 ? st.leg.target.m : 0),
    turnSum: (t) => (t.infos.some((x) => x.hit) ? '✓' : t.infos[0]?.mode === 'set' ? 'Ziel' : '–'),
    homeScore: (st, p) => (st.leg.lives[p] > 0 ? st.leg.lives[p] + ' ♥' : 'raus'),
    col: ['Getroffen', (ml) => pct(ml.hitRate)],
    stats: (f, h) => `<div class="stats">
      ${h.tile('Ziel getroffen', pct(f.hitRate), `${f.hits} von ${f.tries} Versuchen`)}
      ${h.tile('Leben verloren', f.lost, `${num(f.lostPerLeg, 1)} je Leg`)}
      ${h.matchTiles(f)}
    </div>${h.trend(f.history, 'Ziel getroffen in %', 0)}${h.recent(f.history, 'Follow-the-Leader', 'Ziel getroffen', 0, ' %')}`,
  },
  knockout: {
    label: 'Knockout', group: 'party',
    opts: [
      ['koLives', 'Striche bis raus', [[3, '3'], [5, '5']]],
      ['koBar', 'Zu schlagen', [['prev', 'Vorwerfer'], ['high', 'Höchstwert']]],
    ],
    config: (s) => ({ lives: s.koLives, bar: s.koBar }),
    board: boardKnockout,
    turnSum: ptsSum,
    homeScore: (st, p) => (st.leg.lives[p] > 0 ? st.leg.lives[p] + ' ♥' : 'raus'),
    col: ['Ø Runde', (ml) => num(ml.ppr)],
    bar: (st) => (st.turn ? (st.leg.bar === null ? 'Erste Runde gibt vor' : `Zu schlagen <b>${st.leg.bar}</b>`) : ''),
    stats: (k, h) => `<div class="stats">
      ${h.tile('Ø Runde', num(k.ppr, 1), `${k.turns} Runden`)}
      ${h.tile('Striche', k.strikes, `${num(k.strikesPerLeg, 1)} je Leg`)}
      ${h.matchTiles(k)}
    </div>${h.trend(k.history, 'Ø Runde', 1)}${h.recent(k.history, 'Knockout', 'Ø Runde', 1)}`,
  },
  gotcha: {
    label: 'Gotcha', group: 'party',
    opts: [
      ['goGoal', 'Ziel', [[201, '201'], [301, '301'], [501, '501']], 301],
      ['goOver', 'Überwerfen', [['bust', 'Bust'], ['back', 'Rest zurück']]],
      ['goOut', 'Beenden mit', [['any', 'Beliebig'], ['double', 'Doppel']]],
    ],
    config: (s) => ({ goal: s.goGoal, over: s.goOver, out: s.goOut }),
    board: boardGotcha,
    turnSum: ptsSum,
    homeScore: (st, p) => st.leg.score[p],
    col: ['Ø', (ml) => num(ml.avg)],
    stats: (g, h) => `<div class="stats">
      ${h.tile('3-Dart-Ø', num(g.avg, 1), `${g.darts} Darts`)}
      ${h.tile('Gotchas', g.kills, 'Gegner auf 0 gesetzt')}
      ${h.matchTiles(g)}
    </div>${h.trend(g.history, '3-Dart-Ø', 1)}${h.recent(g.history, 'Gotcha', '3-Dart-Ø', 1)}`,
  },
  mickey: {
    label: 'Mickey Mouse', group: 'party',
    opts: [
      ['mmDt', 'Doppel- und Triple-Feld', B],
      ['mmOrder', 'Reihenfolge', [[0, 'Beliebig'], [1, 'Der Reihe nach']]],
      ['mmPoints', 'Punkte', [[0, 'Ohne'], [1, 'Wie Cricket']]],
    ],
    config: (s) => ({ dt: Boolean(s.mmDt), ordered: Boolean(s.mmOrder), points: Boolean(s.mmPoints) }),
    board: boardMarks,
    nums: (st) => (st.cfg.dt ? ALL_NUMS : [20, 19, 18, 17, 16, 15, 14, 13, 12]),
    turnSum: marksSum,
    homeScore: (st, p) => (st.cfg.points ? st.leg.score[p] : ''),
    col: ['MPR', (ml) => num(ml.mpr, 2)],
    stats: mprStats('Mickey-Mouse'),
  },
  shove: {
    label: "Shove Ha'penny", group: 'party',
    opts: [['shBull', 'Bull', [[1, 'Mit Bull'], [0, 'Ohne Bull']]]],
    config: (s) => ({ bull: Boolean(s.shBull) }),
    board: boardMarks,
    nums: () => [1, 2, 3, 4, 5, 6, 7, 8, 9],
    turnSum: marksSum,
    homeScore: () => '',
    col: ['MPR', (ml) => num(ml.mpr, 2)],
    stats: mprStats("Shove-Ha'penny"),
  },
  shanghai: {
    label: 'Shanghai', group: 'party',
    opts: [
      ['shRounds', 'Runden', [[7, '1–7'], [10, '1–10'], [20, '1–20']]],
      ['shInstant', 'Shanghai', [[1, 'Gewinnt sofort'], [0, 'Nur Punkte']]],
    ],
    config: (s) => ({ rounds: s.shRounds, instant: Boolean(s.shInstant) }),
    board: boardShanghai,
    targets: (st) => one(st, shanghaiTarget(st.leg.rounds[st.current] + 1)),
    turnSum: ptsSum,
    homeScore: (st, p) => st.leg.score[p],
    col: ['Punkte', (ml) => ml.points],
    bar: (st) => (st.turn ? roundBar(st, st.leg.rounds[st.current] + 1, st.cfg.rounds, tLabel(shanghaiTarget(st.leg.rounds[st.current] + 1))) : ''),
    overlaySub: (st, ev) => (ev.turn.p === ev.p && ev.turn.infos.some((i) => i.event === 'shanghai') ? '<p class="ov-sub">mit einem Shanghai</p>' : ''),
    stats: (sh, h) => `<div class="stats">
      ${h.tile('Ø Punkte je Runde', num(sh.ppr, 1), `${sh.turns} Runden`)}
      ${h.tile('Trefferquote', pct(sh.hitRate), `${sh.hits} von ${sh.darts} Darts auf die Zahl`)}
      ${h.tile('Beste Punktzahl', sh.bestScore ?? '–', 'in einem Leg')}
      ${h.tile('Shanghais', sh.shanghais)}
      ${h.matchTiles(sh)}
    </div>${h.trend(sh.history, 'Ø Punkte je Runde', 1)}${h.recent(sh.history, 'Shanghai', 'Ø Punkte je Runde', 1)}`,
  },
  halveit: {
    label: 'Halve-It', group: 'party',
    opts: [
      ['hSet', 'Ziele', [['std', 'Standard (9)'], ['short', 'Kurz (6)'], ['random', 'Zufall (9)']]],
      ['hRound', 'Halbieren', [['up', 'Aufrunden'], ['down', 'Abrunden']]],
    ],
    config: (s) => ({ set: s.hSet, round: s.hRound }),
    prepare: (cfg) => ({ ...cfg, targets: cfg.set === 'random' ? [] : [...HALVE_SETS[cfg.set]] }),
    board: boardHalveit,
    targets: (st) => { const k = st.turn && halveKey(halveTarget(st.leg, st.current, st.cfg)); return k ? one(st, k) : []; },
    mult: (st) => { const t = st.turn && halveTarget(st.leg, st.current, st.cfg); return t === 'D' || t === 'DB' ? 2 : t === 'T' ? 3 : 0; },
    turnSum: (t) => signed(sumBy(t, 'pts')),
    homeScore: (st, p) => st.leg.score[p],
    col: ['Punkte', (ml) => ml.score],
    bar: (st) => (st.turn ? roundBar(st, st.leg.rounds[st.current] + 1, st.leg.stage, halveLabel(halveTarget(st.leg, st.current, st.cfg))) : ''),
    overlaySub: (st, ev) => `<p class="ov-sub">Endstand ${st.legResults.at(-1).scores[ev.p]}</p>`,
    stats: endsStats('Halve-It', 'Ø Endstand'),
  },
  bermuda: {
    label: 'Bermuda Triangle', group: 'party',
    opts: [['beRound', 'Halbieren', [['down', 'Abrunden'], ['up', 'Aufrunden']]]],
    config: (s) => ({ round: s.beRound }),
    prepare: (cfg) => ({ ...cfg, targets: [...BERMUDA] }),
    board: boardHalveit,
    targets: (st) => { const k = st.turn && halveKey(halveTarget(st.leg, st.current, st.cfg)); return k ? one(st, k) : []; },
    mult: (st) => { const t = st.turn && halveTarget(st.leg, st.current, st.cfg); return t === 'D' || t === 'DB' ? 2 : t === 'T' ? 3 : 0; },
    turnSum: (t) => signed(sumBy(t, 'pts')),
    homeScore: (st, p) => st.leg.score[p],
    col: ['Punkte', (ml) => ml.score],
    bar: (st) => {
      if (!st.turn) return '';
      const t = halveTarget(st.leg, st.current, st.cfg);
      return roundBar(st, st.leg.rounds[st.current] + 1, st.leg.stage, t === '25' ? '25 + Bull (je 25)' : halveLabel(t));
    },
    overlaySub: (st, ev) => `<p class="ov-sub">Endstand ${st.legResults.at(-1).scores[ev.p]}</p>`,
    stats: endsStats('Bermuda', 'Ø Endstand'),
  },
  golf: {
    label: 'Golf', group: 'party',
    opts: [
      ['gHoles', 'Löcher', [[9, '9'], [18, '18']]],
      ['gCount', 'Es zählt', [['last', 'Letzter Dart'], ['best', 'Bester Dart']]],
      ['gTable', 'Schläge', [['gld', 'D1 · T2 · S3 · 5'], ['darthelp', 'D1 · T3 · S4 · 5']]],
    ],
    config: (s) => ({ holes: s.gHoles, count: s.gCount, table: s.gTable }),
    board: boardGolf,
    targets: (st) => one(st, golfTarget(golfHole(st.leg, st.current))),
    mult: (st) => (st.turn ? 2 : 0),
    turnSum: (t) => (t.infos.length ? t.infos.at(-1).cur + ' S' : ''),
    homeScore: (st, p) => st.leg.strokes[p] + ' Schläge',
    col: ['Ø/Loch', (ml) => num(ml.perHole)],
    bar: (st) => (st.turn ? `${st.leg.contenders ? 'Stechen' : `Loch ${golfHole(st.leg, st.current)}<small>von ${st.cfg.holes}</small>`} · Ziel <b>${tLabel(golfTarget(golfHole(st.leg, st.current)))}</b>` : ''),
    overlaySub: (st, ev) => `<p class="ov-sub">${st.legResults.at(-1).scores[ev.p]} Schläge</p>`,
    stats: (g, h) => `<div class="stats">
      ${h.tile('Ø Schläge je Loch', num(g.perHole, 2), `${g.holes} Löcher`)}
      ${h.tile('Beste Runde', [9, 18].filter((k) => g.best[k] != null).map((k) => `${g.best[k]} <small>(${k})</small>`).join(' · ') || '–')}
      ${h.tile('Hole in One', g.aces)}
      ${h.matchTiles(g)}
    </div>${h.trend(g.history, 'Ø Schläge je Loch', 2)}${h.recent(g.history, 'Golf', 'Ø Schläge je Loch', 2)}`,
  },
  ninelives: {
    label: 'Nine Lives', group: 'party',
    opts: [['nlLives', 'Leben', [[3, '3'], [9, '9']]]],
    config: (s) => ({ lives: s.nlLives }),
    board: boardNine,
    targets: (st) => (st.turn && st.leg.pos[st.current] < 20 ? one(st, st.leg.pos[st.current] + 1) : []),
    turnSum: (t) => '+' + t.infos.filter((x) => x.hit).length,
    homeScore: (st, p) => (st.leg.lives[p] > 0 ? `→ ${st.leg.pos[p] + 1} · ${st.leg.lives[p]} ♥` : 'raus'),
    col: ['Quote', (ml) => pct(ml.hitRate)],
    stats: hitStats('Nine-Lives', (a, h) => h.tile('Leben verloren', a.lost, `${num(a.lostPerLeg, 1)} je Leg`)),
  },

  // ---------- Training ----------
  atc: {
    label: 'Around the Clock', group: 'training',
    opts: [
      ['atcBull', 'Ziele', [[0, '1–20'], [1, '1–20 + Bull']]],
      ['atcOrder', 'Reihenfolge', [['asc', 'Aufsteigend'], ['desc', 'Absteigend'], ['random', 'Zufällig']]],
      ['atcZone', 'Treffer', [['any', 'Jedes Feld'], ['skip', 'D/T springt'], ['double', 'Nur Doppel'], ['triple', 'Nur Triple']]],
    ],
    config: (s) => ({ zone: s.atcZone, bull: Boolean(s.atcBull), order: s.atcOrder }),
    prepare: (cfg) => { const { targets, ...rest } = cfg; return rest; },
    board: boardAtc,
    targets: (st) => { const t = st.turn && atcTargets(st.cfg)[st.leg.pos[st.current]]; return t ? one(st, t) : []; },
    turnSum: advSum,
    homeScore: (st, p) => { const t = atcTargets(st.cfg)[st.leg.pos[p]]; return t ? '→ ' + tLabel(t) : '✓'; },
    col: ['Quote', (ml) => pct(ml.hitRate)],
    overlaySub: (st, ev) => `<p class="ov-sub">Durch in ${st.legResults.at(-1).darts[ev.p]} Darts</p>`,
    stats: hitStats('Around-the-Clock'),
  },
  dbl: {
    label: 'Doppel-Training', group: 'training',
    opts: [
      ['dbOrder', 'Reihenfolge', [['asc', 'D1 → D20'], ['desc', 'D20 → D1'], ['random', 'Zufällig']]],
      ['dbBull', 'Bull am Ende', [[0, 'Nein'], [1, 'Ja']]],
    ],
    config: (s) => ({ zone: 'double', order: s.dbOrder, bull: Boolean(s.dbBull) }),
    board: boardDbl,
    targets: (st) => { const t = st.turn && atcTargets(st.cfg)[st.leg.pos[st.current]]; return t ? one(st, t) : []; },
    mult: (st) => (st.turn ? 2 : 0),
    turnSum: advSum,
    homeScore: (st, p) => { const t = atcTargets(st.cfg)[st.leg.pos[p]]; return t ? '→ ' + (t === 25 ? 'Bull' : 'D' + t) : '✓'; },
    col: ['Quote', (ml) => pct(ml.hitRate)],
    overlaySub: (st, ev) => `<p class="ov-sub">Durch in ${st.legResults.at(-1).darts[ev.p]} Darts</p>`,
    stats: (a, h) => `<div class="stats">
      ${h.tile('Darts je Doppel', num(a.perDouble, 2), `${a.hits} Doppel in ${a.darts} Darts`)}
      ${h.tile('Doppelquote', pct(a.hitRate))}
      ${h.tile('Bestes Leg', a.bestLeg ? a.bestLeg + ' Darts' : '–')}
      ${h.matchTiles(a)}
    </div>${h.trend(a.history, 'Darts je Doppel', 2)}${h.recent(a.history, 'Doppel-Training', 'Darts je Doppel', 2)}`,
  },
  chase: {
    label: 'Chase the Dragon', group: 'training',
    opts: [['chLaps', 'Durchgänge', [[1, '1'], [3, '3 (Three-headed)']]]],
    config: (s) => ({ laps: s.chLaps }),
    board: boardChase,
    targets: (st) => { const t = st.turn && chaseTargets(st.cfg)[st.leg.pos[st.current]]; return t ? one(st, t.s) : []; },
    mult: (st) => { const t = st.turn && chaseTargets(st.cfg)[st.leg.pos[st.current]]; return t ? (t.s === 25 ? (t.m === 2 ? 2 : 0) : 3) : 0; },
    turnSum: advSum,
    homeScore: (st, p) => { const t = chaseTargets(st.cfg)[st.leg.pos[p]]; return t ? '→ ' + chaseLabel(t) : '✓'; },
    col: ['Quote', (ml) => pct(ml.hitRate)],
    overlaySub: (st, ev) => `<p class="ov-sub">Durch in ${st.legResults.at(-1).darts[ev.p]} Darts</p>`,
    stats: hitStats('Chase-the-Dragon'),
  },
  bobs: {
    label: "Bob's 27", group: 'training',
    opts: [
      ['bBull', 'Ziele', [[1, 'D1–D20 + Bull'], [0, 'D1–D20']]],
      ['bHard', 'Unter 0', [[1, 'Ausscheiden'], [0, 'Weiterspielen']]],
    ],
    config: (s) => ({ bull: Boolean(s.bBull), hard: Boolean(s.bHard) }),
    board: boardBobs,
    targets: (st) => one(st, bobsTarget(st.leg, st.current)),
    mult: (st) => (st.turn ? 2 : 0),
    turnSum: (t) => signed(sumBy(t, 'pts')),
    homeScore: (st, p) => (st.leg.out[p] ? 'raus' : st.leg.score[p]),
    col: ['Punkte', (ml) => ml.score],
    bar: (st) => {
      if (!st.turn) return '';
      const t = bobsTarget(st.leg, st.current);
      return roundBar(st, st.leg.rounds[st.current] + 1, st.leg.stage, t === 25 ? 'Bull' : 'D' + t);
    },
    overlaySub: (st, ev) => `<p class="ov-sub">Endstand ${st.legResults.at(-1).scores[ev.p]}</p>`,
    stats: (bo, h) => `<div class="stats">
      ${h.tile('Ø Endstand', num(bo.avgScore, 0), `${bo.finishedLegs} Legs`)}
      ${h.tile('Bester Endstand', bo.bestScore ?? '–')}
      ${h.tile('Doppelquote', pct(bo.hitRate), `${bo.hits} von ${bo.darts} Darts aufs Ziel-Doppel`)}
      ${h.tile('Durchgespielt', bo.finishedLegs ? `${bo.survived} / ${bo.finishedLegs}` : '–', 'Legs ohne Ausscheiden')}
      ${h.matchTiles(bo)}
    </div>${h.trend(bo.history, 'Ø Endstand', 0)}${h.recent(bo.history, "Bob's-27", 'Ø Endstand', 0)}`,
  },
  c121: {
    label: '121', group: 'training',
    opts: [
      ['cTurns', 'Darts je Versuch', [[1, '3'], [2, '6'], [3, '9']], 3],
      ['cAttempts', 'Versuche', [[5, '5'], [10, '10'], [20, '20']], 10],
      ['cFail', 'Fehlversuch', [['down', 'Ziel −1'], ['start', 'Zurück auf 121']]],
      ['cLock', 'Sichern', [[1, 'Check in 3 Darts sichert'], [0, 'Nie']]],
    ],
    config: (s) => ({ start: 121, turns: s.cTurns, attempts: s.cAttempts, fail: s.cFail, lock: Boolean(s.cLock) }),
    board: boardC121,
    turnSum: ptsSum,
    homeScore: (st, p) => '→ ' + st.leg.target[p],
    col: ['Bestes Ziel', (ml) => ml.best || '–'],
    bar: (st) => (st.turn ? `${st.leg.contenders ? 'Stechen' : `Versuch ${st.leg.rounds[st.current] + 1}<small>von ${st.leg.stage}</small>`} · Ziel <b>${st.leg.target[st.current]}</b>` : ''),
    overlaySub: (st, ev) => {
      const r = st.legResults.at(-1);
      const mine = st.darts.filter((x) => x.p === ev.p && x.setNo === r.setNo && x.legNo === r.legNo && x.checkout);
      return `<p class="ov-sub">${mine.length ? `Bestes Ziel ${Math.max(...mine.map((x) => x.target))} · ${mine.length} ${mine.length === 1 ? 'Check' : 'Checks'}` : 'Kein Check'}</p>`;
    },
    stats: (cc, h) => `<div class="stats">
      ${h.tile('Höchstes Ziel', cc.best || '–', 'gecheckt')}
      ${h.tile('Checkout-Quote', pct(cc.rate), `${cc.checks} von ${cc.attempts} Versuchen`)}
      ${h.tile('Ø Darts je Check', num(cc.dartsPerCheck, 1))}
      ${h.matchTiles(cc)}
    </div>${h.trend(cc.history, 'Checkout-Quote in %', 0)}${h.recent(cc.history, '121', 'Checkout-Quote', 0, ' %')}`,
  },
  gallery: {
    label: 'Shooting Gallery', group: 'training',
    opts: [],
    config: () => ({}),
    board: boardGallery,
    turnSum: ptsSum,
    homeScore: (st, p) => `${st.leg.score[p]} P · → ${st.leg.target[p]}`,
    col: ['Punkte', (ml) => ml.score],
    bar: (st) => (st.turn ? `${st.leg.contenders ? 'Stechen' : `Versuch ${st.leg.rounds[st.current] + 1}<small>von ${GALLERY_COUNT}</small>`} · Ziel <b>${st.leg.target[st.current]}</b>` : ''),
    overlaySub: (st, ev) => `<p class="ov-sub">${st.legResults.at(-1).scores[ev.p]} Punkte</p>`,
    stats: (ga, h) => `<div class="stats">
      ${h.tile('Ø Punkte', num(ga.avgScore, 1), `${ga.finishedLegs} Legs, höchstens 120`)}
      ${h.tile('Bestwert', ga.bestScore ?? '–')}
      ${h.tile('Checkout-Quote', pct(ga.rate), `${ga.checks} von ${ga.attempts} Versuchen`)}
      ${h.tile('Ø Darts je Check', num(ga.dartsPerCheck, 1))}
      ${h.matchTiles(ga)}
    </div>${h.trend(ga.history, 'Punkte', 0)}${h.recent(ga.history, 'Shooting-Gallery', 'Punkte', 0)}`,
  },
  jdc: {
    label: 'JDC Challenge', group: 'training',
    opts: [['jdReps', 'Umfang', [[1, 'Standard'], [5, 'Lang (5 Durchgänge)']]]],
    config: (s) => ({ reps: s.jdReps }),
    board: boardJdc,
    targets: (st) => { if (!st.turn) return []; const t = jdcDartTarget(jdcVisit(st.leg, st.current, st.cfg), st.turn.darts.length); return one(st, t.s); },
    mult: (st) => (st.turn && jdcVisit(st.leg, st.current, st.cfg).kind === 'dbl' ? 2 : 0),
    turnSum: ptsSum,
    homeScore: (st, p) => st.leg.score[p],
    col: ['Punkte', (ml) => ml.score],
    bar: (st) => {
      if (!st.turn) return '';
      const v = jdcVisit(st.leg, st.current, st.cfg);
      return `${v.part ? `Teil ${v.part}` : 'Stechen'}<small>${st.leg.rounds[st.current] + 1}/${st.leg.stage}</small> · Ziel <b>${jdcVisitLabel(v)}</b>`;
    },
    overlaySub: (st, ev) => { const s = st.legResults.at(-1).scores[ev.p]; return `<p class="ov-sub">${s} Punkte${st.cfg.reps === 1 ? ` · Stufe ${jdcGrade(s)}` : ''}</p>`; },
    stats: (j, h) => `<div class="stats">
      ${h.tile('Ø Gesamt', num(j.avgScore, 0), `${j.finishedLegs} Legs`)}
      ${h.tile('Bestwert', j.bestScore ?? '–', j.full && j.bestScore != null ? `Stufe ${jdcGrade(j.bestScore)}` : '')}
      ${h.tile('Ø Teil 1 · 2 · 3', j.partAvg.slice(1).map((v) => num(v, 0)).join(' · '))}
      ${h.tile('Shanghais', j.shanghais)}
      ${h.matchTiles(j)}
    </div>${h.trend(j.history, 'Gesamtpunkte', 0)}${h.recent(j.history, 'JDC', 'Gesamtpunkte', 0)}`,
  },
});

// Vorgabewerte aller Setup-Optionen, abgeleitet aus opts
export const setupDefaults = () => Object.fromEntries(Object.values(MODES).flatMap((u) => u.opts.map(([k, , ch, def]) => [k, def ?? ch[0][0]])));
export { MODES };
