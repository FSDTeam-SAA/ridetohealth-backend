const Service = require('../models/Service');
const Driver = require('../models/Driver');
const logger = require('../utils/logger');
const Vehicle = require('../models/Vehicle');

class ServiceController {
 async getAllServices(req, res) {
    try {
      const { page = 1, limit = 10, search = "" } = req.query;

      // Convert query params to numbers
      const pageNum = parseInt(page, 10);
      const limitNum = parseInt(limit, 10);

      // Build search condition using regex
      const searchCondition = {
        isActive: true,
        ...(search && {
          name: { $regex: search, $options: "i" } // case-insensitive search
        })
      };

      // Fetch total count for pagination info
      const total = await Service.countDocuments(searchCondition);

      // Fetch paginated and filtered services
      const services = await Service.find(searchCondition)
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .sort({ createdAt: -1 }); // optional: latest first

      // Response
      res.json({
        success: true,
        currentPage: pageNum,
        totalPages: Math.ceil(total / limitNum),
        totalItems: total,
        data: services
      });
    } catch (error) {
      logger.error("Get all services error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }

 async  getVehiclesByService(req, res) {
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

  async getServiceById(req, res) {
    try {
      const { serviceId } = req.params;
      const service = await Service.findById(serviceId);

      if (!service) {
        return res.status(404).json({
          success: false,
          message: 'Service not found'
        });
      }

      res.json({
        success: true,
        data: service
      });
    } catch (error) {
      logger.error('Get service by ID error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  async getNearbyVehicles(req, res) {
    try {
      const { serviceId, latitude, longitude, radius = 5000 } = req.query;

      if (!serviceId || !latitude || !longitude) {
        return res.status(400).json({
          success: false,
          message: 'Service ID, latitude, and longitude are required'
        });
      }

      const drivers = await Driver.find({
        serviceTypes: serviceId,
        status: 'approved',
        isOnline: true,
        isAvailable: true,
        currentLocation: {
          $near: {
            $geometry: {
              type: 'Point',
              coordinates: [parseFloat(longitude), parseFloat(latitude)]
            },
            $maxDistance: parseInt(radius)
          }
        }
      }).populate('userId', 'fullName profileImage')
        .select('userId vehicle currentLocation ratings');

      res.json({
        success: true,
        data: drivers
      });
    } catch (error) {
      logger.error('Get nearby vehicles error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
}

module.exports = new ServiceController();