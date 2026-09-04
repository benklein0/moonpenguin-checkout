// api/custom-order.js
// Vercel serverless function: receives a custom-order request from
// docs/customize.html, emails it to the shop via Resend
// (https://resend.com), and sends the customer their own confirmation.
// No new npm dependency needed, just a plain fetch to Resend's HTTP API.
//
// Required env vars (set in the Vercel project settings):
//   RESEND_API_KEY    - from your Resend account
//   RESEND_FROM_EMAIL - optional, defaults to onboarding@resend.dev
//     (Resend's shared sending address; swap in a verified
//     themoonpenguinshop.com address later without any code changes)

const RESEND_API_URL = 'https://api.resend.com/emails';
const SHOP_ADDRESSES = ['themoonpenguinshop@gmail.com', 'cvklein@optonline.net'];

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
    const productType = (body.productType || '').trim();
    const color = (body.color || '').trim();
    const baseMetal = (body.baseMetal || '').trim();
    const charm = (body.charm || '').trim();
    const name = (body.name || '').trim();
    const email = (body.email || '').trim();
    const notes = (body.notes || '').trim();

    if (!name || !email || !productType) {
      return res.status(400).json({ error: 'Name, email, and product type are required' });
    }

    if (!process.env.RESEND_API_KEY) {
      console.error('RESEND_API_KEY is not set');
      return res.status(500).json({ error: 'Email service is not configured yet' });
    }

    const fromAddress = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';

    const rows = [
      ['Product type', productType],
      ['Color', color || 'No preference'],
      ['Base metal', baseMetal || 'No preference'],
      ['Charm / theme', charm || 'No preference'],
      ['Customer name', name],
      ['Customer email', email],
      ['Notes', notes || '(none)'],
    ];

    const notificationHtml = `
      <h2>New custom order request</h2>
      <table cellpadding="6" style="border-collapse:collapse;">
        ${rows.map(([label, value]) => `
          <tr>
            <td style="font-weight:bold;vertical-align:top;">${escapeHtml(label)}</td>
            <td>${escapeHtml(value).replace(/\n/g, '<br>')}</td>
          </tr>
        `).join('')}
      </table>
    `;

    // Notify the shop. This one is required: if it fails, the request
    // failed, since nobody would know to make the piece.
    try {
      await sendEmail({
        from: `The Moon Penguin Shop <${fromAddress}>`,
        to: SHOP_ADDRESSES,
        reply_to: email,
        subject: `Custom order request from ${name}`,
        html: notificationHtml,
      });
    } catch (err) {
      console.error('Resend error (shop notification):', err.message);
      return res.status(502).json({ error: 'Could not send the request. Please try again shortly.' });
    }

    // Confirm to the customer. Best-effort: if this one fails, the shop
    // still got the request above, so we don't fail the whole submission
    // over it, just log it for later.
    const confirmationHtml = `
      <p>Hi ${escapeHtml(name)},</p>
      <p>Thanks for your custom order request! Here's what you sent us:</p>
      <table cellpadding="6" style="border-collapse:collapse;">
        ${rows.slice(0, 4).map(([label, value]) => `
          <tr>
            <td style="font-weight:bold;vertical-align:top;">${escapeHtml(label)}</td>
            <td>${escapeHtml(value)}</td>
          </tr>
        `).join('')}
      </table>
      <p>Camilla will follow up at this email address soon to talk through your piece. Custom pieces are made to order, so please allow extra time.</p>
      <p>Thank you,<br>The Moon Penguin Shop</p>
    `;
    try {
      await sendEmail({
        from: `The Moon Penguin Shop <${fromAddress}>`,
        to: [email],
        reply_to: SHOP_ADDRESSES[0],
        subject: 'We received your custom order request',
        html: confirmationHtml,
      });
    } catch (err) {
      console.error('Resend error (customer confirmation, non-fatal):', err.message);
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('custom-order error:', err);
    res.status(500).json({ error: err.message });
  }
};
