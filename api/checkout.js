// api/checkout.js
// Vercel serverless function — creates a Stripe checkout session

const Stripe = require('stripe');

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const SUCCESS_URL = 'https://themoonpenguinshop.com/success.html';
const CANCEL_URL = 'https://themoonpenguinshop.com/shop.html';

module.exports = async (req, res) => {
  // CORS headers
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
    const { title, price, image, productId } = req.body;

    if (!title || !price) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: title,
            images: image ? [image] : [],
            description: 'Handmade by TheMoonPenguinShop — made by hand in Westport, CT'
          },
          unit_amount: Math.round(price * 100), // convert to cents
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: `${SUCCESS_URL}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: CANCEL_URL,
      shipping_address_collection: {
        allowed_countries: ['US', 'CA', 'GB', 'AU', 'NZ', 'IE', 'FR', 'DE', 'IT', 'ES', 'NL', 'BE', 'CH', 'AT', 'SE', 'NO', 'DK', 'FI'],
      },
      phone_number_collection: { enabled: true },
      custom_fields: [{
        key: 'gift_message',
        label: { type: 'custom', custom: 'Gift message (optional)' },
        type: 'text',
        optional: true,
      }],
      metadata: {
        product_id: String(productId),
        product_title: title,
      },
    });

    res.status(200).json({ sessionId: session.id });
  } catch (err) {
    console.error('Stripe error:', err);
    res.status(500).json({ error: err.message });
  }
};
