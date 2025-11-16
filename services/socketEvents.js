// ============================================
// FILE: src/socket/socketEvents.js
// ============================================

const logger = require('../utils/logger.js');
const Driver = require('../models/Driver.js');
const { calculateFare, calculateDistance } = require('../services/fareService');


const handleJoinUser = (socket, senderId) => {
  socket.join(`user:${senderId}`);
  socket.emit("connected");
  logger.info(`👤 User ${senderId} joined personal room: user:${senderId}`);
};

const handleJoinChat = (socket, data) => {
  const { senderId, receiverId } = data;

  if (!senderId || !receiverId) {
    logger.error("❌ Missing senderId or receiverId in join-chat");
    return;
  }

  const chatRoomId = [senderId, receiverId].sort().join('-');

  socket.join(`chat:${chatRoomId}`);
  logger.info(`💬 User ${senderId} joined chat room: chat:${chatRoomId}`);

  socket.emit("joined-chat", { chatRoomId: `chat:${chatRoomId}` });
};

const handleSendMessage = (io, socket, data) => {
  try {
    const { receiverId, senderId, message } = data;

    if (!receiverId || !senderId || !message) {
      socket.emit("error", { message: "Missing required fields" });
      return;
    }

    const chatRoomId = [senderId, receiverId].sort().join('-');

    io.to(`chat:${chatRoomId}`).emit('receive-message', message);

    logger.info(`✅ Message sent to chat room: chat:${chatRoomId}`);
  } catch (err) {
    socket.emit("error", { message: "Failed to send message" });
  }
};

const handleTyping = (socket, data) => {
  try {
    const { senderId, receiverId } = data;
    const chatRoomId = [senderId, receiverId].sort().join('-');

    socket.to(`chat:${chatRoomId}`).emit('user-typing', { userId: senderId });
  } catch (err) {
    console.error("⚠️ Error handling typing:", err);
  }
};

const handleStopTyping = (socket, data) => {
  try {
    const { senderId, receiverId } = data;
    const chatRoomId = [senderId, receiverId].sort().join('-');

    socket.to(`chat:${chatRoomId}`).emit('user-stop-typing', { userId: senderId });
  } catch (err) {
    console.error("⚠️ Error handling stop-typing:", err);
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
 * Handle driver joining the tracking system
 * Driver joins their own room to broadcast location updates
 */
const handleJoinDriver = async (socket, driverData) => {
  try {
    // Extract actual driverId string
    const driverId = driverData?.driverId || driverData;

    // Create driver room
    socket.join(`driver:${driverId}`);
    socket.driverId = driverId;

    console.log('Driver ID in socket:', driverId);
    console.log('Driver room joined:', `driver:${driverId}`);

    logger.info(`🚗 Driver ${driverId} joined tracking room: driver:${driverId}`);

    // Fetch driver from DB
    const driver = await Driver.findOne({ userId: driverId });
    
    if (driver?.currentLocation) {
      socket.emit('location-connected', {
        location: {
          latitude: driver.currentLocation.coordinates[1],
          longitude: driver.currentLocation.coordinates[0],
        },
      });
    }
  } catch (err) {
    logger.error('❌ Error in handleJoinDriver:', err);
    socket.emit('error', { message: 'Failed to join driver tracking' });
  }
};

/**
 * Handle customer tracking a specific driver
 * Customer joins driver's room to receive location updates
 */
const handleTrackDriver = async (socket, data) => {
  try {
    const { customerId, driverId, customerLat, customerLng } = data;
    console.log('Tracking data received:', data);

    // FIXED VALIDATION - check for undefined/null but allow 0
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

    // Validate coordinates are reasonable (not at null island)
    if (customerLat === 0 && customerLng === 0) {
      logger.warn(`⚠️ Customer ${customerId} sent invalid coordinates [0,0]`);
      socket.emit('error', { message: 'Invalid customer location coordinates' });
      return;
    }

    socket.join(`driver:${driverId}`);
    socket.customerId = customerId;
    socket.customerLat = customerLat;
    socket.customerLng = customerLng;
    socket.trackingDriverId = driverId;

    logger.info(`👀 Customer ${customerId} tracking driver: ${driverId}`);

    // Fetch driver's current stored location
    const driver = await Driver.findOne({ userId: driverId }).select('currentLocation');
    console.log('Driver fetched for tracking:', driver);

    if (driver?.currentLocation) {
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
      socket.emit('tracking-started', { driverId, distanceKm: null });
    }

  } catch (err) {
    logger.error('❌ Error in handleTrackDriver:', err);
    socket.emit('error', { message: 'Failed to track driver' });
  }
};

/**
 * Handle customer stopping driver tracking
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
 * Broadcasts location to all tracking customers (FIXED)
 */
const handleDriverLocationUpdate = async (io, socket, data) => {
  try {
    const { latitude, longitude, heading, speed } = data;
    const driverId = socket.driverId;

    if (!driverId) {
      socket.emit('error', { message: 'Driver not authenticated' });
      return;
    }

    if (!latitude || !longitude) {
      socket.emit('error', { message: 'Invalid location data' });
      return;
    }

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

    // FIXED: Get all sockets in the driver's room
    const driverRoom = `driver:${driverId}`;
    const socketsInRoom = await io.in(driverRoom).fetchSockets();

    logger.info(`📍 Broadcasting to ${socketsInRoom.length} clients in room ${driverRoom}`);

    // Broadcast to each customer with personalized distance
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
    }

    logger.info(`📍 Driver ${driverId} location broadcast to ${socketsInRoom.length - 1} customers: [${latitude}, ${longitude}]`);
    
  } catch (err) {
    logger.error('❌ Error in handleDriverLocationUpdate:', err);
    socket.emit('error', { message: 'Failed to update location' });
  }
};


module.exports = {
  handleJoinUser,
  handleJoinChat,
  handleSendMessage,
  handleTyping,
  handleStopTyping,
  handleLeaveChat,
  handleJoinDriver,
  handleTrackDriver,
  handleStopTrackingDriver,
  handleDriverLocationUpdate,
};
