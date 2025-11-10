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
const logger = require('./utils/logger');
const errorHandler = require('./middleware/errorHandler');
const { clientUrl, mongoURI, port } = require('./config/config');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: clientUrl || "*",
    methods: ["GET", "POST"]
  }
});

app.use(helmet());
app.use(compression());
app.use(cors());
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});
app.use('/api/', limiter);
socketHandler(io);
app.set('io', io);

app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/ride', rideRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/driver', driverRoutes);
app.use('/api/service', serviceRoutes);
app.use('/api/notification', notificationRoutes);
app.use('/api/stripe', stripeRoutes)

app.use(errorHandler);
mongoose.connect(mongoURI)
  .then(() => logger.info('Connected to MongoDB'))
  .catch(err => logger.error('MongoDB connection error:', err));
const PORT = port || 5000;
server.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
});