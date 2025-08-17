const express = require('express');
const serviceController = require('../controllers/serviceController');
const { authenticateToken } = require('../middleware/auth');
const router = express.Router();

router.use(authenticateToken);

router.get('/', serviceController.getAllServices);
router.get('/:serviceId', serviceController.getServiceById);
router.get('/nearby/vehicles', serviceController.getNearbyVehicles);

module.exports = router;