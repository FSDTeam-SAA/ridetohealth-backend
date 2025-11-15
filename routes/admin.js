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

// Service Management.
router.post('/services', uploadFields, adminController.createService);
router.put('/services/:serviceId',  uploadFields, adminController.updateService);
router.delete('/services/:serviceId', adminController.deleteService);

// Vehicle Management
router.post('/services/:serviceId/vehicle', adminController.createVehicle);
router.put('/services/vehicle', adminController.assignedDriverToVehicle);



// Promo Code Management
router.post('/promo-codes', adminController.createPromoCode);
router.get('/promo-codes', adminController.getPromoCodes);
router.delete('/promo-codes/:promoCodeId', adminController.deletePromoCode);
router.put('/promo-codes/:promoCodeId', adminController.updatePromoCode);

// Commission
router.get('/commission/history', adminController.getCommissionHistory);
router.post('/commission', adminController.createCommission);

//notifications management

// User Management
router.get('/users', adminController.getAllUsers);
router.get('/users/:userId', adminController.getUserById);

module.exports = router;