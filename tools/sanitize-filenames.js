/* ============ KLINKERBOX · ADRESSEN AUS DATEINAMEN ENTFERNEN ============
 *
 * In assets/gallery/ trugen viele Fotos Strasse, Hausnummer und PLZ des
 * Projekts im Dateinamen. Da der Dateiname als Bild-URL im HTML steht, war
 * die Adresse damit oeffentlich - unabhaengig davon, dass die Bildunterschrift
 * bewusst nicht angezeigt wird.
 *
 * Dieses Skript entfernt NUR die Adressbestandteile und laesst den Rest
 * stehen (Serie, Farbe, Objektart, Ort), damit die Namen weiter sprechend
 * bleiben. Es benennt die Dateien um, zieht die Ableitungen (thumbs-160)
 * nach und aktualisiert die Referenzen in products.js und enrich.js.
 *
 * Regeln, in dieser Reihenfolge:
 *   1. Strassen-Token entfernen  - endet auf strasse/str/weg/gasse/platz/
 *      allee/ring/rte/route/chemin/chem/quai (z. B. "Daellikerstrasse",
 *      "Waldweg", "Keramikweg").
 *   2. PLZ entfernen             - vierstellige Zahl, deren FOLGENDES Token
 *      mit Grossbuchstaben beginnt ("3661-Uetendorf" ja, "septem-7021-gavere"
 *      nein - dort ist 7021 eine Farbnummer).
 *   3. Hausnummer entfernen      - ein- bis dreistellige Zahl mit optionalem
 *      Buchstaben, wenn direkt daneben bereits etwas entfernt wurde.
 *   4. Strassenname ohne Kennwort - das Token direkt vor einer entfernten
 *      Hausnummer, wenn es gross geschrieben ist und nicht zu Serie/Farbe
 *      des Produkts gehoert (faengt "Condemine-61c-1568-Portalban").
 *
 * Serie und Farbe des besitzenden Produkts sind geschuetzt und werden nie
 * entfernt.
 *
 * Aufruf:  node tools/sanitize-filenames.js          (Vorschau)
 *          node tools/sanitize-filenames.js --apply  (schreibt)
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const GAL = path.join(ROOT, 'assets', 'gallery');
const APPLY = process.argv.includes('--apply');

// ---- Produktdaten laden (Serie/Farbe als Schutzbegriffe) ----
global.window = {};
eval(fs.readFileSync(path.join(ROOT, 'assets/js/products.js'), 'utf8'));
eval(fs.readFileSync(path.join(ROOT, 'assets/js/enrich.js'), 'utf8'));
const P = window.PRODUCTS, E = window.ENRICH;

const owner = {};
for (const p of P) {
  const add = k => { if (k && !owner[k]) owner[k] = p; };
  add(p.img);
  const e = E[p.id];
  if (e && e.gallery) e.gallery.forEach(add);
}

const STREET = /(strassen?|strasse|straße|str|weg|gasse|platz|allee|ring|damm|rte|route|chemin|chem|quai|via)\.?$/i;
const PLZ = /^[0-9]{4}$/;
const HOUSENO = /^[0-9]{1,3}[a-z]?$/i;

function norm(s) {
  return s.toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]/g, '');
}

function sanitize(file, prod) {
  const ext = path.extname(file);
  const base = file.slice(0, -ext.length);
  // an - und . trennen, Trennzeichen merken ist unnoetig: wir setzen mit - zusammen
  const toks = base.split(/[-.]+/).filter(Boolean);

  // Schutzbegriffe aus Serie und Farbe
  const guard = new Set();
  if (prod) {
    for (const part of [prod.series, prod.name, prod.family]) {
      if (!part) continue;
      part.split(/[\s\-.]+/).forEach(w => { if (w) guard.add(norm(w)); });
    }
  }
  const drop = new Array(toks.length).fill(false);

  // 1) Strassen-Token
  toks.forEach((t, i) => {
    if (guard.has(norm(t))) return;
    if (STREET.test(t) && /[a-z]/i.test(t) && norm(t).length > 2) drop[i] = true;
    // alleinstehendes "Ch."/"ch" = chemin, wenn ein Name folgt (auch "CH-Moehlin"
    // faellt darunter, das Laenderkuerzel ist im Dateinamen entbehrlich)
    if (/^ch$/i.test(norm(t)) && toks[i + 1] && /^[A-ZÄÖÜ]/.test(toks[i + 1])) drop[i] = true;
  });
  // 2) PLZ (nur wenn danach ein grossgeschriebenes Token folgt)
  toks.forEach((t, i) => {
    if (!PLZ.test(t)) return;
    const nx = toks[i + 1];
    if (nx && /^[A-ZÄÖÜ]/.test(nx)) drop[i] = true;
  });
  // 3) Hausnummer neben etwas bereits Entferntem
  for (let pass = 0; pass < 2; pass++) {
    toks.forEach((t, i) => {
      if (drop[i] || !HOUSENO.test(t)) return;
      if (guard.has(norm(t))) return;
      if ((i > 0 && drop[i - 1]) || (i < toks.length - 1 && drop[i + 1])) drop[i] = true;
    });
  }
  // 4) Strassenname ohne Kennwort: gross geschriebenes Token direkt vor einer
  //    entfernten Hausnummer oder einem entfernten Strassen-Token
  //    (faengt "Condemine-61c-1568-Portalban" und "Obere-Laettenstrasse")
  toks.forEach((t, i) => {
    if (drop[i] || guard.has(norm(t))) return;
    if (!drop[i + 1]) return;
    const nx = toks[i + 1];
    if (!HOUSENO.test(nx) && !STREET.test(nx)) return;
    if (/^[A-ZÄÖÜ]/.test(t) && /[a-zäöü]/.test(t)) drop[i] = true;
  });
  // 5) Was ZWISCHEN zwei entfernten Token liegt, gehoert zur Adresse
  //    ("...-rte-de-Lausanne-1293-..." laesst sonst "de-Lausanne" stehen)
  //    Kurze Ketten (bis 3 Token), die beidseitig von Entferntem eingeschlossen
  //    sind, gehoeren zum Strassennamen. Geschuetzte Begriffe brechen die Kette.
  for (let i = 0; i < toks.length; i++) {
    if (drop[i]) continue;
    let j = i;
    while (j < toks.length && !drop[j]) j++;
    const runStart = i, runEnd = j - 1, len = j - i;
    const flankedLeft = runStart > 0 && drop[runStart - 1];
    const flankedRight = j < toks.length && drop[j];
    if (flankedLeft && flankedRight && len <= 3) {
      let guarded = false;
      for (let k = runStart; k <= runEnd; k++) if (guard.has(norm(toks[k]))) guarded = true;
      if (!guarded) for (let k = runStart; k <= runEnd; k++) drop[k] = true;
    }
    i = j;
  }

  let out = toks.filter((_, i) => !drop[i]).join('-');
  out = out.replace(/-{2,}/g, '-').replace(/^-|-$/g, '');
  if (!out) out = 'bild';
  return out + ext.toLowerCase();
}

// ---- Planen ----
const files = fs.readdirSync(GAL).filter(f => /\.(jpe?g|png)$/i.test(f));
const plan = [];
const used = new Set(files.map(f => f.toLowerCase()));
for (const f of files) {
  const prod = owner['assets/gallery/' + f];
  let to = sanitize(f, prod);
  if (to === f) continue;
  // Kollisionen vermeiden
  if (used.has(to.toLowerCase())) {
    const ext = path.extname(to), stem = to.slice(0, -ext.length);
    let n = 2;
    while (used.has((stem + '-' + n + ext).toLowerCase())) n++;
    to = stem + '-' + n + ext;
  }
  used.add(to.toLowerCase());
  plan.push({ from: f, to, prod: prod ? prod.id : null });
}

console.log(`Galerie-Dateien: ${files.length}`);
console.log(`Umzubenennen   : ${plan.length}`);
console.log('');
if (!APPLY) {
  plan.slice(0, 40).forEach(p => console.log(`  ${p.from}\n   -> ${p.to}`));
  if (plan.length > 40) console.log(`  ... und ${plan.length - 40} weitere`);
  fs.writeFileSync(path.join(ROOT, 'tools', 'rename-plan.txt'),
    plan.map(p => `${p.from}\t${p.to}`).join('\n'), 'utf8');
  console.log('\nVollstaendige Liste: tools/rename-plan.txt');
  console.log('Nichts geschrieben. Mit --apply ausfuehren.');
  process.exit(0);
}

// ---- Anwenden ----
let renamed = 0, thumbs = 0;
for (const p of plan) {
  fs.renameSync(path.join(GAL, p.from), path.join(GAL, p.to));
  renamed++;
  // Ableitung nachziehen
  const tf = path.join(ROOT, 'assets/thumbs-160/gallery', p.from.replace(/\.(jpe?g|png)$/i, '.webp'));
  const tt = path.join(ROOT, 'assets/thumbs-160/gallery', p.to.replace(/\.(jpe?g|png)$/i, '.webp'));
  if (fs.existsSync(tf)) { fs.renameSync(tf, tt); thumbs++; }
}

// ---- Referenzen in den JS-Daten aktualisieren ----
let jsChanged = 0;
for (const rel of ['assets/js/products.js', 'assets/js/enrich.js']) {
  const fp = path.join(ROOT, rel);
  let src = fs.readFileSync(fp, 'utf8');
  const before = src;
  for (const p of plan) {
    src = src.split('assets/gallery/' + p.from).join('assets/gallery/' + p.to);
  }
  if (src !== before) { fs.writeFileSync(fp, src, 'utf8'); jsChanged++; }
}

console.log(`Umbenannt: ${renamed} Bilder, ${thumbs} Thumbnails, ${jsChanged} JS-Dateien aktualisiert.`);
