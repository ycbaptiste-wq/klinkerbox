# ===================== KLINKERBOX · STEMPEL-BEREINIGUNG =====================
# Einmaliges Skript (Ergebnis wird committet).
#
# Die sechs Historika-Bilder trugen einen "HAND-MADE"-Stempel in der unteren
# rechten Ecke. Frueher wurde er BEI JEDEM SEITENAUFRUF im Browser per Canvas
# weggerechnet (app.js: cleanStamp) — das kostete 992 KB Originalbilder und
# ~190 ms Hauptthread-Zeit pro Aufruf, fuer sechs Produkte, die beim Start
# nicht einmal sichtbar sind.
#
# Dieses Skript arbeitet in ZWEI Schritten, beide klonen sauberes Mauerwerk
# von links ueber die Stempelregion:
#
#   1) Hauptflaeche  rw = W*0.46 ; rh = H*0.40
#      (W-2*rw, H-rh, rw, rh)  ->  (W-rw, H-rh, rw, rh)
#      Die Oberkante bei 60 % der Hoehe faellt genau auf eine Moertelfuge —
#      deshalb ist die Naht dort unsichtbar. Nicht veraendern.
#
#   2) Spitze        Das diagonale "HAND-MADE"-Band ragt oben rechts ueber
#      die Hauptflaeche hinaus; genau dieser schwarze Rest blieb in der alten
#      Laufzeit-Fassung immer stehen. Ein schmaler Streifen deckt ihn ab:
#      (W-0.20*W, 0.545*H, 0.10*W, 0.055*H) -> (W-0.10*W, 0.545*H, ...)
#
# Aufruf:  powershell -File tools\clean-stamp.ps1

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$ROOT = Split-Path $PSScriptRoot -Parent

# Quelle (Galerie) -> Ziel (Produktbild), Namen nach Produkt aus products.js
$MAP = @(
  @{ id='m240'; name='Bielefeld'; src='YCB00021-2.jpg';   dst='historika-bielefeld.jpg' }
  @{ id='m241'; name='Hanau';     src='YCB00017-2.jpg';   dst='historika-hanau.jpg'     }
  @{ id='m242'; name='Heinsberg'; src='YCB00027-1.jpg';   dst='historika-heinsberg.jpg' }
  @{ id='m243'; name='Kiel';      src='YCB00019-2.jpg';   dst='historika-kiel.jpg'      }
  @{ id='m244'; name='Luenen';    src='YCB00025-2-2.jpg'; dst='historika-luenen.jpg'    }
  @{ id='m245'; name='Mannheim';  src='YCB00014-2.jpg';   dst='historika-mannheim.jpg'  }
)

$jpegEnc = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() |
           Where-Object { $_.MimeType -eq 'image/jpeg' }
$encParams = New-Object System.Drawing.Imaging.EncoderParameters(1)
$encParams.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter(
                        [System.Drawing.Imaging.Encoder]::Quality, [int64]85)

$outDir = Join-Path $ROOT 'assets\products\mauer'
New-Item -ItemType Directory -Force $outDir | Out-Null

foreach ($m in $MAP) {
  $in  = Join-Path $ROOT ('assets\gallery\' + $m.src)
  $out = Join-Path $outDir $m.dst
  if (!(Test-Path $in)) { Write-Host ("FEHLT  " + $m.src); continue }

  $src = [System.Drawing.Bitmap]::FromFile($in)
  try {
    $W = $src.Width; $H = $src.Height
    # JS Math.round rundet .5 immer auf — [math]::Round nutzt Bankers Rounding
    $rw = [int][math]::Floor($W * 0.46 + 0.5)
    $rh = [int][math]::Floor($H * 0.42 + 0.5)

    $dst = New-Object System.Drawing.Bitmap($W, $H)
    $g = [System.Drawing.Graphics]::FromImage($dst)
    try {
      $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $g.PixelOffsetMode   = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
      $g.DrawImage($src, 0, 0, $W, $H)

      # 1) Hauptflaeche — Oberkante liegt in der Moertelfuge, Naht unsichtbar
      $destRect = New-Object System.Drawing.Rectangle(($W - $rw), ($H - $rh), $rw, $rh)
      $g.DrawImage($src, $destRect, ($W - 2 * $rw), ($H - $rh), $rw, $rh,
                   [System.Drawing.GraphicsUnit]::Pixel)

      # 2) Spitze des diagonalen Bands, die oben rechts herausragt.
      #    Quelle bewusst WEIT links (0.42*W), sonst liegt das Band dort noch
      #    selbst drin und wuerde erneut hereinkopiert.
      $tw = [int][math]::Floor($W * 0.115 + 0.5)
      $th = [int][math]::Floor($H * 0.045 + 0.5)
      $ty = [int][math]::Floor($H * 0.542 + 0.5)
      $sx = [int][math]::Floor($W * 0.42 + 0.5)
      $tipRect = New-Object System.Drawing.Rectangle(($W - $tw), $ty, $tw, $th)
      $g.DrawImage($src, $tipRect, ($W - $tw - $sx), $ty, $tw, $th,
                   [System.Drawing.GraphicsUnit]::Pixel)
    } finally { $g.Dispose() }

    $dst.Save($out, $jpegEnc, $encParams)
    $dst.Dispose()
    $kb = [int]((Get-Item $out).Length / 1KB)
    Write-Host ("OK     {0,-9} {1,4}x{2,-4} -> {3} ({4} KB)" -f $m.name, $W, $H, $m.dst, $kb)
  } finally { $src.Dispose() }
}

Write-Host ''
Write-Host 'Fertig. Danach: powershell -File tools\build-images.ps1  (erzeugt products-640 + thumbs-160)'
