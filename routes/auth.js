const express = require('express');
const authController = require('../controllers/authController');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { uploadMultiple } = require('../middleware/upload');


const uploadFields = uploadMultiple([
  { name: 'license', maxCount: 1 },
  { name: 'nid', maxCount: 1 },
  { name: 'selfie', maxCount: 1 }
]);

router.post('/register', uploadFields, authController.register);
router.post('/login', authController.login);
router.post('/verify-otp', authController.verifyOTP);
router.post('/refresh-token', authenticateToken, authController.refreshToken);
router.post('/change-password', authenticateToken, authController.changePassword);
router.post('/request-password-reset', authController.requestPasswordReset);
router.post('/reset-password', authController.resetPassword);
router.post('/logout', authController.logout);

module.exports = router;