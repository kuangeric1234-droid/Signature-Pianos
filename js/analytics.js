/* Signature Pianos · analytics, on every page
   ----------------------------------------------------------------------------
   Google Tag Manager, container GTM-WS654V8X (Eric, 5 Nov 2026). The container
   loads on the live site only (signaturepianos.com.au): previews, local runs
   and the admin never reach the reports. Anywhere else the events still go into
   window.dataLayer, so they can be checked in the browser, and
   ?gtm=on loads the container there too, marked traffic_type: internal, for
   Tag Manager's preview.

   The events, for the container's GA4 tags to send on:
     generate_lead  { form_type: guide | viewing | enquiry | reservation | rental }
                    pushed by js/office.js when the office keeps a form or starts a checkout
     phone_click    a tap on any tel: link
     email_click    a tap on any mailto: link
   Where a visitor came from (the QR's ?src=, the campaign's utm_ tags) goes with
   every form to the office, as js/office.js has always sent it.

   Loaded in the head, before anything else, as Tag Manager asks. */
(function () {
  'use strict';
  var GTM_ID = 'GTM-WS654V8X';
  var LIVE = ['signaturepianos.com.au', 'www.signaturepianos.com.au'];

  var w = window;
  w.dataLayer = w.dataLayer || [];
  w.gtag = w.gtag || function () { w.dataLayer.push(arguments); };

  var live = LIVE.indexOf(location.hostname) >= 0;
  var asked = false;
  try {
    var q = new URLSearchParams(location.search).get('gtm');
    if (q === 'on') sessionStorage.setItem('sp-gtm', '1');
    if (q === 'off') sessionStorage.removeItem('sp-gtm');
    asked = sessionStorage.getItem('sp-gtm') === '1';
  } catch (e) { /* no storage */ }

  // a hit from anywhere but the live site is GA4's "internal" traffic; the live site sends no traffic_type at all, so
  // GA4's own internal-traffic rules (the office's address) still apply to it (ANALYTICS_SETUP.md)
  if (!live) w.dataLayer.push({ traffic_type: 'internal' });
  if (GTM_ID && (live || asked)) {
    w.dataLayer.push({ 'gtm.start': new Date().getTime(), event: 'gtm.js' });
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtm.js?id=' + encodeURIComponent(GTM_ID);
    var first = document.getElementsByTagName('script')[0];
    if (first && first.parentNode) first.parentNode.insertBefore(s, first);
    else document.head.appendChild(s);
  }

  /** one event into the dataLayer: the pages and js/office.js call this */
  w.spTrack = function (event, params) {
    var o = { event: event };
    if (params) for (var k in params) o[k] = params[k];
    w.dataLayer.push(o);
  };

  // phone and email taps, wherever the link is
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href^="tel:"], a[href^="mailto:"]') : null;
    if (!a) return;
    var tel = a.getAttribute('href').indexOf('tel:') === 0;
    w.spTrack(tel ? 'phone_click' : 'email_click', { link_text: (a.textContent || '').trim().slice(0, 60), page_path: location.pathname });
  }, true);
})();
