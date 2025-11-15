const express = require('express');
const adminController = require('../controllers/adminController');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { uploadMultiple } = require('../middleware/upload');
const { route } = require('./service');
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
router.get('/drivers', adminController.getDrivers);

// Service Management.
router.post('/services', uploadFields, adminController.createService);
router.put('/services/:serviceId',  uploadFields, adminController.updateService);
router.delete('/services/:serviceId', adminController.deleteService);

// Vehicle Management
router.post('/services/:serviceId/vehicle', adminController.createVehicle);
router.put('/services/vehicle', adminController.assignedDriverToVehicle);

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