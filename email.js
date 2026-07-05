/**
 * Dockz — email sending via Gmail, zero dependencies.
 *
 * Sends real email through Google's own mail server (smtp.gmail.com) using
 * your Gmail address + an "App Password", so messages genuinely come from
 * dockzofficial@gmail.com — no third-party email service needed.
 *
 * Required environment variables (Vercel → Settings → Environment Variables):
 *   GMAIL_USER          — dockzofficial@gmail.com
 *   GMAIL_APP_PASSWORD  — 16-character App Password (NOT your normal password;
 *                         see SETUP_BABY_STEPS.md for how to create one)
 *
 * Gmail sending limit is ~500 emails/day — plenty for launch. If Dockz grows
 * past that, swap this file for a transactional provider (Resend/Postmark).
 */

import { connect as tlsConnect } from 'node:tls';

/* ================= SMTP client ================= */

const SMTP_HOST = process.env.SMTP_HOST || 'smtp.gmail.com';
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
// test hook: allow self-signed certs only when explicitly enabled
const REJECT_UNAUTHORIZED = process.env.SMTP_ALLOW_SELF_SIGNED !== '1';

/** Read one full SMTP reply (handles multi-line "250-..." continuations). */
function readReply(socket, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    let buf = '';
    const onData = chunk => {
      buf += chunk.toString('utf8');
      // reply is complete when the last full line is "NNN<space>..." (not "NNN-")
      const lines = buf.split('\r\n').filter(Boolean);
      const last = lines[lines.length - 1];
      if (last && /^\d{3} /.test(last)) {
        cleanup();
        resolve({ code: Number(last.slice(0, 3)), text: buf });
      }
    };
    const onError = err => { cleanup(); reject(err); };
    const timer = setTimeout(() => { cleanup(); reject(new Error('SMTP timeout')); }, timeoutMs);
    const cleanup = () => { clearTimeout(timer); socket.off('data', onData); socket.off('error', onError); };
    socket.on('data', onData);
    socket.on('error', onError);
  });
}

async function command(socket, line, expectCode) {
  socket.write(line + '\r\n');
  const reply = await readReply(socket);
  if (reply.code !== expectCode) {
    throw new Error(`SMTP: expected ${expectCode} after "${line.slice(0, 20)}…", got: ${reply.text.trim().slice(0, 200)}`);
  }
  return reply;
}

const b64 = s => Buffer.from(s, 'utf8').toString('base64');
const wrap76 = s => s.replace(/(.{76})/g, '$1\r\n');

/**
 * Send one HTML email. Throws on failure.
 * @param {{to: string, subject: string, html: string, replyTo?: string}} msg
 */
export async function sendEmail({ to, subject, html, replyTo }) {
  const user = process.env.GMAIL_USER;
  const pass = (process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, ''); // app passwords are shown with spaces
  if (!user || !pass) throw new Error('GMAIL_USER / GMAIL_APP_PASSWORD not configured');

  const socket = await new Promise((resolve, reject) => {
    const s = tlsConnect(
      { host: SMTP_HOST, port: SMTP_PORT, servername: SMTP_HOST, rejectUnauthorized: REJECT_UNAUTHORIZED },
      () => resolve(s)
    );
    s.once('error', reject);
    s.setTimeout(20000, () => { s.destroy(); reject(new Error('SMTP connect timeout')); });
  });

  try {
    let reply = await readReply(socket);                       // 220 greeting
    if (reply.code !== 220) throw new Error(`SMTP greeting failed: ${reply.text.trim()}`);
    await command(socket, `EHLO dockz.local`, 250);
    await command(socket, `AUTH PLAIN ${b64(`\u0000${user}\u0000${pass}`)}`, 235);
    await command(socket, `MAIL FROM:<${user}>`, 250);
    await command(socket, `RCPT TO:<${to}>`, 250);
    await command(socket, 'DATA', 354);

    const message = [
      `From: Dockz <${user}>`,
      `To: <${to}>`,
      replyTo ? `Reply-To: <${replyTo}>` : null,
      `Subject: ${subject}`,
      `Date: ${new Date().toUTCString()}`,
      `Message-ID: <${Date.now()}.${Math.random().toString(36).slice(2)}@dockz>`,
      'MIME-Version: 1.0',
      'Content-Type: text/html; charset=utf-8',
      'Content-Transfer-Encoding: base64',
      '',
      wrap76(b64(html)),
    ].filter(l => l !== null).join('\r\n');

    socket.write(message + '\r\n.\r\n');
    reply = await readReply(socket);                           // 250 queued
    if (reply.code !== 250) throw new Error(`SMTP send failed: ${reply.text.trim().slice(0, 200)}`);
    socket.write('QUIT\r\n');
  } finally {
    socket.destroy();
  }
}

/* ================= Dockz email templates ================= */

const ACCENT = '#0e7490';
const SITE_NAME = 'Dockz';

/** Shared branded shell — dark card on dark background, matching the website. */
function shell(inner, previewText = '') {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#f2f4f7;">
  <div style="display:none;max-height:0;overflow:hidden;">${previewText}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f4f7;padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
        <tr><td style="padding:0 8px 18px;font-family:'Space Grotesk',Arial,sans-serif;font-size:24px;font-weight:700;color:#101623;letter-spacing:.5px;">
          Dock<span style="color:${ACCENT};">z</span>
        </td></tr>
        <tr><td style="background:#ffffff;border:1px solid rgba(16,22,35,.10);border-radius:20px;padding:36px 32px;font-family:Inter,Arial,sans-serif;color:#101623;">
          ${inner}
        </td></tr>
        <tr><td style="padding:20px 8px;font-family:Inter,Arial,sans-serif;font-size:12px;line-height:1.6;color:#8a92a3;">
          ${SITE_NAME} · 3D-printed wall docks for hands-free watching<br>
          You're receiving this because of your order or signup at our website.
          Questions? Just reply to this email.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

const btn = (href, label) =>
  `<a href="${href}" style="display:inline-block;background:${ACCENT};color:#ffffff;font-family:Inter,Arial,sans-serif;font-weight:700;font-size:15px;text-decoration:none;padding:13px 26px;border-radius:12px;">${label}</a>`;

/** Welcome email with the 10% code. */
export function welcomeEmail({ siteUrl, code = 'WELCOME10' }) {
  return {
    subject: 'Your 10% off Dockz is here 🎉',
    html: shell(`
      <h1 style="margin:0 0 14px;font-family:'Space Grotesk',Arial,sans-serif;font-size:26px;line-height:1.25;color:#101623;">Welcome to Dockz.</h1>
      <p style="margin:0 0 18px;font-size:15px;line-height:1.65;color:#4c5566;">
        Thanks for signing up! Here's your welcome discount — <b style="color:#101623;">10% off anything</b> in the shop.
        Use it at checkout whenever you're ready.
      </p>
      <div style="background:#f2f4f7;border:1px dashed rgba(14,116,144,.45);border-radius:14px;padding:20px;text-align:center;margin:0 0 22px;">
        <div style="font-size:12px;letter-spacing:2px;color:#8a92a3;text-transform:uppercase;margin-bottom:6px;">Your code</div>
        <div style="font-family:'Space Grotesk',Arial,sans-serif;font-size:28px;font-weight:700;letter-spacing:4px;color:${ACCENT};">${code}</div>
      </div>
      <p style="margin:0 0 24px;font-size:15px;line-height:1.65;color:#4c5566;">
        Stick it to your kitchen tiles, mirror or gym wall — snap your phone on at eye level
        and watch hands-free. No drills, no screws, no regret.
      </p>
      <div style="text-align:center;">${btn(siteUrl, 'Shop Dockz →')}</div>
    `, 'Your 10% off code is inside — use it at checkout.'),
  };
}

/** Order confirmation to the buyer. */
export function orderConfirmationEmail({ orderId, items, totalPaid, shipTo, name, hasPreorder, siteUrl }) {
  const itemRows = items.map(i => `
    <tr>
      <td style="padding:10px 0;font-size:14px;color:#101623;border-bottom:1px solid rgba(16,22,35,.08);">${i.qty}× ${i.description}</td>
      <td style="padding:10px 0;font-size:14px;color:#101623;border-bottom:1px solid rgba(16,22,35,.08);text-align:right;white-space:nowrap;">${i.lineTotal}</td>
    </tr>`).join('');

  const addr = shipTo
    ? [shipTo.line1, shipTo.line2, shipTo.city, shipTo.postal_code, shipTo.country].filter(Boolean).join(', ')
    : '—';

  return {
    subject: `Order confirmed — your Dockz is on its way to being made 🛠️`,
    html: shell(`
      <h1 style="margin:0 0 14px;font-family:'Space Grotesk',Arial,sans-serif;font-size:26px;line-height:1.25;color:#101623;">You're all docked in${name ? ', ' + name.split(' ')[0] : ''}.</h1>
      <p style="margin:0 0 22px;font-size:15px;line-height:1.65;color:#4c5566;">
        Thanks for your order! We 3D-print every Dockz in-house, so yours goes on the
        print bed shortly. We'll email you again the moment it ships.
        ${hasPreorder ? '<br><br><b style="color:#101623;">Heads up:</b> your order includes a pre-order item — we’ll keep you posted on timing.' : ''}
      </p>
      <div style="background:#f2f4f7;border-radius:14px;padding:18px 20px;margin:0 0 22px;">
        <div style="font-size:12px;letter-spacing:2px;color:#8a92a3;text-transform:uppercase;margin-bottom:4px;">Order reference</div>
        <div style="font-size:14px;color:#101623;word-break:break-all;">${orderId}</div>
      </div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 6px;">
        ${itemRows}
        <tr>
          <td style="padding:14px 0 0;font-size:15px;font-weight:700;color:#101623;">Total paid (incl. shipping)</td>
          <td style="padding:14px 0 0;font-size:15px;font-weight:700;color:${ACCENT};text-align:right;">${totalPaid}</td>
        </tr>
      </table>
      <p style="margin:20px 0 24px;font-size:14px;line-height:1.6;color:#4c5566;">
        <b style="color:#101623;">Shipping to:</b><br>${addr}
      </p>
      <div style="text-align:center;">${btn(siteUrl, 'Back to Dockz')}</div>
    `, 'Order confirmed — we’ll email you when it ships.'),
  };
}

/** Internal alert to you (new order). */
export function orderAlertEmail({ orderId, items, totalPaid, shipTo, name, email, phone, hasPreorder }) {
  const lines = items.map(i => `<li>${i.qty}× ${i.description} — ${i.lineTotal}</li>`).join('');
  const addr = shipTo
    ? [shipTo.line1, shipTo.line2, shipTo.city, shipTo.postal_code, shipTo.country].filter(Boolean).join(', ')
    : '—';
  return {
    subject: `🧾 NEW ORDER — ${totalPaid}${hasPreorder ? ' (incl. pre-order)' : ''}`,
    html: shell(`
      <h1 style="margin:0 0 14px;font-family:'Space Grotesk',Arial,sans-serif;font-size:22px;color:#101623;">New order in. Time to print. 🖨️</h1>
      <ul style="margin:0 0 16px;padding-left:18px;font-size:14px;line-height:1.7;color:#101623;">${lines}</ul>
      <p style="margin:0;font-size:14px;line-height:1.8;color:#4c5566;">
        <b style="color:#101623;">Total:</b> ${totalPaid}<br>
        <b style="color:#101623;">Customer:</b> ${name || '—'} · ${email || '—'} · ${phone || '—'}<br>
        <b style="color:#101623;">Ship to:</b> ${addr}<br>
        <b style="color:#101623;">Stripe ref:</b> ${orderId}
      </p>
    `),
  };
}

/** Internal alert to you (new subscriber). */
export function subscriberAlertEmail({ email }) {
  return {
    subject: `📬 New Dockz subscriber: ${email}`,
    html: shell(`
      <p style="margin:0;font-size:15px;line-height:1.7;color:#101623;">
        <b>${email}</b> just signed up for the 10% welcome offer.<br>
        <span style="color:#4c5566;font-size:13px;">Tip: search your inbox for "New Dockz subscriber" to see your full list.</span>
      </p>
    `),
  };
}
