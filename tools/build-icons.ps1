# ===================== KLINKERBOX · ICONS =====================
# Erzeugt aus assets/img/logo-mark.png (512x512):
#   /favicon.ico            — 32x32, PNG-in-ICO (seit Vista unterstuetzt)
#   /apple-touch-icon.png   — 180x180, auf Seitenhintergrund gelegt
#                             (Apple ersetzt Transparenz sonst durch Schwarz)
# Beide wurden bisher mit 404 beantwortet.
#
# Aufruf:  powershell -File tools\build-icons.ps1

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$ROOT = Split-Path $PSScriptRoot -Parent
$SRC  = Join-Path $ROOT 'assets\img\logo-mark.png'
$BG   = [System.Drawing.ColorTranslator]::FromHtml('#fbfaf8')   # --bg aus style.css

# Sichtbaren Inhalt bestimmen — die Quelle hat asymmetrischen Leerraum,
# ungetrimmt sitzt die Wortmarke im Icon sichtbar aus der Mitte.
function ContentBox([System.Drawing.Bitmap]$b) {
  $minX = $b.Width; $maxX = -1; $minY = $b.Height; $maxY = -1
  for ($y = 0; $y -lt $b.Height; $y++) {
    for ($x = 0; $x -lt $b.Width; $x++) {
      if ($b.GetPixel($x, $y).A -gt 12) {
        if ($x -lt $minX) { $minX = $x }; if ($x -gt $maxX) { $maxX = $x }
        if ($y -lt $minY) { $minY = $y }; if ($y -gt $maxY) { $maxY = $y }
      }
    }
  }
  if ($maxX -lt 0) { return New-Object System.Drawing.Rectangle(0, 0, $b.Width, $b.Height) }
  return New-Object System.Drawing.Rectangle($minX, $minY, ($maxX - $minX + 1), ($maxY - $minY + 1))
}

function Render([int]$size, [bool]$flatten, [int]$padPct) {
  $src = [System.Drawing.Bitmap]::FromFile($SRC)
  $box = ContentBox $src
  $bmp = New-Object System.Drawing.Bitmap($size, $size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.SmoothingMode     = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.PixelOffsetMode   = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  if ($flatten) { $g.Clear($BG) }

  # Seitenverhaeltnis des Inhalts erhalten und mittig einpassen
  $pad = [int]($size * $padPct / 100)
  $avail = $size - 2 * $pad
  $scale = [math]::Min($avail / $box.Width, $avail / $box.Height)
  $dw = [int][math]::Round($box.Width * $scale)
  $dh = [int][math]::Round($box.Height * $scale)
  $dx = [int](($size - $dw) / 2)
  $dy = [int](($size - $dh) / 2)
  $dest = New-Object System.Drawing.Rectangle($dx, $dy, $dw, $dh)
  $g.DrawImage($src, $dest, $box.X, $box.Y, $box.Width, $box.Height,
               [System.Drawing.GraphicsUnit]::Pixel)
  $g.Dispose(); $src.Dispose()
  return $bmp
}

# --- apple-touch-icon.png (180x180, deckend, etwas Rand) ---
$apple = Render 180 $true 12
$applePath = Join-Path $ROOT 'apple-touch-icon.png'
$apple.Save($applePath, [System.Drawing.Imaging.ImageFormat]::Png)
$apple.Dispose()
Write-Host ("OK  apple-touch-icon.png  180x180  ({0} bytes)" -f (Get-Item $applePath).Length)

# --- favicon.ico (32x32, PNG in ICO-Container) ---
$fav = Render 32 $false 0
$ms = New-Object System.IO.MemoryStream
$fav.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
$fav.Dispose()
$png = $ms.ToArray(); $ms.Dispose()

$icoPath = Join-Path $ROOT 'favicon.ico'
$fs = [System.IO.File]::Create($icoPath)
$bw = New-Object System.IO.BinaryWriter($fs)
try {
  $bw.Write([uint16]0)            # reserviert
  $bw.Write([uint16]1)            # Typ 1 = Icon
  $bw.Write([uint16]1)            # Anzahl Bilder
  $bw.Write([byte]32)             # Breite
  $bw.Write([byte]32)             # Hoehe
  $bw.Write([byte]0)              # Farbpalette (0 = keine)
  $bw.Write([byte]0)              # reserviert
  $bw.Write([uint16]1)            # Farbebenen
  $bw.Write([uint16]32)           # Bit pro Pixel
  $bw.Write([uint32]$png.Length)  # Groesse der Bilddaten
  $bw.Write([uint32]22)           # Offset (6 Header + 16 Verzeichnis)
  $bw.Write($png)
} finally { $bw.Dispose(); $fs.Dispose() }
Write-Host ("OK  favicon.ico          32x32    ({0} bytes)" -f (Get-Item $icoPath).Length)
