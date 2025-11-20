const Service = require('../models/Service');
const Driver = require('../models/Driver');
const logger = require('../utils/logger');
const Vehicle = require('../models/Vehicle');
const { uploadToCloudinary } = require('../services/cloudinaryService');

class ServiceController {

  async createService(req, res) {
      try {

        const { name, description } = req.body;
        if (!req.files?.serviceImage?.[0]) {
          return res.status(400).json({ success: false, message: 'Image is required' });
        }
  
        let serviceImage = null;
        const uploadImage = await uploadToCloudinary(req.files.serviceImage[0].buffer, 'services');
        
        serviceImage = uploadImage.secure_url;
        
        const service = new Service({name , serviceImage, description });
        await service.save();
  
        res.status(201).json({ success: true, message: 'Service created successfully', data: service });
      } catch (error) {
        logger.error('Create service error:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
      }
    }
  
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
  
}

module.exports = new ServiceController();