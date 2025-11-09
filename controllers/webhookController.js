// // const { stripeSecret } = require('../config/config');
// // const stripe = require('stripe')(stripeSecret);
// import dotenv from 'dotenv';
// const Payment = require('../models/Payment');
// const Driver = require('../models/Driver');
// dotenv.config();
// import Stripe from 'stripe';

// const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);


// // Stripe Webhook Handler
// exports.handleWebhook = async (req, res) => {
//   const sig = req.headers['stripe-signature'];
//   const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

//   let event;

//   try {
//     event = stripe.webhooks.constructEvent(
//       req.body,
//       sig,
//       webhookSecret
//     );
//   } catch (err) {
//     console.error('Webhook signature verification failed:', err.message);
//     return res.status(400).send(`Webhook Error: ${err.message}`);
//   }

//   // Handle different event types
//   switch (event.type) {
//     case 'payment_intent.succeeded':
//       const paymentIntent = event.data.object;
//       console.log('Payment succeeded:', paymentIntent.id);
      
//       // TODO: Update payment status in database
//       await Payment.findOneAndUpdate(
//         { paymentIntentId: paymentIntent.id },
//         { status: 'succeeded', paidAt: new Date() }
//       );
//       break;

//     case 'payment_intent.payment_failed':
//       const failedPayment = event.data.object;
//       console.log('Payment failed:', failedPayment.id);
      
//       // TODO: Update payment status
//       await Payment.findOneAndUpdate(
//         { paymentIntentId: failedPayment.id },
//         { status: 'failed' }
//       );
//       break;

//     case 'account.updated':
//       const account = event.data.object;
//       console.log('Account updated:', account.id);
      
//       // TODO: Update driver verification status
//       await Driver.findOneAndUpdate(
//         { stripeConnectAccountId: account.id },
//         { isStripeVerified: account.charges_enabled && account.payouts_enabled }
//       );
//       break;

//     case 'charge.refunded':
//       const refund = event.data.object;
//       console.log('Refund processed:', refund.id);
//       break;

//     default:
//       console.log(`Unhandled event type: ${event.type}`);
//   }

//   res.json({ received: true });
// };


import dotenv from 'dotenv';
import Stripe from 'stripe';
import Payment from '../models/Payment.js';
import Driver from '../models/Driver.js';

dotenv.config();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export const handleWebhook = async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  switch (event.type) {
    case 'payment_intent.succeeded':
      const paymentIntent = event.data.object;
      console.log('Payment succeeded:', paymentIntent.id);
      await Payment.findOneAndUpdate(
        { paymentIntentId: paymentIntent.id },
        { status: 'succeeded', paidAt: new Date() }
      );
      break;

    case 'payment_intent.payment_failed':
      const failedPayment = event.data.object;
      console.log('Payment failed:', failedPayment.id);
      await Payment.findOneAndUpdate(
        { paymentIntentId: failedPayment.id },
        { status: 'failed' }
      );
      break;

    case 'account.updated':
      const account = event.data.object;
      console.log('Account updated:', account.id);
      await Driver.findOneAndUpdate(
        { stripeConnectAccountId: account.id },
        { isStripeVerified: account.charges_enabled && account.payouts_enabled }
      );
      break;

    case 'charge.refunded':
      const refund = event.data.object;
      console.log('Refund processed:', refund.id);
      break;

    default:
      console.log(`Unhandled event type: ${event.type}`);
  }

  res.json({ received: true });
};
