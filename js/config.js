/* Signature Pianos — shared config
   Loaded via <script src="/js/config.js"> on every page that needs Supabase.
   Always loaded AFTER the @supabase/supabase-js CDN bundle (which exposes
   window.supabase), and before any page-specific script that uses _supabase.

   TODO: replace the two placeholders below with the real project credentials.
   Never hardcode these values anywhere else in the codebase — every page
   that needs the database imports them from here. */

const SUPABASE_URL = 'https://ernwymzmwhscsjgrnouv.supabase.co'         // TODO: replace
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVybnd5bXptd2hzY3NqZ3Jub3V2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMTI5MzAsImV4cCI6MjA5NDY4ODkzMH0.0K1XNqno1r3EAs-555nogIyB-fwR73OwO84q7BdK-Go' // TODO: replace

// Stripe — browser-safe publishable key (pk_test_... / pk_live_...).
// Used by piano.html when initialising Stripe.js for Checkout. Safe to
// expose client-side; the server-only STRIPE_SECRET_KEY lives in Vercel.
const STRIPE_PUBLIC_KEY = 'YOUR_STRIPE_PUBLIC_KEY' // TODO: replace

const { createClient } = supabase
const _supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
