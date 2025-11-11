const logger = require('../utils/logger');
const Ride = require('../models/Ride');
const User = require('../models/User');
const Message = require('../models/Message');
const DriverLocation = require('../models/DriverLocation');

// ✅ Location Update Controller
const handleLocationUpdate = async (socket, io, data, callback) => {
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
        driver: socket.userId,
        status: { $in: ['accepted', 'picked_up', 'in_progress'] }
      });

      if (ride) {
        // Emit to passenger
        io.to(`user_${ride.passenger}`).emit('driver_location_update', locationData);
        // Emit to ride room
        socket.to(`ride_${rideId}`).emit('driver_location_update', locationData);
      }
    }

    // Always emit to admin dashboard
    io.to('admins').emit('driver_location_update', locationData);

    logger.debug(`Location update from driver ${socket.userId}`);

    if (callback) callback({ success: true, timestamp: locationData.timestamp });
  } catch (err) {
    logger.error(`Location update error: ${err.message}`);
    if (callback) callback({ success: false, error: 'Server error' });
  }
};

// // ✅ Ride Message Controller
// const handleRideMessage = async (socket, io, data, callback) => {
//   try {
//     const { rideId, message, recipientId } = data;

//     // Validate required fields
//     if (!rideId || !message || !recipientId) {
//       const error = 'Missing required fields';
//       if (callback) callback({ success: false, error });
//       return;
//     }

//     // Validate message
//     if (typeof message !== 'string' || message.trim().length === 0) {
//       const error = 'Invalid message';
//       if (callback) callback({ success: false, error });
//       return;
//     }

//     if (message.length > 1000) {
//       const error = 'Message too long (max 1000 characters)';
//       if (callback) callback({ success: false, error });
//       return;
//     }

//     // Verify ride exists and user is part of it
//     const ride = await Ride.findById(rideId);
//     if (!ride) {
//       const error = 'Ride not found';
//       if (callback) callback({ success: false, error });
//       return;
//     }

//     // Verify user is participant (passenger or driver)
//     const isPassenger = ride.passenger.toString() === socket.userId;
//     const isDriver = ride.driver && ride.driver.toString() === socket.userId;

//     if (!isPassenger && !isDriver) {
//       const error = 'You are not a participant in this ride';
//       if (callback) callback({ success: false, error });
//       return;
//     }

//     // Verify recipient is the other participant
//     const validRecipient = (isPassenger && ride.driver && ride.driver.toString() === recipientId) ||
//                            (isDriver && ride.passenger.toString() === recipientId);

//     if (!validRecipient) {
//       const error = 'Invalid recipient';
//       if (callback) callback({ success: false, error });
//       return;
//     }

//     // Sanitize message
//     const sanitizedMessage = message.trim();

//     // Save message to database
//     const newMessage = await Message.create({
//       rideId,
//       sender: socket.userId,
//       recipient: recipientId,
//       message: sanitizedMessage,
//       timestamp: new Date(),
//       read: false
//     });

//     const messageData = {
//       messageId: newMessage._id,
//       rideId,
//       message: sanitizedMessage,
//       senderId: socket.userId,
//       recipientId,
//       timestamp: newMessage.timestamp
//     };

//     // Emit to recipient
//     io.to(`user_${recipientId}`).emit('ride_message', messageData);
    
//     // Also emit to ride room
//     socket.to(`ride_${rideId}`).emit('ride_message', messageData);

//     // Send notification to recipient if they're offline
//     const recipientSockets = await io.in(`user_${recipientId}`).allSockets();
//     if (recipientSockets.size === 0) {
//       // Trigger push notification (implement your notification service)
//       // await sendPushNotification(recipientId, 'New message', sanitizedMessage);
//     }

//     logger.info(`Message sent from ${socket.userId} to ${recipientId} in ride ${rideId}`);

//     if (callback) callback({ 
//       success: true, 
//       messageId: newMessage._id,
//       timestamp: messageData.timestamp 
//     });
//   } catch (err) {
//     logger.error(`Ride message error: ${err.message}`);
//     if (callback) callback({ success: false, error: 'Server error' });
//   }
// };

// ✅ Updated Ride Message Controller (matching your schema)
const handleRideMessage = async (socket, io, data, callback) => {
  try {
    const { rideId, message, recipientId } = data;

    // Validate required fields
    if (!rideId || !message || !recipientId) {
      const error = 'Missing required fields';
      if (callback) callback({ success: false, error });
      return;
    }

    // Validate message content
    if (typeof message !== 'string' || message.trim().length === 0) {
      const error = 'Invalid message';
      if (callback) callback({ success: false, error });
      return;
    }

    if (message.length > 1000) {
      const error = 'Message too long (max 1000 characters)';
      if (callback) callback({ success: false, error });
      return;
    }

    // Fetch ride
    const ride = await Ride.findById(rideId);
    if (!ride) {
      const error = 'Ride not found';
      if (callback) callback({ success: false, error });
      return;
    }

    // Validate user is part of this ride
    const isCustomer = ride.customerId?.toString() === socket.userId;
    const isDriver = ride.driverId?.toString() === socket.userId;

    if (!isCustomer && !isDriver) {
      const error = 'You are not a participant in this ride';
      if (callback) callback({ success: false, error });
      return;
    }

    // Ensure recipient is the other participant
    const validRecipient =
      (isCustomer && ride.driverId?.toString() === recipientId) ||
      (isDriver && ride.customerId?.toString() === recipientId);

    if (!validRecipient) {
      const error = 'Invalid recipient';
      if (callback) callback({ success: false, error });
      return;
    }

    const sanitizedMessage = message.trim();

    // Save message
    const newMessage = await Message.create({
      rideId,
      sender: socket.userId,
      recipient: recipientId,
      message: sanitizedMessage,
      timestamp: new Date(),
      read: false,
    });

    const messageData = {
      messageId: newMessage._id,
      rideId,
      message: sanitizedMessage,
      senderId: socket.userId,
      recipientId,
      timestamp: newMessage.timestamp,
    };

    // Emit message to both parties
    io.to(`user_${recipientId}`).emit('ride_message', messageData);
    socket.to(`ride_${rideId}`).emit('ride_message', messageData);

    // Check if recipient is offline (for push notifications later)
    const recipientSockets = await io.in(`user_${recipientId}`).allSockets();
    if (recipientSockets.size === 0) {
      // Example: await sendPushNotification(recipientId, 'New message', sanitizedMessage);
    }

    console.log(`✅ Message sent from ${socket.userId} to ${recipientId} in ride ${rideId}`);

    if (callback)
      callback({
        success: true,
        messageId: newMessage._id,
        timestamp: messageData.timestamp,
      });
  } catch (err) {
    console.error(`❌ Ride message error: ${err.message}`);
    if (callback) callback({ success: false, error: 'Server error' });
  }
};


// ✅ Typing Indicator Controller
const handleTypingStart = async (socket, io, data) => {
  try {
    const { rideId, recipientId } = data;
    
    if (!rideId || !recipientId) return;

    // Verify ride participation
    const ride = await Ride.findById(rideId);
    if (!ride) return;

    const isParticipant = ride.passenger.toString() === socket.userId ||
                         (ride.driver && ride.driver.toString() === socket.userId);

    if (!isParticipant) return;

    io.to(`user_${recipientId}`).emit('user_typing', {
      rideId,
      userId: socket.userId
    });
  } catch (err) {
    logger.error(`Typing start error: ${err.message}`);
  }
};

// ✅ Typing Stop Controller
const handleTypingStop = async (socket, io, data) => {
  try {
    const { rideId, recipientId } = data;
    
    if (!rideId || !recipientId) return;

    io.to(`user_${recipientId}`).emit('user_stopped_typing', {
      rideId,
      userId: socket.userId
    });
  } catch (err) {
    logger.error(`Typing stop error: ${err.message}`);
  }
};

// ✅ Join Ride Room Controller
const handleJoinRide = async (socket, io, data, callback) => {
  try {
    const { rideId } = data;
    
    if (!rideId) {
      if (callback) callback({ success: false, error: 'Missing rideId' });
      return;
    }

    // Verify user is part of the ride
    const ride = await Ride.findById(rideId);
    if (!ride) {
      if (callback) callback({ success: false, error: 'Ride not found' });
      return;
    }

    const isParticipant = ride.passenger.toString() === socket.userId ||
                         (ride.driver && ride.driver.toString() === socket.userId) ||
                         socket.userRole === 'admin';

    if (!isParticipant) {
      if (callback) callback({ success: false, error: 'Not authorized' });
      return;
    }

    socket.join(`ride_${rideId}`);
    logger.info(`User ${socket.userId} joined ride ${rideId}`);

    // Notify other participants
    socket.to(`ride_${rideId}`).emit('user_joined_ride', {
      rideId,
      userId: socket.userId,
      userRole: socket.userRole
    });
    
    if (callback) callback({ success: true, rideId });
  } catch (err) {
    logger.error(`Join ride error: ${err.message}`);
    if (callback) callback({ success: false, error: 'Server error' });
  }
};

// ✅ Leave Ride Room Controller
const handleLeaveRide = async (socket, io, data, callback) => {
  try {
    const { rideId } = data;
    
    if (!rideId) {
      if (callback) callback({ success: false, error: 'Missing rideId' });
      return;
    }

    socket.leave(`ride_${rideId}`);
    logger.info(`User ${socket.userId} left ride ${rideId}`);

    // Notify other participants
    socket.to(`ride_${rideId}`).emit('user_left_ride', {
      rideId,
      userId: socket.userId
    });
    
    if (callback) callback({ success: true });
  } catch (err) {
    logger.error(`Leave ride error: ${err.message}`);
    if (callback) callback({ success: false, error: 'Server error' });
  }
};

// ✅ Ride Status Update Controller
const handleRideStatusUpdate = async (socket, io, data, callback) => {
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
    const ride = await Ride.findOne({ _id: rideId, driver: socket.userId });
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
    io.to(`user_${ride.passenger}`).emit('ride_status_update', statusUpdate);
    
    // Notify ride room
    io.to(`ride_${rideId}`).emit('ride_status_update', statusUpdate);

    // Notify admins
    io.to('admins').emit('ride_status_update', statusUpdate);

    logger.info(`Ride ${rideId} status updated to ${status} by driver ${socket.userId}`);

    if (callback) callback({ success: true, status, timestamp: statusUpdate.timestamp });
  } catch (err) {
    logger.error(`Ride status update error: ${err.message}`);
    if (callback) callback({ success: false, error: 'Server error' });
  }
};

// ✅ Driver Availability Controller
const handleDriverAvailability = async (socket, io, data, callback) => {
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
    await User.findByIdAndUpdate(socket.userId, { 
      isAvailable: available,
      lastActive: new Date()
    });

    const availabilityData = {
      driverId: socket.userId,
      available,
      timestamp: new Date()
    };

    // Notify admins
    io.to('admins').emit('driver_availability_update', availabilityData);

    logger.info(`Driver ${socket.userId} availability set to ${available}`);

    if (callback) callback({ success: true, available });
  } catch (err) {
    logger.error(`Driver availability error: ${err.message}`);
    if (callback) callback({ success: false, error: 'Server error' });
  }
};

// ✅ Mark Messages as Read Controller
const handleMarkMessagesRead = async (socket, io, data, callback) => {
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
      const otherUserId = ride.passenger.toString() === socket.userId 
        ? ride.driver 
        : ride.passenger;

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
  } catch (err) {
    logger.error(`Mark messages read error: ${err.message}`);
    if (callback) callback({ success: false, error: 'Server error' });
  }
};

// ✅ Request Driver Location Controller (for passengers)
const handleRequestDriverLocation = async (socket, io, data, callback) => {
  try {
    const { rideId } = data;

    if (!rideId) {
      if (callback) callback({ success: false, error: 'Missing rideId' });
      return;
    }

    // Verify user is the passenger of this ride
    const ride = await Ride.findOne({ 
      _id: rideId, 
      passenger: socket.userId,
      status: { $in: ['accepted', 'picked_up', 'in_progress'] }
    });

    if (!ride || !ride.driver) {
      if (callback) callback({ success: false, error: 'Ride not found or no driver assigned' });
      return;
    }

    // Get latest driver location
    const driverLocation = await DriverLocation.findOne({ driverId: ride.driver });

    if (!driverLocation) {
      if (callback) callback({ success: false, error: 'Driver location not available' });
      return;
    }

    const locationData = {
      driverId: ride.driver.toString(),
      location: {
        latitude: driverLocation.location.coordinates[1],
        longitude: driverLocation.location.coordinates[0]
      },
      heading: driverLocation.heading,
      speed: driverLocation.speed,
      timestamp: driverLocation.timestamp
    };

    if (callback) callback({ success: true, ...locationData });
  } catch (err) {
    logger.error(`Request driver location error: ${err.message}`);
    if (callback) callback({ success: false, error: 'Server error' });
  }
};

module.exports = {
  handleLocationUpdate,
  handleRideMessage,
  handleTypingStart,
  handleTypingStop,
  handleJoinRide,
  handleLeaveRide,
  handleRideStatusUpdate,
  handleDriverAvailability,
  handleMarkMessagesRead,
  handleRequestDriverLocation
};