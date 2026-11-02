/* Signature Pianos · the one setting that points the website at the office
   ----------------------------------------------------------------------------
   origin            The address of Signature Pianos Office (its PUBLIC_URL,
                     exactly: https://..., no path). Empty, every page keeps its
                     old ways: Supabase for the pianos, the site's own /api for
                     checkout and forms. Set it only at the switchover, on
                     Eric's word, once the office answers this website with CORS
                     (engine step E87).
   turnstileSiteKey  Cloudflare Turnstile's site key (public, not a secret), for
                     the bot check the office asks of every form and checkout.
                     Set it before the office's TURNSTILE_SECRET_KEY: with the
                     secret and no widget, the office refuses every real person.

   Loaded before js/office.js on the pages that read the office, and on demand
   by js/signature-book.js. For a local run, server.js answers this file from
   OFFICE_ORIGIN and TURNSTILE_SITE_KEY without editing it. */
window.SP_OFFICE_CONFIG = Object.freeze({
  origin: 'https://portal.signaturepianos.com.au',
  turnstileSiteKey: ''
});
