/* Signature Pianos — Auth
   Thin wrapper over @supabase/supabase-js v2 covering the four needs:
     - sign up (email + password, with profile metadata)
     - sign in (email + password, or magic link)
     - session persistence (handled by the Supabase client via localStorage)
     - protected-page redirects (requireAuth / redirectIfAuthed)

   Requires _includes/scripts.html to have loaded:
     1. window.SP_CONFIG.supabaseUrl + .supabaseAnonKey
     2. The @supabase/supabase-js v2 UMD bundle (exposes window.supabase)

   The exported API lives on window.SPAuth. See checkout.js + uploader.js
   for consumers. */

(function (root) {
  'use strict';

  const cfg = root.SP_CONFIG || {};

  if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) {
    console.warn('[SP/auth] window.SP_CONFIG.supabaseUrl / .supabaseAnonKey missing — SPAuth disabled');
    root.SPAuth = null;
    return;
  }
  if (!root.supabase || typeof root.supabase.createClient !== 'function') {
    console.warn('[SP/auth] @supabase/supabase-js UMD not loaded before auth.js');
    root.SPAuth = null;
    return;
  }

  const client = root.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: 'sp.auth',
    },
  });

  async function signUp({ email, password, first_name, last_name, phone }) {
    const { data, error } = await client.auth.signUp({
      email,
      password,
      options: {
        data: { first_name, last_name, phone },
        emailRedirectTo: `${root.location.origin}/portal/index.html`,
      },
    });
    if (error) throw error;
    return data;
  }

  async function signIn({ email, password }) {
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  }

  async function sendMagicLink(email, redirectTo) {
    const { data, error } = await client.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo || `${root.location.origin}/portal/index.html` },
    });
    if (error) throw error;
    return data;
  }

  async function signOut(redirectTo) {
    const { error } = await client.auth.signOut();
    if (error) throw error;
    if (redirectTo) root.location.href = redirectTo;
  }

  async function getSession() {
    const { data } = await client.auth.getSession();
    return data.session;
  }

  async function getUser() {
    const { data } = await client.auth.getUser();
    return data.user;
  }

  /* Gate a page. If unauthenticated, redirect to loginUrl with ?next=<current>.
     Returns the session if present, null if it redirected. */
  async function requireAuth(loginUrl) {
    const session = await getSession();
    if (!session) {
      const target = loginUrl || '/login.html';
      const next = encodeURIComponent(root.location.pathname + root.location.search);
      root.location.replace(`${target}?next=${next}`);
      return null;
    }
    return session;
  }

  /* Opposite of requireAuth — bounce already-logged-in users off the login page. */
  async function redirectIfAuthed(target) {
    const session = await getSession();
    if (session) root.location.replace(target || '/portal/index.html');
  }

  function onAuthStateChange(cb) {
    return client.auth.onAuthStateChange((event, session) => cb({ event, session }));
  }

  /* Resolve the ?next= param (set by requireAuth) on a login page. */
  function nextUrlFromQuery(fallback) {
    const params = new URLSearchParams(root.location.search);
    const next = params.get('next');
    if (next && next.startsWith('/')) return next;
    return fallback || '/portal/index.html';
  }

  root.SPAuth = {
    client,
    signUp,
    signIn,
    sendMagicLink,
    signOut,
    getSession,
    getUser,
    requireAuth,
    redirectIfAuthed,
    onAuthStateChange,
    nextUrlFromQuery,
  };
})(window);
