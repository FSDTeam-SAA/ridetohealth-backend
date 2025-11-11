// const jwt = require('jsonwebtoken');
// const User = require('../models/User');
// const logger = require('../utils/logger');
// const { accessTokenSecret } = require('../config/config');
// const socketController = require('../controllers/socketController');

// // 🔹 Authentication middleware for Socket.IO
// const socketAuth = async (socket, next) => {
//   try {
//     let token;

//     // ✅ FIXED: Correct way to extract token from socket handshake
//     // Method 1: socket.handshake.auth (recommended for socket.io-client)
//     if (socket.handshake.auth?.token) {
//       token = socket.handshake.auth.token;
//     }
    
//     // Method 2: Authorization header (for HTTP-like clients)
//     if (!token && socket.handshake.headers?.authorization) {
//       token = socket.handshake.headers.authorization.split(" ")[1];
//     }
    
//     // Method 3: Query parameter (fallback, less secure)
//     if (!token && socket.handshake.query?.token) {
//       token = socket.handshake.query.token;
//     }

//     if (!token) {
//       return next(new Error("Authentication error: No token provided"));
//     }

//     // Verify JWT
//     const decoded = jwt.verify(token, accessTokenSecret);

//     const user = await User.findById(decoded._id).select('_id role isActive');

//     if (!user) {
//       return next(new Error("User not found"));
//     }

//     // ✅ ADDED: Check if user account is active
//     if (user.isActive === false) {
//       return next(new Error("Account is deactivated"));
//     }

//     // Attach user info to socket
//     socket.userId = user._id.toString();
//     socket.userRole = user.role;
//     next();
//   } catch (err) {
//     logger.error(`Socket auth error: ${err.message}`);
//     next(new Error("Authentication error: Invalid token"));
//   }
// };

// // ✅ ADDED: Throttle helper to prevent spam
// const createThrottle = (delay) => {
//   const lastCall = new Map();
//   return (userId, fn) => {
//     const now = Date.now();
//     const last = lastCall.get(userId) || 0;
//     if (now - last >= delay) {
//       lastCall.set(userId, now);
//       fn();
//     }
//   };
// };

// // 🔹 Main Socket.IO handler
// const socketHandler = (io) => {
//   io.use(socketAuth);

//   // ✅ ADDED: Throttle location updates (max once per 3 seconds)
//   const locationThrottle = createThrottle(3000);

//   io.on('connection', (socket) => {
//     logger.info(`User ${socket.userId} (${socket.userRole}) connected`);

//     // Join user to their personal room
//     socket.join(`user_${socket.userId}`);

//     // If user is a driver, join driver room
//     if (socket.userRole === 'driver') {
//       socket.join(`driver_${socket.userId}`);
//       socket.join('drivers'); // ✅ ADDED: Join global drivers room
//     }

//     // If user is admin, join admin room
//     if (socket.userRole === 'admin') {
//       socket.join('admins');
//     }

//     // ✅ ADDED: Send connection acknowledgment
//     socket.emit('connected', {
//       userId: socket.userId,
//       role: socket.userRole,
//       timestamp: new Date()
//     });

//     // ✅ Location Updates - Delegated to Controller
//     socket.on('location_update', (data, callback) => {
//       locationThrottle(socket.userId, () => {
//         socketController.handleLocationUpdate(socket, io, data, callback);
//       });
//     });

//     // ✅ Ride Messages - Delegated to Controller
//     socket.on('ride_message', (data, callback) => {
//       socketController.handleRideMessage(socket, io, data, callback);
//     });

//     // ✅ Typing Indicators - Delegated to Controller
//     socket.on('typing_start', (data) => {
//       socketController.handleTypingStart(socket, io, data);
//     });

//     socket.on('typing_stop', (data) => {
//       socketController.handleTypingStop(socket, io, data);
//     });

//     // ✅ Join Ride Room - Delegated to Controller
//     socket.on('join_ride', (data, callback) => {
//       socketController.handleJoinRide(socket, io, data, callback);
//     });

//     // ✅ Leave Ride Room - Delegated to Controller
//     socket.on('leave_ride', (data, callback) => {
//       socketController.handleLeaveRide(socket, io, data, callback);
//     });

//     // ✅ Ride Status Update - Delegated to Controller
//     socket.on('ride_status_update', (data, callback) => {
//       socketController.handleRideStatusUpdate(socket, io, data, callback);
//     });

//     // ✅ Driver Availability - Delegated to Controller
//     socket.on('driver_availability', (data, callback) => {
//       socketController.handleDriverAvailability(socket, io, data, callback);
//     });

//     // ✅ Mark Messages as Read - Delegated to Controller
//     socket.on('mark_messages_read', (data, callback) => {
//       socketController.handleMarkMessagesRead(socket, io, data, callback);
//     });

//     // ✅ Request Driver Location - Delegated to Controller
//     socket.on('request_driver_location', (data, callback) => {
//       socketController.handleRequestDriverLocation(socket, io, data, callback);
//     });

//     // ✅ ADDED: Handle errors
//     socket.on('error', (error) => {
//       logger.error(`Socket error for user ${socket.userId}: ${error.message}`);
//     });

//     // Handle disconnection
//     socket.on('disconnect', (reason) => {
//       logger.info(`User ${socket.userId} disconnected: ${reason}`);
      
//       // ✅ ADDED: Notify relevant parties
//       if (socket.userRole === 'driver') {
//         socket.to('admins').emit('driver_offline', {
//           driverId: socket.userId,
//           timestamp: new Date()
//         });
//       }
//     });
//   });
// };

// module.exports = socketHandler;


// ============================================
// FILE: src/socket/socketHandler.js - FIXED VERSION
// ============================================

import { logger } from '../utils/logger.js';
import {
  handleJoinUser,
  handleJoinChat,
  handleSendMessage,
  handleTyping,
  handleStopTyping,
  handleLeaveChat,
} from './socketEvents.js';

export const socketHandler = (io, socket) => {
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