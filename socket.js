// // ============================================
// // FILE: socket.js
// // ============================================

const { Server } = require('socket.io');
const socketHandler = require('./services/socketService');
const logger = require('./utils/logger');

const initializeSocket = (httpServer) => {
  const io = new Server(httpServer, {
    pingTimeout: 60000,
    pingInterval: 25000,
    cors: {
      origin: process.env.CLIENT_URL || 'http://localhost:5173',
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE'],
    },
    transports: ['websocket', 'polling'],
    maxHttpBufferSize: 50 * 1024 * 1024,
  });

  // Socket connection handler
  io.on('connection', (socket) => {
    logger.info(`🟢 User connected: ${socket.id}`);
    socketHandler(io, socket);
  });

  return io;
};

module.exports = { initializeSocket }