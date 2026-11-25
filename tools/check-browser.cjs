// Browserprüfung (ab 0.10.0): Fußzeile, Statistik je Leg und je Startwert, Zurück-Geste, D/T-Vorwahl,
// Gallery mit eigenen Zielen, Regression aller Modi (Start, Dart, Undo, Zurück), Konsolenfehler. Quer und hoch.
const { chromium } = require('playwright');
// Aufruf: _site mit python3 -m http.server 8765 ausliefern, dann node tools/check-browser.cjs [URL]
// Braucht Playwright mit Chromium (in der Sitzungsumgebung vorinstalliert). Läuft nicht im GitHub-Workflow.
const URL = process.argv[2] || "http://127.0.0.1:8765/";
const results = [];
const ok = (name, cond, extra = '') => { const r = [cond ? 'OK ' : 'FAIL', name, extra]; results.push(r); console.log(r.join('  ')); };
(async () => { try {
  const browser = await chromium.launch();
  for (const [w, h] of [[1280, 800], [800, 1280]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    const page = await ctx.newPage();
    page.setDefaultTimeout(5000);
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(URL);
    await page.waitForSelector('.foot');
    const tag = `${w}x${h}`;
    ok(`${tag} Fußzeile 0.10.0`, (await page.textContent('.foot')).includes('0.10.0'));
    // Testdaten: zwei Spieler, X01-Spiele auf 301 und 501 (beendet)
    await page.evaluate(async () => {
      const db = await new Promise((r, j) => { const q = indexedDB.open('oche'); q.onsuccess = () => r(q.result); q.onerror = j; });
      const put = (store, o) => new Promise((r, j) => { const t = db.transaction(store, 'readwrite'); t.objectStore(store).put(o); t.oncomplete = r; t.onerror = j; });
      const now = Date.now();
      await put('players', { id: 'pa', name: 'Anna', color: '#e5484d', archived: false, createdAt: now, updatedAt: now });
      await put('players', { id: 'pb', name: 'Ben', color: '#2fa266', archived: false, createdAt: now, updatedAt: now });
      const D = (str, t0) => str.split(/\s+/).filter(Boolean).map((x, i) => {
        const m = x.startsWith('D') ? 2 : x.startsWith('T') ? 3 : 1;
        return { s: x === '-' ? 0 : Number(x.replace(/^[DT]/, '')), m: x === '-' ? 1 : m, t: t0 + i };
      });
      const G = (id, start, darts, t0) => ({ id, mode: 'x01', config: { start, in: 'single', out: 'double', legs: 2, sets: 1, rv: 2 }, playerIds: ['pa', 'pb'], darts: D(darts, t0), status: 'finished', winnerId: 'pa', createdAt: t0, updatedAt: t0 + 100, finishedAt: t0 + 100 });
      // 61: T7 D20 je Leg, Ben wirft daneben
      await put('games', G('g1', 61, 'T7 D20  - - -  T7 D20', now - 5e6));
      await put('games', G('g2', 41, '1 D20  - - -  1 D20', now - 4e6));
    });
    await page.reload(); await page.waitForSelector('.foot');
    // Statistik: Verlauf je Leg, Tabelle je Startwert
    await page.click('[data-a="nav"][data-v="stats"]');
    await page.waitForTimeout(200);
    const statsText = await page.textContent('body');
    ok(`${tag} Statistik zeigt Verlauf je Leg`, statsText.includes('je Leg'));
    // Modus X01 im Filter wählen, falls nötig
    const sel = await page.$('select');
    if (sel) {
      const opts = await page.$$eval('select option', (o) => o.map((x) => x.value));
      const v = opts.find((x) => x === 'x01');
      if (v) { await page.selectOption('select', v); await page.waitForTimeout(200); }
    }
    const st2 = await page.textContent('body');
    ok(`${tag} Tabelle je Startwert`, st2.includes('Je Startwert') && /\b41\b/.test(st2) && /\b61\b/.test(st2), st2.slice(0, 0));
    await page.screenshot({ path: `/tmp/oche-stats-${tag}.png`, fullPage: true });
    // Zurück-Geste: Statistik → zurück → Start
    await page.goBack(); await page.waitForTimeout(200);
    ok(`${tag} Zurück von Statistik zur Startseite`, (await page.textContent('body')).includes('Neues Spiel') && !(await page.textContent('body')).includes('Noch keine Spieler') && await page.evaluate(() => history.state === null));
    // Setup: Doppel-Training mit Anna
    await page.click('[data-a="nav"][data-v="setup"]'); await page.waitForTimeout(150);
    await page.click('[data-a="setup"][data-k="mode"][data-v="dbl"]'); await page.waitForTimeout(100);
    const annaOn = await page.$('[data-a="togglePlayer"][data-v="pa"].on');
    if (!annaOn) await page.click('[data-a="togglePlayer"][data-v="pa"]');
    for (const b of await page.$$('[data-a="togglePlayer"].on')) { if ((await b.getAttribute('data-v')) !== 'pa') await b.click(); }
    await page.click('[data-a="start"]'); await page.waitForTimeout(200);
    ok(`${tag} Doppel-Training: Double vorgewählt`, await page.$('.mod.d.on') !== null);
    await page.click('[data-a="dart"][data-v="1"]'); await page.waitForTimeout(100);
    let slots = await page.$$eval('.slot', (s) => s.map((x) => x.textContent));
    ok(`${tag} Vorwahl: Taste 1 ergibt D1`, slots[0] === 'D1', JSON.stringify(slots));
    ok(`${tag} Vorwahl kommt nach dem Dart wieder`, await page.$('.mod.d.on') !== null);
    await page.click('[data-a="mult"][data-v="2"]'); await page.waitForTimeout(50);
    await page.click('[data-a="dart"][data-v="2"]'); await page.waitForTimeout(100);
    slots = await page.$$eval('.slot', (s) => s.map((x) => x.textContent));
    ok(`${tag} Abgewählt: Taste 2 ergibt Single 2`, slots[1] === '2', JSON.stringify(slots));
    await page.click('[data-a="dart"][data-v="25"]'); await page.waitForTimeout(100);
    // nach drei Darts neue Runde: letzter Dart steht in der vorherigen Runde. Undo holt die Runde zurück.
    await page.click('[data-a="undo"]'); await page.waitForTimeout(100);
    ok(`${tag} Undo setzt Vorwahl wieder`, await page.$('.mod.d.on') !== null);
    await page.click('[data-a="dart"][data-v="25"]'); await page.waitForTimeout(100);
    const g = await page.evaluate(async () => {
      const db = await new Promise((r) => { const q = indexedDB.open('oche'); q.onsuccess = () => r(q.result); });
      const all = await new Promise((r) => { const q = db.transaction('games').objectStore('games').getAll(); q.onsuccess = () => r(q.result); });
      return all.find((x) => x.mode === 'dbl');
    });
    ok(`${tag} Gespeichert: D1, 2, 25 (Taste 25 bleibt 25)`, JSON.stringify(g.darts.map((d) => [d.s, d.m])) === '[[1,2],[2,1],[25,1]]', JSON.stringify(g.darts.map((d) => [d.s, d.m])));
    // Zurück im Spiel → Startseite, Spiel läuft weiter
    await page.goBack(); await page.waitForTimeout(200);
    const home = await page.textContent('body');
    ok(`${tag} Zurück im Spiel → Startseite mit laufendem Spiel`, home.includes('Doppel-Training') && await page.$('[data-a="resume"]') !== null);
    // Golf: keine Vorwahl
    await page.click('[data-a="nav"][data-v="setup"]'); await page.waitForTimeout(150);
    await page.click('[data-a="setup"][data-k="mode"][data-v="golf"]'); await page.waitForTimeout(100);
    await page.click('[data-a="start"]'); await page.waitForTimeout(200);
    ok(`${tag} Golf ohne Vorwahl`, await page.$('.mod.d.on') === null);
    await page.goBack(); await page.waitForTimeout(200);
    // Shooting Gallery eigene Ziele
    await page.click('[data-a="nav"][data-v="setup"]'); await page.waitForTimeout(150);
    await page.click('[data-a="setup"][data-k="mode"][data-v="gallery"]'); await page.waitForTimeout(100);
    await page.click('[data-a="setup"][data-k="gaSet"][data-v="own"]'); await page.waitForTimeout(100);
    ok(`${tag} Gallery eigen: Start gesperrt ohne Ziele`, await page.$eval('[data-a="start"]', (b) => b.disabled));
    const key = async (k) => { await page.click(`[data-a="gaKey"][data-v="${k}"]`); await page.waitForTimeout(40); };
    for (const k of ['4', '0', 'add', '6', '1', 'add', '9', '9', '9', 'add', '1', 'add']) await key(k);
    let chips = await page.$$eval('.tgt-chip', (c) => c.map((x) => x.textContent.trim()));
    ok(`${tag} Gallery: 40 und 61 übernommen, 999 und 1 abgewiesen`, chips.length === 2 && chips[0].includes('40') && chips[1].includes('61'), JSON.stringify(chips));
    await page.screenshot({ path: `/tmp/oche-gallery-setup-${tag}.png`, fullPage: true });
    for (const k of ['del', 'del', 'del', '7', '7', 'add']) await key(k);
    await page.click('.tgt-chip >> nth=0'); await page.waitForTimeout(80);
    chips = await page.$$eval('.tgt-chip', (c) => c.map((x) => x.textContent.trim()));
    ok(`${tag} Gallery: Entfernen per Tipp`, chips.length === 2 && chips[0].includes('61') && chips[1].includes('77'), JSON.stringify(chips));
    await page.click('[data-a="start"]'); await page.waitForTimeout(200);
    const bar = await page.textContent('body');
    ok(`${tag} Gallery-Spiel startet mit Ziel 61 von 2`, bar.includes('Ziel 61') && bar.includes('von 2'), '');
    await page.screenshot({ path: `/tmp/oche-gallery-game-${tag}.png` });
    await page.goBack(); await page.waitForTimeout(200);
    // Zurück auf der Startseite verlässt die App (Verlauf hat davor nur about:blank)
    const before = page.url();
    await page.goBack(); await page.waitForTimeout(200);
    ok(`${tag} Zurück auf der Startseite verlässt die App`, page.url() !== before, page.url());
    // Regression: jeder Modus mit zwei Spielern starten, werfen, zurücknehmen, zurück zur Startseite
    await page.goto(URL); await page.waitForSelector('.foot');
    await page.click('[data-a="nav"][data-v="setup"]'); await page.waitForTimeout(150);
    const modes = await page.$$eval('[data-a="setup"][data-k="mode"]', (b) => b.map((x) => x.dataset.v));
    let bad = [];
    for (const m of modes) {
      try {
        if (!(await page.$('[data-a="setup"][data-k="mode"]'))) { await page.click('[data-a="nav"][data-v="setup"]'); await page.waitForTimeout(100); }
        await page.click(`[data-a="setup"][data-k="mode"][data-v="${m}"]`); await page.waitForTimeout(60);
        for (const id of ['pa', 'pb']) if (!(await page.$(`[data-a="togglePlayer"][data-v="${id}"].on`))) await page.click(`[data-a="togglePlayer"][data-v="${id}"]`);
        await page.waitForTimeout(60);
        await page.click('[data-a="start"]'); await page.waitForTimeout(150);
        const k = await page.$('[data-a="dart"][data-v="5"]') || await page.$('[data-a="dart"][data-v="0"]');
        await k.click(); await page.waitForTimeout(80);
        await page.click('[data-a="undo"]'); await page.waitForTimeout(80);
        await page.goBack(); await page.waitForTimeout(150);
        if (!(await page.textContent('body')).includes('Neues Spiel')) bad.push(m + ':nicht-start');
        await page.click('[data-a="nav"][data-v="setup"]'); await page.waitForTimeout(100);
      } catch (e) { bad.push(m + ':' + e.message.split('\n')[0]); await page.goto(URL); await page.waitForSelector('.foot'); await page.click('[data-a="nav"][data-v="setup"]'); }
    }
    ok(`${tag} Regression ${modes.length} Modi (Start, Dart, Undo, Zurück)`, bad.length === 0 && modes.length >= 31, bad.join(' | '));
    ok(`${tag} keine Konsolenfehler`, errors.length === 0, errors.join(' | '));
    await ctx.close();
  }
  await browser.close();
  } catch (e) { console.log('ABBRUCH', e.message.split('\n')[0]); }
  console.log(results.filter((r) => r[0] === 'OK ').length + ' / ' + results.length);
})();
