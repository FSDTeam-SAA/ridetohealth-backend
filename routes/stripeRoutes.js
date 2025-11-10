// routes/stripe.routes.js
const express = require('express');
const router = express.Router();

const driverController = require('../controllers/driverController');
const paymentController = require('../controllers/paymentController');
// const customerController = require('../controllers/rideController');
const webhookController = require('../controllers/webhookController');

// ============ DRIVER ROUTES ============
router.post('/driver/create-account', driverController.createDriverStripeAccount);
router.post('/driver/account-link', driverController.createAccountLink);
router.get('/driver/account-status/:accountId', driverController.checkDriverAccountStatus);

// ============ CUSTOMER ROUTES ============
// router.post('/customer/create', customerController.createCustomer);
// router.post('/customer/add-payment-method', customerController.addPaymentMethod);
// router.get('/customer/:customerId/payment-methods', customerController.listPaymentMethods);
// router.delete('/customer/payment-method/:paymentMethodId', customerController.deletePaymentMethod);

// ============ PAYMENT ROUTES ============
router.post('/payment/create', paymentController.createRidePayment);
router.post('/payment/confirm', paymentController.confirmPayment);
router.get('/payment/:paymentIntentId', paymentController.getPaymentDetails);
router.post('/payment/refund', paymentController.refundPayment);

// ============ WEBHOOK ROUTE ============
router.post('/webhook', express.raw({ type: 'application/json' }), webhookController.handleWebhook);

module.exports = router;