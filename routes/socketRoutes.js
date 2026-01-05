const express = require('express');
const router = express.Router();
const socketController = require('../controllers/socketController');
const { authenticateToken } = require('../middleware/auth');


router.use(authenticateToken);

router.post('/location-update', socketController.handleLocationUpdate);
router.post('/send-message', socketController.handleSendMessage);
router.get('/messages/:rideId', socketController.handleGetMessages);
router.post('/ride-status-update/:rideId', socketController.handleRideStatusUpdate);

module.exports = router;