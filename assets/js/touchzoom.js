// ===================== KLINKERBOX · TOUCH-PINCH-ZOOM =====================
// Die 3D-Module (efh/villa/bungalow/office/friesen/room) zoomen bereits ueber
// 'wheel'-Events (Maus/Trackpad), haben aber keine Touch-Pinch-Behandlung.
// Diese Bruecke uebersetzt einen Zwei-Finger-Pinch auf der 3D-Vorschau in
// wheel-Events auf der Canvas -> Zoom funktioniert auch auf dem Handy.
// Isoliert: greift NUR bei 2 Fingern auf #mixPreview, aendert kein Modul.
(function () {
  function init() {
    var host = document.getElementById('mixPreview');
    if (!host || host.__pinchZoom) return;
    host.__pinchZoom = true;

    var last = 0, active = false;
    function dist(t) {
      var dx = t[0].clientX - t[1].clientX, dy = t[0].clientY - t[1].clientY;
      return Math.sqrt(dx * dx + dy * dy);
    }
    function canvas() { return host.querySelector('canvas'); }

    host.addEventListener('touchstart', function (e) {
      if (e.touches.length === 2) {
        active = true; last = dist(e.touches);
        var c = canvas();
        // laufende Ein-Finger-Drehung abbrechen, damit Pinch nicht mit-dreht
        if (c) { try { c.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true })); } catch (_) {} }
      }
    }, { passive: true });

    host.addEventListener('touchmove', function (e) {
      if (!active || e.touches.length !== 2) return;
      e.preventDefault(); // verhindert Seiten-Pinch/Scroll
      var d = dist(e.touches), c = canvas();
      if (c && last) {
        // Finger auseinander (d groesser) -> deltaY negativ -> Modul zoomt rein
        c.dispatchEvent(new WheelEvent('wheel', { deltaY: (last - d) * 2.6, bubbles: false }));
      }
      last = d;
    }, { passive: false });

    function end(e) { if (!e.touches || e.touches.length < 2) { active = false; last = 0; } }
    host.addEventListener('touchend', end, { passive: true });
    host.addEventListener('touchcancel', end, { passive: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
