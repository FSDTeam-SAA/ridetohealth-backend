// routes/ride.js
const express = require('express');
const rideController = require('../controllers/rideController');
const { authenticateToken } = require('../middleware/auth');
const router = express.Router();

router.use(authenticateToken);

router.post('/request', rideController.requestRide);
router.post('/:rideId/accept', rideController.acceptRide);
router.get('/:rideId/status', rideController.getRideStatus);
router.put('/:rideId/status', rideController.updateRideStatus);
router.post('/:rideId/cancel', rideController.cancelRide);
router.post('/:rideId/rate', rideController.rateRide);

module.exports = router;