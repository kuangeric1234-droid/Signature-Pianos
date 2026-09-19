/* Signature Pianos · piano teachers from TeachMusic
   ----------------------------------------------------------------------------
   Live Melbourne piano teachers from TeachMusic (teachmusic.com.au), our sister
   platform, for teachers.html, teacher.html and teachers-match.html.

   Read-only. The key is TeachMusic's public anon key (the same one the homepage
   map uses); row-level security decides what it can see. Only GET requests.

   The rules copy TeachMusic's own so the two sites never disagree:
   - visibility is their BROWSE_VISIBLE filter (published and complete, or a
     seeded listing nobody has claimed yet, never a removed one)
   - "Melbourne" is their /piano-lessons/melbourne box: 35 km around the city
   - an unclaimed listing shows no trial and no badge, because nobody behind it
     has offered one
   Exposes window.TeachMusic. */
(function () {
  'use strict';

  var API = 'https://swxknjeeewbuyvtkgdeb.supabase.co/rest/v1/';
  var KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN3eGtuamVlZXdidXl2dGtnZGViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQxMTY0NzcsImV4cCI6MjA5OTY5MjQ3N30.uMWtd1iH10qfOdmLU4EUMfQu9TA9V8wGEXNKUS7vZfY';
  var SITE = 'https://www.teachmusic.com.au';
  var BROWSE = SITE + '/piano-lessons/melbourne';

  var CENTRE = { lat: -37.82, lng: 145.0 };
  var BOX = boxAround(CENTRE.lat, CENTRE.lng, 35);
  // Suburb lookups reach a little further, so someone in Frankston still gets distances
  var SUBURB_BOX = { south: -38.5, north: -37.3, west: 144.3, east: 145.8 };
  var VISIBLE = '(and(status.eq.published,is_listable.is.true),and(claim_state.eq.unclaimed,is_listable.is.true,status.neq.removed))';
  var SELECT = 'slug,display_name,headline,bio,instruments,ages,levels,modes,exam_boards,qualifications,' +
    'lesson_options,pin_lat,pin_lng,travel_radius_km,price_from_cents,offers_trial,trial_price_cents,' +
    'years_experience,gallery,claim_state,profile_score,suburbs(name),listing_badges(badge)';

  var CACHE_KEY = 'sp-teachmusic-v1';
  var CACHE_MS = 10 * 60 * 1000;
  var TIMEOUT_MS = 12000;

  function boxAround(lat, lng, km) {
    var dLat = km / 111;
    var dLng = km / (111 * Math.cos(lat * Math.PI / 180));
    return { south: lat - dLat, north: lat + dLat, west: lng - dLng, east: lng + dLng };
  }

  /* ---------- Requests ---------- */

  function get(table, params) {
    var ctrl = 'AbortController' in window ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, TIMEOUT_MS) : null;
    return fetch(API + table + '?' + new URLSearchParams(params), {
      headers: { apikey: KEY, Authorization: 'Bearer ' + KEY },
      signal: ctrl ? ctrl.signal : undefined,
    }).then(function (res) {
      if (timer) clearTimeout(timer);
      if (!res.ok) throw new Error('TeachMusic ' + table + ' ' + res.status);
      return res.json();
    }, function (err) {
      if (timer) clearTimeout(timer);
      throw err;
    });
  }

  function listingParams(extra) {
    return [
      ['select', SELECT],
      ['instruments', 'cs.{piano}'],
      ['pin_lat', 'gte.' + BOX.south], ['pin_lat', 'lte.' + BOX.north],
      ['pin_lng', 'gte.' + BOX.west], ['pin_lng', 'lte.' + BOX.east],
      ['or', VISIBLE],
      // TeachMusic's browse order: claimed teachers first, then the fullest profiles
      ['order', 'claim_state.asc,profile_score.desc,id.asc'],
    ].concat(extra || [['limit', '250']]);
  }

  function readCache() {
    try {
      var saved = JSON.parse(sessionStorage.getItem(CACHE_KEY) || 'null');
      if (saved && Date.now() - saved.at < CACHE_MS && Array.isArray(saved.rows)) return saved;
    } catch (e) { /* private mode or bad JSON: just fetch */ }
    return null;
  }
  function writeCache(data) {
    try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), rows: data.rows, instruments: data.instruments })); } catch (e) { /* full or blocked */ }
  }

  /* ---------- The instrument taxonomy: names and whether a tag is a style ---------- */

  var taxonomy = {};
  function setTaxonomy(rows) {
    taxonomy = {};
    (rows || []).forEach(function (r) { if (r && r.id) taxonomy[r.id] = { name: r.name, category: r.category }; });
  }
  function tagName(id) {
    if (taxonomy[id]) return taxonomy[id].name;
    return String(id || '').split('-').map(function (w) { return w ? w[0].toUpperCase() + w.slice(1) : w; }).join(' ');
  }
  function tagCategory(id) { return taxonomy[id] ? taxonomy[id].category : null; }

  /* ---------- One listing row, narrowed to what the pages use ---------- */

  function strings(v) { return Array.isArray(v) ? v.filter(function (s) { return typeof s === 'string' && s; }) : []; }
  function focal(v) { return typeof v === 'number' && isFinite(v) ? Math.round(Math.min(100, Math.max(0, v))) : null; }

  function normalize(row) {
    var claimed = row.claim_state !== 'unclaimed' && row.claim_state !== 'invited';
    // Only http(s) URLs reach an img src; anything else in the jsonb is dropped
    var photos = (Array.isArray(row.gallery) ? row.gallery : [])
      .filter(function (g) { return g && typeof g.url === 'string' && /^https?:\/\//.test(g.url); })
      .slice(0, 8)
      .map(function (g) { return { url: g.url, alt: typeof g.alt === 'string' ? g.alt : '', fx: focal(g.fx), fy: focal(g.fy) }; });
    var badges = (Array.isArray(row.listing_badges) ? row.listing_badges : []).map(function (b) { return b && b.badge; });
    var levels = strings(row.levels).map(function (l) { return l === 'exam_prep' ? 'exam-prep' : l; })
      .filter(function (l, i, a) { return a.indexOf(l) === i; })
      .sort(function (a, b) { return LEVEL_ORDER.indexOf(a) - LEVEL_ORDER.indexOf(b); });
    var lessons = (Array.isArray(row.lesson_options) ? row.lesson_options : [])
      .filter(function (o) { return o && isFinite(o.minutes) && isFinite(o.price_cents); })
      .map(function (o) { return { minutes: o.minutes, cents: o.price_cents }; })
      .sort(function (a, b) { return a.minutes - b.minutes; })
      .slice(0, 6);
    var slug = String(row.slug || '');
    return {
      slug: slug,
      name: row.display_name || 'Piano teacher',
      headline: row.headline || '',
      bio: row.bio || '',
      suburb: row.suburbs && row.suburbs.name ? row.suburbs.name : '',
      lat: typeof row.pin_lat === 'number' ? row.pin_lat : null,
      lng: typeof row.pin_lng === 'number' ? row.pin_lng : null,
      photos: photos,
      priceFrom: typeof row.price_from_cents === 'number' ? row.price_from_cents : null,
      trial: claimed && row.offers_trial ? { cents: typeof row.trial_price_cents === 'number' ? row.trial_price_cents : null } : null,
      years: typeof row.years_experience === 'number' ? row.years_experience : null,
      ages: strings(row.ages).sort(function (a, b) { return AGE_ORDER.indexOf(a) - AGE_ORDER.indexOf(b); }),
      levels: levels,
      modes: strings(row.modes),
      exams: strings(row.exam_boards),
      qualifications: strings(row.qualifications).slice(0, 12),
      lessons: lessons,
      tags: strings(row.instruments),
      travelKm: typeof row.travel_radius_km === 'number' ? row.travel_radius_km : null,
      claimed: claimed,
      completeness: typeof row.profile_score === 'number' ? row.profile_score : 0,
      // TeachMusic's "Child safety verified": a WWCC or VIT check their team confirmed
      childSafe: claimed && badges.indexOf('wwcc_verified') !== -1,
      profileUrl: SITE + '/teachers/' + encodeURIComponent(slug),
      pageUrl: '/teacher.html?slug=' + encodeURIComponent(slug),
    };
  }

  /* ---------- Loading ---------- */

  var pending = null;
  function load() {
    if (pending) return pending;
    var saved = readCache();
    if (saved) {
      setTaxonomy(saved.instruments);
      pending = Promise.resolve(saved.rows.map(normalize).filter(function (t) { return t.slug; }));
      return pending;
    }
    pending = Promise.all([
      get('listings', listingParams()),
      // Names only; the pages fall back to tidied slugs if this one fails
      get('instruments', [['select', 'id,name,category']]).catch(function () { return []; }),
    ]).then(function (res) {
      var rows = Array.isArray(res[0]) ? res[0] : [];
      setTaxonomy(res[1]);
      writeCache({ rows: rows, instruments: res[1] });
      return rows.map(normalize).filter(function (t) { return t.slug; });
    }).catch(function (err) {
      pending = null;
      throw err;
    });
    return pending;
  }

  // One teacher: from the list when it is there, otherwise asked for directly
  function bySlug(slug) {
    return load().then(function (list) {
      var found = list.filter(function (t) { return t.slug === slug; })[0];
      if (found) return { teacher: found, all: list };
      return get('listings', listingParams([['slug', 'eq.' + slug], ['limit', '1']])).then(function (rows) {
        return { teacher: rows && rows[0] ? normalize(rows[0]) : null, all: list };
      });
    });
  }

  // Suburbs from TeachMusic's own table, for "teachers near Box Hill"
  function findSuburbs(text, limit) {
    var q = String(text || '').replace(/[^A-Za-z\s'-]/g, '').replace(/\s+/g, ' ').trim();
    if (q.length < 2) return Promise.resolve([]);
    return get('suburbs', [
      ['select', 'name,postcode,lat,lng'],
      ['state', 'eq.VIC'],
      ['name', 'ilike.' + q + '*'],
      ['lat', 'gte.' + SUBURB_BOX.south], ['lat', 'lte.' + SUBURB_BOX.north],
      ['lng', 'gte.' + SUBURB_BOX.west], ['lng', 'lte.' + SUBURB_BOX.east],
      ['order', 'name.asc'],
      ['limit', String(limit || 6)],
    ]).then(function (rows) {
      return (rows || []).filter(function (s) { return s && s.name && isFinite(s.lat) && isFinite(s.lng); });
    });
  }
  function resolveSuburb(name) {
    return findSuburbs(name, 12).then(function (rows) {
      var want = String(name || '').trim().toLowerCase();
      return rows.filter(function (s) { return s.name.toLowerCase() === want; })[0] || null;
    });
  }

  /* ---------- Filters shared by the directory and the quiz ---------- */

  function teachesAge(t, age) {
    if (age === 'children') return t.ages.indexOf('children') !== -1 || t.ages.indexOf('preschool') !== -1;
    return t.ages.indexOf(age) !== -1;
  }

  // f: { q, mode, age, style, maxCents }. Empty values mean "any".
  function matches(t, f) {
    if (f.q) {
      var q = f.q.trim().toLowerCase();
      if (q && (t.name + ' ' + t.suburb).toLowerCase().indexOf(q) === -1) return false;
    }
    if (f.mode && t.modes.indexOf(f.mode) === -1) return false;
    if (f.age && !teachesAge(t, f.age)) return false;
    if (f.style && t.tags.indexOf(f.style) === -1) return false;
    if (f.maxCents != null && (t.priceFrom == null || t.priceFrom > f.maxCents)) return false;
    return true;
  }

  function distanceKm(a, b) {
    if (!a || !b || a.lat == null || b.lat == null) return null;
    var r = Math.PI / 180;
    var dLat = (b.lat - a.lat) * r;
    var dLng = (b.lng - a.lng) * r;
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 12742 * Math.asin(Math.sqrt(h));
  }

  /* ---------- Words ---------- */

  var AGE = { preschool: 'Preschoolers', children: 'Children', teens: 'Teenagers', adults: 'Adults' };
  var MODE = { studio: 'At their studio', mobile: 'Comes to you', online: 'Online', school: 'At school' };
  var LEVEL = { beginner: 'Beginners', intermediate: 'Intermediate', advanced: 'Advanced', 'exam-prep': 'Exam preparation' };
  var LEVEL_ORDER = ['beginner', 'intermediate', 'advanced', 'exam-prep'];
  var AGE_ORDER = ['preschool', 'children', 'teens', 'adults'];
  var EXAM = { ameb: 'AMEB', abrsm: 'ABRSM', trinity: 'Trinity', rockschool: 'Rockschool', anzca: 'ANZCA', hsc: 'HSC', vce: 'VCE', ib: 'IB' };

  function dollars(cents) { return '$' + Math.round(cents / 100).toLocaleString('en-AU'); }
  function priceLine(t) { return t.priceFrom != null ? 'From ' + dollars(t.priceFrom) + ' per lesson' : 'Prices on enquiry'; }
  function trialLine(t) {
    if (!t.trial) return '';
    if (t.trial.cents === 0) return 'Free trial lesson';
    return t.trial.cents ? 'Trial lesson ' + dollars(t.trial.cents) : 'Trial lesson available';
  }
  function kmLine(km) { return km == null ? '' : km < 1 ? 'Under 1 km' : Math.round(km) + ' km'; }
  function firstName(t) {
    // "Angus Killick" reads as Angus; a studio name reads as itself
    var words = t.name.split(/\s+/);
    return words.length === 2 && !/studio|school|music|piano|academy/i.test(t.name) ? words[0] : t.name;
  }
  function initials(name) {
    var w = String(name || 'T').split(/\s+/).filter(Boolean);
    return w.length > 1 ? (w[0][0] + w[w.length - 1][0]).toUpperCase() : (w[0] || 'T').slice(0, 2).toUpperCase();
  }
  function framing(p) { return p && (p.fx != null || p.fy != null) ? (p.fx == null ? 50 : p.fx) + '% ' + (p.fy == null ? 50 : p.fy) + '%' : '50% 35%'; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ---------- The card: photo, hairline, name, one line of facts, one action ---------- */

  // opts: { note: 'short line under the facts', reasons: ['…'], level: 'h3' }
  function card(t, opts) {
    opts = opts || {};
    var h = opts.level || 'h3';
    var photo = t.photos[0];
    var facts = [t.suburb, priceLine(t)].filter(Boolean).join(' · ');
    var trial = trialLine(t);
    var reasons = (opts.reasons || []).slice(0, 3);
    return '<article class="tm-card" data-slug="' + esc(t.slug) + '">' +
      '<a class="tm-card-photo" href="' + esc(t.pageUrl) + '" tabindex="-1" aria-hidden="true">' +
        (photo
          ? '<img src="' + esc(photo.url) + '" alt="" loading="lazy" decoding="async" style="object-position:' + framing(photo) + '">'
          : '<span class="tm-card-initials">' + esc(initials(t.name)) + '</span>') +
      '</a>' +
      '<div class="tm-card-body">' +
        '<' + h + ' class="tm-card-name"><a href="' + esc(t.pageUrl) + '">' + esc(t.name) + '</a></' + h + '>' +
        '<p class="tm-card-facts">' + esc(facts) + '</p>' +
        (trial ? '<p class="tm-card-trial">' + esc(trial) + '</p>' : '') +
        (opts.note ? '<p class="tm-card-note">' + esc(opts.note) + '</p>' : '') +
        (reasons.length ? '<ul class="tm-card-why">' + reasons.map(function (r) { return '<li>' + esc(r) + '</li>'; }).join('') + '</ul>' : '') +
        '<div class="tm-card-actions">' +
          '<a class="tm-link" href="' + esc(t.pageUrl) + '" aria-label="View ' + esc(t.name) + '’s profile">View profile <i class="ti ti-arrow-right" aria-hidden="true"></i></a>' +
          '<a class="tm-card-ext" href="' + esc(t.profileUrl) + '" target="_blank" rel="noopener">View on TeachMusic<span class="tm-sr"> (opens in a new tab)</span></a>' +
        '</div>' +
      '</div>' +
    '</article>';
  }

  function skeletons(n) {
    var one = '<div class="tm-card tm-card--ghost" aria-hidden="true"><span class="tm-card-photo"></span>' +
      '<div class="tm-card-body"><span class="tm-ghost-line"></span><span class="tm-ghost-line tm-ghost-line--short"></span></div></div>';
    return new Array(n + 1).join(one);
  }

  // A card photo that fails to load shows the teacher's initials, not an empty frame
  document.addEventListener('error', function (e) {
    var img = e.target;
    if (!img || img.tagName !== 'IMG' || !img.closest || !img.closest('.tm-card-photo')) return;
    var name = img.closest('.tm-card') && img.closest('.tm-card').querySelector('.tm-card-name');
    var span = document.createElement('span');
    span.className = 'tm-card-initials';
    span.textContent = initials(name ? name.textContent : '');
    img.replaceWith(span);
  }, true);

  window.TeachMusic = {
    SITE: SITE,
    BROWSE_URL: BROWSE,
    CENTRE: CENTRE,
    load: load,
    bySlug: bySlug,
    findSuburbs: findSuburbs,
    resolveSuburb: resolveSuburb,
    matches: matches,
    teachesAge: teachesAge,
    distanceKm: distanceKm,
    tagName: tagName,
    tagCategory: tagCategory,
    words: { age: AGE, mode: MODE, level: LEVEL, exam: EXAM },
    dollars: dollars,
    priceLine: priceLine,
    trialLine: trialLine,
    kmLine: kmLine,
    firstName: firstName,
    initials: initials,
    framing: framing,
    esc: esc,
    card: card,
    skeletons: skeletons,
  };
})();
