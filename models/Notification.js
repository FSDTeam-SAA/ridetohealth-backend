const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  receiverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  title: {
    type: String,
  },
  message: {
    type: String,
  },
  type: {
    type: String,
    enum: ['ride_request', 'ride_accepted', 'ride_completed', 'payment', 'promotion', 'system', 'rating_received', 'driver_request', "request_approved", "request_rejected", "driver_approval"],
  },
  isRead: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Notification', notificationSchema);