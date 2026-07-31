**Traufblende:** `BoxGeometry(HW+1.1, 0.20, 0.03)` in `0x2e3339`, y = HE − 0.10 = 6.30, z = OV = 0.45, `castShadow=false`. Das ist Muhrs schwarzes Band unter der Traufe.

**Schattenparameter (Z. 188-193):**
```js
sun.shadow.camera.left=-12; sun.shadow.camera.right=12;
sun.shadow.camera.top=12;   sun.shadow.camera.bottom=-9;      // war ±15 / 16 / -10
sun.shadow.bias=-0.00015;   sun.shadow.normalBias=0.012;      // war -0.0004 / 0.035
sun.shadow.radius=MOBILE?1:2.5;                               // war 5
```
Nachgerechnet im Lichtraum (Achsen aus `position (18.9,15.7,10.9)` → `target (0,1.5,0)`): First (0, 10.40, −4.0) projiziert auf (x 3.47, y **8.55**), Kaminkopf (−0.9, 11.20, −4.4) auf (x 3.36, y **9.84**) — beide mit über 20 % Reserve innerhalb `top = 12`. Am unteren Rand ist der rechte Zufahrtsbereich (7.4, 0, 8.0) mit y = **−6.94** und die rechte Heckenecke (10.6, 0, 6.6) mit y = **−8.07** massgebend; `bottom = −9` fasst beides.
Texelgrösse: 24 m/4096 = **5.86 mm** waagrecht, 21 m/4096 = **5.13 mm** senkrecht (heute 7.32 / 6.35).

**`sun.shadow.camera.top` NICHT auf 20 anheben** (Vorschlag aus dem Architekturgutachten) — der First liegt bei 8.55, das wäre reine Auflösungsverschwendung.

**Abnahme:** Feinscan einer Spalte über die oberen 1.2 m der Frontwand zeigt einen Anstieg von **mindestens 20 Stufen** von der Traufe nach unten (heute 0-3). Unter dem Dachrand ein durchgehendes dunkles Band. Der Sohlbankschatten hat eine erkennbare Kante statt eines 4 cm breiten Verlaufs.

---

## 6. `efh3d.js` — Rest

### 6.1 Belichtung und Weisspunkt — Z. 176, 179, 183, 418; `scene3d-lib.js:39`

Histogramm heute vs. Referenz: p50 160/144, p75 187/232, p95 212/247, **Maximum 222/255**, Anteil über L 240: **0.00 % / 12.1 %**. Beide Bilder haben denselben Mittelwert — unseres ist in der Mitte zusammengedrückt. Die Rechnung erklärt es: hellster Himmelstexel `#f3f0e8` (linear 0.89) × Dome 1.12 = 1.0, × Exposure 0.86, ACES → 0.755 → sRGB **227**. Über 227 kann das Bild systembedingt nicht kommen.

| Ort | heute | neu |
|---|---|---|
| `ensureRenderer` Z. 418 | `toneMappingExposure=0.86` | **`1.05`** |
| Sky-Dome Z. 176 | `Color(1.12,1.12,1.12)` | **`Color(1.45,1.45,1.45)`** |
| `scene3d-lib.js` Z. 39 | `g.addColorStop(0,'#4f81b2')` | **`'#6f9ac6'`** |
| Sonne Z. 183 | `intensity 4.4` | **`3.9`** |
| Sonne Z. 184 | `position.set(19,13.5,11)` | **`set(18.9,15.7,10.9)`** — Höhe 28.7° → 33.1°, Azimut 60° bleibt |
| Sonne Z. 183 | `color 0xfff1d8` | **`0xfff6ea`** — der Cremestich kippt Sohlbänke und Vorplatz nach Beige |
| Hemisphere Z. 179 | `0xcfe0f2, 0x7d8a70, 0.30` | **`0xcfe0f2, 0x6d7663, 0.26`** |
| Vignette | 0.20 / 60 % | **0.09 / 74 %** (über `opts`, → 3.2) |

Sonne 4.4 → 3.9 und Hemi 0.30 → 0.26 kompensieren, damit die Fassade netto nur ~8 % heller wird und die Schattenseite nicht mit hochkommt.

**Wichtig:** die Sonnenhöhe ist **28.7°**, nicht 31.6° — `atan(12/21.95)`, weil `sun.target` auf y = 1.5 liegt. Der Schattenlängenfaktor ist 1.829, nicht 1.628. Nach der Anhebung auf 33.1° wird er **1.531** (−16 %); alle Schattenwurf-Positionen aus dem Landschaftsgutachten sind entsprechend zu skalieren.

**Abnahme:** Histogramm des Gesamtbildes: p50 ≈ 145, p75 ≈ 205, p95 ≈ 238, Maximum ≈ 250, Anteil über L 240 zwischen **6 und 9 %**. Die Bildecken sind nicht dunkler als die Bildmitte.

### 6.2 `noiseTex()` und Boden — Z. 26-35, 197-212

```js
function noiseTex(base,vari,w,h){
  …
  t.anisotropy=maxAniso;                    // ► fehlt heute komplett
  return t;
}
```
`maxAniso` wird in Z. 419 gesetzt, `buildScene()` läuft in Z. 420 — verfügbar ✓.

- `lawnT`: Grundfarbe `#7f8f60` → **`#5f7442`** (heute RGB 127,143,96 — Rot und Grün praktisch gleich, ein gelbliches Grau). Rauschamplitude 26 → **40**. `repeat.set(12,12)` → **`set(40,40)`** (2.75 m statt 9.2 m je Kachel auf der 110-m-Ebene). **Mähstreifen** in denselben Canvas: 12 waagrechte Bänder je Kachel, abwechselnd ±5 % Luminanz — das ist der eine Hinweis, der aus grüner Farbe einen gemähten Rasen macht, zu Laufzeitkosten null.
- `floorMat` (Z. 201): Fallbackfarbe `0xd0cdc8` → **`0xdedcd8`**. Für Normal/ORM des Bodens `generateMipmaps` bleibt wie in `texPair` gesetzt ✓ — **kein POM auf dem Boden**: `vt.z` liegt dort bei 0.22-0.29, `layers=mix(26,8,vt.z)` ergäbe 21-22 Samples pro Pixel auf 25-30 % der Bildfläche, und `klbParallax` bricht bei `vt.z<0.10` mit `return uv` ab — auf einer tiefen Bodenebene liegt diese Schwelle als **scharfe, quer durchs Bild laufende Kante**.

**Abnahme:** Rasen misst L 90-110 mit erkennbar dominantem Grünkanal und sichtbarer Mährichtung. Beim Orbitieren kriecht kein Rauschen mehr über den Rasen.

### 6.3 Kontaktschatten-Decal — neu, nach Z. 204

Gemessen: `fin-efh.png`, Spalte x = 470, **87 Bildzeilen Vorplatz konstant bei L = 179, Abweichung exakt 0**. Der Schlagschatten des Baukörpers fehlt nicht — er fällt korrekt nach hinten aus dem Bild. Was fehlt, ist die ansichtsunabhängige Verdunkelung am Bauwerksfuss.

```js
const cCv=document.createElement('canvas'); cCv.width=cCv.height=512;   // 24 m → 46.9 mm/px
// weiss fuellen; Grundriss 9.6 × 8.0 m (Mitte 0 / -4.0) mit 0.40 m Saum,
// an der Wand RGB(140,140,140), nach aussen auf 255 auslaufend, 6 px Weichzeichnung
const dec=new THREE.Mesh(new THREE.PlaneGeometry(24,20),
  new THREE.MeshBasicMaterial({map:cT,blending:THREE.MultiplyBlending,
    depthWrite:false,transparent:true,fog:false}));
dec.rotation.x=-Math.PI/2; dec.position.set(0,0.026,-2.0); dec.renderOrder=2; scene.add(dec);
```
`y = 0.026` liegt über dem angehobenen Belag (0.020) und über dem Rasen (−0.010). `fog:false` ist zwingend — sonst mischt der Nebel die Multiply-Textur mit steigender Entfernung nach Weiss und die Verdunkelung verschwindet.

**Abnahme:** derselbe Spaltenscan zeigt am Wandfuss **mindestens 35 Stufen** Abfall gegenüber der freien Fläche, mit weichem Übergang über ~0.3 m.

### 6.4 Glas — Z. 299

```js
const glassM=glassMaterial({opacity:0.58,color:0x1f2731,env:1.0,roughness:0.04,clearcoat:0});
```
Heute: `opacity 0.52, color 0x232b33, env 1.9, clearcoat 1` → die Oberflächenreflexion wird doppelt gezählt (5.6 % Fresnel bei ior 1.5 **plus** ~4 % Clearcoat) und mit envMapIntensity 1.9 nochmals fast verdoppelt.

**Eine** Glasvariante, nicht zwei. Die Referenz gewinnt ihre Qualität genau dadurch, dass die Scheibe ein **Spiegel** ist — in `muhr-ref.jpg` ist in keinem Fenster ein Möbel erkennbar, nur Himmel und Baumsilhouette. Und das hier ist ein Klinker-Konfigurator: der Innenraum existiert, damit die Öffnung kein schwarzes Loch ist, nicht als Schauobjekt. Clearcoat abzuschalten **entfernt** einen kompletten BRDF-Zweig — das wird messbar billiger.

**Abnahme:** Scheiben messen L 45-85 mit erkennbarem Himmelsverlauf im oberen Drittel. In keiner Scheibe ist ein Möbelstück als Form identifizierbar, aber jede Scheibe zeigt Tiefe (beim Orbitieren wandert der Inhalt gegen die Laibung).

### 6.5 Eingang — Z. 318-344

| | heute | neu |
|---|---|---|
| Öffnung | 1.84 × 2.60 (Portalmass) | **1.60 × 2.23**, Mitte y 1.435, Sturz 2.55 = Fensterlinie |
| Füllung | Blatt 1.02 (x −0.30) + Seitenteil 0.46 (x +0.52) = 1.48 in 1.84 → **0.11 / 0.08 / 0.17 m offene Spalte** | Blatt **1.05** (x −0.24) + Setzholz 0.06 + Seitenteil **0.43** (x +0.545) + 2 × 0.03 Rahmen = **1.60**, kein Restspalt |
| Blattfarbe | `0x5a3d29` mittelbraun glänzend | **`0x2b2f33`** (RAL 7016), Füllungen `0x24282c`, Griffstange 1.20 m in `0xb8bcbe` |
| Stufen | drei ungleiche Steigungen 9.6 / 9.6 / 12.8 cm — harter Baufehler | zwei gleiche à **0.16 m**: untere OK 0.16 (Auftritt 0.30, Breite 2.60, Tiefe 1.40), obere OK 0.32 = Schwelle (Breite 2.20, Tiefe 1.10) |
| Wandleuchten | fehlen | 2 × `BoxGeometry(0.11,0.30,0.11)` in `0x2b2d30` bei x = ±1.15, y = 2.05, z = +0.06, Glasstreifen als `MeshBasicMaterial` `0xd8d2c4` |

**Ausdrücklich verboten:** echte `PointLight`/`SpotLight` daraus machen. Die Szene hat heute genau eine schattenwerfende `DirectionalLight` plus eine `HemisphereLight`. Jede zusätzliche dynamische Lichtquelle zwingt three zur Neukompilierung **aller** `MeshStandardMaterials` und kostet 8-12 % Fragment-Last — bei Tageslicht für null sichtbaren Gewinn. Eine Aussenleuchte ist tagsüber **aus**.

### 6.6 Schreinerfarbe folgt dem Produkt — Z. 150, `setTextures` Z. 486-492

Muhr funktioniert, weil die Polarität stimmt: **heller** Weissklinker mit **anthraziten** Fenstern, Türen und Ortgängen. Unser Haus macht das Gegenteil — dunkelroter Klinker mit weissen Rahmen (`0xf2f1ee`, roughness 0.55). Gemessen: Rahmen L 197-217 gegen Klinker L 56-101, also das **2.5- bis 3.5-fache der Wandhelligkeit** und damit das hellste Objekt der Fassade.

Der Konfigurator kennt das Produkt und kann das entscheiden. **Nicht** über einen vierten `setTextures`-Parameter (Slot 4 ist von `gableCv` belegt, → 0.5), sondern lokal:

```js
function canvasLuma(cv){                        // ~1 ms
  if(!cv) return 0.5;
  const s=document.createElement('canvas'); s.width=64; s.height=40;
  const c=s.getContext('2d',{willReadFrequently:true}); c.drawImage(cv,0,0,64,40);
  const d=c.getImageData(0,0,64,40).data; let L=0;
  for(let i=0;i<d.length;i+=4) L+=(d[i]*0.299+d[i+1]*0.587+d[i+2]*0.114)/255;
  return L/(64*40);
}
// in setTextures, VOR applyTex:
const dark = canvasLuma(facadeCv) < 0.45;
frM.color.set(dark?0x30353a:0xdad7d0);  frM.roughness = dark?0.55:0.85;
```
Das ist die einzige Änderung, die **jedes** Produkt im Sortiment absichtlich aussehen lässt statt nur die hellen.

**Abnahme:** dunkelroten Klinker wählen → Rahmen anthrazit, gemessen L 40-70. Weissen Klinker wählen → Rahmen hell, aber nie heller als L 165.

### 6.7 Aussenanlage

Nach der Kameraumstellung belegt der Boden am Hausabstand die **unteren 14 %** der Bildhöhe bei 22° Streifwinkel. Deshalb wird nur gebaut, was dort noch als Silhouette oder als Fläche wirkt.

**Belag als EINE `THREE.Shape`** (Z. 202-204 ersetzen), `ShapeGeometry`, `rotation.x=-π/2` — ein Draw-Call statt vier Planes:
- Zufahrt x +1.60 … +7.40 / z +1.90 … +8.00
- Gehweg 1.60 m breit, x −2.30 … −0.70, z +1.56 … +8.00
- Türpodest x −1.30 … +1.30 / z +0.12 … +1.56
- Nebenfläche links x −8.60 … −5.10 / z +0.80 … +3.80, `texture.rotation=π/2` → zeigt das Produkt in einer **zweiten Verlegerichtung**
- Rasenkeil x −0.70 … +1.60 bleibt stehen

`ShapeGeometry` liefert in three r160 die UVs direkt in Shape-Koordinaten, also in **Metern**. Deshalb genügt `wrapS=wrapT=RepeatWrapping` und `repeat.set(1/12,1/12)` (12 = `pw` aus `app.js:1347`) — und dasselbe `repeat` **muss** auch auf `maps.normal` und `maps.orm`, sonst liegt das Relief um Faktor 12 daneben.
Fläche schrumpft von 84 auf ~62 m², Belagshöhe **y = +0.020** (Rasen bleibt −0.010): bei 1.5 cm und 33° Sonnenstand wäre der Schattenstreifen nur 2.3 cm breit und verschwände.

**Randeinfassung** (der teuerste fehlende Posten am Boden-Produkt): Läuferreihe hochkant, 0.12 m breit, entlang der gesamten Aussenkante, Oberkante y = +0.020, als **ein** extrudierter Ring (`ExtrudeGeometry`, ~500 Dreiecke, 1 Draw-Call), `texture.rotation=π/2`. Daneben Stahlband 0.006 × 0.08 m in `0x7d7a74`.

**Traufstreifen statt Beetstreifen** (Z. 209-212): der heutige `bed` ist 13.0 m breit, das Haus 9.60 — er ragt beidseits 1.70 m frei in den Rasen. Neu: Kiesstreifen **0.45 m** breit, `0xb9b2a4`, y = −0.030, umlaufend (vorne z +0.08 … +0.53 für x −4.90 … +4.90 mit Aussparung x −1.30 … +1.30, an beiden Giebeln x = ±(4.88 … 5.33)). Staudenbeet nur in zwei Feldern x −4.90 … −1.40 und +1.40 … +4.90.

**Zaun und Mauer auf EINE Linie** (Z. 365-370): heute `fenceRun` bei z = 8.8 mit Pfeilern — das ist bereits durchgehend und in Ordnung. Beibehalten, aber: `bars.castShadow` **abschalten**. Bei 0.020 m Stabdicke und 5.9 mm/Texel wird der Stabschatten zu grauem Rauschen statt zu Streifen — das sieht schlechter aus als gar kein Schatten. Stabdicke gegen das Kantenflimmern im Haupt-Pass auf **0.035** anheben.

**Bepflanzung instanzieren** (Z. 349-354): heute 8 `grassTuft` plus 6 `bushClump` à 4 Einzel-Meshes mit je eigenem Material = **32 Draw-Calls und 24 MeshStandardMaterials für sechs kleine Sträucher**. Neu drei `InstancedMesh`: Formschnittkugeln Ilex ø 0.45 m in zwei Reihen à 5, Ziergräser 12 Stück im Raster 0.60 m, Bodendecker ~400 Instanzen — zusammen unter 7000 Dreiecke in **3 Draw-Calls** bei deutlich mehr Pflanzen. `bushClump`-Farben von vier Grüntönen auf **zwei** reduzieren (`0x4c5c40`, `0x5f6d4a`).
**Pflanzhöhen NICHT anheben** — 0.4-0.8 m ist für einen Neubau richtig und der häufigste Fehler in solchen Szenen wäre, sie hochzuskalieren.

**Kübel am Eingang** (neu, im `beds`-Block): zwei Kübel bei x = ±1.15, z = +0.95, Topf 0.42 × 0.42 × 0.55 in `0x3a3d40`, Formschnittkugel ø 0.50, Oberkante y = 1.05. Zwei weitere in hellen Töpfen (`0xb6b2ab`) am Zufahrtsrand bei (+7.10, +2.20) und (+7.10, +3.60). `castShadow=true`, als zwei `InstancedMesh`. Bei 33.1° Sonnenhöhe (Faktor 1.531) landen die Schatten der rechten Kugeln bei x ≈ 5.7 **mitten auf dem Belag** — das ist der einzige Massstabsvergleich, den der Pflasterklinker bekommt. Kontaktscheiben mit `groundContact(x,z,w,d,parent,0.026)`.

**Hecken** (Z. 357-359): Farbe `0x44553a` → **`0x506732`** (heute HSL 0.272/0.19/0.28, ein entsättigtes Graugrün, das nur den Schattenwert der Referenzhecke trifft und den Sonnenwert nie erreicht). Tuft-Farben `setHSL(0.26+r*0.05, 0.24+r*0.14, 0.16+r*0.12)` → `setHSL(0.24+r*0.05, 0.30+r*0.14, 0.20+r*0.14)`. Seitenhecken auf `len=20.1`, Mitte z = −3.45 verlängern (heute klafft je Flanke eine **6.0 m lange Lücke** zwischen z −7.5 und −13.5).
**Tufts auf den Heckenseitenflächen NICHT bauen** — 32 000 Dreiecke und verdoppelte Instanzzahl im Shadow-Pass für unter 5 % Bildfläche bei 33-45 m Entfernung.

**Kulisse** (Z. 373-376): die drei geplätteten Kugeln löschen. Gemessen L **182** gegen einen Himmel von L 185 — null bis drei Stufen Trennung; Muhrs Baumwand L 98 gegen L 234, also 136 Stufen. Ersatz: **ein** `InstancedMesh` aus 22-26 `IcosahedronGeometry(1,1)`-Kronen bei z −44 … −50, x −38 … +38, Höhen 8-13 m, Kronenradius 3.5-6 m, Farbe `0x44532f` … `0x53613c`, **`castShadow=false`** (sonst bläht sich das Schattenfrustum auf 80 m auf und die Texelgrösse verdreifacht sich).

**Nebel** (Z. 173): `Fog(0xe9ebe9, 55, 110)` → **`Fog(0xf1eee6, 38, 150)`**. Die Farbe muss den Horizontdunst des Himmel-Canvas treffen (`rgba(243,240,232)`, `scene3d-lib.js:90-92`) — der vorgeschlagene Wert `0xdfe4e4` ist kälter und dunkler als der Horizont und gäbe der Kulisse einen blaugrauen Halo genau an der Silhouette, die man verbessern wollte.

**Nicht bauen** (Aufwand für Grundriss-Logik, die in dieser Kamera nie zu sehen ist — Silhouetten von 0.72 bis 1.30 m sind dort 3-10 Bildpunkte hoch): Müllplatz mit Lattenschirm, Veloabstellplatz, Parkfeldmarkierung, Bistrotisch, Entwässerungsrinne, Punktablauf, Gefälle der Zufahrt, rückwärtiger Sitzplatz. Und **kein Hausbaum bei (+9.00, +7.20)** — mit der neuen Kamera stünde er 15.9 m vor dem Objektiv gegen 22.6 m zum Haus, vergrösserte sich um Faktor 1.42 und verdeckte die rechte Giebelwand, also die zweite Produktfläche des Konfigurators.

**Abnahme:** Kulissenbäume messen L 90-125, der Himmel darüber L 225-240 — Differenz über 100 Stufen. Auf dem Belag liegen mindestens zwei scharfe Schlagschatten. Die Belagskante gegen den Rasen ist als Kante erkennbar, nicht als Farbwechsel.

### 6.8 Mobil — Z. 412, 415, 441

```js
renderer=new THREE.WebGLRenderer({antialias:true});          // war !MOBILE
renderer.shadowMap.type=MOBILE?THREE.PCFShadowMap:THREE.PCFShadowMap;
sun.shadow.mapSize.set(MOBILE?2048:4096,MOBILE?2048:4096);   // war 1024
sun.shadow.radius=MOBILE?2:2.5;                              // war 1 — BasicShadowMap ignoriert radius
renderer.setPixelRatio(Math.min(MOBILE?1.25:2,window.devicePixelRatio||1));   // war 1.5
```
Die heutige Kombination ist die ungünstigste von allen: 1.5-facher Pixelratio **ohne** MSAA kostet mehr Füllrate als 1.25-facher **mit** MSAA und sieht schlechter aus. Auf Tile-Based-GPUs wird das MSAA-Resolve on-tile erledigt (typisch 5-15 % Füllrate), während 1.5 → 1.25 **31 % der Fragmente** spart.

**Das ist der einzige Punkt der ganzen Liste mit echtem Messbedarf** — vor dem Ausrollen auf einem realen Android-Mittelklassegerät gegenprüfen, nicht glauben.

### 6.9 POM-Tiefe und Kartenauflösung — Z. 457-461, 486-492

```js
const POM_FRONT=[0.009/HW, 0.009/HE];        // vec2, 7.2 mm statt 11.2 mm (→ 0.3, 3.4)
const POM_SIDE =[0.009/HD, 0.009/HR];
function applyTex(m,cv,fallback,rough,ns,pom){
  applySurface(m,cv,{fallback,rough,normalScale:ns!=null?ns:0.9,aniso:maxAniso,
    env:cv?0.20:0.3, pom:pom||0, maxW:MOBILE?1024:2048});     // ► maxW fehlt heute ganz
}
```
`surfaceMaps` deckelt heute ohne `maxW` auf 1400 (mobil 512): bei 9.60 m Wandbreite **6.86 mm je Pixel**, die 12-mm-Lagerfuge ist 1.75 px breit, danach läuft noch `boxBlur(R=1)` darüber. Mit `maxW=2048` greift `W=Math.min(cap,cv.width)` auf die nativen 2000 px — **keine Neuabtastung**, 4.80 mm/px, Fuge 2.5 px mit auswertbaren Schultern.

**VRAM ehrlich gerechnet:** Front 2000 × 1333 = 2.67 MP → Normal + ORM je 10.7 MB × 1.333 (Mipkette) = **28.4 MB**, plus Farbkarte 14.2 MB. Giebel 1600 × 2080 = 3.33 MP → **35.5 MB** + 17.8 MB. Der Zusammenschluss `sideMatL`/`sideMatR` → `sideMat` (0.6) spart davon **53 MB**, weil das Giebelmaterial sonst zweimal hochgeladen wird. Gesamt danach ~96 MB — auf Desktop tragbar, mobil deshalb `maxW=1024`.

---

## 7. Was bewusst NICHT gebaut wird — mit Begründung

| Vorschlag | Warum nicht |
|---|---|
| Meter-UVs + `RepeatWrapping` für Front und Giebel, `TILE_W/TILE_H`, Eckriegel | Prämisse widerlegt: beide Canvas sind in sich isotrop, der Stein ist auf beiden Wänden gleich gross. Und `paintCourses` zeichnet von `c=-1` bis `cols` **ohne jede Wrap-Logik** — `RepeatWrapping` liefe alle `TILE_W` Meter mit einer sichtbaren Naht durch die Fassade. Verschlechterung. |
| Zwerchhaus 3.20 m breit, eigener First 8.30 | Die Kehle zwischen zwei 45°-Flächen lässt sich mit `BoxGeometry` nicht schliessen — Durchdringungen und Schattenakne genau dort, wo der Blick hinfällt; die Szene hat keine CSG und keine Addons. Nimmt ausserdem dem Bad sein Fenster (den billigsten Raum überhaupt, ~15 statt ~120 Instruktionen). Das Ziel — starke Mittelachse — leisten Segmentbogen, einheitliches Achsraster und 45°-Dach bei einem Zehntel des Risikos. |
| Vordach 2.40 × 1.10, Vorderkante y 2.85 | Kollidiert mit dem Segmentbogen (Oberkante 3.03). Entweder-oder. |
| POM auf dem Vorplatz | 21-22 Samples/Pixel auf 25-30 % der Bildfläche, plus die harte `vt.z<0.10`-Abbruchkante quer durchs Bild. |
| 2 % Gefälle der Zufahrt | Begründet mit einem „wandernden Glanzband"; `floorMat` läuft mit roughness 0.85 und envMapIntensity 0.20-0.40 — es gibt kein Glanzband zu modulieren. Geometrisch sind 12.3 cm Fall bei 22° Blickwinkel ~2 Bildpunkte. |
| Entwässerungsöffnungen (offene Stossfugen 10 × 71 mm) | 0.32 px bei Startansicht, 0.76 px bei maximalem Zoom. Unter einem Pixel bei jeder erreichbaren Kameraposition. |
| Eigenes `sockelMat` mit drittem Texturkanal | Zweiter vollständiger `surfaceMaps`-Lauf bei jedem Produktwechsel. Gegenwert: 0.32 m Sockel = 2.7 % der Bildhöhe, unten von Kiesstreifen und Kontaktschatten überlagert. Stattdessen `facadeMat` mit `color 0xb0aca6` als Abdunkler — dieselbe Karte, null Kosten. |
| Traufgesims / Zahnschnitt | Liegt geometrisch hinter dem Dachrand (→ Kapitel 1). |
| SSAO in drei Passes | three r160 bündelt keine Addons; 3 Full-Screen-Passes kosten auf einem Mittelklasse-Handy 3-6 ms von 16.7 ms. Das Kontaktschatten-Decal (6.3, **ein** Draw-Call) liefert genau die Verdunkelung, die im Bild fehlt. Erst nach allen anderen Schritten wieder bewerten. |
| Bloom, SSR, FXAA/TAA, Farb-Grade | Muhr hat nachweislich keins davon. Bloom würde schaden, SSR ist unnötig (dort ist reines Environment im Glas), FXAA ist mit MSAA überflüssig. |

**Niedrig priorisiert, aber notiert:** die Lagerfugen springen an der Gebäudeecke um `(HR−HE) mod Schichtmass` = 4.00 mod 0.0805 = **55 mm**, weil beide Canvas oben mit einer ganzen Schicht beginnen und die Oberkanten 4.00 m auseinanderliegen. Bei 32 px/m sind das 1.8 Bildpunkte, bei maximalem Zoom 4.2. Fix wäre ein Phasenversatz beim Zeichnen des Giebel-Canvas (`cx.translate(0,-phase)` plus eine Zeile mehr). Erst angehen, wenn alles andere steht — und **nicht** durch Umdrehen des Höhenbezugs: dass die ganze Schicht oben und die angeschnittene unten hinter dem Sockel liegt, ist maurerhandwerklich richtig.

---

## 8. Schrittfolge

Nach jedem Schritt ist der Stand lauffähig und sichtbar besser. Reihenfolge ist nicht beliebig — die Abhängigkeiten stehen dabei.

**Schritt 1 · Bildgrundlage** (6.1, 5.3, 6.2, Nebelfarbe) — kein Geometrierisiko, kein Abhängigkeit.
→ *Sichtbar:* Das Bild bekommt Lichter (Maximum 250 statt 222), das Dach ist kein schwarzes Loch mehr, der Rasen ist Gras. **Grösster Effekt pro Zeile im ganzen Paket.**

**Schritt 2 · Nahfeldfehler** (5.6 ohne Instancing: Laibungskörper in die Öffnung + 3 mm zurück, Rollladenkästen und Tropfblech löschen, fünf Materialien hoisten, `castShadow` der Rahmenhölzer aus). Unabhängig.
→ *Sichtbar:* Das Barcode-Band über der Haustür ist weg, die Fenster verlieren ihre schwarzen Balken, −15 Meshes, −70 Materialien, −60 Shadow-Draw-Calls.

**Schritt 3 · Kamera** (5.1, 5.2). Muss vor jeder Aussenanlagenarbeit stehen — sie entscheidet, was überhaupt noch im Bild ist.
→ *Sichtbar:* Haus füllt 87 % statt 47 % der Bildhöhe, Senkrechte parallel.

**Schritt 4 · Baukörper** (Kapitel 1, 5.4, 5.5, 5.9-Schattenkamera, `app.js` 2.3). Setzt Schritt 1 voraus (sonst sieht man die Formänderung an einer schwarzen Fläche nicht). Die drei Kaskaden aus 0.5/1 **zusammen** einbauen, sonst ist der Zwischenstand kaputt: Canvas-Höhen 1333/2080, Innenschale + Spitzbodenkörper.
→ *Sichtbar:* 45° statt 27.6°, First 10.40, Dachanteil 38.5 % statt 28 %, Traufe mit drei Schichten, Pfannen im richtigen Massstab.

**Schritt 5 · Öffnungsschema** (Kapitel 1, 6.5). Setzt Schritt 4 voraus (Giebelspitzenfenster braucht die Firsthöhe und den Attikakörper).
→ *Sichtbar:* Ein Fenstertyp, gemeinsame Sturz- und Brüstungslinien, Eckpfeiler 1.45 statt 1.05, Tür ohne Restspalt, gleiche Stufen.

**Schritt 6 · Instancing** (5.7). Wird durch Schritt 5 trivial. Kein Bildgewinn, aber ohne ihn sind die Schritte 7 und 9 nicht bezahlbar.
→ *Messbar:* 194 → ~22 Draw-Calls für die Öffnungen.

**Schritt 7 · Produkt an den Öffnungen** (5.8, 6.6). Setzt 5 und 6 voraus.
→ *Sichtbar:* Rollschicht über jeder Öffnung, Sohlbank aus Klinker, Laibung aus Klinker, Segmentbogen über der Tür, Rahmenfarbe folgt dem Produkt. **Das ist der Schritt, der aus dem Modell ein Klinkerhaus macht.**

**Schritt 8 · Innenraum-Shader** (Kapitel 4 komplett, 6.4). Unabhängig von 5-7, aber die Fenstertabelle aus Schritt 5 wird gebraucht. `uRoom=0`-Default zuerst einbauen und die fünf anderen Szenen einmal öffnen, **bevor** die EFH-Tabelle folgt.
→ *Sichtbar:* Ein Grundriss statt 13 Wohnungen, Milchglas über der Haustür, höchstens zwei brennende Fenster, gleicher Tonwertraum wie der Rest des Bildes.

**Schritt 9 · Wandtonwert und Boden** (5.9 Lightmap + Traufblende, 6.3 Kontaktschatten).
→ *Sichtbar:* Die Wand hat einen Verlauf, das Haus steht statt aufzuliegen.

**Schritt 10 · Aussenanlage** (6.7). Setzt Schritt 3 voraus.
→ *Sichtbar:* Zonierter Belag mit Randeinfassung, Traufstreifen, Kübel mit Schlagschatten, Baumkulisse mit Dunstsaum statt Hügeln ohne Silhouette.

**Schritt 11 · Texturpipeline** (2.1, 2.2, 2.4, 6.9, 3.4). Jederzeit einschiebbar, aber die Fugenformel (2.2) braucht `fmtOf` (2.1) davor, und `maxW` (6.9) braucht den Cache-Schlüssel (2.4) davor — sonst liefert der Cache die falsche Auflösung.
→ *Sichtbar:* Langformat- und Grossformatprodukte rendern erstmals im richtigen Massstab, drei unterscheidbare Fugenstufen, Fugenrelief auch im Zoom, Fugentiefe 7 statt 11 mm.

**Schritt 12 · Mobil** (6.8). Zuletzt, weil es auf echter Hardware gemessen werden muss.

**Empfohlener Schnitt für eine erste Auslieferung:** Schritte 1-4. Das sind rund 150 Zeilen, kein Refactoring, und es schliesst nach meiner Einschätzung bereits **die Hälfte** des sichtbaren Abstands zur Referenz — Belichtung, Dach und Proportion sind die drei Befunde, die alles andere überlagern.