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
const socketRoutes = require('./routes/socketRoutes');
const webhookController = require('./controllers/webhookController');
const { initializeSocket } = require('./socket.js');

const logger = require('./utils/logger');
const errorHandler = require('./middleware/errorHandler');
const { clientUrl, mongoURI, port } = require('./config/config');
const cronJobs = require('./middleware/checkCommissionValidity');

const app = express();
const server = http.createServer(app);
app.set('trust proxy', 1); 
const io = initializeSocket(server);
app.set('io', io);
app.use(helmet());
app.use(
  cors({
    origin: true,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"]
  })
);

app.use(compression());
app.post(
  '/api/stripe/webhook', 
  express.raw({ type: 'application/json' }), 
  webhookController.handleWebhook
);
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));


const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 100, 
  standardHeaders: true, 
  legacyHeaders: false, 
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again after 15 minutes.'
  },

  skip: (req) => {
    return req.path === '/api/stripe/webhook';
  }
});


const authLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, 
  max: 10, 
  skipSuccessfulRequests: true, 
  message: {
    success: false,
    message: 'Too many authentication attempts, please try again after 15 minutes.'
  }
});

app.use('/api/', limiter);

app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth/forgot-password', authLimiter);

app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development'
  });
});

app.get('/api/test-ip', (req, res) => {
  res.json({
    ip: req.ip,
    ips: req.ips,
    headers: {
      'x-forwarded-for': req.headers['x-forwarded-for'],
      'x-real-ip': req.headers['x-real-ip'],
      'cf-connecting-ip': req.headers['cf-connecting-ip']
    }
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/ride', rideRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/driver', driverRoutes);
app.use('/api/service', serviceRoutes);
app.use('/api/notification', notificationRoutes);
app.use('/api/stripe', stripeRoutes);
app.use('/api/socket', socketRoutes);

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

app.use(errorHandler);

mongoose.connect(mongoURI)
  .then(() => {
    logger.info('✅ Connected to MongoDB');
  })
  .catch(err => {
    logger.error('❌ MongoDB connection error:', err);
    process.exit(1); 
  });

mongoose.connection.on('error', err => {
  logger.error('MongoDB connection error:', err);
});

mongoose.connection.on('disconnected', () => {
  logger.warn('MongoDB disconnected. Attempting to reconnect...');
});

const PORT = port || 5000;
server.listen(PORT, () => {
  logger.info(`🚀 Server running on port ${PORT}`);
  logger.info(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`🔒 Trust proxy enabled`);
});

server.timeout = 120000;
server.keepAliveTimeout = 120000; 
server.headersTimeout = 120000; 

const gracefulShutdown = (signal) => {
  logger.info(`${signal} received. Starting graceful shutdown...`);
  
  server.close(() => {
    logger.info('HTTP server closed');
    
    mongoose.connection.close(false, () => {
      logger.info('MongoDB connection closed');
      process.exit(0);
    });
  });

  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 30000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', err);
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown('unhandledRejection');
});

module.exports = { app, server, io };