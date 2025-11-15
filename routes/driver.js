const express = require('express');
const driverController = require('../controllers/driverController');
const { authenticateToken } = require('../middleware/auth');
const { uploadMultiple } = require('../middleware/upload');
const router = express.Router();


const uploadFields = uploadMultiple([
  { name: 'license', maxCount: 1 },
  { name: 'nid', maxCount: 1 },
  { name: 'selfie', maxCount: 1 }
]);

// router.post('/register', uploadFields, driverController.register);

router.use(authenticateToken);

router.get('/profile', driverController.getProfile);
router.put('/profile', driverController.updateProfile);
router.put('/location', driverController.updateLocation);
router.put('/online-status', driverController.toggleOnlineStatus);
router.get('/trip-history', driverController.getTripHistory);
router.get('/earnings', driverController.getEarnings);
router.post('/withdrawal', driverController.requestWithdrawal);
router.get('/reviews', driverController.getReviews);
router.get('/get-vehicle', driverController.getVehicleInfo);
router.get('/get-login-history', driverController.loginHistory);
router.post('/send-request-to-admin', driverController.sendRequestToAdmin);

module.exports = router;