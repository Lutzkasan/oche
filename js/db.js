// IndexedDB-Speicher: players, games, meta. Export/Import als JSON für den Gerätewechsel.
import { RULES } from './engine.js';
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
export const SCHEMA = 6;

// Löschen hinterlässt einen Lösch-Vermerk statt den Eintrag zu entfernen. Grund: Der Import führt nach ID
// zusammen. Ein spurlos gelöschter Eintrag käme mit jeder älteren Sicherung zurück. Der Vermerk trägt ein
// neueres updatedAt und gewinnt deshalb gegen jede ältere Kopie, auch auf einem anderen Tablet.
export const isDeleted = (x) => Boolean(x?.deleted);
export const tombstone = (id, now = Date.now()) => ({ id, deleted: true, updatedAt: now });

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
  const unknown = [...new Set(data.games.filter((g) => g && typeof g.id === 'string' && !isDeleted(g)).map((g) => g.mode).filter((m) => !RULES[m]))];
  if (data.schema > SCHEMA || unknown.length) {
    throw new Error('Die Sicherung stammt aus einer neueren App-Version' + (unknown.length ? ` (Spielmodus ${unknown.join(', ')})` : '') + '. Bitte zuerst die App aktualisieren.');
  }
  const db = await open();
  const counts = { players: 0, games: 0, removed: 0 };
  for (const store of ['players', 'games']) {
    const { puts, added, removed } = mergeItems(await getAll(store), data[store]);
    counts[store] = added;
    counts.removed += removed;
    await new Promise((resolve, reject) => {
      const t = db.transaction(store, 'readwrite');
      const s = t.objectStore(store);
      for (const item of puts) s.put(item);
      t.oncomplete = resolve;
      t.onerror = () => reject(t.error);
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

// Fordert dauerhaften Speicher an, damit Android die Daten bei Speichermangel nicht räumt.
export async function requestPersistence() {
  if (!navigator.storage?.persist) return false;
  if (await navigator.storage.persisted()) return true;
  return navigator.storage.persist();
}
