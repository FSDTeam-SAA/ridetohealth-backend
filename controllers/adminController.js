const User = require('../models/User');
const Driver = require('../models/Driver');
const Ride = require('../models/Ride');
const Service = require('../models/Service');
const PromoCode = require('../models/PromoCode');
const Report = require('../models/Report');
const Notification = require('../models/Notification');
const { sendNotification } = require('../services/notificationService');
const logger = require('../utils/logger');

class AdminController {
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

      // Get monthly stats
      const monthlyStats = await Ride.aggregate([
        {
          $match: {
            createdAt: { $gte: new Date(new Date().setMonth(new Date().getMonth() - 12)) }
          }
        },
        {
          $group: {
            _id: {
              year: { $year: '$createdAt' },
              month: { $month: '$createdAt' }
            },
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
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  async getPendingDrivers(req, res) {
    try {
      const { page = 1, limit = 10 } = req.query;

      const drivers = await Driver.find({ status: 'pending' })
        .populate('userId', 'fullName email phoneNumber')
        .sort({ createdAt: -1 })
        .limit(limit * 1)
        .skip((page - 1) * limit);

      const total = await Driver.countDocuments({ status: 'pending' });

      res.json({
        success: true,
        data: {
          drivers,
          pagination: {
            current: page,
            pages: Math.ceil(total / limit),
            total
          }
        }
      });
    } catch (error) {
      logger.error('Get pending drivers error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  async approveDriver(req, res) {
    try {
      const { driverId } = req.params;
      const { status, rejectionReason } = req.body;

      const driver = await Driver.findByIdAndUpdate(
        driverId,
        { status },
        { new: true }
      ).populate('userId');

      if (!driver) {
        return res.status(404).json({
          success: false,
          message: 'Driver not found'
        });
      }

      // Send notification to driver
      const message = status === 'approved' 
        ? 'Your driver application has been approved!' 
        : `Your driver application has been rejected. Reason: ${rejectionReason}`;

      await sendNotification(driver.userId._id, {
        title: 'Driver Application Update',
        message,
        type: 'system'
      });

      res.json({
        success: true,
        message: `Driver ${status} successfully`,
        data: { driverId, status }
      });
    } catch (error) {
      logger.error('Approve driver error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  async suspendDriver(req, res) {
    try {
      const { driverId } = req.params;
      const { duration, reason } = req.body;

      const endDate = new Date();
      endDate.setDate(endDate.getDate() + duration);

      const driver = await Driver.findByIdAndUpdate(
        driverId,
        {
          $push: {
            suspensions: {
              reason,
              duration,
              endDate,
              isActive: true
            }
          },
          isOnline: false,
          isAvailable: false
        },
        { new: true }
      ).populate('userId');

      if (!driver) {
        return res.status(404).json({
          success: false,
          message: 'Driver not found'
        });
      }

      // Send notification to driver
      await sendNotification(driver.userId._id, {
        title: 'Account Suspended',
        message: `Your account has been suspended for ${duration} days. Reason: ${reason}`,
        type: 'system'
      });

      res.json({
        success: true,
        message: 'Driver suspended successfully',
        data: { driverId, duration, reason }
      });
    } catch (error) {
      logger.error('Suspend driver error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  async createService(req, res) {
    try {
      const serviceData = req.body;
      const service = new Service(serviceData);
      await service.save();

      res.status(201).json({
        success: true,
        message: 'Service created successfully',
        data: service
      });
    } catch (error) {
      logger.error('Create service error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  async updateService(req, res) {
    try {
      const { serviceId } = req.params;
      const updates = req.body;

      const service = await Service.findByIdAndUpdate(
        serviceId,
        updates,
        { new: true, runValidators: true }
      );

      if (!service) {
        return res.status(404).json({
          success: false,
          message: 'Service not found'
        });
      }

      res.json({
        success: true,
        message: 'Service updated successfully',
        data: service
      });
    } catch (error) {
      logger.error('Update service error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  async deleteService(req, res) {
    try {
      const { serviceId } = req.params;

      await Service.findByIdAndUpdate(serviceId, { isActive: false });

      res.json({
        success: true,
        message: 'Service deleted successfully'
      });
    } catch (error) {
      logger.error('Delete service error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  async createPromoCode(req, res) {
    try {
      const promoData = {
        ...req.body,
        createdBy: req.user.userId
      };

      const promo = new PromoCode(promoData);
      await promo.save();

      res.status(201).json({
        success: true,
        message: 'Promo code created successfully',
        data: promo
      });
    } catch (error) {
      logger.error('Create promo code error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
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
          pagination: {
            current: page,
            pages: Math.ceil(total / limit),
            total
          }
        }
      });
    } catch (error) {
      logger.error('Get promo codes error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

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
          pagination: {
            current: page,
            pages: Math.ceil(total / limit),
            total
          }
        }
      });
    } catch (error) {
      logger.error('Get reports error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
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

      if (!report) {
        return res.status(404).json({
          success: false,
          message: 'Report not found'
        });
      }

      res.json({
        success: true,
        message: 'Report updated successfully',
        data: report
      });
    } catch (error) {
      logger.error('Update report error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

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
      if (role) {
        filter.role = role;
      }

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
          pagination: {
            current: page,
            pages: Math.ceil(total / limit),
            total
          }
        }
      });
    } catch (error) {
      logger.error('Get all users error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

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
        .populate('driverId')
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
          totalCommission: totalCommission.length > 0 ? totalCommission[0].total : 0,
          pagination: {
            current: page,
            pages: Math.ceil(total / limit),
            total
          }
        }
      });
    } catch (error) {
      logger.error('Get commission history error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
}

module.exports = new AdminController();
