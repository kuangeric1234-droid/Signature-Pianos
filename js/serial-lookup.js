/* Signature Pianos · serial number lookup (/serial-number-lookup.html)
   ----------------------------------------------------------------------------
   Reads the makers' charts printed further down the page (every
   <dl data-chart> list: one <div><dt>year</dt><dd>first serial</dd></div>
   per year), so the table people can check and the answer they get always
   come from the same numbers. To correct or extend a chart, edit the HTML.

   The answer is written into the arch (#snOut). The maker and serial are
   kept in the address (?maker=yamaha&serial=1234567) so a result can be
   bookmarked or sent to someone. */
(function () {
  'use strict';

  var form = document.getElementById('snForm');
  var input = document.getElementById('snSerial');
  var out = document.getElementById('snOut');
  if (!form || !input || !out) return;

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  var NOW = new Date().getFullYear();
  var MAKERS = { yamaha: 'Yamaha', kawai: 'Kawai' };

  // ---- The charts, read from the page ----
  var charts = {};
  document.querySelectorAll('dl[data-chart]').forEach(function (list) {
    var rows = [];
    Array.prototype.forEach.call(list.children, function (row) {
      var dt = row.querySelector('dt');
      var dd = row.querySelector('dd');
      if (!dt || !dd) return;
      var year = parseInt(dt.textContent, 10);
      var from = parseInt(dd.textContent.replace(/\D/g, ''), 10);
      if (year && !isNaN(from)) rows.push({ year: year, from: from, el: row });
    });
    rows.sort(function (a, b) { return a.from - b.from; });
    var first = list.querySelector('dd');
    var shape = first ? first.textContent.trim().match(/^([A-Z]*)(\d+)$/) : null;
    charts[list.getAttribute('data-chart')] = {
      key: list.getAttribute('data-chart'),
      maker: list.getAttribute('data-maker'),
      place: list.getAttribute('data-place') || '',
      made: list.getAttribute('data-made') || '',
      rows: rows,
      closed: list.hasAttribute('data-closed'),
      prefix: shape ? shape[1] : '',
      width: shape ? shape[2].length : 0,
      details: list.closest('details')
    };
  });

  // ---- Helpers ----
  function fmt(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  // A serial as its chart prints it: 2,570,000, or J2212096 and H0004000
  function num(chart, n) {
    return chart.prefix ? chart.prefix + String(n).padStart(chart.width, '0') : fmt(n);
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function maker() {
    var checked = form.querySelector('input[name="maker"]:checked');
    return checked ? checked.value : 'yamaha';
  }

  // Tidy what people type: "No. 2,345,678" -> "2345678". Letters are kept,
  // upper-cased, for the maker rules to read.
  function tidy(raw) {
    return String(raw || '')
      .toUpperCase()
      .replace(/^\s*(NO|N°|#)\.?\s*/, '')
      .replace(/[\s,.\-\/]/g, '');
  }

  // Which chart a serial belongs to: RULES[maker](serial, raw) returns
  // { chart, number, shown, notes, alt, ceiling } or { problem: [paragraphs] }.
  var RULES = {};

  // What people type before the number, and whether a letter stands apart
  // from it ("J 3187751") or is joined to it ("J3187751").
  function stripNo(raw) {
    return String(raw || '').toUpperCase().trim().replace(/^(NO|N°|#)\.?\s*/, '');
  }
  var TYPED_MODEL = ['Type the serial number on its own, without the model name (like U1 or C3).',
    'Most serials are 5 to 7 digits; some start with a letter.'];

  // ---- Yamaha ----
  // No letter: made in Japan. Uprights and grands share one sequence there.
  // A letter joined to the number names another factory (Yamaha USA's chart):
  // J Jakarta, H Hangzhou, T Thomaston, U South Haven, YT Taoyuan. E is Kemble
  // in England, which has no published chart. A letter stamped with a gap
  // before the number is part of the model name (a U3H frame can read
  // "H 2044xxx"), so that piano is Japanese.
  RULES.yamaha = function (serial, raw) {
    var m = serial.match(/^([A-Z]{0,2})(\d+)([A-Z]?)$/);
    if (!m) return { problem: TYPED_MODEL };
    var prefix = m[1];
    var digits = m[2];
    var n = parseInt(digits, 10);
    var gap = /^[A-Z]{1,2}\s+\d/.test(stripNo(raw));
    var japan = charts['yamaha-japan'];
    var notes = m[3] ? ['We’ve read the number without the ' + m[3] + ' after it.'] : [];

    function asJapan(extra) {
      if (digits.length > 7) {
        return { problem: ['Yamaha pianos made in Japan have serial numbers of up to 7 digits. Check for an extra digit.'] };
      }
      var more = notes.slice();
      if (extra) more.push(extra);
      if (n >= 5610000 && n < 5790000) {
        more.push('Yamaha’s numbers jump from about 5.6 million in 1998 to 5.8 million in 1999, so a number in between is unusual. Check the digits.');
      }
      return { chart: japan, number: n, shown: (prefix ? prefix + ' ' : '') + digits, notes: more, ceiling: 6900000 };
    }
    function joined(key) {
      return { chart: charts[key], number: n, shown: prefix + digits, notes: notes };
    }
    var modelLetter = 'We’ve read the ' + prefix + ' as part of the model name and looked up the number on its own.';

    if (!prefix) return asJapan();
    if (gap) return asJapan('The ' + prefix + ' before the gap is part of the model name, so we’ve read the number on its own.');

    switch (prefix) {
      case 'J':
        if (digits.length === 7 && n >= 1500000) {
          var j = joined('yamaha-jakarta');
          j.alt = { chart: japan, number: n, lead: 'If there’s a gap between the J and the number on your piano, the J is part of the model name and it was made in Japan' };
          return j;
        }
        return asJapan(modelLetter);
      case 'H':
        if (digits.length === 7 && digits.charAt(0) === '0') return joined('yamaha-hangzhou');
        return asJapan(modelLetter);
      case 'T':
        if (digits.length === 6) return joined(n >= 500000 ? 'yamaha-thomaston-t5' : 'yamaha-thomaston');
        break;
      case 'U':
        if (digits.length === 6) return joined('yamaha-south-haven');
        return asJapan(modelLetter);
      case 'YT':
        if (digits.length === 6) return joined('yamaha-taiwan');
        break;
      case 'E':
        return { problem: ['An E joined to the number usually means the piano was built at Kemble in England, between about 1990 and 2009. Yamaha doesn’t publish a chart for those, so we can’t date it here.'] };
      default:
        if (prefix.length === 1) return asJapan(modelLetter);
    }
    return { problem: ['We don’t recognise that pattern. Yamaha serials are up to 7 digits, sometimes with a letter joined to the front (J, H, T, U or YT).'].concat(TYPED_MODEL.slice(0, 1)) };
  };

  // ---- Kawai ----
  // No letter: the main Japanese series, uprights and grands together.
  // F: Karawang, Indonesia. A: Lincolnton, North Carolina (1988 to 2004).
  // Kawai America's lookup adds short Japanese runs marked S, E and C, and two
  // plain-number runs (5 and 6 digits, from 1987) that overlap the main
  // series; for those we give the main answer and the other reading.
  // Kawai: "Starting letters other than A or F should be disregarded."
  RULES.kawai = function (serial) {
    var m = serial.match(/^([A-Z]{0,2})(\d+)$/);
    if (!m) return { problem: ['Type the serial number on its own, without the model name (like K-300).', 'Most Kawai serials are 4 to 7 digits; some start with F or A.'] };
    var prefix = m[1];
    var digits = m[2];
    var n = parseInt(digits, 10);

    function series(key) {
      return { chart: charts[key], number: n, shown: prefix + digits };
    }
    // A short run only counts if the number falls inside it
    function within(key) {
      var rows = charts[key].rows;
      return n >= rows[0].from && n <= rows[rows.length - 1].from + 2000;
    }

    if (prefix === 'F') return series('kawai-indonesia');
    if (prefix === 'A') return series('kawai-usa');
    if ((prefix === 'S' || prefix === 'E' || prefix === 'C') && within('kawai-' + prefix.toLowerCase())) {
      return series('kawai-' + prefix.toLowerCase());
    }
    if (digits.length > 7) {
      return { problem: ['Kawai serial numbers have up to 7 digits. Check for an extra digit.'] };
    }

    var notes = [];
    if (prefix) notes.push('Kawai says to ignore letters other than A or F at the start, so we’ve looked up the number on its own.');
    if (prefix === 'B') notes.push('Boston pianos, which Kawai builds for Steinway &amp; Sons, have their own B numbers, so this chart may not fit a Boston.');
    var pick = { chart: charts['kawai-japan'], number: n, shown: (prefix ? prefix + ' ' : '') + digits, notes: notes, ceiling: 2900000 };
    var lead = 'Kawai used the same numbers again on a smaller run from 1987. If your piano looks much newer than {year}, it’s from that run and was made';
    if (!prefix && within('kawai-japan-5')) pick.alt = { chart: charts['kawai-japan-5'], number: n, lead: lead };
    if (!prefix && within('kawai-japan-6')) pick.alt = { chart: charts['kawai-japan-6'], number: n, lead: lead };
    return pick;
  };

  function lookup(chart, n) {
    var rows = chart.rows;
    if (!rows.length) return null;
    if (n < rows[0].from) return { before: rows[0] };
    for (var i = rows.length - 1; i >= 0; i--) {
      if (n >= rows[i].from) {
        return { row: rows[i], next: rows[i + 1] || null, prev: rows[i - 1] || null, last: i === rows.length - 1 };
      }
    }
    return null;
  }

  // ---- Showing the answer ----
  var els = {
    label: out.querySelector('.sn-out-label'),
    year: out.querySelector('.sn-out-year'),
    script: out.querySelector('.sn-out-script'),
    facts: out.querySelector('.sn-out-facts'),
    links: out.querySelector('.sn-out-links')
  };
  var lastMatch = null;

  function show(state) {
    els.label.textContent = state.label;
    els.year.innerHTML = '<span>' + esc(state.year) + '</span>';
    els.year.classList.toggle('is-muted', !!state.muted);
    els.year.classList.toggle('is-long', String(state.year).length > 5);
    els.script.textContent = state.script || '';
    els.facts.innerHTML = (state.facts || []).map(function (p) { return '<p>' + p + '</p>'; }).join('');
    els.facts.hidden = !(state.facts && state.facts.length);
    els.links.innerHTML = (state.links || []).map(function (l) {
      return '<a class="sn-textlink' + (l.down ? ' sn-textlink--down' : '') + '" href="' + l.href + '"' +
        (l.chart ? ' data-show-chart="' + l.chart + '"' : '') + '>' + esc(l.text) +
        ' <i class="ti ' + (l.down ? 'ti-arrow-down' : 'ti-arrow-right') + '" aria-hidden="true"></i></a>';
    }).join('');

    if (lastMatch) lastMatch.classList.remove('is-match');
    lastMatch = state.match || null;
    if (lastMatch) lastMatch.classList.add('is-match');

    out.classList.remove('is-new');
    if (!reduced.matches) {
      void out.offsetWidth; // restart the animation
      out.classList.add('is-new');
    }
  }

  function showEmpty() {
    show({
      label: 'Your piano',
      year: '0000',
      muted: true,
      facts: ['Choose the maker, type the serial number and the year it was made appears here.']
    });
    out.classList.remove('is-new');
  }

  // The year (or span of years) a hit covers. The Japanese Yamaha chart skips
  // years early on (it only gains a row every 10,000 pianos), so some rows
  // cover several years: 1926 to 1933, say.
  function yearsOf(hit) {
    var start = hit.row.year;
    var end = hit.next ? hit.next.year - 1 : null;
    if (end !== null && end > start) {
      var short = String(start).slice(0, 2) === String(end).slice(0, 2) ? String(end).slice(2) : String(end);
      return { start: start, end: end, text: start + '–' + short, words: start + ' and ' + end };
    }
    return { start: start, end: start, text: String(start), words: String(start) };
  }

  function yearPhrase(chart, n) {
    var hit = lookup(chart, n);
    if (!hit) return '';
    if (hit.before) return 'before ' + hit.before.year;
    var y = yearsOf(hit);
    if (hit.last) return 'in ' + y.start + ' or later';
    return y.end > y.start ? 'between ' + y.words : 'in ' + y.text;
  }

  function answer(makerKey, raw) {
    var name = MAKERS[makerKey];
    var serial = tidy(raw);
    var where = { href: '#where', text: 'Where to find it', down: true };

    if (!serial) {
      return show({
        label: 'Serial number',
        year: '0000',
        muted: true,
        facts: ['Type the number stamped on the frame inside your ' + name + ', then press Find the year.'],
        links: [where]
      });
    }

    var picked = RULES[makerKey](serial, raw);
    if (picked.problem) {
      return show({ label: 'Check the number', year: '?', muted: true, facts: picked.problem, links: [where] });
    }

    var chart = picked.chart;
    var n = picked.number;
    var hit = lookup(chart, n);
    var label = name + ' · No. ' + esc(picked.shown || serial);
    var chartLink = { href: '#' + (chart.details ? chart.details.id : 'charts'), text: 'See it in the chart', down: true, chart: chart.key };
    var notes = picked.notes || [];

    if (!hit) {
      return show({ label: 'Check the number', year: '?', muted: true, facts: ['We couldn’t read that number. Check it and try again.'], links: [where] });
    }

    if (hit.before) {
      return show({
        label: label,
        year: 'Pre-' + hit.before.year,
        facts: [
          'That number is lower than any in ' + name + '’s chart for pianos ' + esc(chart.place) + ', which starts in <strong>' +
            hit.before.year + '</strong> at ' + num(chart, hit.before.from) + '. Your piano was probably made before then.',
          'Check the digits first: a missing digit makes a newer piano look much older.'
        ].concat(notes),
        links: [chartLink]
      });
    }

    // Far past the last number anyone has published: more likely a typo
    if (hit.last && picked.ceiling && n > picked.ceiling) {
      return show({
        label: 'Check the number',
        year: '?',
        muted: true,
        facts: ['That number is higher than any ' + name + ' has published for pianos ' + esc(chart.place) +
          ' (the chart ends at ' + num(chart, hit.row.from) + ' in ' + hit.row.year + '). Check for an extra digit.'],
        links: [where, chartLink]
      });
    }

    var row = hit.row;
    var y = yearsOf(hit);
    var facts = [];
    var yearText = y.text;

    if (hit.last && !chart.closed) {
      yearText = row.year + '+';
      facts.push('Numbers from ' + num(chart, row.from) + ' were made in <strong>' + row.year + ' or later</strong>. ' +
        name + '’s published chart stops there, so we can’t narrow it down further.');
    } else {
      var oldest = NOW - y.start;
      var newest = NOW - y.end;
      var age = y.end > y.start
        ? 'About ' + newest + ' to ' + oldest + ' years old.'
        : oldest <= 0 ? 'Made this year.' : oldest === 1 ? 'About a year old.' : 'About <strong>' + oldest + ' years</strong> old.';
      if (!hit.next) {
        // The last year of a series that has since ended (Thomaston's T5 numbers)
        facts.push(age + ' ' + name + ' used these numbers from ' + num(chart, row.from) + ' in ' + row.year + ', the last year of the series.');
      } else {
        var range = num(chart, row.from) + ' to ' + num(chart, hit.next.from - 1);
        facts.push(age + ' ' + (y.end > y.start
          ? name + '’s chart doesn’t split these years: numbers ' + range + ' were made between ' + y.words + '.'
          : name + ' numbered ' + range + ' in ' + row.year + '.'));
      }
      // Close to the turn of a year? Both makers say the dates can vary either side.
      var span = hit.next ? hit.next.from - row.from : 0;
      var into = span > 0 ? (n - row.from) / span : 0.5;
      if (y.end === y.start && hit.prev && into < 0.03) {
        facts.push('<span class="sn-out-pin" aria-hidden="true"></span>Your number is close to the start of ' + row.year +
          ', so it may have been finished late in ' + yearsOf({ row: hit.prev, next: row }).text + '.');
      } else if (y.end === y.start && hit.next && into > 0.97) {
        facts.push('<span class="sn-out-pin" aria-hidden="true"></span>Your number is close to the end of ' + row.year +
          ', so it may have been finished early in ' + hit.next.year + '.');
      }
    }
    if (picked.alt) {
      facts.push('<span class="sn-out-pin" aria-hidden="true"></span>' + picked.alt.lead.replace('{year}', y.text) + ' ' +
        yearPhrase(picked.alt.chart, picked.alt.number) + '.');
    }
    facts = facts.concat(notes);

    show({
      label: label,
      year: yearText,
      script: chart.made,
      facts: facts,
      match: row.el,
      links: [chartLink, { href: '/services/tuning-servicing.html', text: 'Book a tuning' }]
    });
  }

  // ---- Wiring ----
  function run(push) {
    var m = maker();
    answer(m, input.value);
    if (push !== false && window.history && history.replaceState) {
      var url = new URL(window.location.href);
      url.searchParams.set('maker', m);
      if (input.value.trim()) url.searchParams.set('serial', input.value.trim());
      else url.searchParams.delete('serial');
      url.hash = '';
      history.replaceState(null, '', url.pathname + url.search);
    }
    // On a phone the arch sits below the form: bring the answer into view
    if (window.matchMedia('(max-width: 1080px)').matches) {
      var box = out.getBoundingClientRect();
      if (box.top > window.innerHeight * 0.6 || box.bottom < 0) {
        out.closest('.sn-arch').scrollIntoView({ behavior: reduced.matches ? 'auto' : 'smooth', block: 'end' });
      }
    }
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    run();
  });

  // Switching maker re-reads the same number
  form.querySelectorAll('input[name="maker"]').forEach(function (radio) {
    radio.addEventListener('change', function () {
      if (input.value.trim()) run();
      else showEmpty();
      input.placeholder = radio.value === 'kawai' ? 'e.g. 1234567' : 'e.g. 2345678';
    });
  });

  // "See it in the chart": open the chart before jumping to it
  out.addEventListener('click', function (e) {
    var link = e.target.closest('[data-show-chart]');
    if (!link) return;
    var chart = charts[link.getAttribute('data-show-chart')];
    if (chart && chart.details) chart.details.open = true;
    var target = (lastMatch && chart && chart.details && chart.details.contains(lastMatch)) ? lastMatch : (chart && chart.details);
    if (target) {
      e.preventDefault();
      target.scrollIntoView({ behavior: reduced.matches ? 'auto' : 'smooth', block: 'center' });
    }
  });

  // Arriving with ?maker=kawai&serial=1234567
  var params = new URLSearchParams(window.location.search);
  var fromUrl = (params.get('maker') || '').toLowerCase();
  if (MAKERS[fromUrl]) {
    var radio = form.querySelector('input[name="maker"][value="' + fromUrl + '"]');
    if (radio) radio.checked = true;
  }
  if (params.get('serial')) {
    input.value = params.get('serial').slice(0, 20);
    run(false);
  } else {
    showEmpty();
  }

  window.spSerial = { charts: charts, tidy: tidy, rules: RULES, lookup: lookup };
})();
