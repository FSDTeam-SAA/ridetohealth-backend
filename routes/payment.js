const express = require('express');
const paymentController = require('../controllers/paymentController');
const { authenticateToken } = require('../middleware/auth');
const router = express.Router();

router.use(authenticateToken);

router.post('/wallet/add-balance', paymentController.addWalletBalance);
router.get('/wallet/history', paymentController.getWalletHistory);
router.post('/promo/validate', paymentController.validatePromoCode);

module.exports = router;