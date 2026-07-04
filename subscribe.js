/**
 * Dockz — newsletter signup (the "10% off" popup posts here).
 *
 * POST /api/subscribe   Body: { "email": "person@example.com" }
 *  → sends the welcome email (with the WELCOME10 code) to the subscriber
 *  → sends a "new subscriber" alert to your own inbox, so your Gmail
 *    doubles as your mailing list (search: "New Dockz subscriber")
 *
 * Env vars needed: GMAIL_USER, GMAIL_APP_PASSWORD (see SETUP_BABY_STEPS.md)
 * The WELCOME10 code itself is created in the Stripe Dashboard (one-time step).
 */

import { sendEmail, welcomeEmail, subscriberAlertEmail } from '../lib/email.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export async function POST(request) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid request.' }, 400); }

  // honeypot: the popup includes a hidden "website" field real people never fill in
  if (body.website) return json({ ok: true });

  const email = String(body.email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 120) {
    return json({ error: 'That email doesn’t look right — mind checking it?' }, 400);
  }

  const siteUrl =
    process.env.SITE_URL ||
    request.headers.get('origin') ||
    `https://${request.headers.get('host')}`;

  try {
    await sendEmail({ to: email, ...welcomeEmail({ siteUrl }) });
  } catch (err) {
    console.error('Welcome email failed:', err.message);
    return json({ error: 'Could not send the email right now — please try again in a minute.' }, 502);
  }

  // best-effort self-alert; the subscriber already got their email
  try {
    await sendEmail({ to: process.env.GMAIL_USER, ...subscriberAlertEmail({ email }) });
  } catch (err) {
    console.error('Subscriber alert failed:', err.message);
  }

  return json({ ok: true });
}
