const Service = require('../models/Service');
const Driver = require('../models/Driver');
const logger = require('../utils/logger');

class ServiceController {
  async getAllServices(req, res) {
    try {
      const services = await Service.find({ isActive: true });
      res.json({
        success: true,
        data: services
      });
    } catch (error) {
      logger.error('Get all services error:', error);
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