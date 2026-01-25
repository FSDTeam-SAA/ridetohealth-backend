const Service = require('../models/Service');
const Driver = require('../models/Driver');
const logger = require('../utils/logger');
const Vehicle = require('../models/Vehicle');
const { uploadToCloudinary } = require('../services/cloudinaryService');

class ServiceController {

  async createService(req, res) {
      try {

        const { name, description, perKmRate, perMileRate } = req.body;
        if (!req.files?.serviceImage?.[0]) {
          return res.status(400).json({ success: false, message: 'Image is required' });
        }
  
        let serviceImage = null;
        const uploadImage = await uploadToCloudinary(req.files.serviceImage[0].buffer, 'services');
        
        serviceImage = uploadImage.secure_url;
        
        const service = new Service({name , serviceImage, description, perKmRate, perMileRate });
        await service.save();
  
        res.status(201).json({ success: true, message: 'Service created successfully', data: service });
      } catch (error) {
        logger.error('Create service error:', error);
        res.status(500).json({ success: false, message: error.message });
      }
    }
  
 async getAllServices(req, res) {
  try {
    const { page = 1, limit = 10, search = "" } = req.query;

    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);

    const matchStage = {
      isActive: true,
      ...(search && {
        name: { $regex: search, $options: "i" }
      })
    };

    const services = await Service.aggregate([
      { $match: matchStage },

      {
        $lookup: {
          from: "commissions",        
          localField: "_id",
          foreignField: "applicableServices",
          as: "commission"
        }
      },

      {
        $addFields: {
          commission: {
            $first: {
              $filter: {
                input: "$commission",
                as: "c",
                cond: {
                  $and: [
                    { $eq: ["$$c.isActive", true] },
                    { $eq: ["$$c.status", "active"] }
                  ]
                }
              }
            }
          }
        }
      },

      { $sort: { createdAt: -1 } },
      { $skip: (pageNum - 1) * limitNum },
      { $limit: limitNum }
    ]);

    const total = await Service.countDocuments(matchStage);

    res.json({
      success: true,
      currentPage: pageNum,
      totalPages: Math.ceil(total / limitNum),
      totalItems: total,
      data: services
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
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
        message: error.message
      });
    }
  }
    async updateService(req, res) {
  try {
    const { serviceId } = req.params;

    // 1️⃣ Find existing service
    const existingService = await Service.findById(serviceId);
    if (!existingService) {
      return res.status(404).json({
        success: false,
        message: "Service not found",
      });
    }

    let serviceImage = existingService.serviceImage; // keep old image

    // 2️⃣ Upload ONLY if new image is sent
    if (req.files?.serviceImage?.length) {
      serviceImage = await uploadToCloudinary(
        req.files.serviceImage[0].buffer,
        "services"
      );
    }

    // 3️⃣ Update service
    const service = await Service.findByIdAndUpdate(
      serviceId,
      {
        name: req.body.name,
        description: req.body.description,
        serviceImage,
      },
      { new: true, runValidators: true }
    );

    res.json({
      success: true,
      message: "Service updated successfully",
      data: service,
    });
  } catch (error) {
    logger.error("Update service error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
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
          message: error.message
        });
      }
    }
  
}

module.exports = new ServiceController();