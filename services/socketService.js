const jwt = require('jsonwebtoken');
const User = require('../models/User');
const logger = require('../utils/logger');
const { accessTokenSecrete } = require('../config/config');

const socketAuth = async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error('Authentication error'));
    }

    const decoded = jwt.verify(token, accessTokenSecrete);
    const user = await User.findById(decoded.userId);

    if (!user) {
      return next(new Error('User not found'));
    }

    socket.userId = user._id.toString();
    socket.userRole = user.role;
    next();
  } catch (error) {
    next(new Error('Authentication error'));
  }
};

const socketHandler = (io) => {
  io.use(socketAuth);

  io.on('connection', (socket) => {
    logger.info(`User ${socket.userId} connected`);

    // Join user to their personal room
    socket.join(`user_${socket.userId}`);

    // If user is a driver, join driver room
    if (socket.userRole === 'driver') {
      socket.join(`driver_${socket.userId}`);
    }

    // Handle location updates
    socket.on('location_update', (data) => {
      const { latitude, longitude } = data;
      
      // Broadcast location to nearby users if driver
      if (socket.userRole === 'driver') {
        socket.broadcast.emit('driver_location_update', {
          driverId: socket.userId,
          location: { latitude, longitude }
        });
      }
    });

    // Handle ride chat messages
    socket.on('ride_message', (data) => {
      const { rideId, message, recipientId } = data;
      
      io.to(`user_${recipientId}`).emit('ride_message', {
        rideId,
        message,
        senderId: socket.userId,
        timestamp: new Date()
      });
    });

    // Handle typing indicators
    socket.on('typing_start', (data) => {
      const { rideId, recipientId } = data;
      io.to(`user_${recipientId}`).emit('user_typing', {
        rideId,
        userId: socket.userId
      });
    });

    socket.on('typing_stop', (data) => {
      const { rideId, recipientId } = data;
      io.to(`user_${recipientId}`).emit('user_stopped_typing', {
        rideId,
        userId: socket.userId
      });
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      logger.info(`User ${socket.userId} disconnected`);
    });
  });
};

module.exports = socketHandler;