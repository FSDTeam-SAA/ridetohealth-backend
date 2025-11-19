const mongoose = require('mongoose');

const driverSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  vehicleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vehicle',
    default: null
  },
  stripeDriverId: {
    type:String
  },
  currentRideId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Ride',
  },
  currentLocation: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number],
      default: [0, 0]
    },
    address: String
  },
  paymentMethods: [{
    type: {
      type: String,
      enum: ['card', 'paypal', 'stripe'],
      default: 'card'
    },
    cardNumber: String,
    cardHolderName: String,
    expiryDate: String,
    isDefault: {
      type: Boolean,
      default: false
    }
  }],
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'suspended'],
    default: 'pending'
  },
   earnings: {
    total: {
      type: Number,
      default: 0
    },
    available: {
      type: Number,
      default: 0
    },
    withdrawn: {
      type: Number,
      default: 0
    }
  },
  isAvailable: {
    type: Boolean,
    default: true
  },
  withdrawals: [{
    amount: Number,
    bankDetails: {
      accountNumber: String,
      bankName: String,
      accountHolderName: String
    },
    ridestatus: {
      type: String,
      enum: ['pending', 'completed', 'failed'],
      default: 'pending'
    },
     requestDate: {
      type: Date,
      default: Date.now
    },
    completedDate: Date
  }],
 ratings: {
    average: {
      type: Number,
      default: 0,
    },
    totalRatings: {
      type: Number,
      default: 0,
    },
    count1: { type: Number, default: 0 },
    count2: { type: Number, default: 0 },
    count3: { type: Number, default: 0 },
    count4: { type: Number, default: 0 },
    count5: { type: Number, default: 0 },
  },
  heading: {
    type: Number, // Direction in degrees (0-360)
    default: 0,
    min: 0,
    max: 360
  },
  isOnline:{
    type: Boolean,
    default: true
  },
  speed: {
    type: Number, // Speed in km/h
    default: 0,
    min: 0
  },
  accuracy: {
    type: Number, // GPS accuracy in meters
    default: null
  },


});

driverSchema.index({ currentLocation: '2dsphere' });

driverSchema.index(
  { "vehicle.plateNumber": 1 },
  { unique: true, partialFilterExpression: { "vehicle.plateNumber": { $exists: true, $ne: null } } }
);


module.exports = mongoose.model('Driver', driverSchema);