const User = require('../models/User');
const Driver = require('../models/Driver');
const Ride = require('../models/Ride');
const Service = require('../models/Service');
const Vehicle = require('../models/Vehicle');
const PromoCode = require('../models/PromoCode');
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


  // === Service Management ===
  async createService(req, res) {
    try {
      const { name, description } = req.body;
      if (!req.files?.serviceImage?.[0]) {
        return res.status(400).json({ success: false, message: 'Image is required' });
      }

      let serviceImage = null;
      serviceImage = await uploadToCloudinary(req.files.serviceImage[0].buffer, 'services');

      const service = new Service({name , serviceImage, description });
      await service.save();

      res.status(201).json({ success: true, message: 'Service created successfully', data: service });
    } catch (error) {
      logger.error('Create service error:', error);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

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

      res.json({ success: true, message: 'Vehicle updated successfully', data: createVehicle });

    } catch (error) {
      logger.error('Update vehicle error:', error);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  async updateService(req, res) {
    try {
      const { serviceId } = req.params;
     
      let serviceImage = null;
      serviceImage = await uploadToCloudinary(req.files.serviceImage[0].buffer, 'services');

       const service = await Service.findByIdAndUpdate(
        serviceId,
        { serviceImage, ...req.body },
        { new: true, runValidators: true }
      );

      if (!service) return res.status(404).json({ success: false, message: 'Service not found' });

      res.json({ success: true, message: 'Service updated successfully', data: service });

    } catch (error) {
      logger.error('Update service error:', error);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  async deleteService(req, res) {
    try {
      const { serviceId } = req.params;

      // Delete the service from the database
      const service = await Service.findByIdAndDelete(serviceId);

      if (!service) {
        return res.status(404).json({
          success: false,
          message: 'Service not found'
        });
      }

      res.json({
        success: true,
        message: 'Service permanently deleted',
        data: service
      });

    } catch (error) {
      logger.error('Delete service error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  async assignedDriverToVehicle(req, res) {
    try {

      const { vehicleId, driverId } = req.params;
      console.log("vehicleId", vehicleId);
      console.log("driverId", driverId);
      const vehicle = await Vehicle.findById(vehicleId);
      const driver = await Driver.findById(driverId);

      if (!vehicle || !driver) {
        return res.status(404).json({ success: false, message: 'Vehicle or Driver not found' });
      }

      vehicle.driverId = driverId;
      driver.vehicleId = vehicleId;
      vehicle.assignedDrivers = true;

      await vehicle.save();
      await driver.save();

      res.json({ success: true, message: 'Driver assigned to vehicle successfully', data: { vehicle, driver } });
    } catch (error) {
      logger.error('Assign driver to vehicle error:', error);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  // === Promo Code Management ===
  async createPromoCode(req, res) {
    try {
      const promo = new PromoCode({ ...req.body, createdBy: req.user.userId });
      await promo.save();
      res.status(201).json({ success: true, message: 'Promo code created successfully', data: promo });
    } catch (error) {
      logger.error('Create promo code error:', error);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  async getPromoCodes(req, res) {
    try {
      const { page = 1, limit = 10 } = req.query;
      const promoCodes = await PromoCode.find()
        .populate('createdBy', 'fullName')
        .sort({ createdAt: -1 })
        .limit(limit * 1)
        .skip((page - 1) * limit);

      const total = await PromoCode.countDocuments();

      res.json({
        success: true,
        data: {
          promoCodes,
          pagination: { current: +page, pages: Math.ceil(total / limit), total }
        }
      });
    } catch (error) {
      logger.error('Get promo codes error:', error);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  // === Reports ===
  async getReports(req, res) {
    try {
      const { page = 1, limit = 10, status } = req.query;
      const filter = status ? { status } : {};

      const reports = await Report.find(filter)
        .populate('reportedBy', 'fullName email')
        .populate('reportedUser', 'fullName email')
        .populate('rideId')
        .sort({ createdAt: -1 })
        .limit(limit * 1)
        .skip((page - 1) * limit);

      const total = await Report.countDocuments(filter);

      res.json({
        success: true,
        data: {
          reports,
          pagination: { current: +page, pages: Math.ceil(total / limit), total }
        }
      });
    } catch (error) {
      logger.error('Get reports error:', error);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  async updateReport(req, res) {
    try {
      const { reportId } = req.params;
      const { status, adminNotes } = req.body;

      const report = await Report.findByIdAndUpdate(
        reportId,
        {
          status,
          adminNotes,
          resolvedBy: req.user.userId,
          resolvedAt: status === 'resolved' ? new Date() : undefined
        },
        { new: true }
      );

      if (!report) return res.status(404).json({ success: false, message: 'Report not found' });

      res.json({ success: true, message: 'Report updated successfully', data: report });
    } catch (error) {
      logger.error('Update report error:', error);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  // === Users ===
  async getAllUsers(req, res) {
    try {
      const { page = 1, limit = 10, search, role } = req.query;
      const filter = {};
      if (search) {
        filter.$or = [
          { fullName: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
          { phoneNumber: { $regex: search, $options: 'i' } }
        ];
      }
      if (role) filter.role = role;

      const users = await User.find(filter)
        .select('-password')
        .sort({ createdAt: -1 })
        .limit(limit * 1)
        .skip((page - 1) * limit);

      const total = await User.countDocuments(filter);

      res.json({
        success: true,
        data: {
          users,
          pagination: { current: +page, pages: Math.ceil(total / limit), total }
        }
      });
    } catch (error) {
      logger.error('Get all users error:', error);
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

  // === CATEGORY MANAGEMENT ===

  async createCategory(req, res) {
    try {
      const { name } = req.body;
      if (!req.files?.serviceImage?.[0]) {
        return res.status(400).json({ success: false, message: 'Image is required' });
      }

      const buffer = req.files.serviceImage[0].buffer;
      const categoryImage = await uploadToCloudinary(buffer, 'categories');

      const category = await Category.create({ name, categoryImage });

      res.status(201).json({ success: true, data: category });
    } catch (error) {
      logger.error('Create category error:', error);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  async getAllCategories(req, res) {
    try {
      const { page = 1, limit = 10 } = req.query;
      const categories = await Category.find()
        .sort({ createdAt: -1 })
        .limit(limit * 1)
        .skip((page - 1) * limit);

      const total = await Category.countDocuments();

      res.json({
        success: true,
        data: {
          categories,
          pagination: { current: +page, pages: Math.ceil(total / limit), total }
        }
      });
    } catch (error) {
      logger.error('Get categories error:', error);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  async getCategoryById(req, res) {
    try {
      const { categoryId } = req.params;
      const category = await Category.findById(categoryId);
      if (!category)
        return res.status(404).json({ success: false, message: 'Category not found' });
      
      const services = await Service.find({ category: category._id });
      const categoryWithServices = {
        ...category.toObject(),
        services,
      };
      res.status(200).json({ success: true, data: categoryWithServices });
    } catch (error) {
      logger.error('Get category by ID error:', error);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }


  async updateCategory(req, res) {
    try {
      const { categoryId } = req.params;
      const { name } = req.body;
      let categoryImage;

      if (req.files?.serviceImage?.[0]) {
        const buffer = req.files.serviceImage[0].buffer;
        categoryImage = await uploadToCloudinary(buffer, 'categories');
      }

      const updatedData = { name };
      if (categoryImage) updatedData.categoryImage = categoryImage;

      const category = await Category.findByIdAndUpdate(categoryId, updatedData, { new: true });

      if (!category) return res.status(404).json({ success: false, message: 'Category not found' });

      res.json({ success: true, data: category });
    } catch (error) {
      logger.error('Update category error:', error);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  async deleteCategory(req, res) {
    try {
      const { categoryId } = req.params;
      const category = await Category.findByIdAndDelete(categoryId);
      if (!category) return res.status(404).json({ success: false, message: 'Category not found' });

      res.json({ success: true, message: 'Category deleted successfully' });
    } catch (error) {
      logger.error('Delete category error:', error);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }
}

module.exports = new AdminController();