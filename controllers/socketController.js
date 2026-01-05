const logger = require('../utils/logger');
const Ride = require('../models/Ride');
const User = require('../models/User');
const Driver = require('../models/Driver');
const Message = require('../models/Message');
// const DriverLocation = require('../models/DriverLocation');

class SocketController {
 /**
 * HTTP Location Update Handler (REST API endpoint)
 */
async handleLocationUpdate(req, res) {
  try {
    
    let driverId = req.user.userId.toString();
    
    
    const { latitude, longitude, rideId, heading, speed } = req.body;
    
    console.log('📍 Location update request:', { 
      driverId, 
      latitude, 
      longitude, 
      rideId,
      heading,
      speed,
      driverObj: req.driver 
    });

    // ✅ Validate driverId
    if (!driverId) {
      return res.status(401).json({ 
        success: false, 
        error: "Driver authentication required" 
      });
    }

    // ✅ Validate location data
    if (!latitude || !longitude || 
        typeof latitude !== 'number' || typeof longitude !== 'number' ||
        latitude < -90 || latitude > 90 || 
        longitude < -180 || longitude > 180) {
      return res.status(400).json({ 
        success: false, 
        error: "Invalid location data",
        debug: { 
          latitude: { value: latitude, valid: typeof latitude === 'number' && latitude >= -90 && latitude <= 90 },
          longitude: { value: longitude, valid: typeof longitude === 'number' && longitude >= -180 && longitude <= 180 }
        }
      });
    }

    // ✅ Save location to database
    const updatedLocation = await Driver.findOneAndUpdate(
      { userId: driverId },
      {
        userId: driverId,
        currentLocation: {
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
      driverId,
      location: { latitude, longitude },
      heading: heading || 0,
      speed: speed || 0,
      timestamp: updatedLocation.timestamp
    };

    const io = req.app.get('io');

    if (rideId) {
  
      const ride = await Ride.findOne({ 
        _id: rideId, 
        driverId,
        status: { $in: ['accepted', 'picked_up', 'in_progress'] }
      });

      console.log(ride);
      if (ride) {
        const customerId = ride.customerId.toString();
        
        console.log('📡 Emitting location to:', { 
          customerRoom: `user:${customerId}`,
          rideRoom: `ride:${rideId}`,
          adminRoom: 'admins'
        });

        
        io.to(`user:${customerId}`).emit('driver-location-update', locationData);
        
       
        io.to(`ride:${rideId}`).emit('driver-location-update', locationData);
      } else {
        console.log('⚠️ Ride not found or driver not assigned:', { rideId, driverId });
      }
    }

    // // ✅ Always emit to admin dashboard
    // io.to('admins').emit('driver-location-update', locationData);

    // console.log('✅ Location updated successfully via HTTP:', { driverId, rideId });

    return res.json({
      success: true,
      message: "Location updated successfully",
      data: {
        driverId,
        location: { latitude, longitude },
        heading: heading || 0,
        speed: speed || 0,
        timestamp: updatedLocation.timestamp
      }
    });

  } catch (error) {
    console.error("❌ Location update error:", error);
    return res.status(500).json({ 
      success: false, 
      error: "Internal server error" 
    });
  }
}

async handleSendMessage(req, res) {
  try {
    
    // ✅ FIX: Handle both customer and driver auth
    let senderId = req.user.userId.toString();
    
    // ✅ FIX: Handle case where ID might be wrapped in an object
    if (typeof senderId === 'object' && senderId !== null) {
      senderId = senderId.driverId || senderId.userId;
    }
    
    senderId = senderId?.toString();
    
    const { rideId, message, receiverId } = req.body;
    
    console.log('📝 Message request:', { senderId, rideId, receiverId, userObj: req.user, driverObj: req.driver });
  
    // Validate fields
    if (!senderId || !message || !receiverId || !rideId) {
      return res.status(400).json({ 
        success: false, 
        error: "Missing required fields",
        debug: { senderId: !!senderId, message: !!message, receiverId: !!receiverId, rideId: !!rideId }
      });
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
    const customerId = ride.customerId?.toString();
    const driverId = ride.driverId?.toString();
    
    const isCustomer = customerId === senderId;
    const isDriver = driverId === senderId;
    
    console.log('🔍 Authorization check:', { 
      customerId, 
      driverId, 
      senderId, 
      isCustomer, 
      isDriver 
    });
    
    if (!isCustomer && !isDriver) {
      return res.status(403).json({ 
        success: false, 
        error: "You are not a participant in this ride" 
      });
    }
    
    // Save message
    const newMessage = await Message.create({
      rideId,
      sender: senderId,
      recipient: receiverId,
      message: message.trim(),
    });
    
    // Emit to socket room
    const io = req.app.get('io');
    const messageData = {
      rideId,
      senderId,
      receiverId,
      message: message.trim(),
      timestamp: newMessage.createdAt
    };
    
    // ✅ ONLY emit to ride room (both participants are in this room)
    io.to(`ride:${rideId}`).emit('receive-message', messageData);
    
    console.log('✅ Message sent via HTTP:', { rideId, senderId, receiverId });
    
    return res.json({
      success: true,
      message: "Message sent successfully",
      data: newMessage,
    });
    
  } catch (error) {
    console.error("❌ Ride message error:", error);
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
      io.to(`user:${ride.customerId}`).emit('ride_status_update', statusUpdate);
      
      // Notify ride room
      io.to(`ride:${rideId}`).emit('ride_status_update', statusUpdate);

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