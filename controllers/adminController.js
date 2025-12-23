const User = require('../models/User');
const Driver = require('../models/Driver');
const Ride = require('../models/Ride');
const Service = require('../models/Service');
const Vehicle = require('../models/Vehicle');
const PromoCode = require('../models/PromoCode');
const Commission = require('../models/Commission');
const Report = require('../models/Report');
const Notification = require('../models/Notification');
const { sendNotification } = require('../services/notificationService');
const logger = require('../utils/logger');
const Category = require('../models/Category');
const { uploadToCloudinary } = require('../services/cloudinaryService');


class AdminController {
  
  // === Dashboard ===
  async getDashboardStats(req, res) {
    try {
      const [
        totalUsers,
        totalDrivers,
        totalRides,
        totalRevenue,
        activeRides,
        pendingDrivers,
        pendingReports
      ] = await Promise.all([
        User.countDocuments({ role: 'customer' }),
        Driver.countDocuments({ status: 'approved' }),
        Ride.countDocuments(),
        Ride.aggregate([
          { $match: { status: 'completed' } },
          { $group: { _id: null, total: { $sum: '$commission.amount' } } }
        ]),
        Ride.countDocuments({ status: { $in: ['requested', 'accepted', 'in_progress'] } }),
        Driver.countDocuments({ status: 'pending' }),
        Report.countDocuments({ status: 'pending' })
      ]);

      const revenue = totalRevenue.length > 0 ? totalRevenue[0].total : 0;

      const monthlyStats = await Ride.aggregate([
        {
          $match: {
            createdAt: { $gte: new Date(new Date().setMonth(new Date().getMonth() - 12)) }
          }
        },
        {
          $group: {
            _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } },
            rides: { $sum: 1 },
            revenue: { $sum: '$commission.amount' }
          }
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } }
      ]);

      res.json({
        success: true,
        data: {
          overview: {
            totalUsers,
            totalDrivers,
            totalRides,
            totalRevenue: revenue,
            activeRides,
            pendingDrivers,
            pendingReports
          },
          monthlyStats
        }
      });
    } catch (error) {
      logger.error('Get dashboard stats error:', error);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  // === Driver Management ===
  async getDrivers(req, res) {
    try {
      const { status } = req.query;
      let { page, limit } = req.query;

      page = parseInt(page) || 1;
      limit = parseInt(limit) || 10;
      const skip = (page - 1) * limit;

      // Build query object
      const query = {};
      if (status) {
        query.status = status;
      }

      // Fetch drivers with pagination and populate user info
      const drivers = await Driver.find(query)
        .populate('userId', 'fullName email phoneNumber profileImage')
        .populate('serviceId')
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 });

      // Get completed rides count for each driver
      const driversWithRideCount = await Promise.all(
        drivers.map(async (driver) => {
          const completedRidesCount = await Ride.countDocuments({
            driverId: driver._id,
            status: 'completed'
          });

          return {
            ...driver.toObject(),
            completedRides: completedRidesCount
          };
        })
      );

      // Get total count for pagination metadata
      const totalDrivers = await Driver.countDocuments(query);

      res.json({
        success: true,
        page,
        totalPages: Math.ceil(totalDrivers / limit),
        totalDrivers,
        data: driversWithRideCount
      });
    } catch (error) {
      logger.error('Get drivers error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  async getDriverById(req, res) {
    try {

      const { driverId } = req.params;

      const driver = await Driver.findById(driverId)
        .populate('userId', 'fullName email phoneNumber profileImage')
        .populate('vehicleId');

      if (!driver) {  
        return res.status(404).json({ success: false, message: 'Driver not found' });
      }

      res.json({ 
        success: true,
        message: 'Driver fetched successfully',
        data: driver 
      });
    } catch (error) {
      logger.error('Get driver by ID error:', error);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  async deleteDriverById(req, res) {
    try {

      const { driverId } = req.params;
      const driver = await Driver.findByIdAndDelete(driverId);

      if (!driver) {
        return res.status(404).json({ success: false, message: 'Driver not found' });
      }

      res.json({ 
        success: true, 
        message: 'Driver deleted successfully' 
      });
    } catch (error) {
      logger.error('Delete driver by ID error:', error);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  async approvedDriver(req, res) {
    try {

      const senderId = req.user.userId;
      const { driverId } = req.params;
      const driver = await Driver.findByIdAndUpdate(
        driverId,
        { status: 'approved' },
        { new: true }
      ).populate('userId', 'fullName email phoneNumber');

      if (!driver) {
        return res.status(404).json({ success: false, message: 'Driver not found' });
      }

      const driverUserId = driver.userId.toString();
       // Emit to driver
      const io = req.app.get('io');
      const targetRoom = `driver:${driverUserId}`;
      
      // Check sockets in room
      const socketsInRoom = await io.in(targetRoom).allSockets();
      
      if (socketsInRoom.size === 0) {
        console.warn('⚠️ WARNING: No sockets in room! Driver not connected.');
      }

      // ✅ Send only string IDs in socket event
      io.to(targetRoom).emit('assigned_driver', {
        senderId: customerId,          
        receiverId: driverUserId,        
        message: 'Approved as driver. You can now start accepting rides.',
      });
      // Send notification to driver
      const notification = await sendNotification({
        senderId,
        receiverId: driverUserId  ,
        title: 'Driver Approved',
        message: 'Your driver application has been approved. You can now start accepting rides.',
        type: 'driver_approval'
      });


      res.json({ 
        success: true, 
        message: 'Driver approved successfully', 
        driverData: driver,
        adminSendDriverNotification: notification 
      });
    } catch (error) {
      logger.error('Approve driver error:', error);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  async rejectDriver(req, res) {
    try {

      const senderId = req.user.userId;
      const { driverId } = req.params;

      const driver = await Driver.findByIdAndUpdate(
        driverId,
        { status: 'rejected' },
        { new: true }
      ).populate('userId', 'fullName email phoneNumber');

      if (!driver) {
        return res.status(404).json({ success: false, message: 'Driver not found' });
      }

      const driverUserId = driver.userId.toString();

       // Emit to driver
      const io = req.app.get('io');
      const targetRoom = `driver:${driverUserId}`;
      
      // Check sockets in room
      const socketsInRoom = await io.in(targetRoom).allSockets();
      
      if (socketsInRoom.size === 0) {
        console.warn('⚠️ WARNING: No sockets in room! Driver not connected.');
      }

      // ✅ Send only string IDs in socket event
      io.to(targetRoom).emit('assigned_driver', {
        senderId: customerId,          
        receiverId: driverUserId,        
        message: 'Rejected as driver. Please review your details and try again.',
      });
      // Send notification to driver
      const notification = await sendNotification({
        senderId,
        receiverId: driverUserId,
        title: 'Driver Rejected',
        message: 'Your driver application has been rejected. Please review your details and try again.',
        type: 'driver_approval'
      });

      res.json({ 
        success: true, 
        message: 'Driver rejected successfully', 
        driverData: driver,
        adminSendDriverNotification: notification 
      });
    } catch (error) {
      logger.error('Reject driver error:', error);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }
  // === Vehicle Management ===

 async createVehicle(req, res) {
  try {
    const { serviceId } = req.params;
    const { taxiName, color, model, plateNumber, year, vin } = req.body;

    const createVehicle = new Vehicle({
      serviceId,  
      taxiName, 
      color, 
      model,
      plateNumber, 
      year, 
      vin
    });

    await createVehicle.save();

    res.json({ 
      success: true, 
      message: 'Vehicle created successfully', 
      data: createVehicle 
    });

  } catch (error) {
    logger.error('Create vehicle error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

  async getAllVehicles(req, res){
    try {

      const { page = 1, limit = 10 } = req.query;

      const vehicles = await Vehicle.find()
        .populate('serviceId', 'name description serviceImage' )
        .populate({
          path: 'driverId',
          select: 'userId status isOnline isAvailable',
          populate: {
            path: 'userId',
            select: 'fullName profileImage phoneNumber email'
          }
        })

        .limit(parseInt(limit))
        .skip((parseInt(page) - 1) * parseInt(limit))
        .sort({ createdAt: -1 });

      const total = await Vehicle.countDocuments();

      res.json({
        success: true,
        data: {
          vehicles,
          pagination: {
            current: parseInt(page),
            pages: Math.ceil(total / parseInt(limit)),
            total,
          },
        },
      });
    }
    catch (error) {
      logger.error('Get all vehicles error:', error);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }
  

  async getVechileById(req, res){
    try {

      const { vehicleId } = req.params;

      const vehicle = await Vehicle.findById(vehicleId);

      if (!vehicle) {
        return res.status(404).json({ success: false, message: 'Vehicle not found' });
      }

      res.json({ success: true, data: vehicle });
    } catch (error) {
      logger.error('Get vehicle by ID error:', error);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }

  }

  async deleteVehicleById(req, res){
    try {

      const { vehicleId } = req.params;

      const vehicle = await Vehicle.findByIdAndDelete(vehicleId);
      if (!vehicle) {
        return res.status(404).json({ success: false, message: 'Vehicle not found' });
      }

      res.json({ success: true, message: 'Vehicle deleted successfully' });

    } catch (error) {
      logger.error('Delete vehicle by ID error:', error);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  async assignedDriverToVehicle(req, res) {
    try {

      const { vehicleId, driverId } = req.body;
      const adminId = req.user.userId.toString();

      // console.log("vehicleId", vehicleId);
      // console.log("driverId", driverId);

      const vehicle = await Vehicle.findById(vehicleId);
      const driver = await Driver.findById(driverId);
      const driverUserId = driver.userId.toString();

      if (!vehicle || !driver) {
        return res.status(404).json({ success: false, message: 'Vehicle or Driver not found' });
      }

      vehicle.driverId = driverId;
      driver.vehicleId = vehicleId;
      vehicle.assignedDrivers = true;


      await vehicle.save();
      await driver.save();
      // Emit to driver
      const io = req.app.get('io');
      const targetRoom = `driver:${driverUserId}`;
      
      // Check sockets in room
      const socketsInRoom = await io.in(targetRoom).allSockets();
      
      if (socketsInRoom.size === 0) {
        console.warn('⚠️ WARNING: No sockets in room! Driver not connected.');
      }

      // ✅ Send only string IDs in socket event
      io.to(targetRoom).emit('assigned_service', {
        senderId: adminId,          
        receiverId: driverUserId,
        assignedVechile: vehicle     
      });
      
      res.json({ success: true, message: 'Driver assigned to vehicle successfully', data: { vehicle, driver } });

    } catch (error) {
      logger.error('Assign driver to vehicle error:', error);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

 async getVehiclesByService(req, res) {
   try {
     const { serviceId } = req.params;
     const { page = 1, limit = 10 } = req.query;
 
     const skip = (page - 1) * limit;
 
     // Fetch vehicles for the service, with pagination
     const vehicles = await Vehicle.find({ serviceId })
       .populate({
         path: 'driverId',
         select: 'userId status isOnline isAvailable',
         populate: {
           path: 'userId',
           select: 'fullName profileImage phoneNumber email'
         }
       })
       .skip(skip)
       .limit(Number(limit))
       .sort({ createdAt: -1 });
 
     const total = await Vehicle.countDocuments({ serviceId });
 
     res.json({
       success: true,
       total,
       page: Number(page),
       totalPages: Math.ceil(total / limit),
       data: vehicles
     });
 
   } catch (error) {
     logger.error('Get vehicles by service error:', error);
     res.status(500).json({
       success: false,
       message: 'Internal server error'
     });
   }
 }



  // === Promo Code Management ===
  async createPromoCode(req, res) {
    try {
      const { discountValue, startDate, expiryDate, status } = req.body;

      // ---------------------------
      // 🔥 Step 1: Generate unique code
      // ---------------------------
      let code;
      let isUnique = false;

      while (!isUnique) {
        // Generate 6-digit code
        code = Math.floor(100000 + Math.random() * 900000).toString();

        // Check if exists
        const existing = await PromoCode.findOne({ code });

        if (!existing) isUnique = true; // Unique found
      }

      // ---------------------------
      // 🔥 Step 2: Create Promo Code
      // ---------------------------
      const promo = new PromoCode({
        code : "PROMO-" + code,
        discountValue,
        startDate,
        expiryDate,
        status,
        createdBy: req.user.userId
      });
      // console.log("Promo Code Data:", promo);

      await promo.save();

      res.status(201).json({
        success: true,
        message: "Promo code created successfully",
        data: promo
      });

    } catch (error) {
      logger.error("Create promo code error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }


 async getPromoCodes(req, res) {
  try {
    const { page = 1, limit = 10, status } = req.query;

    // -------------------------
    // 🔥 Build dynamic query
    // -------------------------
    let query = {};

    if (status) {
      query.status = { $regex: status, $options: "i" }; 
      // matches: active, Active, ACTIVE, pending, etc.
    }

    const promoCodes = await PromoCode.find(query)
      .populate("createdBy", "fullName")
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    const total = await PromoCode.countDocuments(query);

    res.json({
      success: true,
      data: {
        promoCodes,
        pagination: {
          current: parseInt(page),
          pages: Math.ceil(total / parseInt(limit)),
          total,
        },
      },
    });
  } catch (error) {
    logger.error("Get promo codes error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
}

  async deletePromoCode(req, res) {
    try {

      const { promoCodeId } = req.params;
      console.log("promoCodeId", promoCodeId);
      const promoCode = await PromoCode.findByIdAndDelete(promoCodeId);

      if (!promoCode) { 
        return res.status(404).json({ success: false, message: 'Promo code not found' });
      }

      res.json({ success: true, message: 'Promo code deleted successfully' });

    } catch (error) {
      logger.error('Delete promo code error:', error);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  async updatePromoCode(req, res) {
    try {
      const { promoCodeId } = req.params;
      const updateData = req.body;
      const promoCode = await PromoCode.findByIdAndUpdate(
        promoCodeId,
        updateData,
        { new: true, runValidators: true }
      );
      if (!promoCode) {
        return res.status(404).json({ success: false, message: 'Promo code not found' });
      }
      res.json({ success: true, message: 'Promo code updated successfully', data: promoCode });
    } catch (error) {
      logger.error('Update promo code error:', error);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  //commission management

  async createCommission(req, res) {
    try {

      const { title, description, discountType, commission, applicableServices, status } = req.body;

      const newCommission = new Commission({
        title,
        description,
        discountType,
        commission,
        applicableServices,
        status,
        createdBy: req.user.userId
      });

      await newCommission.save();

      res.status(201).json({ success: true, message: 'Commission created successfully', data: newCommission });

    } catch (error) {
      logger.error('Create commission error:', error);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  // === Commission ===
  async getCommissionHistory(req, res) {
    try {
      const { page = 1, limit = 10, startDate, endDate } = req.query;
      const filter = { status: 'completed' };
      if (startDate || endDate) {
        filter.createdAt = {};
        if (startDate) filter.createdAt.$gte = new Date(startDate);
        if (endDate) filter.createdAt.$lte = new Date(endDate);
      }

      const rides = await Ride.find(filter)
        .populate('customerId', 'fullName')
        .populate('driverId', 'fullName')
        .select('customerId driverId finalFare commission createdAt')
        .sort({ createdAt: -1 })
        .limit(limit * 1)
        .skip((page - 1) * limit);

      const total = await Ride.countDocuments(filter);
      const totalCommission = await Ride.aggregate([
        { $match: filter },
        { $group: { _id: null, total: { $sum: '$commission.amount' } } }
      ]);

      res.json({
        success: true,
        data: {
          rides,
          totalCommission: totalCommission[0]?.total || 0,
          pagination: { current: +page, pages: Math.ceil(total / limit), total }
        }
      });
    } catch (error) {
      logger.error('Get commission history error:', error);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }



  // === Users ===
 // === Users ===
  async getAllUsers(req, res) {
    try {
      const { page = 1, limit = 10, search } = req.query;

      // -----------------------------------
      // 🔥 Only customers
      // -----------------------------------
      const filter = { role: "customer" };

      // -----------------------------------
      // 🔍 Search if provided
      // -----------------------------------
      if (search) {
        filter.$or = [
          { fullName: { $regex: search, $options: "i" } },
          { email: { $regex: search, $options: "i" } },
          { phoneNumber: { $regex: search, $options: "i" } },
        ];
      }

      // -----------------------------------
      // 🔥 Fetch customers
      // -----------------------------------
      const customers = await User.find(filter)
        .select("-password")
        .sort({ createdAt: -1 })
        .limit(parseInt(limit))
        .skip((parseInt(page) - 1) * parseInt(limit));

      const total = await User.countDocuments(filter);

      // -----------------------------------
      // 🔥 Fetch rides for all customers
      // -----------------------------------
      const customerIds = customers.map((c) => c._id);

      const rides = await Ride.find({ customerId: { $in: customerIds } }).sort({ createdAt: -1 });

      // -----------------------------------
      // 🔥 Group rides by customer
      // -----------------------------------
      const rideMap = {};
      const completedRideCount = {};

      rides.forEach((ride) => {
        const cId = ride.customerId.toString();

        // group ride history
        if (!rideMap[cId]) rideMap[cId] = [];
        rideMap[cId].push(ride);

        // count completed rides
        if (ride.status === "completed") {
          if (!completedRideCount[cId]) completedRideCount[cId] = 0;
          completedRideCount[cId]++;
        }
      });

      // -----------------------------------
      // 🔥 Attach rideHistory + completed count
      // -----------------------------------
      const enrichedCustomers = customers.map((customer) => {
        const cId = customer._id.toString();
        return {
          ...customer.toObject(),
          rideHistory: rideMap[cId] || [],
          totalCompletedRides: completedRideCount[cId] || 0,
        };
      });

      // -----------------------------------
      // ✅ Response
      // -----------------------------------
      res.json({
        success: true,
        data: {
          users: enrichedCustomers,
          pagination: {
            current: parseInt(page),
            pages: Math.ceil(total / parseInt(limit)),
            total,
          },
        },
      });

    } catch (error) {
      logger.error("Get all users error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }
  async getUserById(req, res) {
    try {
      const { userId } = req.params;

      // --------------------------
      // 🔹 Get user
      // --------------------------
      const user = await User.findById(userId).select("-password");

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      // --------------------------
      // 🔹 Get all rides for this user
      // --------------------------
      const rides = await Ride.find({ customerId: user._id }).sort({ createdAt: -1 });

      // --------------------------
      // 🔹 Count completed rides
      // --------------------------
      const totalCompletedRides = rides.filter((ride) => ride.status === "completed").length;

      // --------------------------
      // 🔹 Return user with ride data
      // --------------------------
      res.json({
        success: true,
        data: {
          ...user.toObject(),
          rideHistory: rides,
          totalCompletedRides,
        },
      });

    } catch (error) {
      logger.error("Get user by ID error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }

  async deleteUserById(req, res) {
    try {
      const { userId } = req.params;
      const user = await User.findByIdAndDelete(userId);

      if (!user) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }
      res.json({ success: true, message: 'User deleted successfully' });
    }
    catch (error) {
      logger.error('Delete user by ID error:', error);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  //notifications management
  async getNotifications(req, res) {
    try {

      const { page = 1, limit = 10 } = req.query;
      const notifications = await Notification.find()
        .sort({ createdAt: -1 })
        .limit(parseInt(limit))
        .skip((parseInt(page) - 1) * parseInt(limit));
        
      const total = await Notification.countDocuments();

      res.json({
        success: true,
        data: {
          notifications,
          pagination: {
            current: parseInt(page),
            pages: Math.ceil(total / parseInt(limit)),
            total,
          },
        },
      });
    } catch (error) {
      logger.error("Get notifications error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }

  async deleteRideById(req, res) {
    try {
      const { rideId } = req.params;
      const ride = await Ride.findByIdAndDelete(rideId);

      if (!ride) {
        return res.status(404).json({ success: false, message: 'Ride not found' });
      }
      res.json({ 
        success: true, 
        message: 'Ride deleted successfully' ,
        data:ride
      });
    }
   catch (error) {
      logger.error('Delete ride by ID error:', error);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }
}

module.exports = new AdminController();