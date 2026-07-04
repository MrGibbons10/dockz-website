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

    // Pull the purchased line items so the log shows exactly what was bought.
    let itemsSummary = s.metadata?.cart || '(see dashboard)';
    try {
      const res = await fetch(
        `https://api.stripe.com/v1/checkout/sessions/${s.id}/line_items?limit=20`,
        { headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` } }
      );
      if (res.ok) {
        const li = await res.json();
        itemsSummary = li.data
          .map(x => `${x.quantity}× ${x.description} (${(x.amount_total / 100).toFixed(2)} ${x.currency.toUpperCase()})`)
          .join('; ');
      }
    } catch { /* summary is best-effort; the order is still recorded below */ }

    /* =====================================================================
       NEW ORDER — this is your fulfilment hook.
       Right now it logs to Vercel (Project → Logs). You'll ALSO get Stripe's
       own email notification for every payment if enabled in
       Dashboard → Settings → ... → Communication preferences.
       Later, plug in an email service (Resend/Postmark) or a Google Sheet here.
    ===================================================================== */
    console.log('🧾 NEW DOCKZ ORDER', JSON.stringify({
      session: s.id,
      paid: `${((s.amount_total ?? 0) / 100).toFixed(2)} ${(s.currency || 'gbp').toUpperCase()}`,
      customer: s.customer_details?.email,
      name: s.customer_details?.name,
      phone: s.customer_details?.phone,
      ship_to: s.shipping_details?.address || s.customer_details?.address,
      items: itemsSummary,
      preorder: s.metadata?.has_preorder,
    }));
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
