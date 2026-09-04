// api/contact.js
// Vercel serverless function: receives a message from docs/contact.html
// and emails it to the shop via Resend (https://resend.com).
// No new npm dependency needed, just a plain fetch to Resend's HTTP API.
//
// Required env vars (set in the Vercel project settings):
//   RESEND_API_KEY    - from your Resend account
//   RESEND_FROM_EMAIL - optional, defaults to onboarding@resend.dev
//     (Resend's shared sending address; swap in a verified
//     themoonpenguinshop.com address later without any code changes)

const RESEND_API_URL = 'https://api.resend.com/emails';
const SHOP_ADDRESS = 'themoonpenguinshop@gmail.com';

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function sendEmail(payload) {
  const response = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(errText);
  }
  return response;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', 'https://themoonpenguinshop.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = req.body || {};
    const name = (body.name || '').trim();
    const email = (body.email || '').trim();
    const message = (body.message || '').trim();

    if (!name || !email || !message) {
      return res.status(400).json({ error: 'Name, email, and message are required' });
    }

    if (!process.env.RESEND_API_KEY) {
      console.error('RESEND_API_KEY is not set');
      return res.status(500).json({ error: 'Email service is not configured yet' });
    }

    const fromAddress = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';

    const notificationHtml = `
      <h2>New contact form message</h2>
      <table cellpadding="6" style="border-collapse:collapse;">
        <tr>
          <td style="font-weight:bold;vertical-align:top;">Name</td>
          <td>${escapeHtml(name)}</td>
        </tr>
        <tr>
          <td style="font-weight:bold;vertical-align:top;">Email</td>
          <td>${escapeHtml(email)}</td>
        </tr>
        <tr>
          <td style="font-weight:bold;vertical-align:top;">Message</td>
          <td>${escapeHtml(message).replace(/\n/g, '<br>')}</td>
        </tr>
      </table>
    `;

    try {
      await sendEmail({
        from: `The Moon Penguin Shop <${fromAddress}>`,
        to: [SHOP_ADDRESS],
        reply_to: email,
        subject: `Contact form message from ${name}`,
        html: notificationHtml,
      });
    } catch (err) {
      console.error('Resend error (contact notification):', err.message);
      return res.status(502).json({ error: 'Could not send the message. Please try again shortly.' });
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('contact error:', err);
    res.status(500).json({ error: err.message });
  }
};
