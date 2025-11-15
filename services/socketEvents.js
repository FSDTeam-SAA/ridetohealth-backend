// ============================================
// FILE: src/socket/socketEvents.js
// ============================================

const logger = require('../utils/logger.js');

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
 * Handle driver joining their tracking room
 * Drivers join a room to broadcast their location
 */
const handleJoinDriver = async (socket, driverId) => {
  try {
    socket.join(`driver:${driverId}`);
    socket.driverId = driverId; // Store driverId in socket for later use
    
    logger.info(`🚗 Driver ${driverId} joined tracking room: driver:${driverId}`);
    
    // Fetch and emit current driver location
    const driver = await Driver.findOne({ userId: driverId });
    if (driver && driver.currentLocation) {
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
const handleTrackDriver = (socket, data) => {
  try {
    const { customerId, driverId } = data;

    if (!customerId || !driverId) {
      socket.emit('error', { message: 'Missing customerId or driverId' });
      return;
    }

    socket.join(`driver:${driverId}`);
    socket.customerId = customerId;
    socket.trackingDriverId = driverId;

    logger.info(`👀 Customer ${customerId} tracking driver: ${driverId}`);
    
    socket.emit('tracking-started', { driverId });
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

    // Broadcast to all customers tracking this driver
    io.to(`driver:${driverId}`).emit('driver-location-update', {
      driverId,
      location: {
        latitude,
        longitude,
        ...(heading !== undefined && { heading }),
        ...(speed !== undefined && { speed }),
      },
      timestamp: new Date().toISOString(),
    });

    logger.info(`📍 Driver ${driverId} location updated: [${latitude}, ${longitude}]`);
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
