const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const User = require('../models/User');
const Ride = require('../models/Ride');
const PromoCode = require('../models/PromoCode');
const logger = require('../utils/logger');

class PaymentController {
  async addWalletBalance(req, res) {
    try {
      const { amount, paymentMethodId } = req.body;
      const userId = req.user.userId;

      // Create payment intent with Stripe
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount * 100, // Convert to cents
        currency: 'usd',
        payment_method: paymentMethodId,
        confirm: true,
        return_url: process.env.CLIENT_URL
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

  async processRidePayment(req, res) {
    try {
      const { rideId, paymentMethod, paymentMethodId } = req.body;

      const ride = await Ride.findById(rideId);
      if (!ride || ride.status !== 'completed') {
        return res.status(404).json({
          success: false,
          message: 'Ride not found or not completed'
        });
      }

      if (ride.paymentStatus === 'completed') {
        return res.status(400).json({
          success: false,
          message: 'Payment already processed'
        });
      }

      let paymentSuccess = false;

      if (paymentMethod === 'wallet') {
        const user = await User.findById(ride.customerId);
        if (user.wallet.balance >= ride.finalFare) {
          user.wallet.balance -= ride.finalFare;
          user.wallet.transactions.push({
            type: 'debit',
            amount: ride.finalFare,
            description: `Payment for ride ${ride._id}`
          });
          await user.save();
          paymentSuccess = true;
        }
      } else if (paymentMethod === 'card' && paymentMethodId) {
        try {
          const paymentIntent = await stripe.paymentIntents.create({
            amount: ride.finalFare * 100,
            currency: 'usd',
            payment_method: paymentMethodId,
            confirm: true,
            return_url: process.env.CLIENT_URL
          });

          if (paymentIntent.status === 'succeeded') {
            paymentSuccess = true;
          }
        } catch (stripeError) {
          logger.error('Stripe payment error:', stripeError);
        }
      } else if (paymentMethod === 'cash') {
        paymentSuccess = true; // Cash payment is handled offline
      }

      if (paymentSuccess) {
        ride.paymentStatus = 'completed';
        await ride.save();

        res.json({
          success: true,
          message: 'Payment processed successfully',
          data: {
            rideId: ride._id,
            amount: ride.finalFare,
            paymentMethod
          }
        });
      } else {
        ride.paymentStatus = 'failed';
        await ride.save();

        res.status(400).json({
          success: false,
          message: 'Payment failed'
        });
      }
    } catch (error) {
      logger.error('Process ride payment error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
}

module.exports = new PaymentController();
