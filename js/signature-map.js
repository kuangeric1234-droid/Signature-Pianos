/* Signature Pianos · showroom map
   Any element with [data-sp-map] becomes a quiet Carto Positron map (the same
   style as the homepage teacher map) with one Ink pin on the showroom.
   MapLibre is only loaded when the element comes near the viewport. */
(function () {
  'use strict';

  var SHOWROOM = [145.1501145, -37.8617301]; // 63 Blackburn Road, Mount Waverley (OpenStreetMap)
  var STYLE = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';
  var LIB = 'https://cdn.jsdelivr.net/npm/maplibre-gl@4.7.1/dist/maplibre-gl';
  var DIRECTIONS = 'https://www.google.com/maps/dir/?api=1&destination=63+Blackburn+Road+Mount+Waverley+VIC+3149';

  var els = document.querySelectorAll('[data-sp-map]');
  if (!els.length) return;

  var loading = null;
  function loadLib() {
    if (window.maplibregl) return Promise.resolve();
    if (loading) return loading;
    loading = new Promise(function (resolve, reject) {
      var css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = LIB + '.css';
      document.head.appendChild(css);
      var s = document.createElement('script');
      s.src = LIB + '.js';
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
    return loading;
  }

  function mount(el) {
    el.innerHTML = '';
    el.classList.add('sp-map');
    var map = new maplibregl.Map({
      container: el,
      style: STYLE,
      center: SHOWROOM,
      zoom: 14.2,
      attributionControl: { compact: true },
      cooperativeGestures: true
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

    var pin = document.createElement('a');
    pin.className = 'sp-map-pin';
    pin.href = DIRECTIONS;
    pin.target = '_blank';
    pin.rel = 'noopener';
    pin.setAttribute('aria-label', 'Directions to 63 Blackburn Road, Mount Waverley');
    pin.innerHTML = '<img src="/media/brand/monogram-ink.svg" alt="">';
    new maplibregl.Marker({ element: pin, anchor: 'bottom' }).setLngLat(SHOWROOM).addTo(map);
  }

  function fallback(el) {
    el.innerHTML = '<a class="sp-map-fallback" href="' + DIRECTIONS + '" target="_blank" rel="noopener">63 Blackburn Road, Mount Waverley. Get directions</a>';
  }

  var io = 'IntersectionObserver' in window ? new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      io.unobserve(e.target);
      loadLib().then(function () { mount(e.target); }).catch(function () { fallback(e.target); });
    });
  }, { rootMargin: '400px 0px' }) : null;

  els.forEach(function (el) {
    if (io) io.observe(el);
    else loadLib().then(function () { mount(el); }).catch(function () { fallback(el); });
  });
})();
