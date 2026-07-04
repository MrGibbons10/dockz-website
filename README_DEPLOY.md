# Dockz — Deploying the site with Stripe payments

The site is now a tiny Vercel project with **zero npm dependencies**:

```
site/
├── index.html                        ← the whole storefront (unchanged look, real checkout)
├── api/
│   ├── create-checkout-session.js    ← builds a Stripe Checkout session (prices live here!)
│   └── stripe-webhook.js             ← Stripe tells this endpoint when someone pays
├── package.json                      ← metadata only, nothing to install
└── README_DEPLOY.md                  ← this file
```

How a purchase works: buyer clicks **Pay securely →** on your checkout page → the browser
sends the cart to `/api/create-checkout-session` → the server looks up the *real* prices
(so nobody can tamper with them), creates a Stripe Checkout session, and redirects the buyer
to Stripe's hosted payment page (card / Apple Pay / Google Pay, address + shipping choice)
→ on success Stripe sends them back to your site's confirmation page **and** pings
`/api/stripe-webhook` so the order is recorded even if they close the tab.

---

## 1. Put the site on Vercel (10 minutes, free)

1. Go to [vercel.com](https://vercel.com) and sign up (the free Hobby plan is fine).
2. Easiest path — **Vercel CLI**:
   ```bash
   npm i -g vercel
   cd site
   vercel          # answer the prompts, accept defaults
   ```
   Or push the `site/` folder to a GitHub repo and click **Add New → Project → Import** in Vercel.
3. You'll get a URL like `https://dockz.vercel.app`. (Add your own domain later under
   Project → Settings → Domains.)

## 2. Add your Stripe secret key

1. Stripe Dashboard → **Developers → API keys** → copy the **Secret key**.
   Start with the **test** key (`sk_test_...`) — flip the "Test mode" toggle in the dashboard.
2. Vercel → your project → **Settings → Environment Variables** → add:
   - `STRIPE_SECRET_KEY` = `sk_test_...`
3. Redeploy (Vercel → Deployments → ⋯ → Redeploy) so the variable takes effect.

## 3. Connect the webhook

1. Stripe Dashboard → **Developers → Webhooks → Add endpoint**.
2. URL: `https://YOUR-DOMAIN/api/stripe-webhook`
3. Select the single event **`checkout.session.completed`**.
4. Copy the endpoint's **Signing secret** (`whsec_...`) and add it in Vercel as:
   - `STRIPE_WEBHOOK_SECRET` = `whsec_...`
5. Redeploy once more.

## 4. Test the whole flow (still in test mode)

1. Open your deployed site, add a dock to the cart, hit **Pay securely →**.
2. On the Stripe page use the test card **4242 4242 4242 4242**, any future expiry,
   any CVC, any UK postcode.
3. You should land on the "Order confirmed 🎉" page, the payment should appear in the
   Stripe Dashboard (test mode), and the order log should show in Vercel → Project → **Logs**
   (look for `🧾 NEW DOCKZ ORDER`).
4. Also try cancelling on the Stripe page — you should come back to your cart with
   everything still in it.

## 5. Go live

1. Swap `STRIPE_SECRET_KEY` to your **live** key (`sk_live_...`).
2. Create a **second webhook endpoint** while the dashboard is in live mode
   (test and live webhooks are separate) and update `STRIPE_WEBHOOK_SECRET`
   with the live `whsec_...`.
3. Redeploy. Do one real £21 order yourself, then refund it from the dashboard. Done. 🚀

---

## Where to change things

All commerce settings live at the **top of `api/create-checkout-session.js`**:

| What | Where |
|---|---|
| Prices | `CATALOG` — amounts in **pence** (2100 = £21). Also update the displayed prices in `index.html`. |
| Free-shipping threshold | `FREE_UK_SHIPPING_FROM` (4000 = £40; `0` disables) |
| Shipping rates & delivery estimates | `SHIPPING_OPTIONS` (currently UK Standard £3.49, UK Express £5.49, Europe £9.99 — set these to your real Royal Mail rates) |
| Countries you ship to | `ALLOWED_COUNTRIES` |
| New product / finish | Add to `CATALOG` / `FINISHES` here **and** to `PRODUCTS` / `FINISH` in `index.html` |

## Notes

- **Getting notified of orders**: enable Stripe's own email for every successful payment
  (Dashboard → profile → Communication preferences), or watch the Vercel logs. The webhook
  is the right place to later plug in order-confirmation emails (e.g. Resend) or a
  Google Sheet — the TODO marker is in `stripe-webhook.js`.
- **Pre-orders (Dockz Pro)**: currently charged immediately and labelled "(pre-order)" on
  the Stripe page and receipt. If you'd rather not charge until it ships, we can switch
  the Pro to a setup-mode/deferred flow later.
- **VAT**: as a small/hobby seller under the UK VAT threshold you likely don't need
  anything. When you register for VAT, Stripe Tax can calculate it automatically —
  one extra parameter in the session, plus enabling it in the dashboard.
- Refunds, receipts, disputes: all handled from the Stripe Dashboard — nothing to build.
