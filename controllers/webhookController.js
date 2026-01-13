// controllers/webhookController.js
const dotenv = require('dotenv');
const Stripe = require('stripe');
const Payment = require('../models/Payment');
const Driver = require('../models/Driver');
const Ride = require('../models/Ride');

dotenv.config();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

class WebhookController {
  async handleWebhook(req, res) {
    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let event;

    try {
      // Use req.body since you're using express.raw() middleware
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err) {
      console.error('Webhook signature verification failed:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    try {
      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object;

          const result = await Payment.findOneAndUpdate(
            { stripeSessionId: session.id },
            { status: 'succeeded', paidAt: new Date() }
          );
          console.log('Payment record updated:', result);
          const ride = await Ride.findById(result.rideId.toString());
          ride.paymentStatus = 'paid';
          const check = await ride.save();
          break;
        }

        case 'payment_intent.payment_failed': {
          const failedPayment = event.data.object;
          console.log('Payment failed:', failedPayment.id);
          await Payment.findOneAndUpdate(
            { stripeSessionId: session.id },
            { status: 'failed' }
          );
          break;
        }

        case 'account.updated': {
          const account = event.data.object;
          console.log('Account updated:', account.id);
          await Driver.findOneAndUpdate(
            { stripeDriverId: account.id },
            { isStripeVerified: account.charges_enabled && account.payouts_enabled }
          );
          break;
        }

        case 'charge.refunded': {
          const refund = event.data.object;
          console.log('Refund processed:', refund.id);
          break;
        }

        default:
          console.log(`Unhandled event type: ${event.type}`);
      }

      res.json({ received: true });
    } catch (error) {
      console.error('Error processing webhook event:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
}

module.exports = new WebhookController();