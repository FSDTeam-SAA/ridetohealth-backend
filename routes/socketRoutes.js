const express = require('express');
const router = express.Router();
const socketController = require('../controllers/socketController');
const { authenticateToken } = require('../middleware/auth');


router.use(authenticateToken);

router.post('/send-message', socketController.handleSendMessage);
router.get('/messages/:rideId', socketController.handleGetMessages);

module.exports = router;
