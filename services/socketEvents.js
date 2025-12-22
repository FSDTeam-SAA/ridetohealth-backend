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
// const handleJoinDriver = (socket, driverId) => {
//   if (!driverId) {
//     logger.error('❌ join-driver event without driverId');
//     return;
//   }

//   const driverRoom = `driver:${driverId.toString()}`;
//   socket.join(driverRoom);
//   socket.driverId = driverId;
  
//   const rooms = Array.from(socket.rooms);
//   logger.info(`🚗 Driver ${driverId} joined room: ${driverRoom}`);
//   logger.info(`📋 All rooms for this socket: ${JSON.stringify(rooms)}`);
  
//   socket.emit('driver-joined', {
//     success: true,
//     room: driverRoom,
//     message: 'Successfully joined driver room',
//     allRooms: rooms
//   });
// };

const handleJoinDriver = (socket, driverIdOrData) => {
  // Extract ID if object is passed
  let driverId = driverIdOrData;
  if (typeof driverIdOrData === 'object' && driverIdOrData !== null) {
    driverId = driverIdOrData.driverId || driverIdOrData.id || driverIdOrData._id;
  }
  
  if (!driverId) {
    logger.error('❌ join-driver event without driverId');
    return;
  }

  const driverIdStr = String(driverId);
  const driverRoom = `driver:${driverIdStr}`;
  
  socket.join(driverRoom);
  socket.driverId = driverIdStr;
  
  const rooms = Array.from(socket.rooms);
  logger.info(`🚗 Driver ${driverIdStr} joined room: ${driverRoom}`);
  logger.info(`📋 All rooms for this socket: ${JSON.stringify(rooms)}`);
  
  socket.emit('driver-joined', {
    success: true,
    room: driverRoom,
    message: 'Successfully joined driver room',
    allRooms: rooms
  });
};

const handleJoinChat = async (socket, data) => {
  const { rideId } = data;
  
  // ✅ FIX: Extract userId correctly for both customer and driver
  let userId = socket.userId || socket.driverId;
  
  // ✅ FIX: Handle case where driverId might be wrapped in an object
  if (typeof userId === 'object' && userId !== null) {
    userId = userId.driverId || userId.userId;
  }
  
  // Convert to string for consistent comparison
  userId = userId?.toString();

  console.log('🔵 Join chat attempt:', { rideId, userId, rawUserId: socket.userId, rawDriverId: socket.driverId });

  if (!rideId || !userId) {
    console.log('❌ Missing rideId or userId');
    return;
  }

  const ride = await Ride.findById(rideId);
  if (!ride) {
    console.log('❌ Ride not found:', rideId);
    return;
  }

  if (
    ride.customerId.toString() !== userId &&
    ride.driverId.toString() !== userId
  ) {
    console.log('❌ User not participant in ride', {
      customerId: ride.customerId.toString(),
      driverId: ride.driverId.toString(),
      userId
    });
    return;
  }

  socket.join(`ride:${rideId}`);
  console.log(`✅ Joined ride room: ride:${rideId} by user: ${userId}`);
  socket.emit("joined-chat", { rideId });
};

const handleSendMessage = async (io, socket, data) => {
  try {
    const { rideId, message } = data;
    
    // ✅ FIX: Extract senderId correctly
    let senderId = socket.userId || socket.driverId;
    
    // ✅ FIX: Handle case where ID might be wrapped in an object
    if (typeof senderId === 'object' && senderId !== null) {
      senderId = senderId.driverId || senderId.userId;
    }
    
    // Convert to string for consistent comparison
    senderId = senderId?.toString();

    console.log('📨 Send message:', { 
      rideId, 
      senderId, 
      messagePreview: message?.substring(0, 30),
      rawUserId: socket.userId,
      rawDriverId: socket.driverId
    });

    if (!rideId || !senderId || !message) {
      console.log('❌ Missing required fields');
      return;
    }

    const ride = await Ride.findById(rideId);
    if (!ride) {
      console.log('❌ Ride not found');
      return;
    }

    const customerId = ride.customerId.toString();
    const driverId = ride.driverId.toString();
    const receiverId = senderId === customerId ? driverId : customerId;

    console.log('👥 Participants:', { customerId, driverId, senderId, receiverId });

    if (senderId !== customerId && senderId !== driverId) {
      console.log('❌ Unauthorized sender');
      socket.emit("error", { message: "Unauthorized message" });
      return;
    }

    const newMessage = await Message.create({
      rideId,
      sender: senderId,
      recipient: receiverId,
      message,
    });
    
    console.log('📤 Emitting to room:', { 
      rideRoom: `ride:${rideId}`,
      socketRooms: Array.from(socket.rooms)
    });

    // ✅ ONLY emit to ride room (both participants are in this room)
    const messageData = {
      rideId,
      senderId,
      receiverId,
      message,
      timestamp: newMessage.createdAt,
    };

    io.to(`ride:${rideId}`).emit("receive-message", messageData);

    console.log('✅ Message sent successfully');

  } catch (err) {
    console.error('❌ Send message error:', err);
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
