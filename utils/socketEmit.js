// utils/socketEmitter.js
const logger = require('./logger');

/**
 * Socket Emitter Helper - Use this in your REST API controllers
 * to emit real-time events to connected clients
 */

class SocketEmitter {
  constructor() {
    this.io = null;
  }

  /**
   * Initialize with Socket.IO instance
   * Call this from your main server file: socketEmitter.initialize(io)
   */
  initialize(io) {
    this.io = io;
    logger.info('Socket Emitter initialized');
  }

  /**
   * Get Socket.IO instance
   */
  getIO() {
    if (!this.io) {
      throw new Error('Socket.IO not initialized. Call socketEmitter.initialize(io) first.');
    }
    return this.io;
  }

  /**
   * Emit to a specific user
   */
  emitToUser(userId, event, data) {
    try {
      this.getIO().to(`user_${userId}`).emit(event, data);
      logger.debug(`Emitted ${event} to user ${userId}`);
    } catch (err) {
      logger.error(`Error emitting to user: ${err.message}`);
    }
  }

  /**
   * Emit to multiple users
   */
  emitToUsers(userIds, event, data) {
    try {
      userIds.forEach(userId => {
        this.getIO().to(`user_${userId}`).emit(event, data);
      });
      logger.debug(`Emitted ${event} to ${userIds.length} users`);
    } catch (err) {
      logger.error(`Error emitting to users: ${err.message}`);
    }
  }

  /**
   * Emit to a ride room (passenger + driver)
   */
  emitToRide(rideId, event, data) {
    try {
      this.getIO().to(`ride_${rideId}`).emit(event, data);
      logger.debug(`Emitted ${event} to ride ${rideId}`);
    } catch (err) {
      logger.error(`Error emitting to ride: ${err.message}`);
    }
  }

  /**
   * Emit to all drivers
   */
  emitToDrivers(event, data) {
    try {
      this.getIO().to('drivers').emit(event, data);
      logger.debug(`Emitted ${event} to all drivers`);
    } catch (err) {
      logger.error(`Error emitting to drivers: ${err.message}`);
    }
  }

  /**
   * Emit to all admins
   */
  emitToAdmins(event, data) {
    try {
      this.getIO().to('admins').emit(event, data);
      logger.debug(`Emitted ${event} to all admins`);
    } catch (err) {
      logger.error(`Error emitting to admins: ${err.message}`);
    }
  }

  /**
   * Emit to all connected clients
   */
  emitToAll(event, data) {
    try {
      this.getIO().emit(event, data);
      logger.debug(`Emitted ${event} to all clients`);
    } catch (err) {
      logger.error(`Error emitting to all: ${err.message}`);
    }
  }

  /**
   * Notify user about new ride request
   */
  notifyRideRequest(driverId, rideData) {
    this.emitToUser(driverId, 'new_ride_request', {
      ...rideData,
      timestamp: new Date()
    });
  }

  /**
   * Notify passenger that ride was accepted
   */
  notifyRideAccepted(passengerId, rideData) {
    this.emitToUser(passengerId, 'ride_accepted', {
      ...rideData,
      timestamp: new Date()
    });
  }

  /**
   * Notify passenger that ride was cancelled
   */
  notifyRideCancelled(userId, rideData, reason) {
    this.emitToUser(userId, 'ride_cancelled', {
      ...rideData,
      reason,
      timestamp: new Date()
    });
  }

  /**
   * Notify about payment status
   */
  notifyPaymentStatus(userId, paymentData) {
    this.emitToUser(userId, 'payment_status', {
      ...paymentData,
      timestamp: new Date()
    });
  }

  /**
   * Notify about driver arrival
   */
  notifyDriverArrived(passengerId, driverData) {
    this.emitToUser(passengerId, 'driver_arrived', {
      ...driverData,
      timestamp: new Date()
    });
  }

  /**
   * Send notification to user
   */
  sendNotification(userId, notification) {
    this.emitToUser(userId, 'notification', {
      ...notification,
      timestamp: new Date()
    });
  }

  /**
   * Check if user is online
   */
  async isUserOnline(userId) {
    try {
      const sockets = await this.getIO().in(`user_${userId}`).allSockets();
      return sockets.size > 0;
    } catch (err) {
      logger.error(`Error checking user online status: ${err.message}`);
      return false;
    }
  }

  /**
   * Get all connected users in a room
   */
  async getUsersInRoom(roomName) {
    try {
      const sockets = await this.getIO().in(roomName).allSockets();
      return Array.from(sockets);
    } catch (err) {
      logger.error(`Error getting users in room: ${err.message}`);
      return [];
    }
  }

  /**
   * Disconnect a specific user
   */
  async disconnectUser(userId, reason = 'Server request') {
    try {
      const sockets = await this.getIO().in(`user_${userId}`).fetchSockets();
      sockets.forEach(socket => {
        socket.disconnect(true);
      });
      logger.info(`Disconnected user ${userId}: ${reason}`);
    } catch (err) {
      logger.error(`Error disconnecting user: ${err.message}`);
    }
  }
}

// Export singleton instance
module.exports = new SocketEmitter();

// ================================================================

// USAGE EXAMPLES IN YOUR REST API CONTROLLERS:

/*
// In your server.js, after creating Socket.IO:
const socketEmitter = require('./utils/socketEmitter');
const io = socketIo(server, { ... });
socketEmitter.initialize(io);  // Initialize the emitter

// ----------------------------------------------------------------

// In controllers/rideController.js:
const socketEmitter = require('../utils/socketEmitter');

// Example 1: When a new ride is created
exports.createRide = async (req, res) => {
  try {
    const ride = await Ride.create({ ... });
    
    // Find nearby drivers and notify them
    const nearbyDrivers = await findNearbyDrivers(ride.pickupLocation);
    nearbyDrivers.forEach(driver => {
      socketEmitter.notifyRideRequest(driver._id, {
        rideId: ride._id,
        pickup: ride.pickupLocation,
        dropoff: ride.dropoffLocation,
        fare: ride.estimatedFare
      });
    });
    
    res.json({ success: true, ride });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Example 2: When driver accepts ride
exports.acceptRide = async (req, res) => {
  try {
    const ride = await Ride.findByIdAndUpdate(
      req.params.id,
      { driver: req.user._id, status: 'accepted' },
      { new: true }
    ).populate('passenger driver');
    
    // Notify passenger
    socketEmitter.notifyRideAccepted(ride.passenger._id, {
      rideId: ride._id,
      driver: {
        id: ride.driver._id,
        name: ride.driver.name,
        phone: ride.driver.phone,
        vehicle: ride.driver.vehicle
      }
    });
    
    // Notify admins
    socketEmitter.emitToAdmins('ride_accepted', {
      rideId: ride._id,
      driverId: ride.driver._id,
      passengerId: ride.passenger._id
    });
    
    res.json({ success: true, ride });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Example 3: When ride is cancelled
exports.cancelRide = async (req, res) => {
  try {
    const ride = await Ride.findByIdAndUpdate(
      req.params.id,
      { status: 'cancelled', cancellationReason: req.body.reason },
      { new: true }
    ).populate('passenger driver');
    
    // Notify both passenger and driver
    if (ride.driver) {
      socketEmitter.notifyRideCancelled(
        ride.driver._id, 
        { rideId: ride._id },
        req.body.reason
      );
    }
    socketEmitter.notifyRideCancelled(
      ride.passenger._id, 
      { rideId: ride._id },
      req.body.reason
    );
    
    res.json({ success: true, ride });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Example 4: When payment is processed
exports.processPayment = async (req, res) => {
  try {
    const payment = await Payment.create({ ... });
    
    // Notify user about payment status
    socketEmitter.notifyPaymentStatus(req.user._id, {
      paymentId: payment._id,
      status: payment.status,
      amount: payment.amount,
      method: payment.method
    });
    
    res.json({ success: true, payment });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Example 5: Check if user is online before sending SMS
exports.sendNotification = async (req, res) => {
  try {
    const { userId, message } = req.body;
    
    // Check if user is connected via WebSocket
    const isOnline = await socketEmitter.isUserOnline(userId);
    
    if (isOnline) {
      // Send via WebSocket
      socketEmitter.sendNotification(userId, {
        title: 'New Notification',
        message,
        type: 'info'
      });
    } else {
      // Send via SMS/Email as fallback
      await sendSMS(userId, message);
    }
    
    res.json({ success: true, deliveryMethod: isOnline ? 'websocket' : 'sms' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
*/