const Driver = require("../models/Driver");
const User = require("../models/User");
const Ride = require("../models/Ride");
const { uploadToCloudinary } = require("../services/cloudinaryService");
const logger = require("../utils/logger");
const Stripe = require("stripe");
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

class DriverController {
  async register(req, res) {
    try {
      const {
        licenseNumber,
        nidNumber,
        vehicle: vehicleString,
        serviceTypes,
        insuranceInformation,
      } = req.body;

      const userId = req.user.userId;
      console.log(insuranceInformation);

      // Check if driver already exists
      const existingDriver = await Driver.findOne({ userId });
      if (existingDriver) {
        return res.status(400).json({
          success: false,
          message: "Driver profile already exists",
        });
      }

      // Check for uploaded files
      if (
        !req.files ||
        !req.files.license ||
        !req.files.nid ||
        !req.files.selfie
      ) {
        return res.status(400).json({
          success: false,
          message: "All required documents must be uploaded",
        });
      }

      const vehicle = JSON.parse(vehicleString);
      // const insurance = insuranceInformation ? JSON.parse(insuranceInformation) : {};

      // Validate vehicle object
      if (
        !vehicle ||
        !vehicle.color ||
        !vehicle.model ||
        !vehicle.type ||
        !vehicle.plateNumber ||
        !vehicle.year
      ) {
        return res.status(400).json({
          success: false,
          message:
            "All vehicle fields (color, model, type, plateNumber, year) are required",
        });
      }

      // Parse serviceTypes if sent as string
      let serviceTypesArray = serviceTypes;
      if (typeof serviceTypes === "string") {
        try {
          serviceTypesArray = JSON.parse(serviceTypes);
        } catch (err) {
          return res.status(400).json({
            success: false,
            message:
              "Invalid serviceTypes format. Must be an array of ObjectIds.",
          });
        }
      }

      if (!Array.isArray(serviceTypesArray) || serviceTypesArray.length === 0) {
        return res.status(400).json({
          success: false,
          message: "At least one service type is required",
        });
      }

      // Upload documents to cloudinary
      const licenseImage = await uploadToCloudinary(
        req.files.license[0].buffer,
        "driver_documents"
      );
      const nidImage = await uploadToCloudinary(
        req.files.nid[0].buffer,
        "driver_documents"
      );
      const selfieImage = await uploadToCloudinary(
        req.files.selfie[0].buffer,
        "driver_documents"
      );

      let vehicleImage = null;
      if (req.files.vehicleImage) {
        vehicleImage = await uploadToCloudinary(
          req.files.vehicleImage[0].buffer,
          "vehicle_images"
        );
      }

      // Create driver
      const driver = new Driver({
        userId,
        licenseNumber,
        licenseImage,
        nidNumber,
        nidImage,
        selfieImage,
        vehicle: {
          ...vehicle,
          image: vehicleImage,
        },
        serviceTypes: serviceTypesArray,
        insuranceInformation: insuranceInformation,
      });
      // console.log(insurance);

      await driver.save();

      // Update user role to driver
      await User.findByIdAndUpdate(userId, { role: "driver" });

      res.status(201).json({
        success: true,
        message:
          "Driver registration submitted successfully. Awaiting admin approval.",
        data: { driverId: driver._id, status: driver.status },
      });
    } catch (error) {
      console.error("Driver registration error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }

  async getProfile(req, res) {
    try {
      const userId = req.user.userId;
      const driver = await Driver.findOne({ userId })
        .populate("userId", "fullName email phoneNumber profileImage")
        .populate("serviceTypes", "name category");

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
      const {
        fullName,
        phoneNumber,
        vehicle,
        serviceTypes,
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
      });

      // ✅ Update Driver info
      const driver = await Driver.findOneAndUpdate(
        { userId },
        {
          vehicle,
          serviceTypes,
          street_address,
          city,
          state,
          zipcode,
          date_of_birth,
          emergency_contact,
        },
        { new: true, runValidators: true }
      );

      if (!driver) {
        return res.status(404).json({
          success: false,
          message: "Driver profile not found",
        });
      }

      res.json({
        success: true,
        message: "Driver profile updated successfully",
        data: driver,
      });
    } catch (error) {
      console.error("Update driver profile error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }

  async updateLocation(req, res) {
    try {
      const { latitude, longitude } = req.body;
      const userId = req.user.userId;

      await Driver.findOneAndUpdate(
        { userId },
        {
          currentLocation: {
            type: "Point",
            coordinates: [longitude, latitude],
          },
        }
      );

      // Broadcast location to nearby customers
      const io = req.app.get("io");
      io.emit("driver_location_update", {
        driverId: userId,
        location: { latitude, longitude },
      });

      res.json({
        success: true,
        message: "Location updated successfully",
      });
    } catch (error) {
      logger.error("Update driver location error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
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
      const { page = 1, limit = 10, status } = req.query; // Accept status filter
      const userId = req.user.userId;

      const driver = await Driver.findOne({ userId });
      if (!driver) {
        return res.status(404).json({
          success: false,
          message: "Driver profile not found",
        });
      }

      // Build query dynamically
      const query = { driverId: driver.userId };
      if (status) {
        // Use regex for case-insensitive partial matching
        query.status = { $regex: status, $options: "i" };
      }

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
      logger.error("Get driver trip history error:", error);
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

      const driver = await Driver.findOne({ userId }).select(
        "vehicle licenseNumber licenseImage"
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
        data: driver,
      });
    } catch (error) {
      console.error("Get vehicle info error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }

  // Create Stripe Connect Account for Driver
  async createDriverStripeAccount(req, res) {
    try {
      const { driverId, email } = req.body;

      const driver = await Driver.findById(driverId);
      console.log(driver);
      if (!driver) {
        return res.status(404).json({
          success: false,
          message: "Driver not found",
        });
      }

      const account = await stripe.accounts.create({
        type: "express",
        country: "US",
        email: email,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
      });

      // TODO: Save account.id to your driver database
      driver.stripeDriverId = account.id;
      await driver.save();

      console.log(driver);

      // console.log('Stripe account created:', account.id, account);

      res.json({
        success: true,
        accountId: account.id,
        message: "Stripe Connect account created",
      });
    } catch (error) {
      console.log("Create Stripe account error:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  // Create Account Link for Driver Onboarding
  async createAccountLink(req, res) {
    try {
      const { accountId } = req.body;

      const accountLink = await stripe.accountLinks.create({
        account: accountId,
        refresh_url: `${process.env.BASE_URL}/driver/onboarding/refresh`,
        return_url: `${process.env.BASE_URL}/driver/onboarding/success`,
        type: "account_onboarding",
      });

      res.json({
        success: true,
        url: accountLink.url,
      });
    } catch (error) {
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
        console.log("user", user);
        const driver = await Driver.findOne({ userId: user._id });
        if (!driver || !driver.stripeDriverId)
          throw new AppError(404, "Stripe account not found");

        console.log(driver)

        const loginLink = await stripe.accounts.createLoginLink(
          driver.stripeDriverId
        );

        console.log("loginLink", loginLink);

        return {
          url: loginLink.url,
          message: "Stripe dashboard link created successfully",
        };
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
