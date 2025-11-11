// const express = require('express');
// const cors = require('cors');
// const helmet = require('helmet');
// const compression = require('compression');
// const rateLimit = require('express-rate-limit');
// const http = require('http');
// const socketIo = require('socket.io');
// const mongoose = require('mongoose');
// require('dotenv').config();

// const authRoutes = require('./routes/auth');
// const userRoutes = require('./routes/user');
// const rideRoutes = require('./routes/ride');
// const paymentRoutes = require('./routes/payment');
// const adminRoutes = require('./routes/admin');
// const driverRoutes = require('./routes/driver');
// const serviceRoutes = require('./routes/service');
// const notificationRoutes = require('./routes/notification');
// const stripeRoutes = require('./routes/stripeRoutes');

// const socketHandler = require('./services/socketService');
// const logger = require('./utils/logger');
// const errorHandler = require('./middleware/errorHandler');
// const { clientUrl, mongoURI, port } = require('./config/config');

// const app = express();
// const server = http.createServer(app);
// const io = socketIo(server, {
//   cors: {
//     origin: clientUrl || "*",
//     methods: ["GET", "POST"]
//   }
// });

// app.use(helmet());
// app.use(compression());
// app.use(cors());
// app.use(express.json({ limit: '100mb' }));
// app.use(express.urlencoded({ extended: true, limit: '100mb' }));

// const limiter = rateLimit({
//   windowMs: 15 * 60 * 1000,
//   max: 100
// });
// app.use('/api/', limiter);
// socketHandler(io);
// app.set('io', io);

// app.use('/api/auth', authRoutes);
// app.use('/api/user', userRoutes);
// app.use('/api/ride', rideRoutes);
// app.use('/api/payment', paymentRoutes);
// app.use('/api/admin', adminRoutes);
// app.use('/api/driver', driverRoutes);
// app.use('/api/service', serviceRoutes);
// app.use('/api/notification', notificationRoutes);
// app.use('/api/stripe', stripeRoutes)

// app.use(errorHandler);
// mongoose.connect(mongoURI)
//   .then(() => logger.info('Connected to MongoDB'))
//   .catch(err => logger.error('MongoDB connection error:', err));
// const PORT = port || 5000;
// server.listen(PORT, () => {
//   logger.info(`Server running on port ${PORT}`);
// });


const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const rideRoutes = require('./routes/ride');
const paymentRoutes = require('./routes/payment');
const adminRoutes = require('./routes/admin');
const driverRoutes = require('./routes/driver');
const serviceRoutes = require('./routes/service');
const notificationRoutes = require('./routes/notification');
const stripeRoutes = require('./routes/stripeRoutes');

const socketHandler = require('./services/socketService');
const socketEmitter = require('./utils/socketEmitter'); // ✅ ADDED
const logger = require('./utils/logger');
const errorHandler = require('./middleware/errorHandler');
const { clientUrl, mongoURI, port } = require('./config/config');

const app = express();
const server = http.createServer(app);

// ✅ IMPROVED: Socket.IO configuration with better CORS and options
const io = socketIo(server, {
  cors: {
    origin: clientUrl || "*",
    methods: ["GET", "POST"],
    credentials: true,
    allowedHeaders: ["Authorization"]
  },
  pingTimeout: 60000,
  pingInterval: 25000,
  upgradeTimeout: 30000,
  maxHttpBufferSize: 1e6, // 1MB
  transports: ['websocket', 'polling']
});

// ✅ Security middleware
app.use(helmet({
  contentSecurityPolicy: false, // Disable if using Socket.IO with CDN
  crossOriginEmbedderPolicy: false
}));

app.use(compression());

// ✅ IMPROVED: CORS configuration
app.use(cors({
  origin: clientUrl || "*",
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

// ✅ IMPROVED: Rate limiting with different limits for different routes
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5, // Stricter for auth routes
  message: 'Too many authentication attempts, please try again later.',
  skipSuccessfulRequests: true
});

// Apply rate limiters
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/', generalLimiter);

// ✅ Initialize Socket.IO handler
socketHandler(io);

// ✅ Initialize Socket Emitter (for REST controllers)
socketEmitter.initialize(io);

// ✅ Make io available to routes via app.locals (better than app.set)
app.locals.io = io;

// ✅ Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date(),
    uptime: process.uptime(),
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    socketio: io.engine.clientsCount
  });
});

// ✅ API Routes
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/ride', rideRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/driver', driverRoutes);
app.use('/api/service', serviceRoutes);
app.use('/api/notification', notificationRoutes);
app.use('/api/stripe', stripeRoutes);

// ✅ 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

// ✅ Error handler (must be last)
app.use(errorHandler);

// ✅ MongoDB connection with better options
mongoose.connect(mongoURI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
})
  .then(() => {
    logger.info('✅ Connected to MongoDB');
  })
  .catch(err => {
    logger.error('❌ MongoDB connection error:', err);
    process.exit(1);
  });

// ✅ Handle MongoDB connection events
mongoose.connection.on('disconnected', () => {
  logger.warn('⚠️ MongoDB disconnected');
});

mongoose.connection.on('reconnected', () => {
  logger.info('✅ MongoDB reconnected');
});

mongoose.connection.on('error', (err) => {
  logger.error('❌ MongoDB error:', err);
});

// ✅ Graceful shutdown
const gracefulShutdown = async () => {
  logger.info('🛑 Shutting down gracefully...');
  
  // Close server
  server.close(() => {
    logger.info('✅ HTTP server closed');
  });

  // Close Socket.IO
  io.close(() => {
    logger.info('✅ Socket.IO closed');
  });

  // Close MongoDB
  try {
    await mongoose.connection.close();
    logger.info('✅ MongoDB connection closed');
  } catch (err) {
    logger.error('❌ Error closing MongoDB:', err);
  }

  process.exit(0);
};

// Handle shutdown signals
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  logger.error('❌ Uncaught Exception:', err);
  gracefulShutdown();
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown();
});

// ✅ Start server
const PORT = port || 5000;
server.listen(PORT, () => {
  logger.info(`🚀 Server running on port ${PORT}`);
  logger.info(`📡 Socket.IO server ready`);
  logger.info(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = { app, server, io };