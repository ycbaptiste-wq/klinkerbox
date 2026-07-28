# ============ KLINKERBOX · STEMPEL-ENTFERNUNG (Musterfotos der Galerie) ============
#
# Die Musterfotos der Lieferanten (Ancienne Belgique, Elegantia, Historika,
# SeptimA) tragen unten rechts einen schwarzen "HAND-MADE"-Stempel. Dieses
# Skript entfernt ihn EINMALIG offline; das Ergebnis wird committet.
#
# Verfahren je Bild:
#   1. Stempel lokalisieren  — zusammenhaengende Flaeche NEUTRAL schwarzer Pixel
#      (alle Kanaele < 45, Spreizung < 14) in der unteren rechten Bildhaelfte.
#      Bounding-Box plus Rand.
#   2. Klon-Versatz waehlen   — der Bereich wird durch Mauerwerk von WEITER LINKS
#      ersetzt. Der Versatz wird nicht geraten, sondern gesucht: fuer jeden
#      Kandidaten wird die Abweichung entlang der Schnittkanten berechnet und
#      der Versatz mit der kleinsten Naht genommen. Bei Ziegelwaenden trifft
#      das automatisch das Mauerwerksraster, deshalb bleibt die Naht unsichtbar.
#   3. Quelle pruefen         — enthaelt der Quellbereich selbst noch Stempel-
#      pixel, wird der Versatz verworfen (sonst kopiert man den Stempel zurueck).
#
# Aufruf:  powershell -File tools\clean-stamp-gallery.ps1            (Vorschau)
#          powershell -File tools\clean-stamp-gallery.ps1 -Apply     (schreibt)

param([switch]$Apply, [int]$Quality = 85)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$ROOT = Split-Path $PSScriptRoot -Parent
$GAL  = Join-Path $ROOT 'assets\gallery'

# Betroffene Musterfotos (visuell bestaetigt). SeptimA-Grisage fehlt bewusst:
# das Bild stammt aus einer anderen Quelle (380x250) und traegt keinen Stempel.
$FILES = @(
  'Ancienne-Belgique-Basalt','Ancienne-Belgique-Bordeaux','Ancienne-Belgique-Camel',
  'Ancienne-Belgique-Grau-Patiniert','Ancienne-Belgique-Kupferbraun','Ancienne-Belgique-Lava',
  'Ancienne-Belgique-Perlgrau',
  'Elegantia-Amarant','Elegantia-Carbon','Elegantia-Salvia-Salbei','Elegantia-Titan','Elegantia-Vanille',
  'Rheinland_Wand','Ruhrgebiet_Wand',
  'SeptimA-Amarant','SeptimA-Anthrazit','SeptimA-Arena','SeptimA-Aureum','SeptimA-Automne',
  'SeptimA-Brunage','SeptimA-Carbon','SeptimA-Colosseum','SeptimA-Ebonit','SeptimA-Forum',
  'SeptimA-Graphit','SeptimA-Grau-Gelb','SeptimA-Kastanie','SeptimA-Mahagonie','SeptimA-Melange',
  'SeptimA-Noblesse','SeptimA-Olive','SeptimA-Onyx','SeptimA-Rotbraun','SeptimA-Safrane',
  'SeptimA-Sepia','SeptimA-Taupe','SeptimA-Terrestre','SeptimA-Vanille'
)

if (-not ('StampFix' -as [type])) {
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

public class StampFix {
  static bool IsStamp(byte[] b, int i) {
    int bl = b[i], gr = b[i+1], rd = b[i+2];
    int mx = bl; if (gr > mx) mx = gr; if (rd > mx) mx = rd;
    int mn = bl; if (gr < mn) mn = gr; if (rd < mn) mn = rd;
    // Bewusst streng: dunkle Klinker (Lava, Ebonit, Graphit) liegen bei 60-120,
    // der Stempeldruck dagegen nahe 0. Mit <45 zaehlte der Stein selbst mit und
    // die Bounding-Box umfasste das halbe Bild.
    return mx < 28 && (mx - mn) < 10;
  }

  // Rueckgabe: {x, y, w, h, shift, seamError, stampPixels}  — shift < 0 => nichts gefunden
  public static int[] Plan(string path) {
    using (Bitmap bmp = new Bitmap(path)) {
      int W = bmp.Width, H = bmp.Height;
      BitmapData d = bmp.LockBits(new Rectangle(0, 0, W, H), ImageLockMode.ReadOnly, PixelFormat.Format24bppRgb);
      int stride = d.Stride;
      byte[] b = new byte[stride * H];
      Marshal.Copy(d.Scan0, b, 0, b.Length);
      bmp.UnlockBits(d);

      int sx0 = (int)(W * 0.42), sy0 = (int)(H * 0.38);
      int rW = W - sx0, rH = H - sy0;
      bool[] mask = new bool[rW * rH];
      int count = 0;
      for (int y = 0; y < rH; y++) {
        int row = (y + sy0) * stride;
        for (int x = 0; x < rW; x++) {
          if (IsStamp(b, row + (x + sx0) * 3)) { mask[y * rW + x] = true; count++; }
        }
      }
      // Mindestgroesse mit dem Bild skalieren - kleine Musterfotos (380x250)
      // haben einen entsprechend kleinen Stempel.
      int minBlob = Math.Max(60, (W * H) / 8000);
      if (count < minBlob) return new int[] { 0, 0, 0, 0, -1, 0, count };

      // GROESSTE ZUSAMMENHAENGENDE Flaeche nehmen, nicht alle Schwarzpixel.
      // Bei dunklen Klinkern (Lava, Ebonit, Graphit) liegen ueberall vereinzelt
      // sehr dunkle Stellen; ihre gemeinsame Bounding-Box umfasste das halbe
      // Bild, und dann bleibt links kein gueltiger Quellbereich mehr uebrig.
      // Box ueber ALLE Maskenpixel als Rueckfallebene
      int allX0 = W, allX1 = -1, allY0 = H, allY1 = -1;
      for (int y = 0; y < rH; y++)
        for (int x = 0; x < rW; x++)
          if (mask[y * rW + x]) {
            int gx = x + sx0, gy = y + sy0;
            if (gx < allX0) allX0 = gx; if (gx > allX1) allX1 = gx;
            if (gy < allY0) allY0 = gy; if (gy > allY1) allY1 = gy;
          }

      int[] stack = new int[rW * rH];
      bool[] seen = new bool[rW * rH];
      int minX = W, maxX = -1, minY = H, maxY = -1, best = 0;
      for (int s = 0; s < mask.Length; s++) {
        if (!mask[s] || seen[s]) continue;
        int sp = 0; stack[sp++] = s; seen[s] = true;
        int n = 0, aX0 = rW, aX1 = -1, aY0 = rH, aY1 = -1;
        while (sp > 0) {
          int cur = stack[--sp];
          int cx = cur % rW, cy = cur / rW;
          n++;
          if (cx < aX0) aX0 = cx; if (cx > aX1) aX1 = cx;
          if (cy < aY0) aY0 = cy; if (cy > aY1) aY1 = cy;
          if (cx > 0      && mask[cur-1]  && !seen[cur-1])  { seen[cur-1]  = true; stack[sp++] = cur-1; }
          if (cx < rW - 1 && mask[cur+1]  && !seen[cur+1])  { seen[cur+1]  = true; stack[sp++] = cur+1; }
          if (cy > 0      && mask[cur-rW] && !seen[cur-rW]) { seen[cur-rW] = true; stack[sp++] = cur-rW; }
          if (cy < rH - 1 && mask[cur+rW] && !seen[cur+rW]) { seen[cur+rW] = true; stack[sp++] = cur+rW; }
        }
        if (n > best) {
          best = n;
          minX = aX0 + sx0; maxX = aX1 + sx0; minY = aY0 + sy0; maxY = aY1 + sy0;
        }
      }
      // Bildet die groesste Komponente den Stempel gut ab, ist sie die bessere
      // Wahl (dunkle Klinker). Zerfaellt die Maske dagegen in viele Fragmente -
      // kleine Musterfotos mit JPEG-Artefakten - beschreibt die Gesamt-Box den
      // Stempel besser.
      if (best * 100 < count * 35) {
        minX = allX0; maxX = allX1; minY = allY0; maxY = allY1; best = count;
      }
      if (maxX < 0 || best < minBlob) return new int[] { 0, 0, 0, 0, -1, 0, best };
      count = best;

      // Der Ersatzbereich reicht bis an die rechte und untere BILDKANTE.
      // Zwei Gruende: die weich auslaufende Spitze des diagonalen Bandes liegt
      // knapp ausserhalb der Tiefschwarz-Box (sonst bleibt dort ein Rest stehen),
      // und an einer Bildkante entsteht keine Naht - es bleiben nur Ober- und
      // Linkskante zu kaschieren.
      int padX = Math.Max(6, W / 100);
      int padY = Math.Max(6, H / 100) + (maxY - minY) / 6;   // oben grosszuegiger
      int rx = Math.Max(0, minX - padX);
      int ry = Math.Max(0, minY - padY);
      int rw = W - rx;
      int rh = H - ry;

      // Versatz suchen: kleinste Abweichung entlang Ober- und Unterkante
      int bestShift = -1; long bestErr = long.MaxValue;
      // Der Quellbereich muss KOMPLETT links vom Stempel liegen. Sonst kopiert
      // ein zu kleiner Versatz einen Teil des Stempels wieder herein - genau das
      // hinterliess vorher schwarze Reste am rechten Bildrand.
      int minShift = Math.Max(Math.Max(8, W / 40), W - minX);
      for (int s = minShift; s <= rx; s += 2) {
        // Quelle darf den Stempel nicht selbst enthalten. Anteilig pruefen statt
        // absolut: sehr dunkle Klinker (Ebonit, Graphit) haben vereinzelt echte
        // Tiefschwarz-Pixel, das darf den Versatz nicht verwerfen.
        int dirtyN = 0, sampleN = 0; bool oob = false;
        for (int y = ry; y < ry + rh && !oob; y += 3) {
          int row = y * stride;
          for (int x = rx - s; x < rx - s + rw; x += 3) {
            if (x < 0) { oob = true; break; }
            sampleN++;
            if (IsStamp(b, row + x * 3)) dirtyN++;
          }
        }
        if (oob || sampleN == 0) continue;
        if (dirtyN * 200 > sampleN) continue;       // > 0.5 % => Stempel im Quellbereich

        long err = 0; int n = 0;
        // Oberkante: Zeile ueber dem Rechteck gegen Quellzeile
        if (ry - 1 >= 0) {
          int rowD = (ry - 1) * stride;
          for (int x = rx; x < rx + rw; x += 2) {
            int i1 = rowD + x * 3, i2 = rowD + (x - s) * 3;
            err += Math.Abs(b[i1] - b[i2]) + Math.Abs(b[i1+1] - b[i2+1]) + Math.Abs(b[i1+2] - b[i2+2]);
            n++;
          }
        }
        // Unterkante
        if (ry + rh < H) {
          int rowD = (ry + rh) * stride;
          for (int x = rx; x < rx + rw; x += 2) {
            int i1 = rowD + x * 3, i2 = rowD + (x - s) * 3;
            err += Math.Abs(b[i1] - b[i2]) + Math.Abs(b[i1+1] - b[i2+1]) + Math.Abs(b[i1+2] - b[i2+2]);
            n++;
          }
        }
        // Linke Kante
        if (rx - 1 >= 0) {
          for (int y = ry; y < ry + rh; y += 2) {
            int i1 = y * stride + (rx - 1) * 3, i2 = y * stride + (rx - 1 - s) * 3;
            if (rx - 1 - s < 0) break;
            err += Math.Abs(b[i1] - b[i2]) + Math.Abs(b[i1+1] - b[i2+1]) + Math.Abs(b[i1+2] - b[i2+2]);
            n++;
          }
        }
        if (n == 0) continue;
        long norm = err / n;
        if (norm < bestErr) { bestErr = norm; bestShift = s; }
      }
      return new int[] { rx, ry, rw, rh, bestShift, (int)Math.Min(bestErr, int.MaxValue), count };
    }
  }
}
'@
}

$jpegEnc = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$encParams = New-Object System.Drawing.Imaging.EncoderParameters(1)
$encParams.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter(
                        [System.Drawing.Imaging.Encoder]::Quality, [int64]$Quality)

$ok = 0; $skip = 0
foreach ($name in $FILES) {
  $path = Join-Path $GAL "$name.jpg"
  if (!(Test-Path $path)) { Write-Host ("FEHLT   {0}" -f $name); $skip++; continue }
  $p = [StampFix]::Plan($path)
  $rx, $ry, $rw, $rh, $shift, $err, $cnt = $p
  if ($shift -lt 0) {
    Write-Host ("KEIN STEMPEL  {0,-34} (nur {1} Pixel)" -f $name, $cnt); $skip++; continue
  }
  Write-Host ("{0,-34} Box {1},{2} {3}x{4}  Versatz {5}px  Naht {6}" -f $name, $rx, $ry, $rw, $rh, $shift, $err)
  if (-not $Apply) { continue }

  $src = [System.Drawing.Bitmap]::FromFile($path)
  try {
    $dst = New-Object System.Drawing.Bitmap($src.Width, $src.Height)
    $g = [System.Drawing.Graphics]::FromImage($dst)
    try {
      $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $g.PixelOffsetMode   = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
      $g.DrawImage($src, 0, 0, $src.Width, $src.Height)
      $destRect = New-Object System.Drawing.Rectangle($rx, $ry, $rw, $rh)
      $g.DrawImage($src, $destRect, ($rx - $shift), $ry, $rw, $rh, [System.Drawing.GraphicsUnit]::Pixel)
    } finally { $g.Dispose() }
    $tmp = "$path.tmp"
    $dst.Save($tmp, $jpegEnc, $encParams)
    $dst.Dispose(); $src.Dispose(); $src = $null
    Move-Item $tmp $path -Force
    $ok++
  } finally { if ($src) { $src.Dispose() } }
}
Write-Host ''
if ($Apply) { Write-Host "Bereinigt: $ok / uebersprungen: $skip" }
else { Write-Host "Vorschau - nichts geschrieben. Mit -Apply ausfuehren. ($skip ohne Befund)" }
