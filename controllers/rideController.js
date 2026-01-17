const Ride = require('../models/Ride');
const Driver = require('../models/Driver');
const Service = require('../models/Service');
const PromoCode = require('../models/PromoCode');
const User = require('../models/User');
const { calculateFare, calculateDistance } = require('../services/fareService');
const { sendNotification } = require('../services/notificationService');
const logger = require('../utils/logger');
const mongoose = require('mongoose');




class RideController {
async requestRide(req, res) {
  try {
    const {
      pickupLocation,
      dropoffLocation,
      paymentMethod,
      driverId,
      totalFare
    } = req.body;

    const customerId = req.user.userId.toString();
    const customer = await User.findById(customerId);

    if (!mongoose.Types.ObjectId.isValid(driverId)) {
      return res.status(400).json({
        message: "Invalid driver ID",
      });
    }

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

    const driver = await Driver.findById(driverId).populate('userId');
    
    if (!driver) {
      return res.status(404).json({
        success: false,
        message: 'Driver not found'
      });
    }

    const driverUserId = driver.userId._id.toString();
    const driverDocId = driver._id.toString();

    if (driver.status !== 'approved' || !driver.isOnline || !driver.isAvailable) {
      return res.status(400).json({
        success: false,
        message: 'Driver is not available'
      });
    }

    const ride = new Ride({
      customerId,
      driverId: driverUserId,
      pickupLocation,
      dropoffLocation,
      totalFare,
      paymentMethod
    });

    await ride.save();

    // ✅ Convert ride ID to string
    const rideIdString = ride._id.toString();

    // Emit to driver
    const io = req.app.get('io');
    const targetRoom = `driver:${driverUserId}`;
    
    // Check sockets in room
    const socketsInRoom = await io.in(targetRoom).allSockets();
    
    if (socketsInRoom.size === 0) {
      console.warn('⚠️ WARNING: No sockets in room! Driver not connected.');
    }

    // ✅ Send only string IDs in socket event
    io.to(targetRoom).emit('ride_request', {
      senderId: customerId,           // ✅ String
      receiverId: driverUserId,        // ✅ String
      rideId: rideIdString,            // ✅ String
      pickup: pickupLocation,
      dropoff: dropoffLocation,
      totalFare,
      customerName: customer.fullName || 'Customer',
      customerPhone: customer.phoneNumber || '',
      customerImage: customer.profileImage || ''
    });

    // Send notification
    const notification = await sendNotification({
      senderId: customerId,
      receiverId: driverUserId,
      title: 'New Ride Request',
      message: `New ride request from ${pickupLocation.address}`,
      type: 'ride_request',
      data: { rideId: rideIdString } // ✅ String
    });

    // ✅ Return clean string IDs in response
    res.status(201).json({
      success: true,
      message: 'Ride requested successfully',
      data: {
        rideId: rideIdString,           // ✅ String
        totalFare,
        driverInfo: {
          id: driverDocId,              // ✅ String
          userId: driverUserId,         // ✅ String
          name: driver.userId.fullName,
          phone: driver.userId.phoneNumber
        }
      },
      notification
    });

  } catch (error) {
    logger.error('Request ride error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
}

  async acceptRide(req, res) {
    try {
      const { rideId } = req.params;
      const driverUserId = req.user.userId; 

      // 1️⃣ Find driver by userId
      const driver = await Driver.findOne({ userId: driverUserId })
        .populate("userId") 
        .populate("vehicleId");


      if (!driver) {
        return res.status(404).json({
          success: false,
          message: "Driver not found"
        });
      }

      if (!driver.isAvailable) {
        return res.status(400).json({
          success: false,
          message: "Driver not available"
        });
      }

      // 2️⃣ Find ride
      const ride = await Ride.findById(rideId);

      if (!ride) {
        return res.status(404).json({
          success: false,
          message: "Ride not found"
        });
      }

      // 3️⃣ Ensure correct driver was assigned
      if (ride.driverId.toString() !== driverUserId.toString()) {
        return res.status(403).json({
          success: false,
          message: "This ride was not assigned to you"
        });
      }

      if (ride.status !== "requested") {
        return res.status(400).json({
          success: false,
          message: "Ride is no longer available"
        });
      }

      // 4️⃣ Accept the ride
      ride.status = "accepted";
      ride.acceptedAt = new Date();
      ride.timeline.push({
        status: "accepted",
        timestamp: new Date()
      });
      await ride.save();

      // 5️⃣ Set driver unavailable
      driver.isAvailable = false;
      driver.currentRideId = ride._id;
      await driver.save();

      // 6️⃣ Emit Socket Notification
      const io = req.app.get("io");
      const customerRoom = `user:${ride.customerId.toString()}`;


      io.to(customerRoom).emit("ride_accepted", {
        rideId: ride._id,
        driver: {
          id: driver._id,
          name: driver.userId.fullName,
          phone: driver.userId.phoneNumber,
          vehicle: driver.vehicleId,
          rating: driver.ratings?.average || 0,
          currentLocation: driver.currentLocation
        }
      });

       const notification = await sendNotification({
        senderId: driverUserId,
        receiverId: ride.customerId,
        title: 'Accepted Ride Request',
        message: `${driver.userId.fullName} has accepted your ride request`,
        type: 'ride_accepted',
        data: { rideId: ride._id } // ✅ String
      });


      // 7️⃣ Send Push Notification
      // await sendNotification(ride.customerId, {
      //   title: "Ride Accepted",
      //   message: `${driver.userId.fullName} has accepted your ride request`,
      //   type: "ride_accepted",
      //   data: { rideId: ride._id }
      // });

      // 8️⃣ Response
      res.json({
        success: true,
        message: "Ride accepted successfully",
        data: {
          rideId: ride._id,
          customerInfo: {
            pickup: ride.pickupLocation,
            dropoff: ride.dropoffLocation,
            estimatedFare: ride.estimatedFare,
            driverName: driver.userId.fullName,
            driverPhone: driver.userId.phoneNumber
          }
        },
        notification
      });

    } catch (error) {
      logger.error("Accept ride error:", error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

 async getRideStatus(req, res) {
    try {
      const { rideId } = req.params;

      const ride = await Ride.findById(rideId)
        .populate("customerId", "fullName phoneNumber profileImage")
        .populate({
          path: "driverId",
          populate: {
            path: "userId",
            select: "fullName phoneNumber profileImage"
          }
        })
        .populate("serviceId", "name category");

      if (!ride) {
        return res.status(404).json({
          success: false,
          message: "Ride not found"
        });
      }

      res.json({
        success: true,
        data: ride
      });

    } catch (error) {
      logger.error("Get ride status error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error"
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
        message: "Ride not found",
      });
    }

    const driver = await Driver.findOne({ userId: ride.driverId.toString() });
    if (!driver) {
      return res.status(404).json({
        success: false,
        message: "Driver not found",
      });
    }

    ride.status = status;
    ride.timeline.push({
      status,
      timestamp: new Date(),
    });

    if (location) {
      ride.route.push({
        latitude: location.latitude,
        longitude: location.longitude,
        timestamp: new Date(),
      });

      driver.currentLocation.coordinates = [
        location.longitude,
        location.latitude,
      ];
    }

    if (status === "completed") {
      ride.completedAt = new Date();

      const paymentMethod = ride.paymentMethod; 
      const totalPrice = ride.totalFare ?? 0;
      ride.paymentStatus = "successfull";

      if (paymentMethod === "cash" || paymentMethod === "stripe" || paymentMethod === "card") {
        driver.earnings.total += totalPrice;
        driver.earnings.available += totalPrice;
      }
      driver.isAvailable = true;
      driver.currentRideId = null;
    }

    // Save Update
    await ride.save();
    await driver.save();

    // SOCKET EMIT TO USER
    // const io = req.app.get("io");
    // io.to(`user_${ride.customerId}`).emit("ride_status_update", {
    //   rideId: ride._id.toString(),
    //   status,
    //   location,
    // });/

     // Emit socket updates
      const io = req.app.get("io");

      // Notify Customer
      io.to(`user_${ride.customerId}`).emit("ride_status_update", {
        rideId: ride._id,
        message: "Ride completed successfully",
      });

      // Notify Driver (if assigned)
      if (ride.driverId) {
        const driver = await Driver.findOne({userId:ride.driverId.toString()}).populate("userId");

        io.to(`driver_${driver.userId._id}`).emit("ride_status_update", {
          rideId: ride._id,
          message: "Ride completed successfully",
        });
      }

    return res.json({
      success: true,
      message: "Ride status updated successfully",
      data: {
        rideId: ride._id,
        status,
      },
    });
  } catch (error) {
    logger.error("Update ride status error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
}


  async cancelRide(req, res) {
    try {
      const { rideId } = req.params;
      const { reason } = req.body;
      const driverUserId = req.user.userId;

      const ride = await Ride.findById(rideId);
      if (!ride) {
        return res.status(404).json({
          success: false,
          message: "Ride not found"
        });
      }

      // Already cancelled or completed
      if (["completed", "cancelled"].includes(ride.status)) {
        return res.status(400).json({
          success: false,
          message: `Ride is already ${ride.status}`
        });
      }

      // Only cancel allowed during early states
      if (!["requested", "accepted", "driver_arrived"].includes(ride.status)) {
        return res.status(400).json({
          success: false,
          message: "Ride cannot be cancelled at this stage"
        });
      }

      // Update ride details
      ride.status = "cancelled";
      ride.cancellationReason = reason || "No reason provided";
      ride.cancelledBy = req.user.role === "driver" ? "driver" : "customer";
      ride.timeline.push({
        status: "cancelled",
        timestamp: new Date()
      });

      await ride.save();

      // Make assigned driver available (if any)
      if (ride.driverId) {
        await Driver.findByIdAndUpdate(ride.driverId, {
          isAvailable: true,
          currentRideId: null
        });
      }

      // Emit socket updates
      const io = req.app.get("io");
      const customerRoom = `user:${ride.customerId.toString()}`;
      const driverRoom = `driver:${driverUserId}`;

      // Notify Customer
      io.to(customerRoom).emit("ride_cancelled", {
        rideId: ride._id,
        cancelledBy: ride.cancelledBy,
        reason
      });

      let customerId = ride.customerId;
      const driver = await Driver.findOne({ userId: driverUserId }).populate("userId");
      if (ride.driverId) {

        io.to(driverRoom).emit("ride_cancelled", {
          rideId: ride._id,
          cancelledBy: ride.cancelledBy,
          reason
        });
      }
      const notification = await sendNotification({
        senderId: driverUserId,
        receiverId: customerId,
        title: 'Cancelled Ride Request',
        message: `${driver.userId.fullName} has cancelled your ride request`,
        type: 'ride_cancelled',
        data: { rideId: ride._id } // ✅ String
      });

      return res.json({
        success: true,
        message: "Ride cancelled successfully",
        notification
      });

    } catch (error) {
      logger.error("Cancel ride error:", error);
      return res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  async rateRide(req, res) {
  try {
    const { rideId } = req.params;
    const { rating, comment } = req.body;
    const userId = req.user.userId;
    const userRole = req.user.role;
    const ratingComment = comment || '';

    if (userRole !== 'customer') {
      return res.status(403).json({
        success: false,
        message: 'Only customers can rate drivers'
      });
    }

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: 'Rating must be between 1 and 5'
      });
    }

    const ride = await Ride.findById(rideId);
    if (!ride) {
      return res.status(404).json({
        success: false,
        message: 'Ride not found'
      });
    }

    if (ride.customerId.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to rate this ride'
      });
    }

    if (ride.status !== 'completed') {
      return res.status(400).json({
        success: false,
        message: 'Only completed rides can be rated'
      });
    }

    if (ride.rating?.customerToDriver?.rating) {
      return res.status(400).json({
        success: false,
        message: 'You have already rated this ride'
      });
    }

    if (!ride.rating) ride.rating = {};
    ride.rating.customerToDriver = {
      rating,
      comment: ratingComment,
      ratedAt: new Date()
    };
    await ride.save();

    // ================================
    // UPDATE DRIVER RATING STATS
    // ================================
    const driver = await Driver.findOne({ userId: ride.driverId });
    
    // FIX: Check if driver exists
    if (!driver) {
      return res.status(404).json({
        success: false,
        message: 'Driver not found'
      });
    }

    if (!driver.ratings) {
      driver.ratings = {
        average: 0,
        totalRatings: 0,
        count1: 0,
        count2: 0,
        count3: 0,
        count4: 0,
        count5: 0,
        reviews: []
      };
    }

    if (!driver.ratings.reviews) {
      driver.ratings.reviews = [];
    }

    driver.ratings.reviews.unshift({
      rideId: ride._id,
      customerId: ride.customerId,
      rating,
      comment: ratingComment,
      ratedAt: new Date(),
    });

    // FIX: Correct array access syntax
    driver.ratings[`count${rating}`] += 1;

    // Update totals
    driver.ratings.totalRatings += 1;

    // Calculate new average
    let totalScore =
      (1 * driver.ratings.count1) +
      (2 * driver.ratings.count2) +
      (3 * driver.ratings.count3) +
      (4 * driver.ratings.count4) +
      (5 * driver.ratings.count5);

    driver.ratings.average = totalScore / driver.ratings.totalRatings;
    await driver.save();

    // ================================
    // REAL-TIME SOCKET NOTIFICATION
    // ================================
    const io = req.app.get('io');
    
    // FIX: Correct socket.io syntax
    io.to(`driver_${driver.userId}`).emit("new_rating", {
      rideId: ride._id,
      rating,
      comment: ratingComment,
      averageRating: driver.ratings.average.toFixed(2),
      message: `You received a ${rating}-star rating`
    });

    // ================================
    res.json({
      success: true,
      message: 'Driver rated successfully',
      data: {
        rideId: ride._id,
        rating,
        comment: ratingComment
      }
    });
  } catch (error) {
    console.error('Rate ride error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
}


  
}

module.exports = new RideController();
