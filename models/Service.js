const mongoose = require('mongoose');

const serviceSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  description: String,
  category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true},
  icon: String,
  baseFare: {
    type: Number,
    required: true
  },
  perKmRate: {
    type: Number,
    required: true
  },
  perMinuteRate: {
    type: Number,
    required: true
  },
  minimumFare: {
    type: Number,
    required: true
  },
  cancellationFee: {
    type: Number,
    default: 0
  },
  capacity: {
    type: Number,
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  features: [String],
  estimatedArrivalTime: {
    type: Number,
    default: 5 // minutes
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Service', serviceSchema);