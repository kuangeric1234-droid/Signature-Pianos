/* Signature Pianos · the piano-rental pages' behaviour
   The header's dropdowns (each older page keeps these inline), the live list on
   /piano-rental, and the form on /piano-rental/start, which hands the customer to
   the office's own signing page. Every figure comes from the office: this file
   works nothing out. With the office off or rentals not offered, the static
   prices stay and the form says to call. */
(function () {
  'use strict';

  /* ---------- the header ---------- */
  var nav = document.getElementById('nav');
  if (nav) {
    var onScroll = function () { nav.classList.toggle('scrolled', window.scrollY > 60); };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }
  var items = document.querySelectorAll('.nav-item--dropdown');
  var TRIGGER = '.nav-link-trigger, .nav-account-trigger';
  function closeAll(except) {
    items.forEach(function (it) {
      if (it === except) return;
      it.classList.remove('nav-item--open');
      var t = it.querySelector(TRIGGER);
      if (t) t.setAttribute('aria-expanded', 'false');
    });
  }
  items.forEach(function (item) {
    var trigger = item.querySelector(TRIGGER);
    if (!trigger) return;
    function open() { item.classList.add('nav-item--open'); trigger.setAttribute('aria-expanded', 'true'); closeAll(item); }
    function close() { item.classList.remove('nav-item--open'); trigger.setAttribute('aria-expanded', 'false'); }
    item.addEventListener('mouseenter', open);
    item.addEventListener('mouseleave', close);
    trigger.addEventListener('click', function (e) {
      e.stopPropagation();
      if (item.classList.contains('nav-item--open')) close(); else open();
    });
  });
  document.addEventListener('click', function () { closeAll(null); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeAll(null); });

  /* ---------- the office ---------- */
  var office = window.SPOffice;
  var live = !!(office && office.on);
  var money = live ? office.money : function () { return ''; };

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function pianoName(p) { return [p.brand, p.model].filter(Boolean).join(' '); }
  /* as the collection's cards say it */
  function pianoFacts(p) { return [p.year, p.height_cm ? p.height_cm + ' cm tall' : null, p.finish].filter(Boolean).join(' · '); }
  function kindWord(p) { return p.kind ? p.kind + ' piano' : 'Piano'; }
  function firstPhoto(p) { return p.photos && p.photos[0] ? p.photos[0] : null; }
  /* a piano's first photo, its cover; an illustration says so on it, as the piano pages do, and is never passed off as this piano */
  function photoIn(box, p) {
    var photo = firstPhoto(p);
    if (!photo) return;
    var img = el('img');
    img.src = photo.url;
    img.alt = pianoName(p) + (photo.note ? ', an illustration' : '');
    img.loading = 'lazy';
    box.appendChild(img);
    if (photo.note) box.appendChild(el('span', 'sp-illustration', 'Illustration'));
  }
  function lowestRent(p) {
    return p.plans.reduce(function (low, plan) { return low == null || plan.rent_cents < low ? plan.rent_cents : low; }, null);
  }

  /* ---------- /piano-rental: what is ready to rent ---------- */
  var liveBox = document.getElementById('rp-live');
  if (liveBox && live) {
    office.rentalOffers().then(function (out) {
      if (!out.offered || !out.pianos.length) return;
      var list = document.getElementById('rp-live-list');
      out.pianos.forEach(function (p) {
        var a = el('a', 'piano-card');
        a.href = '/piano-rental/start?piano=' + encodeURIComponent(p.slug);
        var image = el('div', 'card-image');
        photoIn(image, p);
        a.appendChild(image);
        var body = el('div', 'card-body');
        body.appendChild(el('span', 'card-tag', kindWord(p)));
        body.appendChild(el('h3', 'card-name', pianoName(p)));
        body.appendChild(el('p', 'card-facts', pianoFacts(p)));
        var row = el('div', 'card-row');
        row.appendChild(el('span', 'card-price', money(lowestRent(p)) + ' a month'));
        var link = el('span', 'card-link', 'Rent this piano');
        var arrow = el('i', 'ti ti-arrow-right');
        arrow.setAttribute('aria-hidden', 'true');
        link.appendChild(arrow);
        row.appendChild(link);
        body.appendChild(row);
        a.appendChild(body);
        list.appendChild(a);
      });
      var count = document.getElementById('rp-live-count');
      if (count) count.textContent = out.pianos.length + (out.pianos.length === 1 ? ' instrument' : ' instruments');
      liveBox.hidden = false;
      var note = document.getElementById('rp-table-note');
      if (note) note.textContent = 'The list above is what is ready to rent now. The table shows what each model rents for.';
    }, function () { /* the office could not be read: the static prices and the phone number stand */ });
  }

  /* ---------- /piano-rental/start ---------- */
  var form = document.getElementById('rp-form');
  if (!form) return;

  var off = document.getElementById('rp-start-off');
  var lead = document.getElementById('rp-start-lead');
  var summary = document.getElementById('rp-summary');
  var plansBox = document.getElementById('rp-plans');
  var errorBox = document.getElementById('rp-error');
  var go = document.getElementById('rp-go');
  var state = { terms: null, piano: null, plan: null };
  var check = null;

  function showOff() {
    document.getElementById('rp-start').classList.add('rp-start--off');
    off.hidden = false;
    form.hidden = true;
    summary.hidden = true;
    if (lead) lead.hidden = true;
  }
  function planOf(key) {
    return state.piano ? state.piano.plans.filter(function (p) { return p.key === key; })[0] || null : null;
  }
  function planNote(plan) {
    if (plan.key === 'rent_to_buy') {
      return money(plan.rent_cents) + ' a month for up to ' + plan.months + ' months. ' + money(plan.total_cents) + ' and it is yours.';
    }
    return money(plan.rent_cents) + ' a month for ' + plan.months + ' months. ' + money(plan.total_cents) + ' all in.';
  }

  function drawSummary() {
    summary.textContent = '';
    if (!state.piano) { summary.hidden = true; return; }
    var p = state.piano;
    var photo = firstPhoto(p);
    if (photo) {
      var image = el('div', 'product-image-main');
      photoIn(image, p);
      summary.appendChild(image);
      if (photo.note && photo.note !== 'Illustration') summary.appendChild(el('p', 'rp-photo-note', photo.note));
    }
    var see = el('a', 'rp-link rp-gallery-link', 'See this piano');
    see.href = '/piano.html?slug=' + encodeURIComponent(p.slug);
    summary.appendChild(see);
    summary.hidden = false;
    drawMoney();
  }

  /* what the chosen plan comes to, under the plans */
  function drawMoney() {
    var dl = document.getElementById('rp-money');
    dl.textContent = '';
    var plan = state.plan, t = state.terms;
    if (!plan || !t) return;
    var row = function (k, v, cls) {
      var d = el('div', cls);
      d.appendChild(el('dt', null, k));
      d.appendChild(el('dd', null, v));
      dl.appendChild(d);
    };
    row('Delivery', money(t.delivery_cents));
    row('Bond, returned', money(t.bond_cents));
    row('First month', money(plan.rent_cents));
    row('First day', money(plan.today_cents), 'rp-today');
  }

  /* the piano page's lines, for the piano this form is for */
  function drawPiano(p) {
    document.getElementById('rp-start-kind').textContent = kindWord(p);
    document.getElementById('rp-start-title').textContent = 'Rent this ' + pianoName(p);
    document.getElementById('rp-crumb').textContent = [pianoName(p), p.year].filter(Boolean).join(' ');
    var meta = document.getElementById('rp-start-meta');
    meta.textContent = '';
    [['Height', p.height_cm ? p.height_cm + ' cm' : null], ['Year', p.year], ['Finish', p.finish]].forEach(function (m) {
      if (!m[1]) return;
      var d = el('div', 'product-meta');
      d.appendChild(el('div', 'product-meta-label', m[0]));
      d.appendChild(el('div', 'product-meta-value', String(m[1])));
      meta.appendChild(d);
    });
    meta.hidden = !meta.firstChild;
  }

  function choosePlan(key) {
    state.plan = planOf(key);
    var own = !!(state.plan && state.plan.key === 'rent_to_buy');
    var dob = document.getElementById('rp-dob-field');
    dob.hidden = !own;
    document.getElementById('rp-dob').required = own;
    drawSummary();
  }

  function drawPlans() {
    plansBox.textContent = '';
    state.piano.plans.forEach(function (plan, i) {
      var label = el('label', 'rp-plan');
      var input = el('input');
      input.type = 'radio';
      input.name = 'plan';
      input.value = plan.key;
      input.addEventListener('change', function () { choosePlan(plan.key); });
      label.appendChild(input);
      label.appendChild(el('b', null, plan.name));
      label.appendChild(el('em', null, money(plan.rent_cents) + ' a month'));
      label.appendChild(el('small', null, planNote(plan)));
      plansBox.appendChild(label);
      var wanted = new URLSearchParams(location.search).get('plan');
      if (wanted ? wanted === plan.key : i === 0) { input.checked = true; choosePlan(plan.key); }
    });
    if (!state.plan && state.piano.plans[0]) {
      plansBox.querySelector('input').checked = true;
      choosePlan(state.piano.plans[0].key);
    }
  }

  function usePiano(piano, terms) {
    state.piano = piano;
    state.terms = terms;
    drawPiano(piano);
    var on = document.getElementById('rp-start-on');
    on.min = terms.earliest_start;
    if (terms.latest_start) on.max = terms.latest_start;
    if (!on.value || on.value < terms.earliest_start) on.value = terms.earliest_start;
    drawPlans();
    form.hidden = false;
    if (!check) check = office.challenge(document.getElementById('rp-check'));
  }

  function drawPicker(pianos, terms) {
    var box = document.getElementById('rp-piano-pick');
    var list = document.getElementById('rp-piano-list');
    pianos.forEach(function (p, i) {
      var label = el('label', 'rp-plan');
      var input = el('input');
      input.type = 'radio';
      input.name = 'piano';
      input.value = p.slug;
      input.addEventListener('change', function () { usePiano(p, terms); });
      label.appendChild(input);
      label.appendChild(el('b', null, pianoName(p)));
      label.appendChild(el('em', null, 'From ' + money(lowestRent(p)) + ' a month'));
      label.appendChild(el('small', null, pianoFacts(p)));
      list.appendChild(label);
      if (i === 0) { input.checked = true; usePiano(p, terms); }
    });
    box.hidden = false;
  }

  if (!live) { showOff(); return; }

  var slug = new URLSearchParams(location.search).get('piano');
  if (slug && office.isSlug(slug)) {
    office.rentalOffer(slug).then(function (out) {
      if (!out || !out.offered || !out.piano || !out.piano.plans.length) return showAll();
      usePiano(out.piano, out.terms);
    }, showOff);
  } else {
    showAll();
  }
  function showAll() {
    office.rentalOffers().then(function (out) {
      if (!out.offered || !out.pianos.length) return showOff();
      drawPicker(out.pianos, out.terms);
    }, showOff);
  }

  /* the way in: more than 4 steps is a phone call, never a form */
  var stepsBox = document.getElementById('rp-steps');
  var stepsStop = document.getElementById('rp-steps-stop');

  function value(id) { return document.getElementById(id).value.trim(); }
  function bad(id, words) {
    var field = document.getElementById(id);
    var wrap = field && field.closest('.rp-field');
    if (wrap) wrap.classList.add('is-bad');
    errorBox.textContent = words;
    errorBox.hidden = false;
    if (field && field.focus) field.focus();
  }
  var FIELD_IDS = { name: 'rp-name', email: 'rp-email', phone: 'rp-phone', street: 'rp-street', suburb: 'rp-suburb', postcode: 'rp-postcode', start_on: 'rp-start-on', date_of_birth: 'rp-dob' };

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    errorBox.hidden = true;
    form.querySelectorAll('.is-bad').forEach(function (n) { n.classList.remove('is-bad'); });
    stepsStop.hidden = true;

    var need = [['rp-name', 'Your full name, please.'], ['rp-email', 'Your email, please.'], ['rp-phone', 'Your mobile, please.'], ['rp-street', 'The street address, please.'], ['rp-suburb', 'The suburb, please.'], ['rp-postcode', 'The postcode, please.'], ['rp-start-on', 'A start date, please.']];
    if (!state.piano || !state.plan) { errorBox.textContent = 'Choose a piano and how long first.'; errorBox.hidden = false; return; }
    if (state.plan.key === 'rent_to_buy') need.push(['rp-dob', 'Your date of birth, please. Rent-to-buy needs it.']);
    for (var i = 0; i < need.length; i++) {
      if (!value(need[i][0])) return bad(need[i][0], need[i][1]);
    }
    if (!stepsBox.checked) { stepsStop.hidden = false; return; }
    if (!document.getElementById('rp-adult').checked) { errorBox.textContent = 'You need to be over 18 to rent a piano.'; errorBox.hidden = false; return; }
    if (!document.getElementById('rp-terms').checked) { errorBox.textContent = 'Please read the rental terms and tick the box.'; errorBox.hidden = false; return; }

    go.disabled = true;
    go.textContent = 'One moment';
    var fields = {
      slug: state.piano.slug, plan: state.plan.key, start_on: value('rp-start-on'),
      name: value('rp-name'), email: value('rp-email'), phone: value('rp-phone'),
      street: value('rp-street'), suburb: value('rp-suburb'), postcode: value('rp-postcode'),
      over_18: true, steps_ok: true, terms_version: state.terms.version,
      sp_check: office.honeypot(document.getElementById('rp-honey'))
    };
    if (state.plan.key === 'rent_to_buy') fields.date_of_birth = value('rp-dob');

    office.startRental(fields, check).then(function (out) {
      if (!out.sign_url) throw new office.Refused(0, null);
      location.href = out.sign_url;
    }).catch(function (err) {
      go.disabled = false;
      go.textContent = 'Continue to sign';
      var words = err && err.words ? err.words : office.WORDS.failed;
      if (err && err.field && FIELD_IDS[err.field]) bad(FIELD_IDS[err.field], words);
      else { errorBox.textContent = words; errorBox.hidden = false; }
    });
  });
})();
