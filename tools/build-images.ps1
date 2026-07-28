# ===================== KLINKERBOX · BILD-PIPELINE =====================
# Einmaliges Konvertierungs-Skript (Ergebnis wird committet, kein Build-System):
#   assets/products-640/**.webp   — Katalogkarten (max. 640px breit, q78)
#   assets/thumbs-160/**.webp     — Lightbox-Thumbnails (160px, q70)
#   assets/img/hero.webp          — Hero als WebP (für image-set)
#   assets/img/og-image.jpg       — 1200×630-Vorschaubild fürs Teilen
# Braucht cwebp (Google libwebp) — wird bei Bedarf nach %TEMP%\libwebp geladen.
# Aufruf:  powershell -File tools\build-images.ps1

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$ROOT = Split-Path $PSScriptRoot -Parent

# cwebp besorgen
$cw = "$env:TEMP\libwebp\cwebp.exe"
if (!(Test-Path $cw)) {
  $zip = "$env:TEMP\libwebp.zip"
  curl.exe -sL -o $zip 'https://storage.googleapis.com/downloads.webmproject.org/releases/webp/libwebp-1.4.0-windows-x64.zip'
  Expand-Archive -Path $zip -DestinationPath "$env:TEMP\libwebp-x" -Force
  $exe = Get-ChildItem "$env:TEMP\libwebp-x" -Recurse -Filter cwebp.exe | Select-Object -First 1
  New-Item -ItemType Directory -Force "$env:TEMP\libwebp" | Out-Null
  Copy-Item $exe.FullName $cw
}

$script:done = 0; $script:skip = 0
function Convert-One([string]$src, [string]$dst, [int]$maxw, [int]$q) {
  if (Test-Path $dst) { $script:skip++; return }
  New-Item -ItemType Directory -Force (Split-Path $dst) | Out-Null
  $img = [System.Drawing.Image]::FromFile($src); $w = $img.Width; $img.Dispose()
  if ($w -gt $maxw) { & $cw -quiet -q $q -resize $maxw 0 $src -o $dst }
  else              { & $cw -quiet -q $q $src -o $dst }
  $script:done++
}

function Convert-Tree([string]$srcBase, [string]$dstBase, [int]$maxw, [int]$q) {
  Get-ChildItem (Join-Path $ROOT $srcBase) -Recurse -Include *.jpg,*.jpeg,*.png | ForEach-Object {
    $rel = $_.FullName.Substring((Join-Path $ROOT $srcBase).Length).TrimStart('\')
    $dst = Join-Path (Join-Path $ROOT $dstBase) ($rel -replace '\.(jpe?g|png)$', '.webp')
    Convert-One $_.FullName $dst $maxw $q
  }
  Write-Host "$dstBase fertig (konvertiert $script:done, übersprungen $script:skip)"
}

# 1) Katalogkarten
Convert-Tree 'assets\products' 'assets\products-640' 640 78
# 2) Lightbox-Thumbs
Convert-Tree 'assets\gallery'  'assets\thumbs-160\gallery'  160 70
Convert-Tree 'assets\products' 'assets\thumbs-160\products' 160 70
Convert-Tree 'assets\refs'     'assets\thumbs-160\refs'     160 70
# 3) Hero-WebP
$hero = Join-Path $ROOT 'assets\img\hero.jpg'
$heroW = Join-Path $ROOT 'assets\img\hero.webp'
if (!(Test-Path $heroW)) { & $cw -quiet -q 80 $hero -o $heroW }
# 4) Og-Image 1200×630 (Center-Crop aus dem Hero)
$og = Join-Path $ROOT 'assets\img\og-image.jpg'
if (!(Test-Path $og)) {
  $src = [System.Drawing.Image]::FromFile($hero)
  $scale = [Math]::Max(1200 / $src.Width, 630 / $src.Height)
  $sw = [int](1200 / $scale); $sh = [int](630 / $scale)
  $sx = [int](($src.Width - $sw) / 2); $sy = [int](($src.Height - $sh) / 2)
  $bmp = New-Object System.Drawing.Bitmap 1200, 630
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = 'HighQualityBicubic'
  $g.DrawImage($src, (New-Object System.Drawing.Rectangle 0,0,1200,630), (New-Object System.Drawing.Rectangle $sx,$sy,$sw,$sh), [System.Drawing.GraphicsUnit]::Pixel)
  $enc = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object MimeType -eq 'image/jpeg'
  $ep = New-Object System.Drawing.Imaging.EncoderParameters 1
  $ep.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, 82L)
  $bmp.Save($og, $enc, $ep)
  $g.Dispose(); $bmp.Dispose(); $src.Dispose()
}
# 5) Referenz-Marquee: die Kacheln sind hoechstens 360 CSS-px breit, geladen wurden
#    aber die 1200er Originale (zusammen rund 1.5 MB fuer sieben Bilder).
Convert-Tree 'assets\refs' 'assets\refs-720' 720 78

# 6) Logos als WebP in Anzeigegroesse. Die PNGs sind 1133x281 fuer eine 153x38-
#    Darstellung — zusammen 194 KB, davon 92 KB fuer das Dark-Logo, das bei
#    "color-scheme: light only" praktisch nie sichtbar wird.
foreach ($n in 'logo-light', 'logo-dark') {
  $src = Join-Path $ROOT "assets\img\$n.png"
  $dst = Join-Path $ROOT "assets\img\$n.webp"
  if ((Test-Path $src) -and !(Test-Path $dst)) {
    # lossless: die Wortmarke ist Flaechengrafik, dort schlaegt verlustfrei die
    # verlustbehaftete Kompression sowohl in Groesse als auch in Kantenschaerfe
    & $cw -quiet -lossless -z 9 -resize 480 0 $src -o $dst
    $script:done++
    Write-Host ("  {0}.webp  {1} KB (vorher {2} KB)" -f $n,
      [int]((Get-Item $dst).Length / 1KB), [int]((Get-Item $src).Length / 1KB))
  }
}

Write-Host "Fertig. Konvertiert: $script:done · übersprungen: $script:skip"
