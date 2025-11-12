const mongoose = require('mongoose');

const driverSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  stripeDriverId: {
    type:String
  },
  paymentMethods: [{
    type: {
      type: String,
      enum: ['card', 'paypal']
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
  ratings:{
    average: {
        type: Number,
        min: 1,
        max: 5
      },
      comment: String
  },
  count:{
    type:Number
  },
  heading: {
    type: Number, // Direction in degrees (0-360)
    default: 0,
    min: 0,
    max: 360
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

module.exports = mongoose.model('Driver', driverSchema);