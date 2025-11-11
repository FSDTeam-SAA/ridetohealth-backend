const jwt = require('jsonwebtoken');
const User = require('../models/User');
const logger = require('../utils/logger');
const { accessTokenSecret } = require('../config/config');

// 🔹 Authentication middleware for Socket.IO
const socketAuth = async (socket, next) => {
  try {
    let token;

    // ✅ FIXED: Correct way to extract token from socket handshake
    // Method 1: socket.handshake.auth (recommended for socket.io-client)
    if (socket.handshake.auth?.token) {
      token = socket.handshake.auth.token;
    }
    
    // Method 2: Authorization header (for HTTP-like clients)
    if (!token && socket.handshake.headers?.authorization) {
      token = socket.handshake.headers.authorization.split(" ")[1];
    }
    
    // Method 3: Query parameter (fallback, less secure)
    if (!token && socket.handshake.query?.token) {
      token = socket.handshake.query.token;
    }

    if (!token) {
      return next(new Error("Authentication error: No token provided"));
    }

    // Verify JWT
    const decoded = jwt.verify(token, accessTokenSecret);

    const user = await User.findById(decoded._id).select('_id role isActive');

    if (!user) {
      return next(new Error("User not found"));
    }

    // ✅ ADDED: Check if user account is active
    if (user.isActive === false) {
      return next(new Error("Account is deactivated"));
    }

    // Attach user info to socket
    socket.userId = user._id.toString();
    socket.userRole = user.role;
    next();
  } catch (err) {
    logger.error(`Socket auth error: ${err.message}`);
    next(new Error("Authentication error: Invalid token"));
  }
};

// ✅ ADDED: Throttle helper to prevent spam
const createThrottle = (delay) => {
  const lastCall = new Map();
  return (userId, fn) => {
    const now = Date.now();
    const last = lastCall.get(userId) || 0;
    if (now - last >= delay) {
      lastCall.set(userId, now);
      fn();
    }
  };
};

// 🔹 Main Socket.IO handler
const socketHandler = (io) => {
  io.use(socketAuth);

  // ✅ ADDED: Throttle location updates (max once per 3 seconds)
  const locationThrottle = createThrottle(3000);

  io.on('connection', (socket) => {
    logger.info(`User ${socket.userId} (${socket.userRole}) connected`);

    // Join user to their personal room
    socket.join(`user_${socket.userId}`);

    // If user is a driver, join driver room
    if (socket.userRole === 'driver') {
      socket.join(`driver_${socket.userId}`);
      socket.join('drivers'); // ✅ ADDED: Join global drivers room
    }

    // ✅ ADDED: Send connection acknowledgment
    socket.emit('connected', {
      userId: socket.userId,
      role: socket.userRole,
      timestamp: new Date()
    });

    // ✅ FIXED: Handle location updates with validation and throttling
    socket.on('location_update', (data, callback) => {
      try {
        const { latitude, longitude, rideId } = data;

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

        // Only drivers should send location updates
        if (socket.userRole !== 'driver') {
          const error = 'Only drivers can send location updates';
          if (callback) callback({ success: false, error });
          return;
        }

        // ✅ FIXED: Throttle updates to prevent spam
        locationThrottle(socket.userId, () => {
          const locationData = {
            driverId: socket.userId,
            location: { latitude, longitude },
            timestamp: new Date()
          };

          // ✅ FIXED: If rideId provided, only emit to that ride's passenger
          if (rideId) {
            socket.to(`ride_${rideId}`).emit('driver_location_update', locationData);
          } else {
            // Emit to admin dashboard only
            socket.to('admins').emit('driver_location_update', locationData);
          }

          logger.debug(`Location update from driver ${socket.userId}`);
        });

        if (callback) callback({ success: true });
      } catch (err) {
        logger.error(`Location update error: ${err.message}`);
        if (callback) callback({ success: false, error: 'Server error' });
      }
    });

    // ✅ FIXED: Handle ride chat messages with validation
    socket.on('ride_message', (data, callback) => {
      try {
        const { rideId, message, recipientId } = data;

        // Validate required fields
        if (!rideId || !message || !recipientId) {
          const error = 'Missing required fields';
          if (callback) callback({ success: false, error });
          return;
        }

        // Validate message length
        if (typeof message !== 'string' || message.trim().length === 0) {
          const error = 'Invalid message';
          if (callback) callback({ success: false, error });
          return;
        }

        if (message.length > 1000) {
          const error = 'Message too long';
          if (callback) callback({ success: false, error });
          return;
        }

        // ✅ ADDED: Sanitize message (basic)
        const sanitizedMessage = message.trim();

        const messageData = {
          rideId,
          message: sanitizedMessage,
          senderId: socket.userId,
          timestamp: new Date()
        };

        // Emit to recipient
        io.to(`user_${recipientId}`).emit('ride_message', messageData);
        
        // ✅ ADDED: Also emit to ride room (for multi-party support)
        socket.to(`ride_${rideId}`).emit('ride_message', messageData);

        if (callback) callback({ success: true, timestamp: messageData.timestamp });
      } catch (err) {
        logger.error(`Ride message error: ${err.message}`);
        if (callback) callback({ success: false, error: 'Server error' });
      }
    });

    // ✅ FIXED: Handle typing indicators with validation
    socket.on('typing_start', (data) => {
      try {
        const { rideId, recipientId } = data;
        
        if (!rideId || !recipientId) return;

        io.to(`user_${recipientId}`).emit('user_typing', {
          rideId,
          userId: socket.userId
        });
      } catch (err) {
        logger.error(`Typing start error: ${err.message}`);
      }
    });

    socket.on('typing_stop', (data) => {
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
    });

    // ✅ ADDED: Join ride room (when ride is assigned)
    socket.on('join_ride', (data, callback) => {
      try {
        const { rideId } = data;
        
        if (!rideId) {
          if (callback) callback({ success: false, error: 'Missing rideId' });
          return;
        }

        socket.join(`ride_${rideId}`);
        logger.info(`User ${socket.userId} joined ride ${rideId}`);
        
        if (callback) callback({ success: true });
      } catch (err) {
        logger.error(`Join ride error: ${err.message}`);
        if (callback) callback({ success: false, error: 'Server error' });
      }
    });

    // ✅ ADDED: Leave ride room
    socket.on('leave_ride', (data, callback) => {
      try {
        const { rideId } = data;
        
        if (!rideId) {
          if (callback) callback({ success: false, error: 'Missing rideId' });
          return;
        }

        socket.leave(`ride_${rideId}`);
        logger.info(`User ${socket.userId} left ride ${rideId}`);
        
        if (callback) callback({ success: true });
      } catch (err) {
        logger.error(`Leave ride error: ${err.message}`);
        if (callback) callback({ success: false, error: 'Server error' });
      }
    });

    // ✅ ADDED: Handle errors
    socket.on('error', (error) => {
      logger.error(`Socket error for user ${socket.userId}: ${error.message}`);
    });

    // Handle disconnection
    socket.on('disconnect', (reason) => {
      logger.info(`User ${socket.userId} disconnected: ${reason}`);
      
      // ✅ ADDED: Notify relevant parties
      if (socket.userRole === 'driver') {
        socket.to('admins').emit('driver_offline', {
          driverId: socket.userId,
          timestamp: new Date()
        });
      }
    });
  });
};

module.exports = socketHandler;