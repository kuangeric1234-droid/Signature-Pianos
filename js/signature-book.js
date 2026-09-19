/* Signature Pianos · "Book a visit" postcard
   ----------------------------------------------------------------------------
   Every link to /services/book-a-viewing.html (and any [data-book-visit]
   element) opens this card instead of leaving the page. The card flies in
   from above, small and tilted, then straightens and settles in the centre.

   Submissions go to the same place as the full booking page: a row in
   `viewing_bookings`, then the confirmation email via /api/send-email.
   Supabase is loaded on demand (supabase-js + /js/config.js) so pages that
   never open the card never pay for it.

   A piano can be passed along with data-piano="Yamaha U3H" on the link or on
   any ancestor; it is prefilled into the message. Ctrl/Cmd/middle clicks still
   open the full booking page. */
(function () {
  'use strict';

  var PAGE = '/services/book-a-viewing.html';
  var SUPABASE_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
  var EASE_OUT = 'cubic-bezier(.16, 1, .3, 1)';
  var EASE_IN = 'cubic-bezier(.7, 0, .84, 0)';
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

  var root, card, form, success, lastFocus, openAnim;

  function el(html) {
    var t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }

  function todayISO() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function build() {
    root = el(
      '<div class="sp-book" id="spBook" hidden data-lenis-prevent>' +
        '<div class="sp-book-backdrop" data-book-close></div>' +
        '<div class="sp-book-card" role="dialog" aria-modal="true" aria-labelledby="spBookTitle">' +
          '<button type="button" class="sp-book-close" data-book-close aria-label="Close">' +
            '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5l14 14M19 5L5 19"/></svg>' +
          '</button>' +
          '<div class="sp-book-side">' +
            '<h2 class="sp-book-title" id="spBookTitle"><span class="sp-book-script">Book</span><span class="sp-book-display">a visit</span></h2>' +
            '<div class="sp-book-notes">' +
              '<p>Come and play our pre-loved Japanese pianos, hand-picked in Japan and checked in Melbourne, in a private viewing at the Mount Waverley showroom.</p>' +
              '<p>We confirm every request within 24 hours.</p>' +
              '<p class="sp-book-direct">Rather talk now? <a href="tel:+61479128955">0479 128 955</a></p>' +
            '</div>' +
          '</div>' +
          '<div class="sp-book-rule" aria-hidden="true">' +
            '<span class="sp-book-seal"><img src="/media/brand/monogram-ink.svg" width="415" height="551" alt=""></span>' +
          '</div>' +
          '<form class="sp-book-form" novalidate>' +
            '<div class="sp-book-field">' +
              '<label for="spb-name">Full name</label>' +
              '<input id="spb-name" name="full_name" type="text" autocomplete="name" required>' +
            '</div>' +
            '<div class="sp-book-pair">' +
              '<div class="sp-book-field">' +
                '<label for="spb-phone">Phone</label>' +
                '<input id="spb-phone" name="phone" type="tel" autocomplete="tel" inputmode="tel" required>' +
              '</div>' +
              '<div class="sp-book-field">' +
                '<label for="spb-email">Email</label>' +
                '<input id="spb-email" name="email" type="email" autocomplete="email" inputmode="email" required>' +
              '</div>' +
            '</div>' +
            '<div class="sp-book-pair">' +
              '<div class="sp-book-field">' +
                '<label for="spb-date">Preferred date</label>' +
                '<input id="spb-date" name="preferred_date" type="date" required>' +
              '</div>' +
              '<div class="sp-book-field">' +
                '<label for="spb-time">Preferred time</label>' +
                '<select id="spb-time" name="preferred_time" required>' +
                  '<option value="" disabled selected>Choose a time</option>' +
                  '<option value="morning">Morning, 9am to 12pm</option>' +
                  '<option value="afternoon">Afternoon, 12pm to 4pm</option>' +
                  '<option value="late_afternoon">Late afternoon, 4pm to 6pm</option>' +
                '</select>' +
              '</div>' +
            '</div>' +
            '<fieldset class="sp-book-field sp-book-chips">' +
              '<legend>I\'d like to see</legend>' +
              '<label><input type="checkbox" name="pianos_interested" value="Japanese upright pianos"><span>Uprights</span></label>' +
              '<label><input type="checkbox" name="pianos_interested" value="Japanese grand pianos"><span>Grands</span></label>' +
              '<label><input type="checkbox" name="pianos_interested" value="Not sure yet, happy to browse"><span>Not sure yet</span></label>' +
            '</fieldset>' +
            '<div class="sp-book-field">' +
              '<label for="spb-message">Anything we should know <small>(optional)</small></label>' +
              '<textarea id="spb-message" name="message" rows="1"></textarea>' +
            '</div>' +
            '<div class="sp-book-foot">' +
              '<p class="sp-book-privacy">We only use your details to arrange your visit. <span class="sp-book-error" role="alert" hidden>That didn\'t send. Please try again, or call 0479 128 955.</span></p>' +
              '<button type="submit" class="sp-book-send"><span>Send</span></button>' +
            '</div>' +
          '</form>' +
          '<div class="sp-book-success" hidden aria-live="polite">' +
            '<p class="sp-book-script">Thank you</p>' +
            '<p class="sp-book-success-text">We\'ll confirm your visit within 24 hours, <span data-book-name></span>. See you at 63 Blackburn Road.</p>' +
            '<button type="button" class="sp-book-done" data-book-close>Close</button>' +
          '</div>' +
        '</div>' +
      '</div>'
    );
    document.body.appendChild(root);
    card = root.querySelector('.sp-book-card');
    form = root.querySelector('.sp-book-form');
    success = root.querySelector('.sp-book-success');
    form.querySelector('#spb-date').min = todayISO();

    root.addEventListener('click', function (e) {
      if (e.target.closest('[data-book-close]')) close();
    });
    root.addEventListener('keydown', trapFocus);
    form.addEventListener('submit', submit);
    form.addEventListener('input', function (e) {
      var f = e.target.closest('.sp-book-field');
      if (f) f.classList.remove('is-invalid');
      if (e.target.tagName === 'TEXTAREA') autogrow(e.target);
    });
  }

  function autogrow(t) {
    t.style.height = 'auto';
    t.style.height = Math.min(t.scrollHeight, 140) + 'px';
  }

  function focusables() {
    return Array.prototype.filter.call(
      card.querySelectorAll('a[href], button, input, select, textarea'),
      function (n) { return !n.disabled && n.offsetParent !== null; }
    );
  }

  function trapFocus(e) {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key !== 'Tab') return;
    var list = focusables();
    if (!list.length) return;
    var first = list[0], last = list[list.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  function lockScroll(on) {
    document.documentElement.classList.toggle('sp-book-open', on);
    var lenis = window.spLenis;
    if (lenis) { on ? lenis.stop() : lenis.start(); }
  }

  function open(piano) {
    if (!root) build();
    if (!root.hidden) return;
    lastFocus = document.activeElement;
    form.hidden = false;
    success.hidden = true;
    if (piano) {
      var msg = form.querySelector('#spb-message');
      if (!msg.value) { msg.value = 'I\'d like to see the ' + piano + '.'; autogrow(msg); }
    }
    root.hidden = false;
    lockScroll(true);
    loadSupabase();

    var backdrop = root.querySelector('.sp-book-backdrop');
    if (openAnim) openAnim.cancel();
    if (reduced.matches) {
      openAnim = card.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 250, easing: 'linear' });
      backdrop.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 250, easing: 'linear' });
    } else {
      backdrop.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 500, easing: 'linear' });
      openAnim = card.animate([
        { transform: 'translate3d(0, -112vh, 0) rotate(-16deg) scale(0.46)' },
        { transform: 'translate3d(0, 0, 0) rotate(0deg) scale(1)' }
      ], { duration: 1050, easing: EASE_OUT });
    }
    setTimeout(function () { var f = form.querySelector('#spb-name'); if (f) f.focus({ preventScroll: true }); }, reduced.matches ? 60 : 520);
  }

  function close() {
    if (!root || root.hidden) return;
    var backdrop = root.querySelector('.sp-book-backdrop');
    var done = function () {
      root.hidden = true;
      lockScroll(false);
      if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
    };
    if (reduced.matches) { done(); return; }
    backdrop.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 420, easing: 'linear', fill: 'forwards' });
    var a = card.animate([
      { transform: 'translate3d(0, 0, 0) rotate(0deg) scale(1)', opacity: 1 },
      { transform: 'translate3d(0, 70vh, 0) rotate(9deg) scale(0.7)', opacity: 0 }
    ], { duration: 520, easing: EASE_IN, fill: 'forwards' });
    a.onfinish = function () { done(); a.cancel(); backdrop.getAnimations().forEach(function (x) { x.cancel(); }); };
  }

  /* ---------- Supabase, on demand ---------- */
  var sbReady = null;
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src; s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    });
  }
  function client() {
    try { return typeof _supabase !== 'undefined' ? _supabase : null; } catch (e) { return null; }
  }
  function loadSupabase() {
    if (sbReady) return sbReady;
    sbReady = (client() ? Promise.resolve() :
      (window.supabase && window.supabase.createClient ? Promise.resolve() : loadScript(SUPABASE_JS))
        .then(function () { return client() ? null : loadScript('/js/config.js'); })
    ).then(client).catch(function (err) { sbReady = null; throw err; });
    return sbReady;
  }

  /* ---------- Submit ---------- */
  function validate() {
    var ok = true;
    form.querySelectorAll('[required]').forEach(function (f) {
      var bad = !f.value.trim() || (f.type === 'email' && !/^\S+@\S+\.\S+$/.test(f.value.trim()));
      f.closest('.sp-book-field').classList.toggle('is-invalid', bad);
      if (bad && ok) { f.focus(); ok = false; }
    });
    return ok;
  }

  function submit(e) {
    e.preventDefault();
    var err = form.querySelector('.sp-book-error');
    err.hidden = true;
    if (!validate()) return;

    var btn = form.querySelector('.sp-book-send');
    btn.disabled = true;
    btn.classList.add('is-sending');

    var fullName = form.full_name.value.trim().replace(/\s+/g, ' ');
    var parts = fullName.split(' ');
    var payload = {
      first_name: parts[0],
      last_name: parts.slice(1).join(' ') || '',
      email: form.email.value.trim(),
      phone: form.phone.value.trim(),
      preferred_date: form.preferred_date.value,
      preferred_time: form.preferred_time.value,
      pianos_interested: Array.prototype.map.call(form.querySelectorAll('input[name="pianos_interested"]:checked'), function (c) { return c.value; }),
      message: form.message.value.trim(),
      status: 'pending',
      notified: false
    };

    loadSupabase()
      .then(function (sb) {
        if (!sb) throw new Error('Supabase unavailable');
        return sb.from('viewing_bookings').insert(payload);
      })
      .then(function (res) {
        if (res && res.error) throw res.error;
        // The booking is saved; the email is best effort.
        fetch('/api/send-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(Object.assign({ type: 'viewing_booking' }, payload))
        }).catch(function (mailErr) { console.error('[book] send-email failed', mailErr); });

        success.querySelector('[data-book-name]').textContent = payload.first_name;
        form.hidden = true;
        success.hidden = false;
        success.querySelector('.sp-book-done').focus({ preventScroll: true });
        form.reset();
        if (!reduced.matches) {
          success.animate([{ opacity: 0, transform: 'translateY(16px)' }, { opacity: 1, transform: 'none' }], { duration: 700, easing: EASE_OUT });
        }
      })
      .catch(function (ex) {
        console.error('[book] submission failed', ex);
        err.hidden = false;
      })
      .then(function () {
        btn.disabled = false;
        btn.classList.remove('is-sending');
      });
  }

  /* ---------- Wire every "Book a visit" link ---------- */
  function isBookingLink(a) {
    if (a.hasAttribute('data-book-visit')) return true;
    var href = a.getAttribute('href') || '';
    return /book-a-viewing\.html(?:$|[?#])/.test(href) && !/#viewing-form/.test(href);
  }

  document.addEventListener('click', function (e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target.closest('a[href], [data-book-visit]');
    if (!a || !isBookingLink(a)) return;
    e.preventDefault();
    var holder = a.closest('[data-piano]');
    open(holder ? holder.getAttribute('data-piano') : '');
  });

  // /any-page#book opens the card on arrival
  if (location.hash === '#book') {
    window.addEventListener('load', function () { open(''); });
  }

  // supabase(): the on-demand client, shared with js/signature-matcher.js
  window.spBook = { open: open, close: close, page: PAGE, supabase: loadSupabase };
})();
