const Ride = require('../models/Ride');
const Driver = require('../models/Driver');
const Service = require('../models/Service');
const PromoCode = require('../models/PromoCode');
const User = require('../models/User');
const { calculateFare, calculateDistance } = require('../services/fareService');
const { sendNotification } = require('../services/notificationService');
const logger = require('../utils/logger');



class RideController {
  async requestRide(req, res) {
    try {
      const {
        serviceId,
        pickupLocation,
        dropoffLocation,
        paymentMethod,
        promoCode,
        driverId
      } = req.body;

      const customerId = req.user.userId;

      // Validate required fields
      if (!driverId) {
        return res.status(400).json({
          success: false,
          message: 'Driver ID is required'
        });
      }

      // Check if user has any active rides
      const activeRide = await Ride.findOne({
        customerId,
        status: { $in: ['requested', 'accepted', 'driver_arrived', 'in_progress'] }
      });

      if (activeRide) {
        return res.status(400).json({
          success: false,
          message: 'You already have an active ride'
        });
      }

      // Verify service availability
      const service = await Service.findById(serviceId);
      if (!service || !service.isActive) {
        return res.status(404).json({
          success: false,
          message: 'Service not available'
        });
      }

      // Verify driver availability
      const driver = await Driver.findOne({
        _id: driverId,
        status: 'approved',
        isOnline: true,
        isAvailable: true
      }).populate('userId', 'fullName phoneNumber');

      if (!driver) {
        return res.status(404).json({
          success: false,
          message: 'Driver is not available'
        });
      }

      // Calculate distance and fare
      const distance = calculateDistance(
        pickupLocation.coordinates,
        dropoffLocation.coordinates
      );

      let fare = calculateFare(service, distance, 0);

      // Apply promo code if provided
      let promoDiscount = 0;
      if (promoCode) {
        const promo = await PromoCode.findOne({
          code: promoCode.toUpperCase(),
          isActive: true,
          validFrom: { $lte: new Date() },
          validUntil: { $gte: new Date() }
        });

        if (promo && fare >= promo.minimumOrderValue) {
          if (promo.discountType === 'percentage') {
            promoDiscount = Math.min(
              fare * (promo.discountValue / 100),
              promo.maxDiscount || fare
            );
          } else {
            promoDiscount = Math.min(promo.discountValue, fare);
          }
          fare -= promoDiscount;
        }
      }

      // Create ride request
      const ride = new Ride({
        customerId,
        serviceId,
        driverId,
        pickupLocation,
        dropoffLocation,
        estimatedDistance: distance,
        estimatedDuration: Math.ceil((distance / 30) * 60),
        estimatedFare: fare,
        paymentMethod,
        promoCode: promoCode ? { code: promoCode, discount: promoDiscount } : undefined
      });

      await ride.save();

      // Send immediate notification to the selected driver
      const io = req.app.get('io');
      io.to(`driver_${driver.userId._id}`).emit('ride_request', {
        rideId: ride._id,
        pickup: pickupLocation,
        dropoff: dropoffLocation,
        estimatedFare: fare,
        distance,
        customerName: req.user.fullName || 'Customer'
      });

      await sendNotification(driver.userId._id, {
        title: 'New Ride Request',
        message: `New ride request from ${pickupLocation.address}`,
        type: 'ride_request',
        data: { rideId: ride._id }
      });

      res.status(201).json({
        success: true,
        message: 'Ride requested successfully',
        data: {
          rideId: ride._id,
          estimatedFare: fare,
          estimatedDistance: distance,
          driverInfo: {
            id: driver._id,
            name: driver.userId.fullName,
            phone: driver.userId.phoneNumber
          }
        }
      });

    } catch (error) {
      logger.error('Request ride error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  async acceptRide(req, res) {
    try {
      const { rideId } = req.params;
      const driverUserId = req.user.userId; // This is the user ID from auth token

      // Find driver by userId (not _id)
      const driver = await Driver.findOne({ userId: driverUserId }).populate('userId', 'fullName phoneNumber');
      
      if (!driver) {
        return res.status(404).json({
          success: false,
          message: 'Driver not found'
        });
      }

      if (!driver.isAvailable) {
        return res.status(400).json({
          success: false,
          message: 'Driver not available'
        });
      }

      // Find the ride
      const ride = await Ride.findById(rideId);
      
      if (!ride) {
        return res.status(404).json({
          success: false,
          message: 'Ride not found'
        });
      }

      // Check if this ride was requested for this specific driver
      if (ride.driverId.toString() !== driver._id.toString()) {
        return res.status(403).json({
          success: false,
          message: 'This ride was not assigned to you'
        });
      }

      if (ride.status !== 'requested') {
        return res.status(400).json({
          success: false,
          message: 'Ride is no longer available'
        });
      }

      // Accept the ride
      ride.status = 'accepted';
      ride.acceptedAt = new Date();
      ride.timeline.push({ 
        status: 'accepted',
        timestamp: new Date()
      });
      await ride.save();

      // Update driver availability
      driver.isAvailable = false;
      driver.currentRideId = ride._id;
      await driver.save();

      const io = req.app.get('io');

      // Notify customer
      io.to(`user_${ride.customerId}`).emit('ride_accepted', {
        rideId: ride._id,
        driver: {
          id: driver._id,
          name: driver.userId.fullName,
          phone: driver.userId.phoneNumber,
          vehicle: driver.vehicle,
          rating: driver.ratings?.average || 0,
          currentLocation: driver.currentLocation
        }
      });

      await sendNotification(ride.customerId, {
        title: 'Ride Accepted',
        message: `${driver.userId.fullName} has accepted your ride request`,
        type: 'ride_accepted',
        data: { rideId: ride._id }
      });

      res.json({
        success: true,
        message: 'Ride accepted successfully',
        data: { 
          rideId: ride._id,
          customerInfo: {
            pickup: ride.pickupLocation,
            dropoff: ride.dropoffLocation,
            estimatedFare: ride.estimatedFare
          }
        }
      });

    } catch (error) {
      logger.error('Accept ride error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
  async getRideStatus(req, res) {
    try {
      const { rideId } = req.params;

      const ride = await Ride.findById(rideId)
        .populate('customerId', 'fullName phoneNumber profileImage')
        .populate('driverId')
        .populate('serviceId', 'name category');

      if (!ride) {
        return res.status(404).json({
          success: false,
          message: 'Ride not found'
        });
      }

      res.json({
        success: true,
        data: ride
      });

    } catch (error) {
      logger.error('Get ride status error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  async updateRideStatus(req, res) {
    try {
      const { rideId } = req.params;
      const { status, location } = req.body;

      const ride = await Ride.findById(rideId);
      if (!ride) {
        return res.status(404).json({
          success: false,
          message: 'Ride not found'
        });
      }

      ride.status = status;
      ride.timeline.push({ status });

      if (location) {
        ride.route.push({
          latitude: location.latitude,
          longitude: location.longitude
        });
      }

      if (status === 'completed') {
        // Calculate final fare
        const actualDistance = ride.route.length > 0 ? 
          calculateDistance(ride.route[0], ride.route[ride.route.length - 1]) : 
          ride.estimatedDistance;

        const service = await Service.findById(ride.serviceId);
        ride.finalFare = calculateFare(service, actualDistance, ride.actualDuration);
        ride.actualDistance = actualDistance;

        // Calculate commission
        ride.commission.amount = ride.finalFare * ride.commission.rate;

        // Update driver availability and earnings
        const driver = await Driver.findById(ride.driverId);
        driver.isAvailable = true;
        driver.earnings.total += ride.finalFare - ride.commission.amount;
        driver.earnings.available += ride.finalFare - ride.commission.amount;
        await driver.save();

        // Process payment
        if (ride.paymentMethod === 'wallet') {
          const customer = await User.findById(ride.customerId);
          if (customer.wallet.balance >= ride.finalFare) {
            customer.wallet.balance -= ride.finalFare;
            customer.wallet.transactions.push({
              type: 'debit',
              amount: ride.finalFare,
              description: `Payment for ride ${ride._id}`
            });
            await customer.save();
            ride.paymentStatus = 'completed';
          } else {
            ride.paymentStatus = 'failed';
          }
        }
      }

      await ride.save();


       const io = req.app.get('io');
      io.to(`user_${ride.customerId}`).emit('ride_status_update', {
        rideId: ride._id,
        status,
        location
      });

      res.json({
        success: true,
        message: 'Ride status updated successfully',
        data: { status, rideId: ride._id }
      });

    } catch (error) {
      logger.error('Update ride status error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  async cancelRide(req, res) {
    try {
      const { rideId } = req.params;
      const { reason } = req.body;

      const ride = await Ride.findById(rideId);
      if (!ride) {
        return res.status(404).json({
          success: false,
          message: 'Ride not found'
        });
      }

      if (!['requested', 'accepted', 'driver_arrived'].includes(ride.status)) {
        return res.status(400).json({
          success: false,
          message: 'Ride cannot be cancelled at this stage'
        });
      }

      ride.status = 'cancelled';
      ride.cancellationReason = reason;
      ride.cancelledBy = req.user.role === 'driver' ? 'driver' : 'customer';
      ride.timeline.push({ status: 'cancelled' });
      await ride.save();

      // If driver was assigned, make them available again
      if (ride.driverId) {
        await Driver.findByIdAndUpdate(ride.driverId, {
          isAvailable: true
        });
      }

      const io = req.app.get('io');
      io.to(`user_${ride.customerId}`).emit('ride_cancelled', {
        rideId: ride._id,
        reason
      });

      if (ride.driverId) {
        io.to(`driver_${ride.driverId}`).emit('ride_cancelled', {
          rideId: ride._id,
          reason
        });
      }

      res.json({
        success: true,
        message: 'Ride cancelled successfully'
      });

    } catch (error) {
      logger.error('Cancel ride error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  async rateRide(req, res) {
    try {
      const { rideId } = req.params;
      const { rating, reviews } = req.body;

      console.log(rideId, req.body);

      const ride = await Ride.findById(rideId);
      if (!ride || ride.status !== 'completed') {
        return res.status(404).json({
          success: false,
          message: 'Ride not found or not completed'
        });
      }

      if (req.user.role === 'customer') {
        ride.rating.customerToDriver = { rating };
        ride.reviews = reviews;

        // Update driver rating
        const driver = await Driver.findById(ride.driverId);
        const newCount = driver.ratings.count + 1;
        const newAverage = ((driver.ratings.average * driver.ratings.count) + rating) / newCount;
        
        driver.ratings.average = newAverage;
        driver.ratings.count = newCount;
        await driver.save();
      } else {
        ride.rating.driverToCustomer = { rating};
      }

      await ride.save();

      res.json({
        success: true,
        message: 'Rating submitted successfully'
      });

    } catch (error) {
      logger.error('Rate ride error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
}

module.exports = new RideController();