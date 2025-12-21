const logger = require('../utils/logger');
const Ride = require('../models/Ride');
const User = require('../models/User');
const Driver = require('../models/Driver');
const Message = require('../models/Message');
// const DriverLocation = require('../models/DriverLocation');

class SocketController {
  /**
   * Location Update Handler
   */
  async handleLocationUpdate(socket, io, data, callback) {
    try {
      const { latitude, longitude, rideId, heading, speed } = data;

      // Validate data
      if (!latitude || !longitude || 
          typeof latitude !== 'number' || typeof longitude !== 'number' ||
          latitude < -90 || latitude > 90 || 
          longitude < -180 || longitude > 180) {
        const error = 'Invalid location data';
        logger.warn(`${socket.userId}: ${error}`);
        if (callback) callback({ success: false, error });
        return;
      }

      // Only drivers can send location updates
      if (socket.userRole !== 'driver') {
        const error = 'Only drivers can send location updates';
        if (callback) callback({ success: false, error });
        return;
      }

      // Save location to database
      await DriverLocation.findOneAndUpdate(
        { driverId: socket.userId },
        {
          driverId: socket.userId,
          location: {
            type: 'Point',
            coordinates: [longitude, latitude]
          },
          heading: heading || 0,
          speed: speed || 0,
          timestamp: new Date()
        },
        { upsert: true, new: true }
      );

      const locationData = {
        driverId: socket.userId,
        location: { latitude, longitude },
        heading,
        speed,
        timestamp: new Date()
      };

      // If rideId provided, emit to that ride's passenger and admins
      if (rideId) {
        // Verify driver is assigned to this ride
        const ride = await Ride.findOne({ 
          _id: rideId, 
          driverId: socket.userId,
          status: { $in: ['accepted', 'picked_up', 'in_progress'] }
        });

        if (ride) {
          // Emit to passenger
          io.to(`user_${ride.customerId}`).emit('driver_location_update', locationData);
          // Emit to ride room
          socket.to(`ride_${rideId}`).emit('driver_location_update', locationData);
        }
      }

      // Always emit to admin dashboard
      io.to('admins').emit('driver_location_update', locationData);

      logger.debug(`Location update from driver ${socket.userId}`);

      if (callback) callback({ success: true, timestamp: locationData.timestamp });
    } catch (error) {
      logger.error('Location update error:', error);
      if (callback) callback({ success: false, error: 'Internal server error' });
    }
  }

  /**
   * Ride Message Handler
   */
  // async handleSendMessage(req, res) {
  //   try {
  //     console.log("HTTP Ride Message Handler Invoked");

  //     const senderId = req.user.userId;      // Comes from auth middleware
  //     const { rideId, message, receiverId } = req.body;

  //     console.log("Sender ID:", senderId);
  //     console.log("Ride ID:", rideId);
  //     console.log("Receiver ID:", receiverId);
  //     console.log("Message:", message);
  //     // Validate fields
  //     if (!senderId || !message || !receiverId || !rideId) {
  //       return res.status(400).json({ success: false, error: "Missing required fields" });
  //     }

  //     // Validate message content
  //     if (typeof message !== "string" || message.trim().length === 0) {
  //       return res.status(400).json({ success: false, error: "Invalid message" });
  //     }

  //     if (message.length > 1000) {
  //       return res.status(400).json({ success: false, error: "Message too long (max 1000 characters)" });
  //     }

  //     // Fetch ride
  //     const ride = await Ride.findById(rideId);
  //     if (!ride) {
  //       return res.status(404).json({ success: false, error: "Ride not found" });
  //     }

  //     // Check if sender is customer or driver
  //     const isCustomer = ride.customerId?.toString() === senderId;
  //     const isDriver = ride.driverId?.toString() === receiverId;

  //     if (!isCustomer && !isDriver) {
  //       return res.status(403).json({ success: false, error: "You are not a participant in this ride" });
  //     }


  //     // Save message
  //     const newMessage = await Message.create({
  //       rideId,
  //       sender: senderId,
  //       recipient: receiverId,
  //       message: message,
  //     });

  //     return res.json({
  //       success: true,
  //       message: "Message sent successfully",
  //       data: newMessage,
  //     });

  //   } catch (error) {
  //     logger.error("Ride message error:", error);
  //     return res.status(500).json({ success: false, error: "Internal server error" });
  //   }
  // }

  async handleSendMessage(req, res) {
  try {
    console.log("HTTP Ride Message Handler Invoked");
    
    const senderId = req.user.userId.toString();      // Comes from auth middleware
    const { rideId, message, receiverId } = req.body;
  
    // Validate fields
    if (!senderId || !message || !receiverId || !rideId) {
      return res.status(400).json({ success: false, error: "Missing required fields" });
    }
    
    // Validate message content
    if (typeof message !== "string" || message.trim().length === 0) {
      return res.status(400).json({ success: false, error: "Invalid message" });
    }
    
    if (message.length > 1000) {
      return res.status(400).json({ success: false, error: "Message too long (max 1000 characters)" });
    }
    
    // Fetch ride
    const ride = await Ride.findById(rideId);
    if (!ride) {
      return res.status(404).json({ success: false, error: "Ride not found" });
    }
    
    // Check if sender is customer or driver
    const isCustomer = ride.customerId?.toString() === senderId;
    const isDriver = ride.driverId?.toString() === senderId;
    console.log(ride.customerId?.toString(), ride.driverId?.toString(), senderId);
    
    if (!isCustomer && !isDriver) {
      return res.status(403).json({ success: false, error: "You are not a participant in this ride" });
    }
    
    // Save message
    const newMessage = await Message.create({
      rideId,
      sender: senderId,
      recipient: receiverId,
      message: message,
    });
    
    // Emit to socket room

     const io = req.app.get('io');
      io.to(`ride:${rideId}`).emit('receive-message', {
        rideId,
        senderId,
        receiverId,
        message,
        timestamp: newMessage.createdAt
      });
    
    return res.json({
      success: true,
      message: "Message sent successfully",
      data: newMessage,
    });
    
  } catch (error) {
    logger.error("Ride message error:", error);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
}

  //get all messages for a ride
  async handleGetMessages(req, res) {
    try {
      const userId = req.user.userId;      
      const { rideId } = req.params;

      if (!rideId) {
        return res.status(400).json({ success: false, error: "Missing rideId" });
      }

      const messages = await Message.find({ rideId });

      return res.json({
        success: true,
        data: messages,
      });
    } catch (error) {
      logger.error("Get messages error:", error);
      return res.status(500).json({ success: false, error: "Internal server error" });
    }
  }

  /**
   * Ride Status Update Handler
   */
  async handleRideStatusUpdate(socket, io, data, callback) {
    try {
      const { rideId, status } = data;

      if (!rideId || !status) {
        if (callback) callback({ success: false, error: 'Missing required fields' });
        return;
      }

      // Only drivers can update ride status
      if (socket.userRole !== 'driver') {
        if (callback) callback({ success: false, error: 'Only drivers can update ride status' });
        return;
      }

      // Verify driver is assigned to this ride
      const ride = await Ride.findOne({ _id: rideId, driverId: socket.userId });
      if (!ride) {
        if (callback) callback({ success: false, error: 'Ride not found or not assigned to you' });
        return;
      }

      // Validate status transition
      const validStatuses = ['accepted', 'arrived', 'picked_up', 'in_progress', 'completed', 'cancelled'];
      if (!validStatuses.includes(status)) {
        if (callback) callback({ success: false, error: 'Invalid status' });
        return;
      }

      // Update ride status
      ride.status = status;
      if (status === 'picked_up') {
        ride.pickupTime = new Date();
      } else if (status === 'completed') {
        ride.dropoffTime = new Date();
      }
      await ride.save();

      const statusUpdate = {
        rideId,
        status,
        driverId: socket.userId,
        timestamp: new Date()
      };

      // Notify passenger
      io.to(`user_${ride.customerId}`).emit('ride_status_update', statusUpdate);
      
      // Notify ride room
      io.to(`ride_${rideId}`).emit('ride_status_update', statusUpdate);

      // Notify admins
      io.to('admins').emit('ride_status_update', statusUpdate);

      logger.info(`Ride ${rideId} status updated to ${status} by driver ${socket.userId}`);

      if (callback) callback({ success: true, status, timestamp: statusUpdate.timestamp });
    } catch (error) {
      logger.error('Ride status update error:', error);
      if (callback) callback({ success: false, error: 'Internal server error' });
    }
  }

  /**
   * Driver Availability Handler
   */
  async handleDriverAvailability(socket, io, data, callback) {
    try {
      const { available } = data;

      if (typeof available !== 'boolean') {
        if (callback) callback({ success: false, error: 'Invalid availability status' });
        return;
      }

      // Only drivers can update availability
      if (socket.userRole !== 'driver') {
        if (callback) callback({ success: false, error: 'Only drivers can update availability' });
        return;
      }

      // Update driver availability in database
      await Driver.findOneAndUpdate(
        { userId: socket.userId },
        { 
          isAvailable: available,
          lastActive: new Date()
        }
      );

      const availabilityData = {
        driverId: socket.userId,
        available,
        timestamp: new Date()
      };

      // Notify admins
      io.to('admins').emit('driver_availability_update', availabilityData);

      logger.info(`Driver ${socket.userId} availability set to ${available}`);

      if (callback) callback({ success: true, available });
    } catch (error) {
      logger.error('Driver availability error:', error);
      if (callback) callback({ success: false, error: 'Internal server error' });
    }
  }

  /**
   * Mark Messages as Read Handler
   */
  async handleMarkMessagesRead(socket, io, data, callback) {
    try {
      const { rideId } = data;

      if (!rideId) {
        if (callback) callback({ success: false, error: 'Missing rideId' });
        return;
      }

      // Mark all messages as read for this user in this ride
      const result = await Message.updateMany(
        { 
          rideId, 
          recipient: socket.userId,
          read: false
        },
        { 
          read: true,
          readAt: new Date()
        }
      );

      logger.info(`${result.modifiedCount} messages marked as read for user ${socket.userId} in ride ${rideId}`);

      // Notify sender that messages were read
      const ride = await Ride.findById(rideId);
      if (ride) {
        const otherUserId = ride.customerId?.toString() === socket.userId 
          ? ride.driverId 
          : ride.customerId;

        if (otherUserId) {
          io.to(`user_${otherUserId}`).emit('messages_read', {
            rideId,
            readBy: socket.userId,
            count: result.modifiedCount,
            timestamp: new Date()
          });
        }
      }

      if (callback) callback({ success: true, count: result.modifiedCount });
    } catch (error) {
      logger.error('Mark messages read error:', error);
      if (callback) callback({ success: false, error: 'Internal server error' });
    }
  }

}

module.exports = new SocketController();