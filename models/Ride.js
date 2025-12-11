const mongoose = require('mongoose');

const rideSchema = new mongoose.Schema({
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  driverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Driver',
    default: null
  },
  serviceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Service'
  },
  pickupLocation: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number],
      required: true
    },
    address: {
      type: String,
      required: true
    }
  },
  dropoffLocation: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number],
      required: true
    },
    address: {
      type: String,
      required: true
    }
  },
  estimatedDistance: {
    type: Number
  },
  estimatedDuration: {
    type: Number
  },
  estimatedFare: {
    type: Number
  },
  actualDistance: {
    type: Number,
    default: 0
  },
  actualDuration: {
    type: Number,
    default: 0
  },
  totalFare: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: ['requested', 'accepted', 'driver_arrived', 'in_progress', 'completed', 'cancelled'],
    default: 'requested'
  },
  paymentMethod: {
    type: String,
    enum: ['cash', 'stripe', 'card'],
    default: 'stripe'
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'successfull', 'failed'],
    default: 'pending'
  },
  promoCode: {
    code: String,
    discount: Number
  },
  rating: {
    customerToDriver: {
      rating: {
        type: Number,
        min: 1,
        max: 5
      },
      comment: String,
      ratedAt: {
        type: Date,
        default: Date.now
      }
    },
    driverToCustomer: {
      rating: {
        type: Number,
        min: 1,
        max: 5
      },
      comment: String,
      ratedAt: {
        type: Date,
        default: Date.now
      }
    }
  },

  reviews:{
    type:String
  },
  route: [{
    latitude: Number,
    longitude: Number,
    timestamp: {
      type: Date,
      default: Date.now
    }
  }],
  timeline: [{
    status: String,
    timestamp: {
      type: Date,
      default: Date.now
    }
  }],
  cancellationReason: String,
  cancelledBy: {
    type: String,
    enum: ['customer', 'driver', 'admin']
  },
  commission: {
    rate: {
      type: Number,
      default: 0.02 // 2%
    },
    amount: {
      type: Number,
      default: 0
    }
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

rideSchema.index({ pickupLocation: '2dsphere' });
rideSchema.index({ dropoffLocation: '2dsphere' });

module.exports = mongoose.model('Ride', rideSchema);