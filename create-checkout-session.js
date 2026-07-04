/**
 * Dockz — Stripe Checkout session creator (Vercel Function, zero dependencies)
 *
 * POST /api/create-checkout-session
 * Body: { "items": [ { "id": "classic", "colour": "black", "qty": 2 }, ... ] }
 * Returns: { "url": "https://checkout.stripe.com/..." }
 *
 * Prices live HERE (server-side), not in the browser, so nobody can tamper
 * with them. If you change a price on the website, change it here too.
 *
 * Required environment variable (set in Vercel → Project → Settings → Environment Variables):
 *   STRIPE_SECRET_KEY  — your secret key, sk_live_... (or sk_test_... while testing)
 * Optional:
 *   SITE_URL           — e.g. https://dockz.co.uk  (fallback for redirect URLs;
 *                        if unset, the request's own origin is used)
 */

/* ---------------- catalogue (source of truth for prices) ---------------- */

const CURRENCY = 'gbp';

const CATALOG = {
  classic: { name: 'Dockz Classic', amount: 2100, preorder: false }, // £21.00
  pro:     { name: 'Dockz Pro',     amount: 3000, preorder: true  }, // £30.00
};

const FINISHES = {
  white: 'Matte White',
  black: 'Matte Black',
  grey:  'Matte Grey',
};

const MAX_QTY_PER_LINE = 10;

/* ---------------- shipping ----------------
 * Buyers pick one at checkout. Amounts in pence.
 * Free UK shipping automatically appears when the subtotal
 * reaches FREE_UK_SHIPPING_FROM (set to 0 to disable free shipping,
 * or to a huge number to never offer it).
 */
const FREE_UK_SHIPPING_FROM = 4000; // £40+

const SHIPPING_OPTIONS = [
  { name: 'UK Standard — Royal Mail Tracked 48', amount: 349, minDays: 2, maxDays: 4, ukOnly: true },
  { name: 'UK Express — Royal Mail Tracked 24',  amount: 549, minDays: 1, maxDays: 2, ukOnly: true },
  { name: 'Europe — International Tracked',      amount: 999, minDays: 5, maxDays: 10, ukOnly: false },
];

// UK + EU/EEA. Trim this list to wherever you actually want to ship.
const ALLOWED_COUNTRIES = [
  'GB', 'IE', 'FR', 'DE', 'NL', 'BE', 'LU', 'ES', 'PT', 'IT', 'AT',
  'DK', 'SE', 'FI', 'PL', 'CZ', 'SK', 'SI', 'HR', 'HU', 'RO', 'BG',
  'GR', 'EE', 'LV', 'LT', 'MT', 'CY', 'NO', 'CH',
];

/* ---------------- helpers ---------------- */

/**
 * Flatten a nested object/array into Stripe's bracketed form encoding:
 * { line_items: [{ price_data: { currency: 'gbp' } }] }
 *   → line_items[0][price_data][currency]=gbp
 */
function formEncode(obj, prefix = '', out = new URLSearchParams()) {
  for (const [key, val] of Object.entries(obj)) {
    if (val === undefined || val === null) continue;
    const name = prefix ? `${prefix}[${key}]` : key;
    if (typeof val === 'object') formEncode(val, name, out);
    else out.append(name, String(val));
  }
  return out;
}

async function stripeRequest(path, params, secretKey) {
  const res = await fetch(`https://api.stripe.com${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Stripe-Version': '2024-06-20',
    },
    body: formEncode(params).toString(),
  });
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data?.error?.message || `Stripe error (HTTP ${res.status})`);
    err.stripe = data?.error;
    throw err;
  }
  return data;
}

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

/* ---------------- handler ---------------- */

export async function POST(request) {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    console.error('STRIPE_SECRET_KEY is not set');
    return json({ error: 'Payments are not configured yet.' }, 500);
  }

  // ---- parse & validate the cart ----
  let items;
  try {
    ({ items } = await request.json());
  } catch {
    return json({ error: 'Invalid request body.' }, 400);
  }
  if (!Array.isArray(items) || items.length === 0 || items.length > 20) {
    return json({ error: 'Your cart is empty or invalid.' }, 400);
  }

  const lineItems = [];
  let subtotal = 0;
  let hasPreorder = false;

  for (const item of items) {
    const product = CATALOG[item?.id];
    const finish = FINISHES[item?.colour];
    const qty = Number(item?.qty);
    if (!product || !finish || !Number.isInteger(qty) || qty < 1 || qty > MAX_QTY_PER_LINE) {
      return json({ error: 'Your cart contains an invalid item — please refresh and try again.' }, 400);
    }
    if (product.preorder) hasPreorder = true;
    subtotal += product.amount * qty;

    lineItems.push({
      quantity: qty,
      price_data: {
        currency: CURRENCY,
        unit_amount: product.amount,
        product_data: {
          name: `${product.name} — ${finish}${product.preorder ? ' (pre-order)' : ''}`,
          metadata: { product_id: item.id, finish: item.colour },
        },
      },
    });
  }

  // ---- shipping choices for this order ----
  const shipping = [];
  if (FREE_UK_SHIPPING_FROM > 0 && subtotal >= FREE_UK_SHIPPING_FROM) {
    shipping.push({
      shipping_rate_data: {
        display_name: 'UK Standard — FREE (order over £40)',
        type: 'fixed_amount',
        fixed_amount: { amount: 0, currency: CURRENCY },
        delivery_estimate: {
          minimum: { unit: 'business_day', value: 2 },
          maximum: { unit: 'business_day', value: 4 },
        },
      },
    });
  }
  for (const s of SHIPPING_OPTIONS) {
    if (s.amount === 0) continue;
    // skip paid UK standard when free UK standard is on offer
    if (shipping.length && s.ukOnly && s.name.includes('Standard')) continue;
    shipping.push({
      shipping_rate_data: {
        display_name: s.name,
        type: 'fixed_amount',
        fixed_amount: { amount: s.amount, currency: CURRENCY },
        delivery_estimate: {
          minimum: { unit: 'business_day', value: s.minDays },
          maximum: { unit: 'business_day', value: s.maxDays },
        },
      },
    });
  }

  // ---- redirect URLs ----
  const origin =
    process.env.SITE_URL ||
    request.headers.get('origin') ||
    `https://${request.headers.get('host')}`;

  // ---- create the Checkout Session ----
  try {
    const session = await stripeRequest('/v1/checkout/sessions', {
      mode: 'payment',
      line_items: lineItems,
      shipping_address_collection: { allowed_countries: ALLOWED_COUNTRIES },
      shipping_options: shipping,
      phone_number_collection: { enabled: true },
      allow_promotion_codes: true,
      success_url: `${origin}/#/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/#/cart`,
      metadata: {
        source: 'dockz-website',
        has_preorder: hasPreorder ? 'yes' : 'no',
        cart: items.map(i => `${i.id}/${i.colour}x${i.qty}`).join(','),
      },
    }, secretKey);

    return json({ url: session.url });
  } catch (err) {
    console.error('Stripe checkout session failed:', err.stripe || err.message);
    return json({ error: 'Could not start checkout — please try again in a moment.' }, 502);
  }
}
