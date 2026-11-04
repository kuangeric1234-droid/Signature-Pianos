/* Signature Pianos · the redesigned pages: lift like a fallboard, press like a key
   ----------------------------------------------------------------------------
   Home, the collection, a piano's page and the 404 (lib/site/render.js writes
   them; every word is in the HTML before this runs). One clock (gsap.ticker),
   transform and opacity only, nothing hides again once shown, and under reduced
   motion nothing travels. The header's menus are js/chrome.js.

   The forms are the office's, through js/office.js exactly as the old pages
   used it: its consent words beside the box, its hidden box and bot check, its
   answer in its own words, and a lead for the analytics when it keeps one. */
(function () {
  'use strict';
  var H = document.documentElement;
  var RM = H.classList.contains('rm');
  var G = typeof window.gsap !== 'undefined';
  function on() { return !RM && G; }
  var FINE = matchMedia('(hover: hover) and (pointer: fine)').matches;
  var EASE = 'power3.out';
  var lenis = null;
  var PHONE = '0479 128 955';

  if (G) {
    gsap.registerPlugin(ScrollTrigger, SplitText, Flip, CustomEase);
    CustomEase.create('sp', '.4,0,.1,1');
    EASE = 'sp';
  }
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function groundOf(el) {
    for (var n = el; n && n !== document.documentElement; n = n.parentElement) {
      var b = getComputedStyle(n).backgroundColor;
      if (b && b !== 'transparent' && !/rgba\(\d+, \d+, \d+, 0\)/.test(b)) return b;
    }
    return '#F3F0E9';
  }
  function belowFold(el) { return el.getBoundingClientRect().top > innerHeight * 0.92; }

  /* ---------- smooth scroll: desktop pointer only, native on touch ---------- */
  function smooth() {
    if (!FINE || !on() || typeof window.Lenis === 'undefined') return;
    lenis = new Lenis({ lerp: 0.095, smoothWheel: true, autoRaf: false });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add(function (t) { lenis.raf(t * 1000); });
    gsap.ticker.lagSmoothing(0);
    document.addEventListener('spc:lock', function () { lenis.stop(); });
    document.addEventListener('spc:unlock', function () { lenis.start(); });
    // the Book a visit card scrolls itself
    new MutationObserver(function () { H.classList.contains('sp-book-open') ? lenis.stop() : lenis.start(); }).observe(H, { attributes: true, attributeFilter: ['class'] });
  }
  function scrollToEl(el) {
    var off = -(parseFloat(getComputedStyle(H).getPropertyValue('--nav')) || 80) - 10;
    if (lenis) lenis.scrollTo(el, { offset: off, duration: 1.2 });
    else window.scrollTo({ top: el.getBoundingClientRect().top + scrollY + off, behavior: RM ? 'auto' : 'smooth' });
  }
  function anchors() {
    document.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('a[href^="#"]');
      if (!a || e.defaultPrevented) return;
      var id = a.getAttribute('href').slice(1), t = id && document.getElementById(id);
      if (!t) return;
      e.preventDefault(); scrollToEl(t);
      try { history.replaceState(null, '', '#' + id); } catch (err) { /* ok */ }
    });
  }

  /* ---------- the fallboard: it lowers under the header, the next page lifts it ---------- */
  /* only between the redesigned pages: the others load as they always have */
  function isNewPage(path) { return path === '/' || path === '/index.html' || /^\/pianos(\/|$)/.test(path); }
  function fallboard() {
    var fb = $('.fallboard'); if (!fb) return;
    var label = $('.fb-l', fb);
    function reset() { if (G) gsap.set(fb, { yPercent: -101, visibility: 'hidden' }); $$('.ghost').forEach(function (g) { g.remove(); }); }
    window.addEventListener('pageshow', function (e) { if (e.persisted) reset(); });
    if (H.classList.contains('pt-in')) {
      var lb = null; try { lb = sessionStorage.getItem('sp-pt-label'); } catch (e) { /* none */ }
      if (lb && label) label.textContent = lb;
      fb.classList.toggle('fb-side', H.classList.contains('pt-photo'));
      if (on()) {
        gsap.set(fb, { yPercent: 0, visibility: 'visible' });
        H.classList.remove('pt-in');
        var photoUp = H.classList.contains('pt-photo');
        gsap.to(fb, { yPercent: -101, duration: 0.7, ease: EASE, delay: 0.06, onComplete: function () { gsap.set(fb, { visibility: 'hidden' }); H.classList.remove('pt-photo'); } });
        if (!photoUp) gsap.from($('main'), { y: 40, duration: 0.9, ease: EASE, delay: 0.06, clearProps: 'transform' });
      } else H.classList.remove('pt-in', 'pt-photo');
    }
    if (!on()) return;
    document.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('a[href]');
      if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if (a.target || a.hasAttribute('download')) return;
      var url; try { url = new URL(a.href, location.href); } catch (err) { return; }
      if (url.origin !== location.origin || !isNewPage(url.pathname)) return;
      if (url.pathname === location.pathname) return;
      e.preventDefault();
      leave(url.href, a);
    });
    function leave(href, a) {
      var text = a.getAttribute('data-label') || 'Signature';
      if (label) label.textContent = text;
      var ph = a.matches('[data-piano]') ? $('.key-ph, .pl-th', a) : null;
      if (ph && !$('img', ph)) ph = null;
      fb.classList.toggle('fb-side', !!ph);
      var stored = false;
      try { sessionStorage.setItem('sp-pt', '1'); sessionStorage.setItem('sp-pt-label', text); sessionStorage.setItem('sp-pt-photo', ph ? '1' : '0'); stored = sessionStorage.getItem('sp-pt') === '1'; } catch (err) { /* none */ }
      if (!stored) { location.href = href; return; }
      gsap.set(fb, { yPercent: -101, visibility: 'visible' });
      var tl = gsap.timeline({ onComplete: function () { location.href = href; } });
      tl.to(fb, { yPercent: 0, duration: 0.5, ease: 'power3.inOut' }, 0);
      if (ph) tl.add(flight(ph), 0);
    }
    /* the card's photo flies to where the piano page shows it; transforms only */
    function flight(ph) {
      var probe = $('.pp-probe .pp-main'); var img = $('img', ph);
      if (!probe || !img) return gsap.timeline();
      var s = ph.getBoundingClientRect(), t = probe.getBoundingClientRect();
      var ghost = document.createElement('div'); ghost.className = 'ghost';
      var gi = document.createElement('img'); gi.src = img.currentSrc || img.src; gi.alt = '';
      var W0 = s.height * 4 / 3, H0 = s.height, ox0 = -(W0 - s.width) * 0.47;
      Object.assign(ghost.style, { left: '0px', top: '0px', width: s.width + 'px', height: s.height + 'px', transformOrigin: '0 0' });
      Object.assign(gi.style, { position: 'absolute', left: '0px', top: '0px', width: W0 + 'px', height: H0 + 'px', maxWidth: 'none', transformOrigin: '0 0' });
      ghost.appendChild(gi); document.body.appendChild(ghost);
      var SX = t.width / s.width, SY = t.height / s.height, M = t.width / W0;
      var o = { p: 0 };
      function draw() {
        var p = o.p, sx = 1 + (SX - 1) * p, sy = 1 + (SY - 1) * p, m = 1 + (M - 1) * p;
        var x = s.left + (t.left - s.left) * p, y = s.top + (t.top - s.top) * p;
        ghost.style.transform = 'translate(' + x + 'px,' + y + 'px) scale(' + sx + ',' + sy + ')';
        gi.style.transform = 'translate(' + (ox0 * (1 - p)) / sx + 'px,0) scale(' + m / sx + ',' + m / sy + ')';
      }
      draw();
      return gsap.to(o, { p: 1, duration: 0.62, ease: 'power3.inOut', onUpdate: draw });
    }
  }

  /* ---------- the intro runs in CSS (site.css, html.intro); this only releases it ---------- */
  function intro() { setTimeout(function () { H.classList.remove('intro', 'pt'); }, RM ? 0 : 2600); }

  /* ---------- reveals: headings rise from their masks, panels lift off images ---------- */
  function reveals() {
    if (!on()) return;
    $$('.xh').forEach(function (h) {
      if (h.closest('.hero, .chead, .pp-top, .nf') || !belowFold(h)) return;
      gsap.from($$('.mk > span', h), { yPercent: 108, duration: 1.2, ease: EASE, stagger: 0.1, scrollTrigger: { trigger: h, start: 'top 86%', once: true } });
    });
    $$('[data-rv]').forEach(function (el) {
      if (!belowFold(el)) return;
      gsap.from(el, { y: 30, opacity: 0, duration: 1.1, ease: EASE, scrollTrigger: { trigger: el, start: 'top 90%', once: true } });
    });
    $$('[data-stag]').forEach(function (box) {
      var kids = Array.prototype.slice.call(box.children).filter(function (k) { return !k.hidden; });
      if (!belowFold(box)) return;
      gsap.from(kids, { y: 34, opacity: 0, duration: 1, ease: EASE, stagger: 0.06, scrollTrigger: { trigger: box, start: 'top 88%', once: true } });
    });
    $$('[data-lift]').forEach(function (fr) {
      if (!belowFold(fr)) return;
      var c = document.createElement('span');
      c.setAttribute('aria-hidden', 'true');
      Object.assign(c.style, { position: 'absolute', inset: '0', zIndex: '2', background: groundOf(fr.parentElement) });
      fr.appendChild(c);
      var img = $('img', fr);
      var tl = gsap.timeline({ scrollTrigger: { trigger: fr, start: 'top 84%', once: true } });
      tl.to(c, { yPercent: -101, duration: 1.3, ease: 'power3.inOut' }, 0);
      if (img) tl.from(img, { yPercent: 10, duration: 1.6, ease: EASE }, 0.1);
      tl.add(function () { c.remove(); });
    });
  }

  /* ---------- keys: drag, arrows, and a wave that answers scroll speed ---------- */
  function keys() {
    $$('[data-keys]').forEach(function (wrap) {
      var row = $('.keys', wrap); if (!row) return;
      var step = function () { var k = $('.keys > li', row); return k ? k.getBoundingClientRect().width * 3 : 600; };
      $$('[data-k]', wrap).forEach(function (b) {
        b.addEventListener('click', function () {
          var to = row.scrollLeft + step() * (+b.getAttribute('data-k'));
          if (on()) gsap.to(row, { scrollLeft: to, duration: 0.9, ease: EASE, overwrite: true }); else row.scrollLeft = to;
        });
      });
      $$('img', row).forEach(function (i) { i.draggable = false; });
      if (FINE) {
        var down = false, sx = 0, sl = 0, moved = 0, vx = 0, lx = 0, tw = null;
        row.addEventListener('pointerdown', function (e) { if (e.pointerType !== 'mouse' || e.button !== 0) return; down = true; sx = lx = e.clientX; sl = row.scrollLeft; moved = 0; vx = 0; if (tw) tw.kill(); });
        addEventListener('pointermove', function (e) { if (!down) return; var dx = e.clientX - sx; moved = Math.max(moved, Math.abs(dx)); row.scrollLeft = sl - dx; vx = e.clientX - lx; lx = e.clientX; if (moved > 4) row.classList.add('dragging'); });
        addEventListener('pointerup', function () { if (!down) return; down = false; if (on() && Math.abs(vx) > 1) tw = gsap.to(row, { scrollLeft: row.scrollLeft - vx * 16, duration: 1, ease: 'power3.out' }); setTimeout(function () { row.classList.remove('dragging'); }, 0); });
        row.addEventListener('click', function (e) { if (moved > 6) { e.preventDefault(); e.stopPropagation(); moved = 0; } }, true);
      }
      if (!on()) return;
      var ks = $$('.key, .key-all', row);
      var set = ks.map(function (k) { return gsap.quickSetter(k, 'y', 'px'); });
      var cur = ks.map(function () { return 0; });
      var lastL = row.scrollLeft, lastY = scrollY, energy = 0, phase = 0, dir = 1, live = false;
      ScrollTrigger.create({ trigger: row, start: 'top bottom', end: 'bottom top', onToggle: function (s) { live = s.isActive; } });
      gsap.ticker.add(function () {
        if (!live) return;
        var dl = row.scrollLeft - lastL, dy = scrollY - lastY; lastL = row.scrollLeft; lastY = scrollY;
        if (dl) dir = dl > 0 ? 1 : -1; else if (dy) dir = dy > 0 ? 1 : -1;
        var v = Math.min(Math.abs(dl) * 0.55 + Math.abs(dy) * 0.3, 16);
        energy += (v - energy) * 0.1;
        phase += 0.28 + energy * 0.03;
        var any = energy > 0.05;
        for (var i = 0; i < ks.length; i++) {
          var w = Math.max(0, Math.sin(phase - i * 0.62 * dir));
          var target = any ? energy * 0.7 * w * w : 0;
          cur[i] += (target - cur[i]) * 0.22;
          if (Math.abs(cur[i]) > 0.01 || target) set[i](cur[i]); else if (cur[i] !== 0) { cur[i] = 0; set[i](0); }
        }
      });
    });
  }

  /* ---------- the price list: the model follows the pointer ---------- */
  function preview() {
    var list = $('[data-plist]'), box = $('.preview');
    if (!list || !box || !FINE || !on()) return;
    var img = $('img', box);
    var x = gsap.quickTo(box, 'x', { duration: 0.6, ease: 'power3.out' });
    var y = gsap.quickTo(box, 'y', { duration: 0.6, ease: 'power3.out' });
    var r = gsap.quickTo(box, 'rotate', { duration: 0.8, ease: 'power3.out' });
    var lx = 0, px = 0, py = 0, shown = false;
    $$('a[data-preview]', list).forEach(function (a) {
      a.addEventListener('pointerenter', function () {
        img.removeAttribute('srcset'); img.src = a.getAttribute('data-preview');
        if (!shown) { shown = true; gsap.to(box, { autoAlpha: 1, scale: 1, duration: 0.5, ease: EASE, overwrite: 'auto' }); }
      });
    });
    function hide() { if (!shown) return; shown = false; gsap.to(box, { autoAlpha: 0, scale: 0.86, duration: 0.4, ease: EASE, overwrite: 'auto' }); }
    gsap.set(box, { scale: 0.86 });
    list.addEventListener('pointerleave', hide);
    addEventListener('pointermove', function (e) { px = e.clientX; py = e.clientY; x(px); y(py); r(gsap.utils.clamp(-9, 9, (px - lx) * 0.5)); lx = px; }, { passive: true });
    var lastY = scrollY;
    gsap.ticker.add(function () { if (shown && scrollY !== lastY) { lastY = scrollY; var el = document.elementFromPoint(px, py); if (!el || !list.contains(el)) hide(); } });
  }

  /* ---------- the story: the stage shows the chapter in view ---------- */
  function story() {
    var stage = $('[data-stage]'); if (!stage) return;
    var frames = $$('.st-fr', stage), cap = $('[data-cap]', stage), chs = $$('[data-chapter]');
    function setI(i) { frames.forEach(function (f, j) { f.classList.toggle('on', i === j); }); if (cap) cap.textContent = chs[i].getAttribute('data-cap'); }
    if (!G) return;
    chs.forEach(function (ch, i) { ScrollTrigger.create({ trigger: ch, start: 'top 62%', end: 'bottom 62%', onToggle: function (s) { if (s.isActive) setI(i); } }); });
    if (on()) $$('.st-fr img', stage).forEach(function (im) { gsap.fromTo(im, { yPercent: -5 }, { yPercent: 5, ease: 'none', scrollTrigger: { trigger: '[data-story]', start: 'top bottom', end: 'bottom top', scrub: true } }); });
  }

  /* ---------- real numbers count once; the countdown is worked out for today, Melbourne time ---------- */
  function melbourneToday() {
    var p = {};
    new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Melbourne', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()).forEach(function (x) { p[x.type] = x.value; });
    return p.year + '-' + p.month + '-' + p.day;
  }
  function counts() {
    $$('[data-days]').forEach(function (el) {
      var n = Math.max(0, Math.round((Date.parse(el.getAttribute('data-days') + 'T00:00:00Z') - Date.parse(melbourneToday() + 'T00:00:00Z')) / 86400000));
      el.textContent = String(n); el.setAttribute('data-count', String(n));
      var u = $('[data-days-unit]'); if (u) u.textContent = n === 1 ? 'day' : 'days';
    });
    if (!on()) return;
    $$('[data-count]').forEach(function (el) {
      if (!belowFold(el)) return;
      var end = +el.getAttribute('data-count'), pre = el.getAttribute('data-pre') || '', suf = el.getAttribute('data-suf') || '';
      var o = { v: 0 }; el.textContent = pre + '0' + suf;
      gsap.to(o, { v: end, duration: 1.6, ease: 'expo.out', scrollTrigger: { trigger: el, start: 'top 88%', once: true }, onUpdate: function () { el.textContent = pre + Math.round(o.v).toLocaleString('en-AU') + suf; } });
    });
  }

  /* ---------- the signature writes itself, once ---------- */
  function signoff() {
    var c = $('.spc-cover'); if (!c || !on()) return;
    gsap.set(c, { display: 'block', scaleX: 1, transformOrigin: '100% 50%' });
    gsap.to(c, { scaleX: 0, duration: 2.1, ease: 'power2.inOut', scrollTrigger: { trigger: '.spc-sign', start: 'top 92%', once: true } });
  }

  function parallax() {
    if (!on()) return;
    $$('[data-par]').forEach(function (el) {
      gsap.fromTo(el, { yPercent: -7 }, { yPercent: 7, ease: 'none', scrollTrigger: { trigger: el.parentElement, start: 'top bottom', end: 'bottom top', scrub: true } });
    });
  }

  /* ---------- the cursor: a small charcoal dot that names the action ---------- */
  function cursor() {
    if (!FINE || !on()) return;
    var c = document.createElement('div'); c.className = 'cursor'; c.setAttribute('aria-hidden', 'true'); document.body.appendChild(c);
    var xTo = gsap.quickTo(c, 'x', { duration: 0.42, ease: 'power3.out' }), yTo = gsap.quickTo(c, 'y', { duration: 0.42, ease: 'power3.out' });
    var cur = null;
    addEventListener('pointermove', function (e) {
      xTo(e.clientX); yTo(e.clientY);
      var t = e.target && e.target.closest ? e.target.closest('[data-cursor]') : null;
      if (t === cur) return; cur = t;
      if (t) { c.textContent = t.getAttribute('data-cursor'); c.classList.toggle('inv', t.hasAttribute('data-cursor-inv')); }
      gsap.to(c, { opacity: t ? 1 : 0, scale: t ? 1 : 0.2, duration: 0.4, ease: EASE, overwrite: 'auto' });
    }, { passive: true });
    document.addEventListener('click', function () { cur = null; gsap.to(c, { opacity: 0, scale: 0.2, duration: 0.18, overwrite: 'auto' }); }, true);
    document.addEventListener('pointerleave', function () { cur = null; gsap.to(c, { opacity: 0, scale: 0.2, duration: 0.3 }); });
  }

  /* ---------- the collection: chips filter in place and the cards glide ---------- */
  var CAT_PATH = { upright: '/pianos/uprights/', grand: '/pianos/grands/', yamaha: '/pianos/yamaha/', kawai: '/pianos/kawai/', all: '/pianos/' };
  function filters() {
    var grid = $('[data-kgrid]'); if (!grid) return;
    // only the collection itself holds every piano: on the uprights, grands, Yamaha and Kawai pages a chip is a link
    var whole = grid.hasAttribute('data-all');
    var chips = $$('[data-chip]');
    var items = $$('[data-p]', grid), bands = $$('[data-band]', grid);
    var emptyLi = $('[data-band="empty"]', grid), emptyP = emptyLi && $('p', emptyLi);
    function match(li, f) {
      if (f === 'all') return true;
      if (f === 'upright' || f === 'grand' || f === 'digital') return li.getAttribute('data-kind') === f;
      if (f === 'yamaha' || f === 'kawai') return li.getAttribute('data-brand').indexOf(f) >= 0;
      if (f === 'room' || f === 'sea') return li.getAttribute('data-where') === f;
      if (f.indexOf('m-') === 0) return li.getAttribute('data-model') === f.slice(2);
      return true;
    }
    var NAMES = { upright: 'Uprights', grand: 'Grands', yamaha: 'Yamaha', kawai: 'Kawai', room: 'In the showroom', sea: 'On its way', digital: 'Digital' };
    function apply(f, animate) {
      if (!NAMES[f] && f !== 'all' && f.indexOf('m-') !== 0) f = 'all';
      var all = items.concat(bands);
      var state = animate && on() ? Flip.getState(all) : null;
      var n = 0, sold = 0;
      items.forEach(function (li) { var m = match(li, f); li.hidden = !m; if (m) { n++; if (li.getAttribute('data-where') === 'sold') sold++; } });
      bands.forEach(function (b) {
        var k = b.getAttribute('data-band');
        b.hidden = k === 'empty' ? (n - sold) > 0 : k === 'sold' ? sold === 0 : (f !== 'all' || n < 8);
      });
      if (n - sold === 0 && emptyP) emptyP.textContent = (emptyLi.getAttribute('data-e-' + (f.indexOf('m-') === 0 ? 'x' : f)) || 'Nothing here just now. Ask us about the next one on ' + PHONE + '.');
      var mc = $('[data-chip-model]');
      var shown = chips.some(function (c) { return c.getAttribute('data-chip') === f; });
      var extra = f.indexOf('m-') === 0 ? 'Model ' + f.slice(2).toUpperCase() : (f !== 'all' && !shown) ? NAMES[f] : '';
      if (extra) {
        if (!mc) { mc = document.createElement('button'); mc.type = 'button'; mc.className = 'chip'; mc.setAttribute('data-chip-model', ''); $('.chips').appendChild(mc); mc.addEventListener('click', function () { apply('all', true); }); }
        mc.innerHTML = '';
        mc.appendChild(document.createTextNode(extra + ' '));
        var b = document.createElement('b'); b.textContent = String(n - sold); mc.appendChild(b);
        var x = document.createElement('span'); x.setAttribute('aria-hidden', 'true'); x.textContent = ' ×'; mc.appendChild(x);
        mc.setAttribute('aria-label', 'Showing ' + extra + '. Show all');
        mc.setAttribute('aria-pressed', 'true'); mc.hidden = false;
      } else if (mc) mc.hidden = true;
      chips.forEach(function (c) {
        var is = c.getAttribute('data-chip') === f;
        if (c.tagName === 'A') { if (is) c.setAttribute('aria-current', 'page'); else c.removeAttribute('aria-current'); }
        else c.setAttribute('aria-pressed', String(is));
      });
      try {
        var path = CAT_PATH[f] || '/pianos/';
        history.replaceState(null, '', CAT_PATH[f] ? path : (f === 'all' ? path : path + '#' + f));
      } catch (e) { /* ok */ }
      if (state) Flip.from(state, { duration: 0.75, ease: EASE, absolute: true, prune: true,
        onEnter: function (els) { return gsap.fromTo(els, { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.7, ease: EASE, stagger: 0.025 }); },
        onLeave: function (els) { return gsap.to(els, { opacity: 0, duration: 0.25 }); } });
      if (G) ScrollTrigger.refresh();
    }
    if (!whole) return;
    chips.forEach(function (c) {
      c.addEventListener('click', function (e) {
        if (e.metaKey || e.ctrlKey || e.shiftKey) return;
        e.preventDefault(); e.stopPropagation();
        apply(c.getAttribute('data-chip'), true);
      }, true);
    });
    var start = (location.hash || '#all').slice(1);
    if (start !== 'all') apply(start, false);
  }

  /* ---------- a piano's page: photos, and the panels that hold its forms ---------- */
  function pianoPage() {
    var main = $('.pp-main img'), note = $('.pp-note');
    $$('.pp-thumbs button').forEach(function (b) {
      b.addEventListener('click', function () {
        $$('.pp-thumbs button').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
        // an illustration carries its words under it, the office's own
        if (note) { var w = b.getAttribute('data-note') || ''; note.textContent = w; note.hidden = !w; }
        var src = b.getAttribute('data-src'), set = b.getAttribute('data-srcset') || '';
        if (!main || main.getAttribute('src') === src) return;
        var illus = $('.pp-main .illus'); if (illus) illus.hidden = !b.getAttribute('data-note');
        function put(im) { if (set) im.srcset = set; else im.removeAttribute('srcset'); im.src = src; }
        if (!on()) { put(main); return; }
        var n = main.cloneNode(); put(n); n.removeAttribute('fetchpriority');
        Object.assign(n.style, { position: 'absolute', inset: '0' }); main.parentElement.appendChild(n);
        gsap.fromTo(n, { opacity: 0, scale: 1.04 }, { opacity: 1, scale: 1, duration: 0.8, ease: EASE, onComplete: function () { put(main); n.remove(); } });
      });
    });
    $$('[data-open-act]').forEach(function (b) {
      b.addEventListener('click', function () { openPanel(b.getAttribute('data-open-act'), b.closest('.pbar')); });
    });
  }
  function openPanel(which, fromBar) {
    var panel = $('.act-panel[data-act="' + which + '"]'); if (!panel) return;
    $$('.act-panel.open').forEach(function (p) { if (p !== panel) p.classList.remove('open'); });
    panel.classList.add('open');
    if (innerWidth < 900 || fromBar) scrollToEl(panel);
    var i = $('input:not([type=hidden]):not(.sp-hp)', panel); if (i) setTimeout(function () { i.focus({ preventScroll: true }); }, 350);
    if (on()) gsap.fromTo(panel, { y: 14, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, ease: EASE });
    return panel;
  }

  /* ---------- the office's forms ---------- */
  var EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  function forms() {
    var O = window.SPOffice && window.SPOffice.on ? window.SPOffice : null;
    var forms = $$('form[data-form]');
    if (!forms.length) return;
    var failed = 'Sorry, this form can’t be sent from here just now. Please call us on ' + PHONE + '.';

    function say(f, words, refused) {
      var a = $('.answer', f); if (!a) return;
      a.textContent = words || ''; a.classList.toggle('is-refused', !!refused); a.hidden = !words;
    }
    function mark(input, bad) { var fl = input && input.closest('.field'); if (fl) fl.classList.toggle('is-invalid', !!bad); return !!bad; }
    function val(f, n) { var i = f.elements[n]; return i ? String(i.value || '').trim() : ''; }
    function done(f) {
      $$('.field, .two, .consent, .check-box, button[type=submit], .fine', f).forEach(function (n) { n.hidden = true; });
    }

    forms.forEach(function (f) {
      var type = f.getAttribute('data-form'); // guide | visit | question | reserve
      var consentName = type === 'reserve' ? null : type;
      var label = $('[data-consent]', f), hp = $('.sp-hp', f), box = $('.check-box', f), btn = $('button[type=submit]', f);
      var check = null;
      function getCheck() { if (!check && O) check = O.challenge(box); return check; }
      if (!O) { say(f, failed, true); return; }
      if (label) O.showConsent(consentName, label);
      if (hp) O.honeypot(hp);
      f.addEventListener('focusin', function () { getCheck(); });
      if (type === 'visit') {
        var dayIn = f.elements.day, timeIn = f.elements.time, days = O.visitDays();
        if (dayIn) { dayIn.min = days.min; dayIn.max = days.max; dayIn.addEventListener('change', function () { O.fitTimes(timeIn, dayIn.value); }); }
      }

      f.addEventListener('submit', function (e) {
        e.preventDefault();
        if (btn && btn.disabled) return;
        if (consentName && !O.consentShown(consentName)) {
          O.showConsent(consentName, label).then(function (shown) { say(f, shown ? O.WORDS.tick : O.WORDS.noConsent, true); });
          return;
        }
        var name = val(f, 'name'), email = val(f, 'email'), phone = val(f, 'phone');
        var bad = mark(f.elements.name, !name);
        if (type === 'guide' || type === 'reserve') bad = mark(f.elements.email, !EMAIL_OK.test(email)) || bad;
        else bad = mark(f.elements.email, (!email && !phone) || (!!email && !EMAIL_OK.test(email))) || bad;
        if (type === 'visit') {
          bad = mark(f.elements.day, !val(f, 'day')) || bad;
          bad = mark(f.elements.time, !val(f, 'time')) || bad;
        }
        if (type === 'question') bad = mark(f.elements.message, !val(f, 'message')) || bad;
        if (bad) {
          say(f, type === 'guide' || type === 'reserve' ? 'Please add your name and your email.'
            : type === 'visit' ? 'Please add your name, your email or phone, and the day and time you would like.'
              : 'Please add your name, your email or phone, and your question.', true);
          return;
        }
        var tick = label && $('input', label);
        if (label) label.classList.toggle('is-invalid', !tick.checked);
        if (label && !tick.checked) { say(f, 'Please tick the box so we may answer you.', true); return; }

        var was = btn ? btn.innerHTML : '';
        if (btn) { btn.disabled = true; btn.textContent = type === 'reserve' ? 'One moment…' : 'Sending…'; }
        say(f, '');
        var slug = f.getAttribute('data-piano-slug') || undefined;
        var pianoName = f.getAttribute('data-piano-name') || '';
        var sending;
        if (type === 'reserve') {
          sending = O.checkout({ piano: slug, pay: 'deposit', name: name, email: email, phone: phone }, getCheck());
        } else {
          var fields = { name: name, email: email, phone: phone, sp_check: O.honeypot(hp) };
          if (type === 'visit') {
            fields.day = val(f, 'day'); fields.time = val(f, 'time');
            fields.message = [pianoName ? 'I’d like to see the ' + pianoName + '.' : '', val(f, 'message')].filter(Boolean).join('\n\n');
            if (slug) fields.piano = slug;
          }
          if (type === 'question') { fields.message = val(f, 'message'); if (slug) fields.piano = slug; }
          sending = O.sendForm(type, fields, getCheck());
        }
        sending.then(function (out) {
          if (type === 'reserve') {
            done(f);
            if (out.duplicate && !out.pay) { say(f, 'Your checkout for this piano has started already. If its payment page didn’t open, call us on ' + PHONE + '.', true); return; }
            say(f, out.said || '');
            if (out.pay) {
              var go = document.createElement('a'); go.className = 'btn go'; go.href = out.pay;
              go.textContent = ('Pay ' + (O.money(out.amount_cents) || '') + ' now').replace('  ', ' ');
              f.appendChild(go); go.focus({ preventScroll: true });
            } else {
              var p = document.createElement('p'); p.className = 'answer is-refused';
              p.textContent = 'We could not open the payment page from here. Call us on ' + PHONE + (out.order ? ' and quote order ' + out.order : '') + '.';
              f.appendChild(p);
            }
            return;
          }
          done(f);
          say(f, O.answerWords(out));
          if (type === 'guide' || type === 'visit') try { f.reset(); } catch (err) { /* ok */ }
        }, function (err) {
          if (btn) { btn.disabled = false; btn.innerHTML = was; }
          say(f, err && err.message ? err.message : failed, true);
          if (err && err.field && f.elements[err.field]) mark(f.elements[err.field], true);
          // a checkout the office won't take (the piano is being bought, or can't be bought online just now): ask
          // about it instead, with what they typed, so the office keeps them as interested in this piano
          if (type === 'reserve' && err && err.status === 409) {
            var q = openPanel('question');
            if (q) { ['name', 'email', 'phone'].forEach(function (k) { if (q.elements[k] && !q.elements[k].value) q.elements[k].value = val(f, k); }); }
          }
        });
      });
    });

    // where the office offers this piano for rent, the way to; nothing shown where it doesn't
    var rent = $('[data-rent]'), anyForm = $('form[data-piano-slug]');
    if (rent && anyForm) {
      var slug = anyForm.getAttribute('data-piano-slug');
      O.rentalOffer(slug).then(function (out) {
        var plans = out && out.offered && out.piano ? out.piano.plans : [];
        if (!plans.length) return;
        var low = Math.min.apply(null, plans.map(function (x) { return x.rent_cents; }));
        var a = document.createElement('a'); a.href = '/piano-rental/start?piano=' + encodeURIComponent(slug);
        a.textContent = 'Or rent this piano from ' + O.money(low) + ' a month';
        rent.appendChild(a); rent.hidden = false;
      }, function () { /* nothing said */ });
    }
  }

  /* ---------- start ---------- */
  function start() {
    anchors();
    forms();
    if (G) {
      smooth(); fallboard(); intro(); keys(); preview(); story(); counts(); signoff(); parallax(); cursor(); filters(); pianoPage();
      reveals();
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { ScrollTrigger.refresh(); });
      addEventListener('load', function () { ScrollTrigger.refresh(); });
    } else {
      H.classList.remove('intro', 'pt-in', 'pt-photo');
      keys(); story(); counts(); filters(); pianoPage();
    }
  }
  start();
})();
