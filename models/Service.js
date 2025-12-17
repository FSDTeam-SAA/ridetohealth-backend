const { boolean } = require('joi');
const mongoose = require('mongoose');

const serviceSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  description: String,
  // category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true},
  icon: String,
  baseFare: {
    type: Number,
    default: 100
  },
  driverId: {
    type:String,
  },
  serviceImage: String,
  perKmRate: {
    type: Number,
    default: 10
  },
  perMileRate: {
    type: Number,
    default: 3
  },
  perMinuteRate: {
    type: Number,
    default: 2
  },
  minimumFare: {
    type: Number,
    default: 50
  },
  cancellationFee: {
    type: Number,
    default: 0
  },
  capacity: {
    type: Number,
    default: 4
  },
  isActive: {
    type: Boolean,
    default: true
  },
  features: [String],
  estimatedArrivalTime: {
    type: Number,
    default: 5 // minutes
  }
},
{
  timestamps: true
}
);

module.exports = mongoose.model('Service', serviceSchema);