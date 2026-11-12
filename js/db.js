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
export const SCHEMA = 4;

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
export const put = (store, obj) => tx(store, 'readwrite', (s) => s.put(obj));
export const del = (store, id) => tx(store, 'readwrite', (s) => s.delete(id));
export const getMeta = async (key) => (await tx('meta', 'readonly', (s) => s.get(key)))?.value;
export const setMeta = (key, value) => put('meta', { key, value });

export async function exportAll() {
  const [players, games] = await Promise.all([getAll('players'), getAll('games')]);
  return { app: 'oche', schema: SCHEMA, exportedAt: new Date().toISOString(), players, games };
}

// Zusammenführen nach ID: Neuere Version (updatedAt) gewinnt. Mehrfaches Importieren ist folgenlos.
export async function importAll(data) {
  if (!data || data.app !== 'oche' || !Array.isArray(data.players) || !Array.isArray(data.games)) {
    throw new Error('Das ist keine Oche-Sicherung.');
  }
  const unknown = [...new Set(data.games.filter((g) => g && typeof g.id === 'string').map((g) => g.mode).filter((m) => !RULES[m]))];
  if (data.schema > SCHEMA || unknown.length) {
    throw new Error('Die Sicherung stammt aus einer neueren App-Version' + (unknown.length ? ` (Spielmodus ${unknown.join(', ')})` : '') + '. Bitte zuerst die App aktualisieren.');
  }
  const db = await open();
  const counts = { players: 0, games: 0 };
  for (const store of ['players', 'games']) {
    const existing = new Map((await getAll(store)).map((x) => [x.id, x]));
    await new Promise((resolve, reject) => {
      const t = db.transaction(store, 'readwrite');
      const s = t.objectStore(store);
      for (const item of data[store]) {
        if (!item || typeof item.id !== 'string') continue;
        const cur = existing.get(item.id);
        if (!cur || (item.updatedAt || 0) > (cur.updatedAt || 0)) {
          s.put(item);
          counts[store]++;
        }
      }
      t.oncomplete = resolve;
      t.onerror = () => reject(t.error);
    });
  }
  return counts;
}

// Fordert dauerhaften Speicher an, damit Android die Daten bei Speichermangel nicht räumt.
export async function requestPersistence() {
  if (!navigator.storage?.persist) return false;
  if (await navigator.storage.persisted()) return true;
  return navigator.storage.persist();
}
