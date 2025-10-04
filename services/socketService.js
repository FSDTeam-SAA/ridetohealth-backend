const jwt = require('jsonwebtoken');
const User = require('../models/User');
const logger = require('../utils/logger');
const { accessTokenSecret } = require('../config/config');

const socketAuth = async (socket, next) => {
  try {
    // Try different ways to get token
    let token = socket.handshake.auth?.token; // from frontend (socket.io-client)
    
    // Support query param (Postman/WebSocket test)
    if (!token && socket.handshake.query?.token) {
      token = socket.handshake.query.token;
    }

    // Support Authorization header (Postman/WebSocket test)
    if (!token && socket.handshake.headers?.authorization) {
      token = socket.handshake.headers.authorization.split(" ")[1];
    }

    if (!token) {
      return next(new Error("Authentication error: No token provided"));
    }

    const decoded = jwt.verify(token, accessTokenSecret);
    const user = await User.findById(decoded.userId);

    if (!user) {
      return next(new Error("User not found"));
    }

    socket.userId = user._id.toString();
    socket.userRole = user.role;
    next();
  } catch (err) {
    // next(new Error("Authentication error: " + err.message));
  }
};

module.exports = socketAuth;
