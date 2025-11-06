const express = require('express');
const adminController = require('../controllers/adminController');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { uploadMultiple } = require('../middleware/upload');
const router = express.Router();

router.use(authenticateToken);
router.get('/categories', adminController.getAllCategories);
router.get('/categories/:categoryId', adminController.getCategoryById);



router.use(requireRole('admin'));

const uploadFields = uploadMultiple([
  { name: 'serviceImage', maxCount: 1 }
]);


// Dashboard
router.get('/dashboard/stats', adminController.getDashboardStats);

// Driver Management
router.get('/drivers/pending', adminController.getPendingDrivers);
router.put('/drivers/:driverId/approve', adminController.approveDriver);
router.put('/drivers/:driverId/suspend', adminController.suspendDriver);

// Service Management.
router.post('/services', adminController.createService);
router.put('/services/:serviceId', adminController.updateService);
router.delete('/services/:serviceId', adminController.deleteService);

// Category Management
router.post('/categories', uploadFields, adminController.createCategory);

router.put('/categories/:categoryId', uploadFields, adminController.updateCategory);
router.delete('/categories/:categoryId', adminController.deleteCategory);

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