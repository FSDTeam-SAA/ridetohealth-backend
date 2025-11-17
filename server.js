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
const { initializeSocket } = require( './socket.js');


const logger = require('./utils/logger');
const errorHandler = require('./middleware/errorHandler');
const { clientUrl, mongoURI, port } = require('./config/config');

const app = express();
const server = http.createServer(app);

const io = initializeSocket(server);
app.set('io', io);

app.use(helmet());
app.use(compression());
app.use(cors())
app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), webhookController.handleWebhook);
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});
app.use('/api/', limiter);

app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/ride', rideRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/driver', driverRoutes);
app.use('/api/service', serviceRoutes);
app.use('/api/notification', notificationRoutes);
app.use('/api/stripe', stripeRoutes)
app.use('/api/socket', socketRoutes)

app.use(errorHandler);
mongoose.connect(mongoURI)
  .then(() => logger.info('Connected to MongoDB'))
  .catch(err => logger.error('MongoDB connection error:', err));
const PORT = port || 5000;
server.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
});