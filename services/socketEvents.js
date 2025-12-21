// ============================================
// FILE: src/socket/socketEvents.js
// ============================================

const logger = require('../utils/logger.js');
const Driver = require('../models/Driver.js');
const { calculateDistance, isValidCoordinate } = require('./fareService.js');
const Ride = require('../models/Ride.js');
const Message = require('../models/Message.js');


const handleJoinUser = (socket, userId) => {
  if (!userId) {
    logger.error('❌ Join event without userId');
    return;
  }

  // ✅ Use "user:" prefix for customers
  const userRoom = `user:${userId}`;
  socket.join(userRoom);
  socket.userId = userId;
  
  logger.info(`👤 User ${userId} joined personal room: ${userRoom}`);
  
  socket.emit('joined', {
    success: true,
    room: userRoom,
    message: 'Successfully joined user room'
  });
};

// ✅ CORRECT: Driver joins with "driver:" prefix
const handleJoinDriver = (socket, driverId) => {
  if (!driverId) {
    logger.error('❌ join-driver event without driverId');
    return;
  }

  const driverRoom = `driver:${driverId}`;
  socket.join(driverRoom);
  socket.driverId = driverId;
  
  const rooms = Array.from(socket.rooms);
  logger.info(`🚗 Driver ${driverId} joined room: ${driverRoom}`);
  logger.info(`📋 All rooms for this socket: ${JSON.stringify(rooms)}`);
  
  socket.emit('driver-joined', {
    success: true,
    room: driverRoom,
    message: 'Successfully joined driver room',
    allRooms: rooms
  });
};

// const handleJoinChat = (socket, data) => {
//   const { senderId, receiverId } = data;

//   if (!senderId || !receiverId) {
//     logger.error("❌ Missing senderId or receiverId in join-chat");
//     return;
//   }

//   const chatRoomId = [senderId, receiverId].sort().join('-');

//   socket.join(`chat:${chatRoomId}`);
//   logger.info(`💬 User ${senderId} joined chat room: chat:${chatRoomId}`);

//   socket.emit("joined-chat", { chatRoomId: `chat:${chatRoomId}` });
// };

// const handleSendMessage = (io, socket, data) => {
//   try {
//     const { receiverId, senderId, message, rideId } = data;

//     if (!receiverId || !senderId || !message || !rideId) {
//       socket.emit("error", { message: "Missing required fields" });
//       return;
//     }

//     const chatRoomId = [senderId, receiverId].sort().join('-');

//     io.to(`chat:${chatRoomId}`).emit('receive-message', message);

//     logger.info(`✅ Message sent to chat room: chat:${chatRoomId}`);
//   } catch (err) {
//     socket.emit("error", { message: "Failed to send message" });
//   }
// };
const handleJoinChat = async (socket, data) => {
  const { rideId } = data;
  const userId = socket.userId || socket.driverId;

  if (!rideId || !userId) return;

  const ride = await Ride.findById(rideId);
  if (!ride) return;

  if (
    ride.customerId.toString() !== userId &&
    ride.driverId.toString() !== userId
  ) return;

  socket.join(`ride:${rideId}`);
  socket.emit("joined-chat", { rideId });
};

const handleSendMessage = async (io, socket, data) => {
  try {
    const { rideId, receiverId, message } = data;
    const senderId = socket.userId || socket.driverId;

    if (!rideId || !senderId || !receiverId || !message) return;

    const ride = await Ride.findById(rideId);
    if (!ride) return;

    // validate sender & receiver
    const participants = [
      ride.customerId.toString(),
      ride.driverId.toString(),
    ];

    if (!participants.includes(senderId) || !participants.includes(receiverId)) {
      socket.emit("error", { message: "Unauthorized message" });
      return;
    }

    const newMessage = await Message.create({
      rideId,
      sender: senderId,
      recipient: receiverId,
      message,
    });

    io.to(`ride:${rideId}`).emit("receive-message", {
      rideId,
      senderId,
      receiverId,
      message,
      timestamp: newMessage.createdAt,
    });

  } catch (err) {
    socket.emit("error", { message: "Failed to send message" });
  }
};

const handleLeaveChat = (socket, data) => {
  try {
    const { senderId, receiverId } = data;
    const chatRoomId = [senderId, receiverId].sort().join('-');

    socket.leave(`chat:${chatRoomId}`);

    logger.info(`👋 User ${senderId} left chat room: chat:${chatRoomId}`);
  } catch (err) {
    console.error("⚠️ Error handling leave-chat:", err);
  }
};

/**
 * Customer starts tracking a driver
 */
const handleTrackDriver = async (socket, data) => {
  try {
    const { customerId, driverId, customerLat, customerLng } = data;
    console.log('Tracking data received:', data);

    // Validate required fields
    if (
      !customerId ||
      !driverId ||
      customerLat === undefined ||
      customerLat === null ||
      customerLng === undefined ||
      customerLng === null
    ) {
      socket.emit('error', { message: 'Missing required fields' });
      return;
    }

    // Validate coordinates
    if (!isValidCoordinate(customerLat, customerLng)) {
      logger.warn(`⚠️ Customer ${customerId} sent invalid coordinates [${customerLat}, ${customerLng}]`);
      socket.emit('error', { message: 'Invalid customer location coordinates' });
      return;
    }

    // Leave previous driver room if tracking another driver
    if (socket.trackingDriverId && socket.trackingDriverId !== driverId) {
      socket.leave(`driver:${socket.trackingDriverId}`);
      logger.info(`👋 Customer ${customerId} left driver room: driver:${socket.trackingDriverId}`);
    }

    // Join new driver room
    socket.join(`driver:${driverId}`);
    socket.customerId = customerId;
    socket.customerLat = customerLat;
    socket.customerLng = customerLng;
    socket.trackingDriverId = driverId;

    logger.info(`👀 Customer ${customerId} tracking driver: ${driverId}`);

    // Fetch driver's current location
    const driver = await Driver.findOne({ userId: driverId }).select('currentLocation');
    console.log('Driver fetched for tracking:', driver);

    if (!driver) {
      socket.emit('error', { 
        message: 'Driver not found',
        code: 'DRIVER_NOT_FOUND'
      });
      socket.leave(`driver:${driverId}`);
      socket.trackingDriverId = null;
      return;
    }

    if (driver.currentLocation?.coordinates) {
      const driverLat = driver.currentLocation.coordinates[1];
      const driverLng = driver.currentLocation.coordinates[0];

      // Calculate distance
      const distanceKm = calculateDistance(
        [customerLng, customerLat],
        [driverLng, driverLat]
      );
      
      socket.emit('tracking-started', {
        driverId,
        distanceKm,
        driverLocation: { lat: driverLat, lng: driverLng }
      });
    } else {
      socket.emit('tracking-started', { 
        driverId, 
        distanceKm: null,
        message: 'Driver location not yet available'
      });
    }

  } catch (err) {
    logger.error('❌ Error in handleTrackDriver:', err);
    socket.emit('error', { message: 'Failed to track driver' });
  }
};

/**
 * Customer updates their own location (for accurate distance calculation)
 */
const handleCustomerLocationUpdate = (socket, data) => {
  const { latitude, longitude } = data;
  
  if (!isValidCoordinate(latitude, longitude)) {
    socket.emit('error', { message: 'Invalid location data' });
    return;
  }
  
  socket.customerLat = latitude;
  socket.customerLng = longitude;
  
  logger.info(`📍 Customer ${socket.customerId} location updated: [${latitude}, ${longitude}]`);
};

/**
 * Customer stops tracking a driver
 */
const handleStopTrackingDriver = (socket, data) => {
  try {
    const { customerId, driverId } = data;

    if (!driverId) {
      socket.emit('error', { message: 'Missing driverId' });
      return;
    }

    socket.leave(`driver:${driverId}`);
    socket.trackingDriverId = null;

    logger.info(`👋 Customer ${customerId} stopped tracking driver: ${driverId}`);
    
    socket.emit('tracking-stopped', { driverId });
  } catch (err) {
    logger.error('❌ Error in handleStopTrackingDriver:', err);
  }
};

/**
 * Handle real-time driver location updates
 * Broadcasts location to all tracking customers
 */
const handleDriverLocationUpdate = async (io, socket, data) => {
  try {
    const { latitude, longitude, heading, speed } = data;
    const driverId = socket.driverId;

    if (!driverId) {
      socket.emit('error', { message: 'Driver not authenticated' });
      return;
    }

    if (!isValidCoordinate(latitude, longitude)) {
      socket.emit('error', { message: 'Invalid location data' });
      return;
    }

    // Rate limiting
    const now = Date.now();
    const lastUpdate = locationUpdateLimiter.get(driverId);
    
    if (lastUpdate && (now - lastUpdate) < RATE_LIMIT_MS) {
      return; // Silently ignore too frequent updates
    }
    
    locationUpdateLimiter.set(driverId, now);

    // Update database
    await Driver.findOneAndUpdate(
      { userId: driverId },
      {
        currentLocation: {
          type: 'Point',
          coordinates: [longitude, latitude],
        },
        lastLocationUpdate: new Date(),
        ...(heading !== undefined && { heading }),
        ...(speed !== undefined && { speed }),
      },
      { new: true }
    );

    // Get all sockets in the driver's room
    const driverRoom = `driver:${driverId}`;
    const socketsInRoom = await io.in(driverRoom).fetchSockets();

    logger.info(`📍 Broadcasting to ${socketsInRoom.length} clients in room ${driverRoom}`);

    // Broadcast to each customer with personalized distance
    let customerCount = 0;
    for (const clientSocket of socketsInRoom) {
      // Skip the driver's own socket
      if (clientSocket.id === socket.id) {
        continue;
      }

      // Calculate distance for this specific customer
      let distanceKm = null;
      if (clientSocket.customerLat && clientSocket.customerLng) {
        distanceKm = calculateDistance(
          [clientSocket.customerLng, clientSocket.customerLat],
          [longitude, latitude]
        );
      }

      // Send personalized update to this customer
      clientSocket.emit('driver-location-update', {
        driverId,
        location: {
          latitude,
          longitude,
          ...(heading !== undefined && { heading }),
          ...(speed !== undefined && { speed }),
        },
        distanceKm,
        timestamp: new Date().toISOString(),
      });
      
      customerCount++;
    }

    // Confirm to driver
    socket.emit('location-update-success', {
      latitude,
      longitude,
      customersNotified: customerCount,
      timestamp: new Date().toISOString()
    });

    logger.info(`📍 Driver ${driverId} location broadcast to ${customerCount} customers: [${latitude}, ${longitude}]`);
    
  } catch (err) {
    logger.error('❌ Error in handleDriverLocationUpdate:', err);
    socket.emit('error', { message: 'Failed to update location' });
  }
};

/**
 * Handle socket disconnect
 */
const handleDisconnect = (socket) => {
  const { driverId, customerId, trackingDriverId } = socket;
  
  if (driverId) {
    logger.info(`🚗 Driver ${driverId} disconnected`);
  }
  
  if (customerId && trackingDriverId) {
    logger.info(`👤 Customer ${customerId} disconnected while tracking driver ${trackingDriverId}`);
  }
  
  // Clean up socket properties to prevent memory leaks
  delete socket.driverId;
  delete socket.customerId;
  delete socket.customerLat;
  delete socket.customerLng;
  delete socket.trackingDriverId;
};



module.exports = {
  handleJoinUser,
  handleJoinChat,
  handleLeaveChat,
  handleJoinDriver,
  handleTrackDriver,
  handleStopTrackingDriver,
  handleDriverLocationUpdate,
  handleJoinDriver,
  handleDisconnect,
  handleCustomerLocationUpdate,
  handleSendMessage
};
