const express = require('express');
const adminController = require('../controllers/adminController');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { uploadMultiple } = require('../middleware/upload');
const { route } = require('./service');
const router = express.Router();

router.use(authenticateToken);



router.use(requireRole('admin'));

const uploadFields = uploadMultiple([
  { name: 'serviceImage', maxCount: 1 }
]);


// Dashboard
router.get('/dashboard/stats', adminController.getDashboardStats);

// Driver Management
router.get('/drivers', adminController.getDrivers);
router.put('/approved-driver/:driverId', adminController.approvedDriver);
router.put('/reject-driver/:driverId', adminController.rejectDriver);
router.get('/drivers/:driverId', adminController.getDriverById);
router.delete('/drivers/:driverId', adminController.deleteDriverById);

// Vehicle Management
router.post('/services/:serviceId/vehicle', adminController.createVehicle);
router.put('/services/vehicle/assign-vehicle', adminController.assignedDriverToVehicle);
router.get('/vehicle', adminController.getAllVehicles);
router.delete('/services/vehicle/:vehicleId', adminController.deleteVehicleById);
router.get('/services/:serviceId/vehicles', adminController.getVehiclesByService);
router.get('/services/vehicle/:vehicleId', adminController.getVechileById);



// Promo Code Management
router.post('/promo-codes', adminController.createPromoCode);
router.get('/promo-codes', adminController.getPromoCodes);
router.delete('/promo-codes/:promoCodeId', adminController.deletePromoCode);
router.put('/promo-codes/:promoCodeId', adminController.updatePromoCode);

// Commission Management
router.get('/commission/history', adminController.getCommissionHistory);
router.post('/commission', adminController.createCommission);

//notifications management

// User Management
router.get('/users', adminController.getAllUsers);
router.get('/users/:userId', adminController.getUserById);
router.delete('/users/:userId', adminController.deleteUserById);


module.exports = router;