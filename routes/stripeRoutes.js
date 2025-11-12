// routes/ride.js
const express = require('express');
const driverController = require('../controllers/driverController');
const { authenticateToken } = require('../middleware/auth');
const paymentController = require('../controllers/paymentController');
const router = express.Router();

router.use(authenticateToken);

// ============ DRIVER ROUTES ============
router.post('/driver/create-account', driverController.createDriverStripeAccount);
router.post('/driver/login-link', driverController.getStripeDashboardLink);
router.get('/driver/account-status/:accountId', driverController.checkDriverAccountStatus);



// ============ PAYMENT ROUTES ============
router.post('/payment/create', paymentController.createRidePayment);
router.get('/payment/:paymentIntentId', paymentController.getPaymentDetails);
router.post('/payment/refund', paymentController.refundPayment);

module.exports = router;