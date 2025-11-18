const express = require('express');
const serviceController = require('../controllers/serviceController');
const { uploadMultiple } = require('../middleware/upload');
const { authenticateToken, requireRole } = require('../middleware/auth');
const router = express.Router();

router.get('/', serviceController.getAllServices);

router.use(authenticateToken);

router.get('/:serviceId', serviceController.getServiceById);

router.use(requireRole('admin'));

const uploadFields = uploadMultiple([
  { name: 'serviceImage', maxCount: 1 }
]);


router.post('/services', uploadFields, serviceController.createService);
router.put('/services/:serviceId',  uploadFields, serviceController.updateService);
router.delete('/services/:serviceId', serviceController.deleteService);

module.exports = router;

//getVehiclesByService