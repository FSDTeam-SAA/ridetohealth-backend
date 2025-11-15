const Driver = require("../models/Driver");
const User = require("../models/User");
const Ride = require("../models/Ride");
const { uploadToCloudinary } = require("../services/cloudinaryService");
const logger = require("../utils/logger");
const Stripe = require("stripe");
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const Notification = require("../models/Notification");

class DriverController {

  async getProfile(req, res) {
    try {
      const userId = req.user.userId;

      const driver = await User.findById(userId);

      if (!driver) {
        return res.status(404).json({
          success: false,
          message: "Driver profile not found",
        });
      }

      res.json({
        success: true,
        data: driver,
      });
    } catch (error) {
      logger.error("Get driver profile error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }
  async updateProfile(req, res) {
    try {
      
      const userId = req.user.userId; // Logged-in user ID
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ 
          success: false, 
          message: "User not found" 
        });
      }
      const {
        fullName,
        phoneNumber,
        street_address,
        city,
        state,
        zipcode,
        date_of_birth,
        emergency_contact,
      } = req.body;

      // ✅ Update User basic info
      await User.findByIdAndUpdate(userId, {
        fullName,
        phoneNumber,
        street_address,
        city,
        state,
        zipcode,
        date_of_birth,
        emergency_contact,
      });
      res.json({
        success: true,
        message: "Driver profile updated successfully",
        data: user,
      });
    } catch (error) {
      console.error("Update driver profile error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }

  // ============================================
// FILE: src/controllers/driverController.js
// ============================================

async updateLocation(req, res) {
    try {
      const { latitude, longitude, heading, speed } = req.body;
      const userId = req.user.userId;

      // Validate coordinates
      if (!latitude || !longitude) {
        return res.status(400).json({
          success: false,
          message: 'Latitude and longitude are required',
        });
      }

      // Update database
      const driver = await Driver.findOneAndUpdate(
        { userId },
        {
          currentLocation: {
            type: 'Point',
            coordinates: [longitude, latitude],
          },
          lastLocationUpdate: new Date(),
          ...(heading !== undefined && { heading }),
          ...(speed !== undefined && { speed }),
        },
        { new: true }
      );

      if (!driver) {
        return res.status(404).json({
          success: false,
          message: 'Driver not found',
        });
      }

      // Broadcast via Socket.IO
      const io = req.app.get('io');
      io.to(`driver:${userId}`).emit('driver-location-update', {
        driverId: userId,
        location: {
          latitude,
          longitude,
          ...(heading !== undefined && { heading }),
          ...(speed !== undefined && { speed }),
        },
        timestamp: new Date().toISOString(),
      });

      res.json({
        success: true,
        message: 'Location updated successfully',
        data: {
          location: {
            latitude,
            longitude,
          },
        },
      });
    } catch (error) {
      logger.error('Update driver location error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  }
  async toggleOnlineStatus(req, res) {
    try {
      const { isOnline } = req.body;
      const userId = req.user.userId;

      const driver = await Driver.findOneAndUpdate(
        { userId },
        { isOnline, isAvailable: isOnline },
        { new: true }
      );

      if (!driver) {
        return res.status(404).json({
          success: false,
          message: "Driver profile not found",
        });
      }

      res.json({
        success: true,
        message: `Driver is now ${isOnline ? "online" : "offline"}`,
        data: { isOnline: driver.isOnline, isAvailable: driver.isAvailable },
      });
    } catch (error) {
      logger.error("Toggle online status error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }

  async getTripHistory(req, res) {
    try {
      const { page = 1, limit = 10, status } = req.query;
      const userId = req.user.userId;
      const role = req.user.role; // <-- assuming token contains role

      // Check User Exists
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      // ==========================
      // 🔥 BUILD ROLE-BASED QUERY
      // ==========================
      let query = {};

      if (role === "driver") {
        const driver = await Driver.findOne({ userId });

        if (!driver) {
          return res.status(404).json({
            success: false,
            message: "Driver profile not found",
          });
        }

        query.driverId = driver.userId; // only own rides
      }

      // Admin → gets all rides (no driver filter)
      // Driver → gets only his rides (query.driverId already added)

      // ==========================
      // 🔥 STATUS FILTER (optional)
      // ==========================
      if (status) {
        query.status = { $regex: status, $options: "i" };
      }

      // ==========================
      // 🔥 FETCH DATA
      // ==========================
      const rides = await Ride.find(query)
        .populate("customerId", "fullName profileImage")
        .populate("serviceId", "name category")
        .sort({ createdAt: -1 })
        .limit(parseInt(limit))
        .skip((parseInt(page) - 1) * parseInt(limit));

      const total = await Ride.countDocuments(query);

      res.json({
        success: true,
        data: {
          rides,
          pagination: {
            current: parseInt(page),
            pages: Math.ceil(total / parseInt(limit)),
            total,
          },
        },
      });

    } catch (error) {
      logger.error("Get trip history error:", error);

      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }


  async getEarnings(req, res) {
    try {
      const userId = req.user.userId;
      const driver = await Driver.findOne({ userId });
      const driverId = driver._id;

      if (!driver) {
        return res.status(404).json({
          success: false,
          message: "Driver profile not found",
        });
      }

      const result = await Ride.aggregate([
        { $match: { driverId } },
        {
          $group: {
            _id: null,
            totalEstimatedFare: { $sum: "$estimatedFare" },
            totalRides: { $sum: 1 },
          },
        },
      ]);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error("Get driver earnings error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }

  async requestWithdrawal(req, res) {
    try {
      const { amount, bankDetails } = req.body;
      const userId = req.user.userId;

      const driver = await Driver.findOne({ userId });
      if (!driver) {
        return res.status(404).json({
          success: false,
          message: "Driver profile not found",
        });
      }

      if (amount > driver.earnings.available) {
        return res.status(400).json({
          success: false,
          message: "Insufficient available balance",
        });
      }

      // Create withdrawal request
      driver.withdrawals.push({
        amount,
        bankDetails,
        status: "pending",
      });

      // Update available earnings
      driver.earnings.available -= amount;

      await driver.save();

      res.json({
        success: true,
        message: "Withdrawal request submitted successfully",
        data: {
          requestId: driver.withdrawals[driver.withdrawals.length - 1]._id,
          amount,
          status: "pending",
        },
      });
    } catch (error) {
      logger.error("Request withdrawal error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }

  async getReviews(req, res) {
    try {
      const { page = 1, limit = 10 } = req.query;
      const userId = req.user.userId;

      const driver = await Driver.findOne({ userId });
      if (!driver) {
        return res.status(404).json({
          success: false,
          message: "Driver profile not found",
        });
      }

      const rides = await Ride.find({
        driverId: driver._id,
        "rating.customerToDriver.rating": { $exists: true },
      })
        .populate("customerId", "fullName profileImage")
        .select("rating.customerToDriver createdAt")
        .sort({ createdAt: -1 })
        .limit(limit * 1)
        .skip((page - 1) * limit);

      const total = await Ride.countDocuments({
        driverId: driver._id,
        "rating.customerToDriver.rating": { $exists: true },
      });

      res.json({
        success: true,
        data: {
          reviews: rides.map((ride) => ({
            customer: ride.customerId,
            rating: ride.rating.customerToDriver.rating,
            comment: ride.rating.customerToDriver.comment,
            date: ride.createdAt,
          })),
          pagination: {
            current: page,
            pages: Math.ceil(total / limit),
            total,
          },
          averageRating: driver.ratings.average,
          totalRatings: driver.ratings.count,
        },
      });
    } catch (error) {
      logger.error("Get driver reviews error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }

  // Get Driver loginhistory info
  async loginHistory(req, res) {
    try {
      const userId = req.user.userId;

      // Fetch user by ID and select only loginHistory field
      const user = await User.findById(userId).select("loginHistory");

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      res.json({
        success: true,
        message: "Login history fetched successfully",
        loginHistory: user.loginHistory,
      });
    } catch (error) {
      console.error("Get login history error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }

  // Get Driver Vehicle Info
  async getVehicleInfo(req, res) {
    try {
      const userId = req.user.userId;

      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      const driver = await Driver.findOne({ userId }).select(
        "vehicle"
      );

      if (!driver) {
        return res.status(404).json({
          success: false,
          message: "Driver not found",
        });
      }

      res.json({
        success: true,
        message: "Vehicle information fetched successfully",
        vehicle: driver,
        licenseNumber: user.licenseNumber,
        licenseImage: user.licenseImage,
      });
    } catch (error) {
      console.error("Get vehicle info error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }

  async sendRequestToAdmin(req, res) {
    try {

      const userId = req.user.userId;
      const { title, message, type} = req.body;
      const driver = await User.findById(userId);
      const driverId = driver._id;  

      if (!driver) {  
        return res.status(404).json({
          success: false,
          message: "Driver not found",
        });
      } 

      // Create a new notification
      const newNotification = new Notification({
        userId: userId,
        title: title || "Driver Request",
        message: message || "Driver has sent a request to admin.",
        type: type || "driver_request",
        data: { driverId: driverId, fullName: driver.fullName, email: driver.email },
      });
      await newNotification.save();

      res.json({
        success: true,
        message: "Request sent to admin successfully",
        data: newNotification
      });
    } catch (error) {
      console.error("Send request to admin error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }


  // Create Stripe Connect Account for Driver
  async createDriverStripeAccount(req, res) {
    try {
      const userId = req.user.userId;
      const user = await User.findById(userId);
      // const { driverId, email } = req.body;

      // const driver = await Driver.findById(driverId);
      const driver = await Driver.findOne({ userId });
      // console.log(driver);
      if (!driver) {
        return res.status(404).json({
          success: false,
          message: "Driver not found",
        });
      }

      const account = await stripe.accounts.create({
        
        type: 'express',
        email: user.email,
        business_type: 'individual',
        individual: {
          first_name: user.fullName,
          email: user.email,
          // phone: user.phone,
        },
        business_profile: {
          name: user.companyName,
          product_description: user.professionTitle,
          url: 'https://your-default-website.com/',
        },
        settings: {
          payments: {
            statement_descriptor: user.companyName,
          },
        },
      });
      if (!account) {
        throw new AppError(400, 'Failed to create stripe account');
      }

      // TODO: Save account.id to your driver database
      driver.stripeDriverId = account.id;
      await driver.save();


       const accountLink = await stripe.accountLinks.create({
        account: account.id,
        refresh_url: `${process.env.BASE_URL}/driver/onboarding/refresh`,
        return_url: `${process.env.BASE_URL}/driver/onboarding/success`,
        type: "account_onboarding",
      });

      res.json({
        success: true,
        accountId: account.id,
        message: "Stripe Connect account created",
        url: accountLink.url,
      });
    } catch (error) {
      console.log("Create Stripe account error:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
  /**
   * ✅ Contractor Dashboard Login Link
   */
  async getStripeDashboardLink(req, res) {
    try{

        const userId = req.user.userId;
        const user = await User.findById(userId);
        // console.log("user", user);
        const driver = await Driver.findOne({ userId: user._id });
        if (!driver || !driver.stripeDriverId)
          throw new AppError(404, "Stripe account not found");

        // console.log(driver)

        const loginLink = await stripe.accounts.createLoginLink(
          driver.stripeDriverId
        );

        // console.log("loginLink", loginLink);

        res.json({
          url: loginLink.url,
          message: "Stripe dashboard link created successfully",
        });
    }catch(error){
        console.error("Error getting Stripe dashboard link:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
          });
    }
  }

  // Check Driver Account Status
  async checkDriverAccountStatus(req, res) {
    
    try {
      const { accountId } = req.params;

      const account = await stripe.accounts.retrieve(accountId);

      const isVerified = account.charges_enabled && account.payouts_enabled;

      // TODO: Update driver database
      await Driver.findOneAndUpdate(
        { stripeDriverId: accountId },
        { isStripeVerified: isVerified }
      );

      res.json({
        success: true,
        isVerified: isVerified,
        chargesEnabled: account.charges_enabled,
        payoutsEnabled: account.payouts_enabled,
        detailsSubmitted: account.details_submitted,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
}

module.exports = new DriverController();
// module.exports = new RideController();
