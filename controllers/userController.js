const User = require('../models/User');
const Ride = require('../models/Ride');
const Driver = require('../models/Driver');
const Service = require('../models/Service');
const { uploadToCloudinary } = require('../services/cloudinaryService');
const logger = require('../utils/logger');
const Vehicle = require('../models/Vehicle');
const Commission = require('../models/Commission');

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
      const userId = req.user.userId;
      const { fullName, email, phoneNumber, country, city, state, zipcode, street_address } = req.body;

      // Find user first
      const user = await User.findById(userId);
      // console.log(user);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Update allowed fields
      if (fullName) user.fullName = fullName;
      if (email) user.email = email;
      if (phoneNumber) user.phoneNumber = phoneNumber;
      if (country) user.country = country;
      if (city) user.city = city;
      if (state) user.state = state;
      if (zipcode) user.zipcode = zipcode;
      if (street_address) user.street_address = street_address;

      await user.save();

      res.json({
        success: true,
        message: 'Profile updated successfully',
        data: user
      });
    } catch (error) {
      console.error('Update profile error:', error);
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

      let imageUrl = null;
      const uploadImage = await uploadToCloudinary(req.file.buffer, 'profile_images');

      imageUrl = uploadImage.secure_url;


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

     if (
      user.savedPlaces &&
      user.savedPlaces.some(
        (place) =>
          place.address &&
          place.address.trim().toLowerCase() === address.trim().toLowerCase()
      )
    ) {
      return res.json({
        success: false,
        message: "This place is already saved"
      });
    }


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
      
      console.log(req.user.userId, "daskldfdafajlkl;l;lf");
      const userId = req.user.userId;
      const user = await User.findById(userId).select('savedPlaces');
      
      res.json({
        success: true,
        data: user.savedPlaces
      });
    } catch (error) {
      logger.error('Get saved places error:', error);
      res.status(500).json({
        success: false,
        message: error.message,
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
      console.log(req.user.userId);
      const rides = await Ride.find({ customerId: req.user.userId }).select('-rating -commission -route')
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

  async getRiderByDestination(req, res) {
  try {
    const { latitude, longitude } = req.query;

    // Validate input
    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        message: 'Latitude and longitude are required'
      });
    }

    // Find drivers near user location
    const drivers = await Driver.find({
      status: 'approved',
      isOnline: true,
      isAvailable: true,
      currentLocation: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [
              parseFloat(longitude),
              parseFloat(latitude)
            ]
          },
          $maxDistance: 5000000 // 100 km in meters
        }
      }
    }).populate('userId', 'fullName phoneNumber profileImage');

    // Check driver availability
    if (drivers.length === 0) {
      return res.json({
        success: false,
        message: 'No drivers found within 100 km.'
      });
    }

    // Get service/vehicle details for each driver
    const driverDetails = await Promise.all(
      drivers.map(async (driver) => {
        const vehicle = await Vehicle.findById(driver.vehicleId);
        const service = await Service.findById(vehicle?.serviceId);
        const commission = service ? await Commission.findOne({applicableServices:service._id}) : null;
        return {
          driver,
          vehicle,
          service,
          commission
        };
      })
    );

    return res.json({
      success: true,
      message: 'Nearby drivers found',
      data: driverDetails
    });

  } catch (error) {
    console.error('Get nearby drivers error:', error.message);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
}

}

module.exports = new UserController();