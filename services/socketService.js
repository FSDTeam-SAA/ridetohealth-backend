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
} = require('./socketEvents.js');

const socketHandler = (io, socket) => {
  logger.info(`🟢 New socket connection: ${socket.id}`);
  
  // User joins their personal room
  socket.on('join', (senderId) => {
    if (senderId) {
      handleJoinUser(socket, senderId);
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

  // Handle disconnection
  socket.on('disconnect', () => {
    logger.info(`🔴 User disconnected: ${socket.id}`);
  });

  // Error handling
  socket.on('error', (error) => {
    logger.error('❌ Socket error:', error);
  });
};

module.exports = { socketHandler }; // Change from 'export' to 'module.exports'