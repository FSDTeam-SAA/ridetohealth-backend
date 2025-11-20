const express = require('express');
const userController = require('../controllers/userController');
const { authenticateToken } = require('../middleware/auth');
const { upload }=require('../middleware/upload')
const router = express.Router();

router.use(authenticateToken);

router.get('/profile', userController.getProfile);
router.put('/profile', userController.updateProfile);
router.post('/profile/image', upload.single('image'), userController.uploadProfileImage);
router.put('/location', userController.updateLocation);
router.post('/saved-places', userController.addSavedPlace);
router.get('/saved-places', userController.getSavedPlaces);
router.delete('/saved-places/:placeId', userController.deleteSavedPlace);
router.get('/recent-trips', userController.getRecentTrips);
router.put('/notification-settings', userController.updateNotificationSettings);
router.get('/find-rider', userController.getRiderByDestination);

module.exports = router;