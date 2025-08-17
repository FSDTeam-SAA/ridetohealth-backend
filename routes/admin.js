const express = require('express');
const adminController = require('../controllers/adminController');
const { authenticateToken, requireRole } = require('../middleware/auth');
const router = express.Router();

router.use(authenticateToken);
router.use(requireRole('admin'));

// Dashboard
router.get('/dashboard/stats', adminController.getDashboardStats);

// Driver Management
router.get('/drivers/pending', adminController.getPendingDrivers);
router.put('/drivers/:driverId/approve', adminController.approveDriver);
router.put('/drivers/:driverId/suspend', adminController.suspendDriver);

// Service Management
router.post('/services', adminController.createService);
router.put('/services/:serviceId', adminController.updateService);
router.delete('/services/:serviceId', adminController.deleteService);

// Promo Code Management
router.post('/promo-codes', adminController.createPromoCode);
router.get('/promo-codes', adminController.getPromoCodes);

// Reports Management
router.get('/reports', adminController.getReports);
router.put('/reports/:reportId', adminController.updateReport);

// User Management
router.get('/users', adminController.getAllUsers);

// Commission
router.get('/commission/history', adminController.getCommissionHistory);

module.exports = router;