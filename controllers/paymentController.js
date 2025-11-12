const { stripeSecret, clientUrl } = require('../config/config');
const stripe = require('stripe')(stripeSecret);
const User = require('../models/User');
const Ride = require('../models/Ride');
const Driver = require('../models/Driver');
const Payment = require('../models/Payment');
const PromoCode = require('../models/PromoCode');
const logger = require('../utils/logger');

// import Stripe from 'stripe';

// export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

class PaymentController {
  
  async addWalletBalance(req, res) {
    try {
      const { amount, paymentMethodId } = req.body;
      const userId = req.user.userId;

      // Create payment intent with Stripe
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount * 100, 
        currency: 'usd',
        payment_method: paymentMethodId,
        confirm: true,
        return_url: clientUrl || 'http://localhost:3000'
      });

      if (paymentIntent.status === 'succeeded') {
        // Add balance to wallet
        const user = await User.findById(userId);
        user.wallet.balance += amount;
        user.wallet.transactions.push({
          type: 'credit',
          amount,
          description: 'Wallet top-up'
        });
        await user.save();

        res.json({
          success: true,
          message: 'Wallet balance added successfully',
          data: {
            newBalance: user.wallet.balance,
            transactionId: paymentIntent.id
          }
        });
      } else {
        res.status(400).json({
          success: false,
          message: 'Payment failed'
        });
      }
    } catch (error) {
      logger.error('Add wallet balance error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  async getWalletHistory(req, res) {
    try {
      const { page = 1, limit = 10 } = req.query;
      const userId = req.user.userId;

      const user = await User.findById(userId).select('wallet');
      
      const transactions = user.wallet.transactions
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice((page - 1) * limit, page * limit);

      const total = user.wallet.transactions.length;

      res.json({
        success: true,
        data: {
          balance: user.wallet.balance,
          transactions,
          pagination: {
            current: page,
            pages: Math.ceil(total / limit),
            total
          }
        }
      });
    } catch (error) {
      logger.error('Get wallet history error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  async validatePromoCode(req, res) {
    try {
      const { code, serviceId, fareAmount } = req.body;

      const promo = await PromoCode.findOne({
        code: code.toUpperCase(),
        isActive: true,
        validFrom: { $lte: new Date() },
        validUntil: { $gte: new Date() }
      });

      if (!promo) {
        return res.status(404).json({
          success: false,
          message: 'Invalid or expired promo code'
        });
      }

      if (promo.usageLimit && promo.usedCount >= promo.usageLimit) {
        return res.status(400).json({
          success: false,
          message: 'Promo code usage limit exceeded'
        });
      }

      if (fareAmount < promo.minimumOrderValue) {
        return res.status(400).json({
          success: false,
          message: `Minimum order value should be ${promo.minimumOrderValue}`
        });
      }

      if (promo.applicableServices.length > 0 && !promo.applicableServices.includes(serviceId)) {
        return res.status(400).json({
          success: false,
          message: 'Promo code not applicable for this service'
        });
      }

      let discount = 0;
      if (promo.discountType === 'percentage') {
        discount = Math.min(fareAmount * (promo.discountValue / 100), promo.maxDiscount || fareAmount);
      } else {
        discount = Math.min(promo.discountValue, fareAmount);
      }

      res.json({
        success: true,
        message: 'Promo code is valid',
        data: {
          discount,
          finalAmount: fareAmount - discount,
          promoDetails: {
            title: promo.title,
            code: promo.code,
            discountType: promo.discountType,
            discountValue: promo.discountValue
          }
        }
      });
    } catch (error) {
      logger.error('Validate promo code error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  

 async createRidePayment (req, res) {
    try {
      const rideId = req.user.userId; // or your ride/project id
      const { amount, stripeDriverId, driverId, title } = req.body;

      if (!amount || !stripeDriverId || !driverId) {
        return res.status(400).json({ success: false, error: 'Missing required fields' });
      }

      // Calculate split amounts
      const totalAmount = amount;
      const adminFee = Math.round(totalAmount * 0.05); // 5%
      const driverAmount = totalAmount - adminFee;

      // Create Checkout Session
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: { name: title || 'Ride Payment' },
              unit_amount: totalAmount,
            },
            quantity: 1,
          },
        ],
        mode: 'payment',
        success_url: `${clientUrl}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${clientUrl}/payment/cancel`,
        payment_intent_data: {
          application_fee_amount: adminFee,
          transfer_data: {
            destination: stripeDriverId,
          },
          metadata: {
            rideId,
            driverId,
            adminFee,
            driverAmount,
          },
        },
      });
      // Save payment info to database
      await Payment.create({
        rideId,
        driverId,
        amount: totalAmount,
        adminFee,
        driverAmount,
        success_url: session.success_url,
        status: 'pending',
      });

      res.json({
        success: true,
        url: session.url,
        sessionId: session.id,
        breakdown: {
          total: totalAmount / 100,
          adminFee: adminFee / 100,
          driverAmount: driverAmount / 100,
        },
      });
    } catch (error) {
      console.error('Error creating checkout session:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  };

  // Get Payment Details
   async getPaymentDetails (req, res) {
    try {
      const { paymentIntentId } = req.params;

      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

      res.json({
        success: true,
        payment: {
          id: paymentIntent.id,
          amount: paymentIntent.amount / 100,
          status: paymentIntent.status,
          created: new Date(paymentIntent.created * 1000),
          metadata: paymentIntent.metadata
        }
      });
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  };

  // Refund Payment
  async refundPayment (req, res){
    try {
      const { paymentIntentId, amount, reason } = req.body;

      const refund = await stripe.refunds.create({
        payment_intent: paymentIntentId,
        amount: amount,
        reason: reason || 'requested_by_customer',
        reverse_transfer: true, // Reverses transfer to driver
        refund_application_fee: true // Refunds admin fee
      });

      res.json({
        success: true,
        refund: {
          id: refund.id,
          amount: refund.amount / 100,
          status: refund.status
        }
      });
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  };
}

module.exports = new PaymentController();
