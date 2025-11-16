// ============================================
// FILE: src/socket/socketHandler.js - FIXED VERSION
// ============================================

const logger = require('../utils/logger');
const {
  handleJoinUser,
  handleJoinChat,
  handleSendMessage,
  handleTyping,
  handleStopTyping,
  handleLeaveChat,
  handleJoinDriver,
  handleTrackDriver,
  handleStopTrackingDriver,
  handleDriverLocationUpdate
} = require('./socketEvents.js');

const socketHandler = (io, socket) => {
  logger.info(`🟢 New socket connection: ${socket.id}`);
  
  // User joins their personal room
  socket.on('join', (data) => {
    if (data.senderId) {
      handleJoinUser(socket, data.senderId);
    } else {
      logger.error("❌ Join event received without senderId");
    }
  });

  // User joins a specific chat room
  socket.on('join-chat', (data) => {
    handleJoinChat(socket, data);
  });

  // User leaves a chat room
  socket.on('leave-chat', (data) => {
    handleLeaveChat(socket, data);
  });

  // Handle new message
  socket.on('send-message', (data) => {
    handleSendMessage(io, socket, data);
  });

  // Typing indicators
  socket.on('typing', (data) => {
    handleTyping(socket, data);
  });
  
  socket.on('stop-typing', (data) => {
    handleStopTyping(socket, data);
  });

  // === DRIVER LOCATION EVENTS ===
  
  // Driver joins tracking system
  socket.on('join-driver', (driverId) => {
    handleJoinDriver(socket, driverId);
  });

  // Customer starts tracking a driver
  socket.on('track-driver', (data) => {
    handleTrackDriver(socket, data);
  });

  // Customer stops tracking a driver
  socket.on('stop-tracking-driver', (data) => {
    handleStopTrackingDriver(socket, data);
  });

  // Driver sends location update
  socket.on('update-location', (data) => {
    handleDriverLocationUpdate(io, socket, data);
  });

  // === GENERAL EVENTS ===
  
  socket.on('disconnect', () => {
    logger.info(`🔴 User disconnected: ${socket.id}`);
    
    // Clean up tracking if customer disconnects
    if (socket.trackingDriverId) {
      socket.leave(`driver:${socket.trackingDriverId}`);
    }
  });

  socket.on('error', (error) => {
    logger.error('❌ Socket error:', error);
  });
};

module.exports = { socketHandler }; // Change from 'export' to 'module.exports'