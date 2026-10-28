/* Signature Pianos · the office
   ----------------------------------------------------------------------------
   The website's one door to Signature Pianos Office (plan step S3.4): its public
   stock feed, its online checkout and its four forms (the buyer's guide, a
   visit, a tuning or service, a question), each behind the office's guard at
   <origin>/public/m/<module>/<path>.

   Used only when js/office-config.js names the office's origin (SPOffice.on).
   With none, every page keeps its old ways (Supabase and the site's /api).

   The browser talks to the office directly (cross-origin), so the office counts
   each visitor's own address for its limits and checks the bot check itself.
   The office answers this website's origin with CORS once engine step E87 is
   taken; until then every read and send here fails as "didn't go through",
   never as sent. Nothing is sent with cookies (credentials: 'omit').

   A form or checkout says it was kept only when the office answered ok; its
   refusals are shown in the office's own words. */
(function () {
  'use strict';

  var cfg = window.SP_OFFICE_CONFIG || {};
  var ORIGIN = originOf(cfg.origin);
  var SITE_KEY = typeof cfg.turnstileSiteKey === 'string' && /^[0-9A-Za-z_-]{10,100}$/.test(cfg.turnstileSiteKey)
    ? cfg.turnstileSiteKey : '';

  /* The office's address: https, or http on this machine for a local run; an
     origin alone (no path, query or login). Anything else leaves the switch off. */
  function originOf(v) {
    if (typeof v !== 'string' || !v) return '';
    try {
      var u = new URL(v);
      var local = u.hostname === '127.0.0.1' || u.hostname === 'localhost';
      if (u.protocol !== 'https:' && !(u.protocol === 'http:' && local)) return '';
      if (u.username || u.password || (u.pathname && u.pathname !== '/') || u.search || u.hash) return '';
      return u.origin;
    } catch (e) { return ''; }
  }

  /* The words each form shows beside its box and their version, word for word
     as the office keeps them (Signature-Pianos-office modules/sales/consent.ts,
     the newest of each at build c48e4c0). The office keeps every version it has
     shown, so these stay valid when it adds a newer one; a change of words is
     made there first, then copied here with its version. */
  var CONSENT = {
    guide: {
      version: 'guide-2026-10-26',
      words: 'Email me the buyer’s guide. Signature Pianos may also contact me about pianos, and I can ask them to stop at any time.'
    },
    visit: {
      version: 'visit-2026-10-27',
      words: 'Signature Pianos will use what I have sent to arrange my visit, and may contact me about pianos afterwards. I can ask them to stop at any time.'
    },
    service: {
      version: 'service-2026-10-27',
      words: 'Signature Pianos will use what I have sent to arrange my tuning or service, and may contact me about pianos later. I can ask them to stop at any time.'
    },
    question: {
      version: 'question-2026-10-27',
      words: 'Signature Pianos will use what I have sent to answer my question, and may contact me about pianos later. I can ask them to stop at any time.'
    }
  };

  /* The times of day the office's visit form takes, and the hour each is over by
     on the day itself, Melbourne time (modules/sales/forms.ts VISIT_TIME_WORDS).
     The pages offer morning and afternoon: the showroom's evening hours are
     Eric's to say (office PLACEHOLDERS P40). */
  var TIME_OVER = { morning: '12:00', afternoon: '17:00', evening: '20:00' };
  var ZONE = 'Australia/Melbourne';

  var WORDS = {
    /* this site's own words where the office could not be reached */
    failed: 'Sorry, that didn’t go through. Please try again, or call us on 0479 128 955.',
    /* the same send kept already: the office answers it as kept, without words */
    kept: 'Thank you. We have this already.',
    /* the office's own words for a send without a passed bot check (its guard's) */
    check: 'This page could not tell that a person sent it. Complete the check on the page, then send it again.'
  };

  /** a refusal: the office's own words and the field they are about, or none
      where the office could not be reached or did not answer as it answers */
  function Refused(status, words, field) {
    this.name = 'Refused';
    this.status = status || 0;
    this.words = typeof words === 'string' && words ? words : null;
    this.field = typeof field === 'string' && field ? field : null;
    this.message = this.words || WORDS.failed;
  }
  Refused.prototype = Object.create(Error.prototype);
  Refused.prototype.constructor = Refused;

  /* ---------- calls ---------- */

  function call(path, opts) {
    var post = opts && opts.method === 'POST';
    var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, post ? 30000 : 12000) : null;
    // no header of our own but a POST's content-type: a feed read needs no preflight
    var init = { mode: 'cors', credentials: 'omit', redirect: 'error', referrerPolicy: 'strict-origin-when-cross-origin' };
    if (ctrl) init.signal = ctrl.signal;
    if (opts) for (var k in opts) init[k] = opts[k];
    return fetch(ORIGIN + path, init).then(function (res) {
      return res.json().catch(function () { return null; }).then(function (body) {
        if (timer) clearTimeout(timer);
        return { status: res.status, ok: res.ok, body: body && typeof body === 'object' ? body : null };
      });
    }, function (err) {
      if (timer) clearTimeout(timer);
      throw err;
    });
  }

  function refusedBy(r) {
    var b = r.body || {};
    return new Refused(r.status, typeof b.error === 'string' ? b.error : null, typeof b.field === 'string' ? b.field : null);
  }

  /* ---------- the stock feed ---------- */

  var SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  function isSlug(s) { return typeof s === 'string' && s.length <= 120 && SLUG.test(s); }
  var STATUSES = { 'For sale': true, 'Reserved': true, 'Sold': true };

  function text(v) { return typeof v === 'string' && v.trim() ? v.trim() : null; }
  function cents(v) { return typeof v === 'number' && isFinite(v) && v > 0 ? Math.round(v) : null; }
  /** a photo's address: the office's own signed path for a file, nothing else */
  function photoUrl(u) {
    return typeof u === 'string' && /^\/public\/file\?[A-Za-z0-9_.~=&%-]+$/.test(u) ? ORIGIN + u : null;
  }
  function kindKey(kind) {
    return /grand/i.test(kind) ? 'grand' : /upright/i.test(kind) ? 'upright' : /digital/i.test(kind) ? 'digital' : '';
  }

  /** a piano as the pages use it, from the feed's allow-list and nothing else */
  function shape(p) {
    if (!p || typeof p !== 'object' || !isSlug(p.slug) || !STATUSES[p.status]) return null;
    var brand = text(p.brand) || '';
    var model = text(p.model) || '';
    var kind = text(p.kind) || '';
    return {
      slug: p.slug,
      name: (brand + ' ' + model).trim() || 'Piano',
      brand: brand,
      model: model,
      kind: kind,
      kindKey: kindKey(kind),
      year: typeof p.year === 'number' && isFinite(p.year) ? p.year : null,
      finish: text(p.finish),
      condition: text(p.condition),
      defects: text(p.defects_told),
      status: p.status,
      priceCents: p.status === 'Sold' ? null : cents(p.price_cents),
      depositCents: p.status === 'For sale' ? cents(p.deposit_cents) : null,
      /* the deposit's terms, once the feed carries them (office step S3.6) */
      depositTerms: p.status === 'For sale' ? text(p.deposit_terms) : null,
      photos: (Array.isArray(p.photos) ? p.photos : [])
        .map(function (f) { return f && photoUrl(f.url); }).filter(Boolean),
      href: '/piano.html?slug=' + encodeURIComponent(p.slug)
    };
  }

  var feed = null;
  /** the pianos on the website, newest listed first: For sale and Reserved */
  function pianos() {
    if (!ORIGIN) return Promise.reject(new Refused(0, null));
    if (!feed) {
      feed = call('/public/m/stock/pianos').then(function (r) {
        if (!r.ok || !r.body || !Array.isArray(r.body.pianos)) throw refusedBy(r);
        return r.body.pianos.map(shape).filter(Boolean);
      });
      feed.catch(function () { feed = null; });
    }
    return feed;
  }

  /** one piano by its lasting address: For sale, Reserved or Sold; null where the
      office says no piano is on the website at that address */
  function piano(slug) {
    if (!ORIGIN) return Promise.reject(new Refused(0, null));
    if (!isSlug(slug)) return Promise.resolve(null);
    return call('/public/m/stock/piano?slug=' + encodeURIComponent(slug)).then(function (r) {
      if (r.status === 404) return null;
      if (!r.ok || !r.body || !r.body.piano) throw refusedBy(r);
      var p = shape(r.body.piano);
      if (!p || p.slug !== slug) throw new Refused(0, null);
      return p;
    });
  }

  /** an amount in cents as the brand writes it: $6,900, or $1,998.50 */
  function money(c) {
    if (typeof c !== 'number' || !isFinite(c)) return '';
    return '$' + (c / 100).toLocaleString('en-AU', { minimumFractionDigits: c % 100 ? 2 : 0, maximumFractionDigits: 2 });
  }

  /* ---------- where a visitor came from: the QR's code and the campaign ---------- */

  var UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'fbclid'];
  var FROM_KEY = 'sp-office-from';
  /** the QR placement's code (?src=, as the office prints it) and the campaign's
      tags, from this address, else from the landing earlier in this visit */
  function cameFrom() {
    var p = new URLSearchParams(location.search);
    var out = { placement: null, utm: {} };
    var src = (p.get('src') || '').trim();
    if (/^[A-Za-z0-9_-]{1,60}$/.test(src)) out.placement = src;
    UTM_KEYS.forEach(function (k) {
      var v = (p.get(k) || '').trim();
      if (v) out.utm[k] = v.slice(0, 120);
    });
    var any = out.placement || Object.keys(out.utm).length;
    try {
      if (any) sessionStorage.setItem(FROM_KEY, JSON.stringify(out));
      else {
        var had = JSON.parse(sessionStorage.getItem(FROM_KEY) || 'null');
        if (had && typeof had === 'object') {
          if (typeof had.placement === 'string' && /^[A-Za-z0-9_-]{1,60}$/.test(had.placement)) out.placement = had.placement;
          if (had.utm && typeof had.utm === 'object') UTM_KEYS.forEach(function (k) {
            if (typeof had.utm[k] === 'string' && had.utm[k]) out.utm[k] = had.utm[k].slice(0, 120);
          });
        }
      }
    } catch (e) { /* no storage: this address alone */ }
    return out;
  }

  /* ---------- the bot check: Cloudflare Turnstile ---------- */

  var turnstileLoad = null;
  function loadTurnstile() {
    if (window.turnstile) return Promise.resolve(window.turnstile);
    if (!turnstileLoad) {
      turnstileLoad = new Promise(function (resolve, reject) {
        var s = document.createElement('script');
        s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        s.async = true;
        s.onload = function () { window.turnstile ? resolve(window.turnstile) : reject(new Error('turnstile missing')); };
        s.onerror = function () { reject(new Error('turnstile did not load')); };
        document.head.appendChild(s);
      });
      turnstileLoad.catch(function () { turnstileLoad = null; });
    }
    return turnstileLoad;
  }

  /** the bot check drawn into `box` where a site key is set; its token() gives
      the answer to send (none where no key is set: the office then keeps a form
      as "Recorded, not checked", and in production refuses a checkout) */
  function challenge(box) {
    if (!SITE_KEY || !box) {
      if (box) box.hidden = true;
      return { on: false, token: function () { return Promise.resolve(null); }, reset: function () {} };
    }
    box.hidden = false;
    var id = null;
    var ready = loadTurnstile().then(function (ts) {
      id = ts.render(box, { sitekey: SITE_KEY, theme: 'light', size: 'flexible' });
      return ts;
    });
    ready.catch(function () {});
    return {
      on: true,
      token: function () {
        return ready.then(function (ts) {
          var t = id != null ? ts.getResponse(id) : '';
          if (!t) throw new Refused(400, WORDS.check);
          return t;
        }, function () { throw new Refused(0, null); });
      },
      reset: function () { if (id != null && window.turnstile) { try { window.turnstile.reset(id); } catch (e) { /* gone */ } } }
    };
  }

  /* ---------- sending: one id a submission, the same id for the same words ---------- */

  var sent = {};
  function newId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    var a = new Uint8Array(16);
    crypto.getRandomValues(a);
    return Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
  }
  /** the submission's id: kept while the words are the same, so a send whose
      answer was lost is answered by the office as kept, never kept twice */
  function idFor(key, body) {
    var digest = JSON.stringify(body);
    if (sent[key] && sent[key].digest === digest) return sent[key].id;
    sent[key] = { digest: digest, id: newId() };
    return sent[key].id;
  }

  function post(path, key, body, check) {
    if (!ORIGIN) return Promise.reject(new Refused(0, null));
    var asked = check ? check.token() : Promise.resolve(null);
    return asked.then(function (token) {
      var out = {};
      for (var k in body) out[k] = body[k];
      out.id = idFor(key, body);
      if (token) out.challenge = token;
      return call(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(out) });
    }).then(function (r) {
      // a token is spent whatever the answer
      if (check) check.reset();
      if (r.ok && r.body && r.body.ok === true) return r.body;
      throw refusedBy(r);
    }, function (err) {
      if (check) check.reset();
      throw err instanceof Refused ? err : new Refused(0, null);
    });
  }

  /** what the office answered a kept form, in its words */
  function answerWords(out) {
    return out && typeof out.said === 'string' && out.said ? out.said : WORDS.kept;
  }

  var FIELDS = ['name', 'email', 'phone', 'message', 'day', 'time', 'piano', 'their_piano', 'suburb', 'sp_check'];
  /** one of the four forms, sent as the office takes it: its fields, the box
      ticked with its words' version, the page, the QR's code and the campaign */
  function sendForm(form, fields, check) {
    var consent = CONSENT[form];
    if (!consent) return Promise.reject(new Refused(0, null));
    var body = { consent: true, consent_version: consent.version, page: location.pathname };
    FIELDS.forEach(function (k) {
      var v = fields[k];
      if (typeof v === 'string' && v.trim()) body[k] = v.trim();
    });
    var from = cameFrom();
    if (from.placement) body.placement = from.placement;
    if (Object.keys(from.utm).length) body.utm = from.utm;
    return post('/public/m/sales/' + form, 'form:' + form, body, check);
  }

  /** the office's pay page for a checkout: its own origin and /pay/<token>, never
      another address, so an answer can't send a buyer anywhere else */
  function isPayLink(u) {
    try {
      var x = new URL(u);
      return x.origin === ORIGIN && /^\/pay\/[A-Za-z0-9_-]{22,128}$/.test(x.pathname) && !x.search && !x.hash;
    } catch (e) { return false; }
  }

  /** a checkout started for a piano: a deposit or the full price. Its answer's
      `pay` is kept only where it is the office's own pay page */
  function checkout(fields, check) {
    if (!isSlug(fields.piano) || (fields.pay !== 'deposit' && fields.pay !== 'full')) return Promise.reject(new Refused(0, null));
    var body = { piano: fields.piano, pay: fields.pay, name: (fields.name || '').trim(), email: (fields.email || '').trim() };
    if (fields.phone && fields.phone.trim()) body.phone = fields.phone.trim();
    return post('/public/m/orders/checkout', 'checkout', body, check).then(function (out) {
      if (!isPayLink(out.pay)) out.pay = null;
      return out;
    });
  }

  /* ---------- a visit's day and time, as the office takes them ---------- */

  function melbourne(at) {
    var parts = {};
    new Intl.DateTimeFormat('en-AU', {
      timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).formatToParts(at || new Date()).forEach(function (p) { parts[p.type] = p.value; });
    return { day: parts.year + '-' + parts.month + '-' + parts.day, time: parts.hour + ':' + parts.minute };
  }
  function addDays(day, n) {
    var d = new Date(day + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }
  /** the days the office takes a visit for: today in Melbourne to a year on */
  function visitDays() {
    var today = melbourne().day;
    return { min: today, max: addDays(today, 365) };
  }
  /** whether the office takes this time of day on this day: 'ok', 'gone' (over
      already today) or 'not taken' */
  function visitTime(value, day) {
    if (!Object.prototype.hasOwnProperty.call(TIME_OVER, value)) return 'not taken';
    var now = melbourne();
    return day === now.day && TIME_OVER[value] <= now.time ? 'gone' : 'ok';
  }
  /** a time <select> made to offer only what the office takes on its day:
      options it doesn't take removed, ones gone today disabled */
  function fitTimes(select, day) {
    if (!select) return;
    Array.prototype.slice.call(select.options).forEach(function (o) {
      if (!o.value) return;
      var t = visitTime(o.value, day);
      if (t === 'not taken') { o.remove(); return; }
      o.disabled = t === 'gone';
      if (o.disabled && o.selected) select.value = '';
    });
  }

  /* ---------- small things the pages share ---------- */

  /** a form's hidden box made the one the office reads (sp_check: a name no
      browser fills for a person, as it would "company"); called as the page
      starts, and again for its value as the form is sent */
  function honeypot(input) {
    if (!input) return '';
    if (input.name !== 'sp_check') {
      input.name = 'sp_check';
      input.setAttribute('autocomplete', 'off');
      input.tabIndex = -1;
      input.setAttribute('aria-hidden', 'true');
    }
    return input.value;
  }

  window.SPOffice = Object.freeze({
    on: !!ORIGIN,
    origin: ORIGIN,
    CONSENT: CONSENT,
    WORDS: WORDS,
    Refused: Refused,
    isSlug: isSlug,
    pianos: pianos,
    piano: piano,
    money: money,
    challenge: challenge,
    sendForm: sendForm,
    answerWords: answerWords,
    checkout: checkout,
    visitDays: visitDays,
    visitTime: visitTime,
    fitTimes: fitTimes,
    honeypot: honeypot,
    cameFrom: cameFrom
  });
})();
