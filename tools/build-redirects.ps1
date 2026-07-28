# ===================== KLINKERBOX · WEITERLEITUNGEN =====================
# GitHub Pages kann keine 301 ausliefern. Google behandelt einen Meta-Refresh
# mit Verzoegerung 0 aber wie eine permanente Weiterleitung. Dieses Skript legt
# fuer jeden alten WordPress-Pfad eine kleine index.html an, die weiterleitet.
#
# WICHTIG: Die Liste unten ist der bekannte Teil. Die VOLLSTAENDIGE Liste steht
# in der Google Search Console unter  Seiten -> Nicht gefunden (404)  bzw.
# Seiten -> Indexiert. Diese dort exportieren und hier ergaenzen, nicht raten.
#
# Aufruf:  powershell -File tools\build-redirects.ps1

$ErrorActionPreference = 'Stop'
$ROOT = Split-Path $PSScriptRoot -Parent
$BASE = 'https://klinkerbox.ch'

# alter Pfad  ->  neues Ziel (relativ zur Domain) + Linktext
$MAP = @(
  @{ from = 'pflasterklinker';         to = '/#pflaster';   label = 'Pflasterklinker' }
  @{ from = 'mauerklinker-fassaden';   to = '/#mauer';      label = 'Mauerklinker' }
  @{ from = 'tonplatten-indoor';       to = '/#tonplatten'; label = 'Tonplatten' }
  @{ from = 'tonplatten-boden-outdoor';to = '/#tonplatten'; label = 'Tonplatten' }
  @{ from = 'crea-3010';               to = '/#mauer';      label = 'Mauerklinker' }
  @{ from = 'rubio';                   to = '/#mauer';      label = 'Mauerklinker' }
  @{ from = 'galerie';                 to = '/#referenzen'; label = 'Referenzen' }
  @{ from = 'contact';                 to = '/#kontakt';    label = 'Kontakt' }
)

$n = 0
foreach ($m in $MAP) {
  $dir = Join-Path $ROOT $m.from
  New-Item -ItemType Directory -Force $dir | Out-Null
  $target = $BASE + $m.to

  $html = @"
<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<title>Weitergeleitet — Klinkerbox</title>
<link rel="canonical" href="$target">
<meta http-equiv="refresh" content="0; url=$target">
<meta name="robots" content="noindex,follow">
</head>
<body>
<p>Diese Seite ist umgezogen: <a href="$target">$($m.label) bei Klinkerbox</a></p>
</body>
</html>
"@

  Set-Content -Path (Join-Path $dir 'index.html') -Value $html -Encoding utf8
  Write-Host ("  /{0,-26} -> {1}" -f ($m.from + '/'), $m.to)
  $n++
}
Write-Host ''
Write-Host "$n Weiterleitungen geschrieben."
