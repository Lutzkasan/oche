// IndexedDB-Speicher: players, games, meta. Export/Import als JSON für den Gerätewechsel.
import { RULES, replay } from './engine.js';
const DB_NAME = 'oche';
const DB_VERSION = 1;
// Schema der Sicherung. 2 = Modi atc, shanghai, killer. 3 = zusätzlich bobs, halveit, c121.
// 4 = zusätzlich ttt, hare, follow, chase, golf, knockout, ninelives, blindkiller, mickey, bermuda, gotcha,
//     shove, dbl, jdc, gallery und der Stopp-Eintrag { stop: true } in der Dartliste (Golf, Follow the Leader).
// Apps bis 0.3.0 prüfen nur die Schema-Nummer. Damit sie neue Sicherungen ablehnen statt an einem
// unbekannten Modus abzustürzen, steigt SCHEMA mit jedem neuen Modus.
// Ab 0.4.0 prüft der Import zusätzlich jeden Modus gegen RULES. Ein vergessener Schema-Sprung führt
// dann zur selben Ablehnung mit Hinweis statt zu einem Absturz.
// 5 = Lösch-Vermerke { id, deleted: true, updatedAt }, Spiele mit excluded (nicht gewertet), Cricket mit
//     Zufallszahlen (config.numbers), Around the Clock mit Reihenfolge (config.targets). Eine App mit Schema 4
//     würde Lösch-Vermerke als Spiele ohne Modus lesen und ausgenommene Spiele mitzählen. Deshalb lehnt sie ab.
// 6 = config.seed: Zufallswerte je Leg (Killer, Tic-Tac-Toe, Cricket-Zufall …). Eine App mit Schema 5 würde
//     alle Legs mit den Werten des ersten Legs nachspielen und so andere Spielstände errechnen.
// 7 = Modi baseball, fives, steeples, war, scram.
// 8 = Steeples mit config.back 'miss', Shooting Gallery mit config.out und config.over. Eine App mit Schema 7
//     kennt beide Werte nicht: Sie würde Steeples mit der strengen Regel und Shooting Gallery mit Double Out auf
//     genau 0 nachspielen und so andere Spielstände errechnen.
// 9 = config.rv (Regelversion je Spiel, engine.js). Eine App mit Schema 8 kennt rv nicht: Sie würde Fives,
//     War „1 Treffer“ und Mickey Mouse mit Punkten nach den alten Regeln nachspielen.
export const SCHEMA = 9;

// Löschen hinterlässt einen Lösch-Vermerk statt den Eintrag zu entfernen. Grund: Der Import führt nach ID
// zusammen. Ein spurlos gelöschter Eintrag käme mit jeder älteren Sicherung zurück. Der Vermerk trägt ein
// neueres updatedAt und gewinnt deshalb gegen jede ältere Kopie, auch auf einem anderen Tablet.
export const isDeleted = (x) => Boolean(x?.deleted);
export const tombstone = (id, now = Date.now()) => ({ id, deleted: true, updatedAt: now });

// ---------- Prüfung der Einträge (ab 0.7.1) ----------
// Bis 0.7.0 prüfte der Import nur die Hülle der Sicherung und den Spielmodus. Der Inhalt eines Eintrags ging
// ungeprüft in den Speicher und von dort in jede Ansicht. Ein Spiel ohne gültige config oder ein Profil ohne
// Namen warf dann bei jedem Start einen Fehler, und id, Farbe und config-Werte standen ungeprüft im HTML.
// Deshalb gilt jetzt an beiden Grenzen dieselbe Prüfung: beim Import (sanitize) und beim Laden aus dem
// Speicher (app.js, loadAll). Was sie nicht besteht, wird übersprungen und gemeldet, nie gelöscht.
// Die Muster lassen nur Zeichen zu, die im HTML nichts bedeuten. Namen sind frei, die Ausgabe schützt sie mit esc.
const ID = /^[\w-]{1,64}$/;         // crypto.randomUUID und der Ersatz in ui.js (uid)
const COLOR = /^#[0-9a-f]{6}$/i;    // alle Farben stammen aus COLORS in ui.js
const WORD = /^[\w-]{0,32}$/;       // Optionswerte wie 'double', 'cutthroat', Zielkürzel wie 'DB'
const isObj = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const isId = (v) => typeof v === 'string' && ID.test(v);
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isTime = (v) => v == null || isNum(v);
const isFlag = (v) => v == null || typeof v === 'boolean';
const isPrim = (v) => v == null || typeof v === 'boolean' || isNum(v) || (typeof v === 'string' && WORD.test(v));

// Regelparameter: flaches Objekt aus Zahlen, Wahrheitswerten, kurzen Wörtern und Listen davon.
// Das deckt alle Modi ab, ohne je Modus ein eigenes Schema zu pflegen (Test „jede Einstellung jedes Modus").
export const validConfig = (c) => isObj(c) && Object.keys(c).length <= 32
  && Object.values(c).every((v) => isPrim(v) || (Array.isArray(v) && v.length <= 64 && v.every(isPrim)));

// Dart { s, m, t } oder Stopp-Eintrag { s: 0, m: 0, stop: true }
export const validDart = (d) => isObj(d) && isTime(d.t) && (d.stop === true
  ? d.s === 0 && d.m === 0
  : Number.isInteger(d.s) && ((d.s >= 0 && d.s <= 20) || d.s === 25) && (d.m === 1 || d.m === 2 || d.m === 3));

export const validPlayer = (p) => isObj(p) && isId(p.id) && typeof p.name === 'string' && p.name.trim().length > 0
  && p.name.length <= 64 && typeof p.color === 'string' && COLOR.test(p.color)
  && isFlag(p.archived) && isTime(p.createdAt) && isTime(p.updatedAt);

export const validGame = (g) => isObj(g) && isId(g.id) && typeof g.mode === 'string' && Object.hasOwn(RULES, g.mode)
  && validConfig(g.config)
  && Array.isArray(g.playerIds) && g.playerIds.length >= 1 && g.playerIds.length <= 32 && g.playerIds.every(isId)
  && Array.isArray(g.darts) && g.darts.every(validDart)
  && (g.status === 'active' || g.status === 'finished') && (g.winnerId == null || isId(g.winnerId))
  && isFlag(g.excluded) && isTime(g.createdAt) && isTime(g.updatedAt) && isTime(g.finishedAt);

const validTombstone = (x) => isObj(x) && isId(x.id) && x.deleted === true && isTime(x.updatedAt);
// Lässt sich das Spiel nachspielen? Fängt, was die Form nicht zeigt, etwa fehlende Killer-Zahlen.
const replays = (g) => { try { replay(g); return true; } catch { return false; } };

// Sicherung auf lesbare Einträge beschränken. Rein, damit die Tests es ohne IndexedDB prüfen können.
// skipped zählt, was verworfen wurde. Der Import meldet die Zahl.
export function sanitize(data) {
  const keep = (list, ok) => list.filter((x) => (isDeleted(x) ? validTombstone(x) : ok(x)));
  const players = keep(data.players, validPlayer);
  const games = keep(data.games, (g) => validGame(g) && replays(g));
  return { players, games, skipped: data.players.length - players.length + data.games.length - games.length };
}

let dbp = null;
function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('players')) db.createObjectStore('players', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('games')) db.createObjectStore('games', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

async function tx(store, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    let result;
    const r = fn(s);
    if (r) r.onsuccess = () => (result = r.result);
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export const getAll = (store) => tx(store, 'readonly', (s) => s.getAll());
// Alles außer Lösch-Vermerken. Die App arbeitet nur mit diesen Einträgen.
export const getLive = async (store) => (await getAll(store)).filter((x) => !isDeleted(x));
export const put = (store, obj) => tx(store, 'readwrite', (s) => s.put(obj));
export const remove = (store, id) => put(store, tombstone(id));
export const getMeta = async (key) => (await tx('meta', 'readonly', (s) => s.get(key)))?.value;
export const setMeta = (key, value) => put('meta', { key, value });

export async function exportAll() {
  const [players, games] = await Promise.all([getAll('players'), getAll('games')]);
  return { app: 'oche', schema: SCHEMA, exportedAt: new Date().toISOString(), players, games };
}

// Zusammenführen nach ID: Neuere Version (updatedAt) gewinnt. Mehrfaches Importieren ist folgenlos.
// Lösch-Vermerke werden wie Einträge zusammengeführt: der neuere Stand gewinnt, ob Vermerk oder Eintrag.
export async function importAll(data) {
  if (!data || data.app !== 'oche' || !Array.isArray(data.players) || !Array.isArray(data.games)) {
    throw new Error('Das ist keine Oche-Sicherung.');
  }
  // Object.hasOwn statt RULES[m]: Ein Modus namens 'constructor' fände sonst die geerbte Eigenschaft und gälte als bekannt.
  const unknown = [...new Set(data.games.filter((g) => g && typeof g.id === 'string' && !isDeleted(g) && typeof g.mode === 'string').map((g) => g.mode).filter((m) => !Object.hasOwn(RULES, m)))];
  if (data.schema > SCHEMA || unknown.length) {
    throw new Error('Die Sicherung stammt aus einer neueren App-Version' + (unknown.length ? ` (Spielmodus ${unknown.join(', ')})` : '') + '. Bitte zuerst die App aktualisieren.');
  }
  const clean = sanitize(data);
  const db = await open();
  const counts = { players: 0, games: 0, removed: 0, skipped: clean.skipped };
  for (const store of ['players', 'games']) {
    const { puts, added, removed } = mergeItems(await getAll(store), clean[store]);
    counts[store] = added;
    counts.removed += removed;
    await new Promise((resolve, reject) => {
      const t = db.transaction(store, 'readwrite');
      const s = t.objectStore(store);
      for (const item of puts) s.put(item);
      t.oncomplete = resolve;
      t.onerror = () => reject(t.error);
      // Bricht die Transaktion beim Abschluss ab (voller Speicher), feuert nur abort. Ohne diese Zeile
      // blieb der Import dann ohne Erfolg und ohne Fehlermeldung hängen. tx() weiter oben hatte sie schon.
      t.onabort = () => reject(t.error || new Error('Speichern abgebrochen.'));
    });
  }
  return counts;
}

// Reine Zusammenführung, getrennt vom Speicher, damit die Tests sie ohne IndexedDB prüfen können.
// Liefert die zu schreibenden Einträge. added = neue oder aktualisierte Einträge, removed = Einträge, die hier
// noch lebten und die ein neuerer Lösch-Vermerk entfernt. Ein Vermerk für etwas, das hier nie existierte,
// ändert nichts Sichtbares und zählt nicht.
export function mergeItems(existing, incoming) {
  const have = new Map(existing.map((x) => [x.id, x]));
  const puts = [];
  let added = 0, removed = 0;
  for (const item of incoming) {
    if (!item || typeof item.id !== 'string') continue;
    const cur = have.get(item.id);
    if (cur && (item.updatedAt || 0) <= (cur.updatedAt || 0)) continue;
    puts.push(item);
    have.set(item.id, item);
    if (isDeleted(item)) { if (cur && !isDeleted(cur)) removed++; } else added++;
  }
  return { puts, added, removed };
}

// Zurücksetzen: leert Spieler, Spiele (samt Lösch-Vermerken) und Meta-Daten. Eine danach importierte
// Sicherung bringt alles zurück, denn ohne Lösch-Vermerke gewinnt beim Zusammenführen jeder Eintrag.
// Das ist gewollt: So stellt eine Sicherung den alten Stand wieder her.
export async function resetAll() {
  const db = await open();
  await new Promise((resolve, reject) => {
    const t = db.transaction(['players', 'games', 'meta'], 'readwrite');
    for (const s of ['players', 'games', 'meta']) t.objectStore(s).clear();
    t.oncomplete = resolve;
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('Zurücksetzen abgebrochen.'));
  });
}

// Fordert dauerhaften Speicher an, damit Android die Daten bei Speichermangel nicht räumt.
export async function requestPersistence() {
  if (!navigator.storage?.persist) return false;
  if (await navigator.storage.persisted()) return true;
  return navigator.storage.persist();
}
