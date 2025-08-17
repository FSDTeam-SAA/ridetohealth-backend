const User = require('../models/User');
const Ride = require('../models/Ride');
const { uploadToCloudinary } = require('../services/cloudinaryService');
const logger = require('../utils/logger');

class UserController {
  async getProfile(req, res) {
    try {
      const user = await User.findById(req.user.userId).select('-password');
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      res.json({
        success: true,
        data: user
      });
    } catch (error) {
      logger.error('Get profile error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  async updateProfile(req, res) {
    try {
      const updates = req.body;
      const allowedUpdates = ['fullName', 'email', 'phoneNumber'];
      const filteredUpdates = {};

      allowedUpdates.forEach(key => {
        if (updates[key] !== undefined) {
          filteredUpdates[key] = updates[key];
        }
      });

      const user = await User.findByIdAndUpdate(
        req.user.userId,
        filteredUpdates,
        { new: true, runValidators: true }
      ).select('-password');

      res.json({
        success: true,
        message: 'Profile updated successfully',
        data: user
      });
    } catch (error) {
      logger.error('Update profile error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  async uploadProfileImage(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'No image file provided'
        });
      }

      const imageUrl = await uploadToCloudinary(req.file.buffer, 'profile_images');

      await User.findByIdAndUpdate(req.user.userId, {
        profileImage: imageUrl
      });

      res.json({
        success: true,
        message: 'Profile image uploaded successfully',
        data: { profileImage: imageUrl }
      });
    } catch (error) {
      logger.error('Upload profile image error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  async updateLocation(req, res) {
    try {
      const { latitude, longitude, address } = req.body;

      await User.findByIdAndUpdate(req.user.userId, {
        currentLocation: {
          type: 'Point',
          coordinates: [longitude, latitude],
          address
        }
      });

      res.json({
        success: true,
        message: 'Location updated successfully'
      });
    } catch (error) {
      logger.error('Update location error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  async addSavedPlace(req, res) {
    try {
      const { name, address, latitude, longitude, type } = req.body;

      const user = await User.findById(req.user.userId);
      user.savedPlaces.push({
        name,
        address,
        coordinates: [longitude, latitude],
        type
      });

      await user.save();

      res.json({
        success: true,
        message: 'Saved place added successfully',
        data: user.savedPlaces
      });
    } catch (error) {
      logger.error('Add saved place error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  async getSavedPlaces(req, res) {
    try {
      const user = await User.findById(req.user.userId).select('savedPlaces');
      res.json({
        success: true,
        data: user.savedPlaces
      });
    } catch (error) {
      logger.error('Get saved places error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  async deleteSavedPlace(req, res) {
    try {
      const { placeId } = req.params;

      await User.findByIdAndUpdate(req.user.userId, {
        $pull: { savedPlaces: { _id: placeId } }
      });

      res.json({
        success: true,
        message: 'Saved place deleted successfully'
      });
    } catch (error) {
      logger.error('Delete saved place error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  async getRecentTrips(req, res) {
    try {
      const { page = 1, limit = 10 } = req.query;

      const rides = await Ride.find({ customerId: req.user.userId })
        .populate('driverId', 'userId')
        .populate('serviceId', 'name category')
        .sort({ createdAt: -1 })
        .limit(limit * 1)
        .skip((page - 1) * limit);

      const total = await Ride.countDocuments({ customerId: req.user.userId });

      res.json({
        success: true,
        data: {
          rides,
          pagination: {
            current: page,
            pages: Math.ceil(total / limit),
            total
          }
        }
      });
    } catch (error) {
      logger.error('Get recent trips error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  async addPaymentMethod(req, res) {
    try {
      const { type, cardNumber, cardHolderName, expiryDate, isDefault } = req.body;

      const user = await User.findById(req.user.userId);

      // If this is set as default, make others non-default
      if (isDefault) {
        user.paymentMethods.forEach(method => {
          method.isDefault = false;
        });
      }

      user.paymentMethods.push({
        type,
        cardNumber: cardNumber.slice(-4), // Store only last 4 digits
        cardHolderName,
        expiryDate,
        isDefault
      });

      await user.save();

      res.json({
        success: true,
        message: 'Payment method added successfully',
        data: user.paymentMethods
      });
    } catch (error) {
      logger.error('Add payment method error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  async getPaymentMethods(req, res) {
    try {
      const user = await User.findById(req.user.userId).select('paymentMethods wallet');
      res.json({
        success: true,
        data: {
          paymentMethods: user.paymentMethods,
          wallet: user.wallet
        }
      });
    } catch (error) {
      logger.error('Get payment methods error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  async deletePaymentMethod(req, res) {
    try {
      const { methodId } = req.params;

      await User.findByIdAndUpdate(req.user.userId, {
        $pull: { paymentMethods: { _id: methodId } }
      });

      res.json({
        success: true,
        message: 'Payment method deleted successfully'
      });
    } catch (error) {
      logger.error('Delete payment method error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  async updateNotificationSettings(req, res) {
    try {
      const { pushNotifications, emailNotifications, smsNotifications } = req.body;

      await User.findByIdAndUpdate(req.user.userId, {
        notificationSettings: {
          pushNotifications,
          emailNotifications,
          smsNotifications
        }
      });

      res.json({
        success: true,
        message: 'Notification settings updated successfully'
      });
    } catch (error) {
      logger.error('Update notification settings error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
}

module.exports = new UserController();