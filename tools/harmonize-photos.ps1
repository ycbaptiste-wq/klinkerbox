# ============ KLINKERBOX · PROJEKTFOTOS ANGLEICHEN ============
#
# Ziel: Die Projektfotos in der Galerie sollen wie aus einem Guss wirken.
# Sie stammen aus vielen Jahren, von verschiedenen Kameras und Lichtsituationen
# und streuen entsprechend stark (Luma 52 bis 233).
#
# Drei Regeln, damit daraus keine Bildbearbeitung wird:
#
# 1. MUSTERFOTOS BLEIBEN UNANGETASTET. Das jeweils erste Galeriebild eines
#    Produkts ist die Farbreferenz des Lieferanten. Wer daran dreht, zeigt dem
#    Kunden die falsche Klinkerfarbe. Nur die uebrigen Projektfotos werden
#    angeglichen.
#
# 2. BEIDSEITIG, ABER GEDECKELT. Zu dunkle Aufnahmen werden angehoben, zu
#    helle leicht zurueckgenommen - beides nur bis zu einer festen Grenze
#    (Gamma 1.25 bzw. 0.90). Ausreisser wandern damit Richtung Mitte, ohne
#    dass ein Bild seinen Charakter verliert.
#
# 3. NUR DORT, WO PLATZ IST. Beim Anheben laeuft die Wirkung zu den Lichtern
#    hin auf null aus (ab Luma 200 exakt null) - helle Stellen werden nicht
#    heller. Beim Zuruecknehmen bleiben umgekehrt die Schatten verschont
#    (unter Luma 55 exakt null) - es saufen keine Tiefen ab. Gerechnet wird
#    auf der Luminanz, alle drei Kanaele werden mit demselben Faktor skaliert,
#    damit sich der Farbton nicht verschiebt.
#
# Aufruf:  powershell -File tools\harmonize-photos.ps1           (Vorschau)
#          powershell -File tools\harmonize-photos.ps1 -Apply

param([double]$Target = 128, [double]$MaxUp = 1.25, [double]$MinDown = 0.90,
      [double]$Deadzone = 0.03, [int]$Quality = 90, [switch]$Apply)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$ROOT = Split-Path $PSScriptRoot -Parent
$GAL  = Join-Path $ROOT 'assets\gallery'

# ---- Musterfotos bestimmen: erstes Galeriebild je Produkt ----
$enSrc = Get-Content (Join-Path $ROOT 'assets\js\enrich.js') -Raw
$swatch = @{}
foreach ($m in [regex]::Matches($enSrc, '"gallery"\s*:\s*\[\s*"(assets/gallery/[^"]+)"')) {
  $swatch[[System.IO.Path]::GetFileName($m.Groups[1].Value)] = $true
}
# Kartenbilder aus products.js zaehlen ebenfalls als Referenz
$prodSrc = Get-Content (Join-Path $ROOT 'assets\js\products.js') -Raw
foreach ($m in [regex]::Matches($prodSrc, '"img"\s*:\s*"(assets/gallery/[^"]+)"')) {
  $swatch[[System.IO.Path]::GetFileName($m.Groups[1].Value)] = $true
}

if (-not ('Harm' -as [type])) {
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

public class Harm {
  public static double MeanLuma(string path) {
    using (Bitmap b = new Bitmap(path)) {
      int W=b.Width,H=b.Height;
      BitmapData d=b.LockBits(new Rectangle(0,0,W,H),ImageLockMode.ReadOnly,PixelFormat.Format24bppRgb);
      int st=d.Stride; byte[] buf=new byte[st*H];
      Marshal.Copy(d.Scan0,buf,0,buf.Length); b.UnlockBits(d);
      double s=0; long n=0;
      for(int y=0;y<H;y+=2){ int r=y*st;
        for(int x=0;x<W;x+=2){ int i=r+x*3; s+=0.299*buf[i+2]+0.587*buf[i+1]+0.114*buf[i]; n++; } }
      return s/n;
    }
  }
  static double SmoothFall(double v,double v0,double v1){        // 1 unten -> 0 oben
    if(v<=v0) return 1.0; if(v>=v1) return 0.0;
    double t=(v-v0)/(v1-v0); return 1.0-(t*t*(3.0-2.0*t));
  }
  static double SmoothRise(double v,double v0,double v1){        // 0 unten -> 1 oben
    if(v<=v0) return 0.0; if(v>=v1) return 1.0;
    double t=(v-v0)/(v1-v0); return t*t*(3.0-2.0*t);
  }
  public static void Apply(string src,string dst,double gamma,long quality){
    bool up = gamma > 1.0;
    double[] lut=new double[256];
    for(int v=0;v<256;v++){
      double moved=Math.Pow(v/255.0,1.0/gamma)*255.0;
      double w = up ? SmoothFall(v,100,200)    // Lichter schuetzen
                    : SmoothRise(v,55,120);    // Schatten schuetzen
      lut[v]=v+(moved-v)*w;
    }
    using (Bitmap b=new Bitmap(src)) {
      int W=b.Width,H=b.Height;
      BitmapData d=b.LockBits(new Rectangle(0,0,W,H),ImageLockMode.ReadWrite,PixelFormat.Format24bppRgb);
      int st=d.Stride; byte[] buf=new byte[st*H];
      Marshal.Copy(d.Scan0,buf,0,buf.Length);
      for(int y=0;y<H;y++){ int r=y*st;
        for(int x=0;x<W;x++){
          int i=r+x*3; int bl=buf[i],gr=buf[i+1],rd=buf[i+2];
          int Y=(int)(0.299*rd+0.587*gr+0.114*bl+0.5);
          if(Y<=0) continue;
          double gain=lut[Y]/Y;
          if(Math.Abs(gain-1.0)<0.001) continue;
          int mx=bl; if(gr>mx)mx=gr; if(rd>mx)mx=rd;
          if(mx*gain>255.0) gain=255.0/mx;
          buf[i]  =(byte)Math.Max(0,Math.Min(255,Math.Round(bl*gain)));
          buf[i+1]=(byte)Math.Max(0,Math.Min(255,Math.Round(gr*gain)));
          buf[i+2]=(byte)Math.Max(0,Math.Min(255,Math.Round(rd*gain)));
        } }
      Marshal.Copy(buf,0,d.Scan0,buf.Length);
      b.UnlockBits(d);
      ImageCodecInfo enc=null;
      foreach(ImageCodecInfo c in ImageCodecInfo.GetImageEncoders()) if(c.MimeType=="image/jpeg") enc=c;
      EncoderParameters ep=new EncoderParameters(1);
      ep.Param[0]=new EncoderParameter(Encoder.Quality,quality);
      b.Save(dst,enc,ep);
    }
  }
}
'@
}

$sel=@(); $skipSwatch=0; $skipOk=0; $before=@()
foreach ($f in (Get-ChildItem $GAL -Include *.jpg,*.jpeg -File -Recurse)) {
  if ($swatch.ContainsKey($f.Name)) { $skipSwatch++; continue }
  try { $L=[Harm]::MeanLuma($f.FullName) } catch { continue }
  $before += $L
  $g=[math]::Log($L/255.0)/[math]::Log($Target/255.0)
  if ($g -gt $MaxUp) { $g=$MaxUp }
  if ($g -lt $MinDown) { $g=$MinDown }
  if ([math]::Abs($g-1.0) -lt $Deadzone) { $skipOk++; continue }
  $sel += [pscustomobject]@{ L=[math]::Round($L,1); G=[math]::Round($g,3); P=$f.FullName; N=$f.Name }
}
function Spread($vals){
  $s=$vals|Sort-Object; $avg=($vals|Measure-Object -Average).Average
  $sd=[math]::Sqrt((($vals|ForEach-Object{[math]::Pow($_-$avg,2)})|Measure-Object -Sum).Sum/$vals.Count)
  "P10 {0:N0}  Median {1:N0}  P90 {2:N0}  StdAbw {3:N1}" -f $s[[int]($s.Count*0.1)],$s[[int]($s.Count*0.5)],$s[[int]($s.Count*0.9)],$sd
}
"Projektfotos gesamt      : $($before.Count)"
"  davon anzugleichen     : $($sel.Count)   (aufhellen $(($sel|Where-Object{$_.G -gt 1}).Count) / zuruecknehmen $(($sel|Where-Object{$_.G -lt 1}).Count))"
"  bereits im Zielbereich  : $skipOk"
"Musterfotos geschuetzt   : $skipSwatch"
""
"Streuung vorher : $(Spread $before)"

if ($Apply) {
  foreach ($s in $sel) {
    [Harm]::Apply($s.P,$s.P+'.tmp',$s.G,[int64]$Quality)
    Move-Item ($s.P+'.tmp') $s.P -Force
  }
  $after=@()
  foreach ($f in (Get-ChildItem $GAL -Include *.jpg,*.jpeg -File -Recurse)) {
    if ($swatch.ContainsKey($f.Name)) { continue }
    try { $after += [Harm]::MeanLuma($f.FullName) } catch {}
  }
  "Streuung nachher: $(Spread $after)"
  "Angeglichen: $($sel.Count)"
} else {
  "Vorschau - nichts geschrieben. Mit -Apply ausfuehren."
}
