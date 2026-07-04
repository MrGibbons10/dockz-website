/**
 * Dockz — Stripe webhook receiver (Vercel Function, zero dependencies)
 *
 * Stripe calls THIS endpoint (not the buyer's browser) when a payment
 * completes, so you get a reliable order record even if the buyer closes
 * the tab on the success page.
 *
 * Setup (once, in the Stripe Dashboard):
 *   Developers → Webhooks → Add endpoint
 *   URL:    https://YOUR-DOMAIN/api/stripe-webhook
 *   Events: checkout.session.completed
 *   Then copy the "Signing secret" (whsec_...) into the
 *   STRIPE_WEBHOOK_SECRET environment variable on Vercel.
 *
 * Required environment variables:
 *   STRIPE_SECRET_KEY      — sk_live_... / sk_test_...
 *   STRIPE_WEBHOOK_SECRET  — whsec_...
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { sendEmail, orderConfirmationEmail, orderAlertEmail } from '../lib/email.js';

const TOLERANCE_SECONDS = 300; // reject events older than 5 minutes (replay protection)

/* ---- verify Stripe's signature over the RAW request body ---- */
function verifySignature(rawBody, sigHeader, secret) {
  if (!sigHeader) return false;
  const parts = Object.fromEntries(
    sigHeader.split(',').map(kv => kv.split('=').map(s => s.trim())).filter(p => p.length === 2)
  );
  const timestamp = Number(parts.t);
  if (!timestamp || Math.abs(Date.now() / 1000 - timestamp) > TOLERANCE_SECONDS) return false;

  const expected = createHmac('sha256', secret)
    .update(`${parts.t}.${rawBody}`, 'utf8')
    .digest('hex');

  // Stripe may send several v1 signatures; accept if any matches.
  return sigHeader
    .split(',')
    .filter(kv => kv.trim().startsWith('v1='))
    .map(kv => kv.trim().slice(3))
    .some(sig => {
      try {
        return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(sig, 'hex'));
      } catch {
        return false;
      }
    });
}

export async function POST(request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error('STRIPE_WEBHOOK_SECRET is not set');
    return new Response('Webhook not configured', { status: 500 });
  }

  const rawBody = await request.text();
  const sig = request.headers.get('stripe-signature');

  if (!verifySignature(rawBody, sig, secret)) {
    return new Response('Invalid signature', { status: 400 });
  }

  const event = JSON.parse(rawBody);

  if (event.type === 'checkout.session.completed') {
    const s = event.data.object;
    const gbp = n => `£${((n ?? 0) / 100).toFixed(2)}`;

    // Pull the purchased line items so emails/logs show exactly what was bought.
    let items = [];
    try {
      const res = await fetch(
        `https://api.stripe.com/v1/checkout/sessions/${s.id}/line_items?limit=20`,
        { headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` } }
      );
      if (res.ok) {
        const li = await res.json();
        items = li.data.map(x => ({ qty: x.quantity, description: x.description, lineTotal: gbp(x.amount_total) }));
      }
    } catch { /* best-effort; fall back to metadata below */ }
    if (!items.length && s.metadata?.cart) {
      items = [{ qty: 1, description: s.metadata.cart, lineTotal: gbp(s.amount_total) }];
    }

    const order = {
      orderId: s.id,
      items,
      totalPaid: gbp(s.amount_total),
      shipTo: s.shipping_details?.address || s.customer_details?.address,
      name: s.customer_details?.name,
      email: s.customer_details?.email,
      phone: s.customer_details?.phone,
      hasPreorder: s.metadata?.has_preorder === 'yes',
      siteUrl: process.env.SITE_URL || 'https://dockz-website.vercel.app',
    };

    // Always keep the log line — it's the record of last resort in Vercel → Logs.
    console.log('🧾 NEW DOCKZ ORDER', JSON.stringify({
      session: order.orderId, paid: order.totalPaid, customer: order.email,
      name: order.name, phone: order.phone, ship_to: order.shipTo,
      items: items.map(i => `${i.qty}× ${i.description} (${i.lineTotal})`).join('; '),
      preorder: s.metadata?.has_preorder,
    }));

    // Branded order confirmation to the buyer…
    if (order.email) {
      try { await sendEmail({ to: order.email, ...orderConfirmationEmail(order) }); }
      catch (err) { console.error('Order confirmation email failed:', err.message); }
    }
    // …and a "new order" alert to your own inbox.
    if (process.env.GMAIL_USER) {
      try { await sendEmail({ to: process.env.GMAIL_USER, ...orderAlertEmail(order) }); }
      catch (err) { console.error('Order alert email failed:', err.message); }
    }
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
