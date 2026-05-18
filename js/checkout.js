/* Signature Pianos — Checkout
   Stripe Checkout for single-piano purchases. AUD throughout (matches
   pianos.currency and orders.currency defaults in supabase/schema.sql).

   Adapted from stripe-samples/accept-a-payment/prebuilt-checkout-page,
   re-shaped around our schema: we want a row in `orders` to exist BEFORE
   the customer leaves for Stripe, so the session id can be stored back
   on the order as payment_reference and reconciled by webhook.

   Flow:
     1. startCheckout({ piano, customer }) inserts a row into `orders`
        (status='pending') and returns its id + auto-generated order_number.
     2. POST /api/create-checkout-session with the order details. The
        Vercel serverless handler creates a Stripe Checkout Session in
        mode='payment' with AUD line items and returns { url } (303-style)
        or { sessionId } (for client-side redirect fallback).
     3. Browser navigates to the Stripe-hosted page.
     4. On return, the success page reads ?session_id= and calls
        getCheckoutSession() to render confirmation + let the server
        update the order.

   Required _includes/scripts.html bits:
     - window.SP_CONFIG.stripePublicKey
     - Stripe.js (window.Stripe)
     - SPAuth (for the Supabase client that writes the pending order) */

(function (root) {
  'use strict';

  const cfg = root.SP_CONFIG || {};

  function getStripe() {
    if (!root.Stripe) {
      console.warn('[SP/checkout] Stripe.js not loaded');
      return null;
    }
    if (!cfg.stripePublicKey) {
      console.warn('[SP/checkout] SP_CONFIG.stripePublicKey missing');
      return null;
    }
    if (!root._spStripe) root._spStripe = root.Stripe(cfg.stripePublicKey);
    return root._spStripe;
  }

  /* Resolve the effective unit price in cents (Stripe wants integer minor units). */
  function priceFor(piano) {
    const dollars = Number(piano.sale_price || piano.price);
    const cents = Math.round(dollars * 100);
    if (!Number.isFinite(cents) || cents <= 0) {
      throw new Error('Invalid piano price');
    }
    return cents;
  }

  async function createPendingOrder({ piano, customer }) {
    if (!root.SPAuth || !root.SPAuth.client) {
      throw new Error('Supabase client unavailable — auth.js must load first');
    }
    const subtotal = Number(piano.price);
    const discount = piano.sale_price ? subtotal - Number(piano.sale_price) : 0;
    const total = subtotal - discount;

    const { data, error } = await root.SPAuth.client
      .from('orders')
      .insert({
        customer_id: customer.id,
        piano_id: piano.id,
        status: 'pending',
        subtotal,
        discount,
        total,
        currency: 'AUD',
        payment_method: 'stripe',
      })
      .select('id, order_number, total')
      .single();
    if (error) throw error;
    return data;
  }

  /* Kick off the checkout. `piano` must include { id, brand, model, price, sale_price? }
     and `customer` must include { id, email }. */
  async function startCheckout({ piano, customer, successUrl, cancelUrl }) {
    if (!piano || !piano.id) throw new Error('piano with id required');
    if (!customer || !customer.id) throw new Error('customer with id required');

    const order = await createPendingOrder({ piano, customer });

    const res = await fetch('/api/create-checkout-session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        orderId: order.id,
        orderNumber: order.order_number,
        pianoId: piano.id,
        pianoName: `${piano.brand} ${piano.model || ''}`.trim(),
        amount: priceFor(piano),
        currency: 'aud',
        customerEmail: customer.email,
        successUrl: successUrl || `${root.location.origin}/checkout-success.html?session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: cancelUrl || `${root.location.origin}/checkout-cancel.html`,
      }),
    });

    if (!res.ok) {
      const msg = await res.text();
      throw new Error(`create-checkout-session failed: ${msg}`);
    }

    const payload = await res.json();
    if (payload.url) {
      root.location.href = payload.url;
      return { url: payload.url, orderId: order.id };
    }
    /* Fallback: server only returned the session id — finish the redirect client-side. */
    const stripe = getStripe();
    if (stripe && payload.sessionId) {
      await stripe.redirectToCheckout({ sessionId: payload.sessionId });
      return { sessionId: payload.sessionId, orderId: order.id };
    }
    throw new Error('Checkout session response had no url or sessionId');
  }

  async function getCheckoutSession(sessionId) {
    if (!sessionId) return null;
    const res = await fetch(`/api/checkout-session?sessionId=${encodeURIComponent(sessionId)}`);
    if (!res.ok) throw new Error('Could not load Stripe session');
    return res.json();
  }

  function readSessionIdFromUrl() {
    return new URLSearchParams(root.location.search).get('session_id');
  }

  root.SPCheckout = {
    startCheckout,
    getCheckoutSession,
    readSessionIdFromUrl,
  };
})(window);
