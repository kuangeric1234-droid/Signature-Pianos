/* Signature Pianos · piano finder
   ----------------------------------------------------------------------------
   The homepage "Find your perfect piano" questions, matched against the
   pianos actually in stock (pianos.stock_status = 'available').

   Every piano is scored on budget, room size and who is playing, and the top
   three are shown with reasons built only from that piano's own details.
   Condition grades are internal and never shown. Supabase comes from the
   on-demand loader in js/signature-book.js (window.spBook.supabase). */
(function () {
  'use strict';

  var root = document.getElementById('matcher');
  var btn = document.getElementById('findBtn');
  if (!root || !btn) return;

  var BUDGETS = {
    b1: { min: 0, max: 5000, label: 'under $5,000' },
    b2: { min: 5000, max: 7000, label: '$5,000 to $7,000' },
    b3: { min: 7000, max: 10000, label: '$7,000 to $10,000' },
    b4: { min: 10000, max: Infinity, label: '$10,000 and over' }
  };
  var FULL_SIZE_CM = 128; // 131 cm uprights and up: longer strings, fuller bass
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  var ids = ['q-level', 'q-space', 'q-budget'];
  var selects = ids.map(function (id) { return document.getElementById(id); });
  var steps = root.querySelectorAll('.step');
  var stock = null;

  selects.forEach(function (sel, i) {
    sel.addEventListener('focus', function () { setStep(i); });
    sel.addEventListener('change', function () { setStep(Math.min(i + 1, 2)); });
  });
  function setStep(i) {
    steps.forEach(function (s, idx) { s.classList.toggle('active', idx === i); });
  }

  var results = document.createElement('div');
  results.className = 'sp-match';
  results.setAttribute('aria-live', 'polite');
  results.hidden = true;
  (root.querySelector('.selects') || btn).insertAdjacentElement('afterend', results);

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function money(n) { return '$' + Number(n).toLocaleString('en-AU'); }

  function loadStock() {
    if (stock) return Promise.resolve(stock);
    if (!window.spBook || !window.spBook.supabase) return Promise.reject(new Error('loader missing'));
    return window.spBook.supabase().then(function (sb) {
      if (!sb) throw new Error('Supabase unavailable');
      return sb.from('pianos')
        .select('id, brand, model, year, sale_price, type, dimensions_cm, finish, colour, images, featured')
        .eq('stock_status', 'available');
    }).then(function (res) {
      if (res.error) throw res.error;
      stock = (res.data || []).filter(function (p) { return Number(p.sale_price) > 0; });
      // dimensions_cm is stored as JSON text
      stock.forEach(function (p) {
        if (typeof p.dimensions_cm === 'string') { try { p.dimensions_cm = JSON.parse(p.dimensions_cm); } catch (e) { p.dimensions_cm = null; } }
      });
      return stock;
    });
  }
  // Start fetching once the section is close, so the answer feels instant
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      if (entries.some(function (e) { return e.isIntersecting; })) { io.disconnect(); loadStock().catch(function () {}); }
    }, { rootMargin: '600px 0px' });
    io.observe(root);
  }

  function score(p, level, space, budget) {
    var price = Number(p.sale_price);
    var h = p.dimensions_cm && p.dimensions_cm.height;
    var grand = p.type === 'acoustic_grand';
    var full = grand || (h && h >= FULL_SIZE_CM);
    var b = BUDGETS[budget];
    var s = 0, fit;

    if (price >= b.min && price <= b.max) { s += 50; fit = 'in'; }
    else if (price < b.min) { s += 30; fit = 'under'; }
    else if (price <= b.max * 1.1) { s += 15; fit = 'over'; }
    else { s -= 100; fit = 'far'; }

    if (space === 'small') s += grand ? -50 : (full ? 5 : 25);
    else if (space === 'medium') s += grand ? -10 : 15;
    else s += full ? 25 : 8;

    if (level === 'beginner') s += price <= b.max ? 8 : 0;
    if (level === 'intermediate') s += (p.year || 0) >= 1985 ? 6 : 0;
    if (level === 'student') s += (full ? 12 : 0) + ((p.year || 0) >= 1985 ? 6 : 0);
    if (level === 'pro') s += (full ? 15 : 0) + ((p.year || 0) >= 1995 ? 8 : 0) + (grand ? 15 : 0);

    s += Math.max(0, Math.min(4, ((p.year || 1970) - 1970) / 10));
    if (p.featured) s += 3;
    return { piano: p, score: s, fit: fit, full: full, height: h, grand: grand };
  }

  function reasons(m, space) {
    var p = m.piano, out = [];
    var price = money(p.sale_price);
    if (m.fit === 'in') out.push(price + ', inside your budget');
    else if (m.fit === 'under') out.push(price + ', under your budget');
    else out.push(price + ', a little over your budget');

    if (m.grand) out.push('A grand piano for a room with space around it');
    else if (m.full && m.height) out.push(m.height + ' cm tall: the longer strings give a fuller bass');
    else if (m.height) out.push(m.height + ' cm tall, so it sits comfortably ' + (space === 'small' ? 'in a smaller room' : 'against a wall'));

    if (p.year) out.push('Made in ' + p.year + ', hand-picked in Japan');
    return out;
  }

  function card(m, space) {
    var p = m.piano;
    var name = ((p.brand || '') + ' ' + (p.model || '')).trim();
    var photo = p.images && p.images[0];
    var facts = [p.year, m.height ? m.height + ' cm tall' : '', p.finish || p.colour].filter(Boolean).join(' · ');
    return '' +
      '<article class="sp-match-card" data-piano="' + esc(name + (p.year ? ' (' + p.year + ')' : '')) + '">' +
        '<a class="sp-match-photo' + (photo ? '' : ' is-empty') + '" href="/piano.html?id=' + encodeURIComponent(p.id) + '" tabindex="-1" aria-hidden="true">' +
          (photo ? '<img src="' + esc(photo) + '" alt="" loading="lazy">'
                 : '<img src="/media/brand/monogram-ink.svg" alt=""><span>Photographs soon</span>') +
        '</a>' +
        '<div class="sp-match-body">' +
          '<h3 class="sp-match-name"><a href="/piano.html?id=' + encodeURIComponent(p.id) + '">' + esc(name) + '</a></h3>' +
          '<p class="sp-match-facts">' + esc(facts) + '</p>' +
          '<ul class="sp-match-why">' + reasons(m, space).map(function (r) { return '<li>' + esc(r) + '</li>'; }).join('') + '</ul>' +
          '<div class="sp-match-actions">' +
            '<a class="sp-match-link" href="/piano.html?id=' + encodeURIComponent(p.id) + '">View piano<i class="ti ti-arrow-right" aria-hidden="true"></i></a>' +
            '<a class="sp-match-link" href="/services/book-a-viewing.html">Play it in the showroom<i class="ti ti-arrow-right" aria-hidden="true"></i></a>' +
          '</div>' +
        '</div>' +
      '</article>';
  }

  function render(html) {
    results.innerHTML = html;
    results.hidden = false;
    if (!reduced.matches && results.animate) {
      results.animate([{ opacity: 0, transform: 'translateY(24px)' }, { opacity: 1, transform: 'none' }],
        { duration: 700, easing: 'cubic-bezier(.4, 0, .1, 1)' });
    }
    var top = results.getBoundingClientRect().top + window.scrollY - 120;
    if (window.spLenis) window.spLenis.scrollTo(top);
    else window.scrollTo({ top: top, behavior: reduced.matches ? 'auto' : 'smooth' });
  }

  function find() {
    var level = selects[0].value, space = selects[1].value, budget = selects[2].value;
    btn.disabled = true;
    btn.classList.add('is-loading');
    loadStock().then(function (list) {
      if (!list.length) {
        render('<p class="sp-match-note">Our pianos are between shipments from Japan right now. <a href="/services/book-a-viewing.html">Book a visit</a> and tell us what you are after.</p>');
        return;
      }
      var ranked = list.map(function (p) { return score(p, level, space, budget); })
        .sort(function (a, b) { return b.score - a.score || a.piano.sale_price - b.piano.sale_price; });
      var fitting = ranked.filter(function (m) { return m.fit !== 'far'; });
      var top = (fitting.length ? fitting : ranked).slice(0, 3);
      var inBudget = ranked.filter(function (m) { return m.fit === 'in' || m.fit === 'under'; }).length;

      var head = inBudget
        ? '<p class="sp-label sp-match-label">In the showroom now</p><h3 class="sp-match-title">' + (top.length === 1 ? 'Your match' : 'Your ' + top.length + ' best matches') + '</h3>'
        : '<p class="sp-label sp-match-label">In the showroom now</p><h3 class="sp-match-title">The closest we have</h3>' +
          '<p class="sp-match-note">Nothing in stock is ' + BUDGETS[budget].label + ' right now, so these are the nearest. Tell us what you are after when you <a href="/services/book-a-viewing.html">book a visit</a> and we will look out for it in Japan.</p>';
      var grandNote = (level === 'pro' || space === 'large') && !list.some(function (p) { return p.type === 'acoustic_grand'; })
        ? '<p class="sp-match-note">No grand pianos in stock at the moment. If a grand is what you are after, <a href="/services/book-a-viewing.html">book a visit</a> and we can talk about finding one in Japan.</p>'
        : '';
      render(head +
        '<div class="sp-match-grid">' + top.map(function (m) { return card(m, space); }).join('') + '</div>' +
        grandNote +
        '<p class="sp-match-foot">Matched against the ' + list.length + ' piano' + (list.length === 1 ? '' : 's') + ' in stock today. <a href="/instruments/">See them all</a></p>');
    }).catch(function (err) {
      console.error('[matcher] stock load failed', err);
      render('<p class="sp-match-note">We could not load our stock just now. <a href="/instruments/">See all pianos</a>, or call <a href="tel:+61479128955">0479 128 955</a>.</p>');
    }).then(function () {
      btn.disabled = false;
      btn.classList.remove('is-loading');
    });
  }

  btn.addEventListener('click', find);
})();
