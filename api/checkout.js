// api/checkout.js
// Vercel serverless function, creates a Stripe checkout session.
//
// Accepts two request body shapes:
//   New (cart):   { items: [{ title, price, image, productId, quantity }, ...] }
//   Legacy (single item, kept for backward compatibility with older callers
//   like test-checkout.html): { title, price, image, productId }

const Stripe = require('stripe');

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const SUCCESS_URL = 'https://themoonpenguinshop.com/success.html';
const CANCEL_URL = 'https://themoonpenguinshop.com/shop.html';

const INTERNATIONAL_SHIPPING_COST = 2200; // $22.00 in cents

// Sales tax requires Stripe Tax to be configured in the Stripe Dashboard first
// (origin address + tax registrations for wherever you have nexus). Until then,
// leave ENABLE_SALES_TAX unset/false so checkout keeps working normally.
const SALES_TAX_ENABLED = process.env.ENABLE_SALES_TAX === 'true';

function normalizeItems(body) {
  if (Array.isArray(body.items) && body.items.length > 0) {
    return body.items.map(item => ({
      title: item.title,
      price: item.price,
      image: item.image,
      productId: item.productId,
      quantity: Math.max(1, parseInt(item.quantity, 10) || 1),
    }));
  }
  // Legacy single-item shape
  if (body.title && body.price) {
    return [{
      title: body.title,
      price: body.price,
      image: body.image,
      productId: body.productId,
      quantity: 1,
    }];
  }
  return [];
}

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
    const items = normalizeItems(req.body || {});

    if (items.length === 0) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    if (items.some(i => !i.title || !i.price)) {
      return res.status(400).json({ error: 'Each item needs a title and price' });
    }

    const line_items = items.map(item => ({
      price_data: {
        currency: 'usd',
        product_data: {
          name: item.title,
          images: item.image ? [item.image] : [],
          description: 'Handmade by TheMoonPenguinShop, made by hand in Westport, CT',
        },
        unit_amount: Math.round(item.price * 100),
        ...(SALES_TAX_ENABLED ? { tax_behavior: 'exclusive' } : {}),
      },
      quantity: item.quantity,
    }));

    const sessionConfig = {
      payment_method_types: ['card'],
      line_items,
      mode: 'payment',
      success_url: `${SUCCESS_URL}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: CANCEL_URL,
      shipping_address_collection: {
        allowed_countries: ['US', 'CA', 'GB', 'AU', 'NZ', 'IE', 'FR', 'DE', 'IT', 'ES', 'NL', 'BE', 'CH', 'AT', 'SE', 'NO', 'DK', 'FI', 'JP', 'KR', 'SG', 'HK', 'MX', 'BR', 'AR', 'CL', 'CO', 'IN', 'ZA', 'IL', 'AE', 'PT', 'GR', 'PL', 'CZ', 'HU', 'RO'],
      },
      shipping_options: [
        {
          shipping_rate_data: {
            type: 'fixed_amount',
            fixed_amount: { amount: 0, currency: 'usd' },
            display_name: 'US Addresses Only: Free Shipping',
            delivery_estimate: {
              minimum: { unit: 'business_day', value: 3 },
              maximum: { unit: 'business_day', value: 7 },
            },
          },
        },
        {
          shipping_rate_data: {
            type: 'fixed_amount',
            fixed_amount: { amount: INTERNATIONAL_SHIPPING_COST, currency: 'usd' },
            display_name: 'International (Outside US): $22.00',
            delivery_estimate: {
              minimum: { unit: 'business_day', value: 7 },
              maximum: { unit: 'business_day', value: 21 },
            },
          },
        },
      ],
      phone_number_collection: { enabled: true },
      custom_fields: [{
        key: 'gift_message',
        label: { type: 'custom', custom: 'Gift message (optional)' },
        type: 'text',
        optional: true,
      }],
      metadata: {
        product_ids: items.map(i => i.productId).join(','),
        product_titles: items.map(i => i.title).join(' | ').slice(0, 500),
        item_count: String(items.length),
      },
    };

    if (SALES_TAX_ENABLED) {
      sessionConfig.automatic_tax = { enabled: true };
    }

    const session = await stripe.checkout.sessions.create(sessionConfig);

    res.status(200).json({ sessionId: session.id });
  } catch (err) {
    console.error('Stripe error:', err);
    res.status(500).json({ error: err.message });
  }
};
