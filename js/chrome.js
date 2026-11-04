/* Signature Pianos · the header's menus, on every page
   The Pianos, Services and Teachers dropdowns (open on hover with a mouse, on a
   tap or Enter anywhere; Escape or a click outside closes them) and the phone
   sheet (the burger opens it, focus stays inside, Escape closes it). The
   markup is lib/site/render.js's header(). The redesigned pages' smooth scroll
   (js/site.js) is told when the sheet opens, so the page under it holds still. */
(function () {
  'use strict';
  var FINE = window.matchMedia && matchMedia('(hover: hover) and (pointer: fine)').matches;
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }

  var dds = $$('.spc-dd'), closeT = 0;
  function setDD(dd, open) {
    dd.classList.toggle('open', open);
    var t = $('.spc-ddt', dd);
    if (t) t.setAttribute('aria-expanded', String(open));
  }
  function closeAll(except) { dds.forEach(function (d) { if (d !== except) setDD(d, false); }); }
  dds.forEach(function (dd) {
    var t = $('.spc-ddt', dd);
    if (!t) return;
    t.addEventListener('click', function (e) { e.stopPropagation(); var o = !dd.classList.contains('open'); closeAll(dd); setDD(dd, o); });
    if (FINE) {
      dd.addEventListener('pointerenter', function () { clearTimeout(closeT); closeAll(dd); setDD(dd, true); });
      dd.addEventListener('pointerleave', function () { closeT = setTimeout(function () { setDD(dd, false); }, 220); });
    }
    // leaving the panel by keyboard closes it
    dd.addEventListener('focusout', function (e) { if (!dd.contains(e.relatedTarget)) setDD(dd, false); });
  });
  document.addEventListener('click', function (e) { if (!e.target.closest || !e.target.closest('.spc-dd')) closeAll(); });

  var burger = $('.spc-burger'), sheet = $('#spc-sheet'), sheetOpen = false;
  function setSheet(open, focusBack) {
    if (!sheet || !burger) return;
    sheetOpen = open;
    sheet.hidden = !open;
    burger.setAttribute('aria-expanded', String(open));
    var l = $('.spc-burger-l', burger);
    if (l) l.textContent = open ? 'Close' : 'Menu';
    document.documentElement.classList.toggle('spc-locked', open);
    document.dispatchEvent(new CustomEvent(open ? 'spc:lock' : 'spc:unlock'));
    if (open) { var first = $('.spc-sht', sheet); if (first) first.focus(); }
    else if (focusBack) burger.focus();
  }
  if (burger) burger.addEventListener('click', function () { setSheet(!sheetOpen); });
  $$('.spc-shg > button.spc-sht').forEach(function (b) {
    b.addEventListener('click', function () {
      var g = b.parentElement, o = !g.classList.contains('open');
      g.classList.toggle('open', o);
      b.setAttribute('aria-expanded', String(o));
    });
  });
  if (sheet) {
    sheet.addEventListener('click', function (e) { if (e.target.closest('a[href]')) setSheet(false); });
    sheet.addEventListener('keydown', function (e) {
      if (e.key !== 'Tab') return;
      var f = $$('a[href], button', sheet).filter(function (x) { return x.offsetParent !== null; });
      f.unshift(burger);
      var i = f.indexOf(document.activeElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
    });
  }
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    var o = dds.filter(function (d) { return d.classList.contains('open'); })[0];
    if (o) { setDD(o, false); var t = $('.spc-ddt', o); if (t) t.focus(); }
    if (sheetOpen) setSheet(false, true);
  });
  window.addEventListener('resize', function () { if (sheetOpen && window.innerWidth >= 900) setSheet(false); });
})();
