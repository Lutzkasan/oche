// Baut die auslieferbare Seite nach _site/ und stempelt die Cache-Version.
// Ausführen: node tools/build.mjs   (läuft auch automatisch bei jedem Upload auf GitHub)
//
// Warum: Der Service Worker liefert cache-first aus. Ohne neue VERSION in sw.js sieht das Tablet
// geänderte Dateien nie, und eine Datei, die in FILES fehlt, gibt es offline nicht.
// Beides hing bisher an Handarbeit. Dieses Skript leitet VERSION aus dem Inhalt aller Dateien
// und FILES aus dem Verzeichnis ab, damit keins von beiden mehr vergessen werden kann.
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, '_site');
// Was auf den Server gehört. README, Tests und Werkzeuge bleiben im Repository.
const INCLUDE = ['index.html', 'manifest.webmanifest', 'app.css', 'sw.js', 'js', 'fonts', 'icons'];

const fail = (msg) => { console.error('✗ ' + msg); process.exit(1); };

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

// 1. Kopieren
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT);
for (const entry of INCLUDE) {
  const src = join(ROOT, entry);
  if (!existsSync(src)) fail(`${entry} fehlt im Repository.`);
  cpSync(src, join(OUT, entry), { recursive: true });
}
const files = walk(OUT).map((p) => relative(OUT, p).split('\\').join('/')).sort();

// 2. Jeder Modul-Import und jede Referenz in index.html/Manifest/CSS muss auf eine vorhandene Datei zeigen.
// Fängt den Fall ab, dass eine neue Datei beim Hochladen vergessen wurde.
const have = new Set(files);
const check = (from, ref) => {
  if (/^(https?:|data:|#)/.test(ref)) return;
  const target = relative(OUT, resolve(OUT, dirname(from), ref)).split('\\').join('/');
  if (!have.has(target)) fail(`${from} verweist auf ${ref}, die Datei fehlt.`);
};
for (const f of files) {
  const txt = /\.(js|mjs|html|css|webmanifest)$/.test(f) ? readFileSync(join(OUT, f), 'utf8') : '';
  if (f.endsWith('.js')) for (const m of txt.matchAll(/(?:import|export)[^'"]*?from\s*['"](\.[^'"]+)['"]/g)) check(f, m[1]);
  if (f.endsWith('.html')) for (const m of txt.matchAll(/(?:src|href)="([^"]+)"/g)) check(f, m[1]);
  if (f.endsWith('.css')) for (const m of txt.matchAll(/url\(([^)]+)\)/g)) check(f, m[1].replace(/['"]/g, ''));
  if (f.endsWith('.webmanifest')) for (const i of JSON.parse(txt).icons || []) check(f, i.src);
}

// 3. Version aus dem Inhalt: gleicher Inhalt → gleiche Version → keine unnötige Update-Meldung.
const hash = createHash('sha256');
for (const f of files) hash.update(f).update(readFileSync(join(OUT, f)));
const build = hash.digest('hex').slice(0, 10);

const stamp = (file, pattern, replacement) => {
  const p = join(OUT, file);
  const src = readFileSync(p, 'utf8');
  if (!pattern.test(src)) fail(`Platzhalter in ${file} nicht gefunden: ${pattern}`);
  writeFileSync(p, src.replace(pattern, replacement));
};
const cached = ['./', ...files.filter((f) => f !== 'sw.js').map((f) => './' + f)];
stamp('sw.js', /const VERSION = '[^']*';/, `const VERSION = 'oche-${build}';`);
stamp('sw.js', /const FILES = \[[\s\S]*?\];/, `const FILES = ${JSON.stringify(cached, null, 2)};`);
stamp('js/app.js', /export const BUILD = '[^']*';/, `export const BUILD = '${build}';`);

console.log(`✓ _site gebaut: ${files.length} Dateien, Build ${build}`);
