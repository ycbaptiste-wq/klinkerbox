// Per-product technical data (transcribed from the source detail pages / spec sheets)
(function(){
  // Septema Aqua Splitt — physical & mechanical properties (EN 1344:2013 / AC:2015)
  const AQUA={ desc:"Physikalische & mechanische Eigenschaften gemäss EN 1344:2013 / AC:2015.",
    rows:[
      ["Wasseraufnahme (NBN EN 771)","Klasse W2 · Ø max. 5 % · Einzel max. 6 %"],
      ["Biegezugfestigkeit","Klasse T4 · Ø min. 80 N/mm · Einzel min. 64 N/mm"],
      ["Abriebwiderstand","Klasse A2 (+) · Ø max. 600 mm³ · Einzel max. 800 mm³"],
      ["Frostwiderstandsfähigkeit","FP100 · entspricht den Anforderungen"],
      ["Rutschfestigkeit","Klasse U3 · > 55"],
      ["Säurebeständigkeit","Klasse C · < 7 %"],
      ["Maßtoleranz","NPD"]
    ]};
  const inf=(desc,dim,a,b)=>({desc:desc,rows:[
      ["Abmessungen (L × B × H)","ca. "+dim+" mm"],
      ["Stück/m² · traditionelle Fuge",a],
      ["Stück/m² · dünne Fuge",b]
    ]});
  // Historika — geprüft und zertifiziert
  const HW={ desc:"Die verwendeten Rohstoffe bilden einen warmen, mediterranen, hell rötlichen Farbton. Geprüft und zertifiziert.",
    rows:[["Nennmass","250 × 120 × 65 mm"],["Trockenrohdichte","1922 kg/m³"],["Druckfestigkeit","43.8 N/mm²"],["Wasseraufnahme","6.2 %"],["Frostwiderstandsfähigkeit","Klasse F2"]]};
  const HD=(size)=>({ desc:"Die verwendeten Rohstoffe ergeben einen deutlich dunkleren, rötlichen Brand bis hin zum Schmolz und verleihen dem Stein einen leicht kühleren Touch. Geprüft und zertifiziert.",
    rows:[["Nennmass",size],["Trockenrohdichte","2099 kg/m³"],["Druckfestigkeit","43.8 N/mm²"],["Wasseraufnahme","5.9 %"],["Frostwiderstandsfähigkeit","Klasse F2"]]});

  window.SPECS={
    // Septema Aqua Splitt
    p41:AQUA, p42:AQUA, p43:AQUA, p44:AQUA,
    // Infinitum
    m104:inf("Beige bis reinweiss, nuanciert bis in die Masse.","505 × 100 × 40","37","43"),
    m105:inf("Gelb nuanciert mit hellen braungelben bis gelbrosa Tönen.","505 × 100 × 40","37","43"),
    m106:inf("Rot in der Masse, stark nuanciert von Rot, Rotbraun bis Blauviolett.","500 × 100 × 38","39","45"),
    m107:inf("Helles Graugrün bis Graubraun mit schwarzgrauer Oberflächenstruktur.","505 × 100 × 40","37","43"),
    m108:inf("Hellgrau bis in die Masse.","505 × 100 × 40","37","43"),
    m109:inf("Dunkles, nuanciertes Taubengrau mit Schwarzgrau bis Hellbraun und Graubraun.","500 × 100 × 38","39","45"),
    // Historika
    m133:HW,
    m132:HD("250 × 120 × 65 mm"),
    m240:HD("250 × 120 × 65 mm"), m241:HD("250 × 120 × 65 mm"), m242:HD("250 × 120 × 65 mm"),
    m243:HD("250 × 120 × 65 mm"), m244:HD("250 × 80 × 65 mm"),  m245:HD("250 × 120 × 65 mm")
  };
  // Tonplatten — shared format / thickness / units / weight table (all clay-tile products)
  window.TONFORMATS=[
    ["20 × 20 cm","2 cm","24","38 kg"],
    ["30 × 30 cm","2 cm","11","38 kg"],
    ["16 × 16 cm","1.8 cm","36","31 kg"],
    ["7.5 × 30 cm","2 cm","42","38 kg"]
  ];
})();
