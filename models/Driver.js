const mongoose = require('mongoose');

const driverSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  licenseNumber: {
    type: String,
    required: true,
    unique: true
  },
  licenseImage: {
    type: String,
    required: true
  },
  nidNumber: {
    type: String,
    required: true,
    unique: true
  },
  nidImage: {
    type: String,
    required: true
  },
  selfieImage: {
    type: String,
    required: true
  },
  vehicle: {
    type: {
      type: String,
      required: true
    },
    model: {
      type: String,
      required: true
    },
    year: {
      type: Number,
      required: true
    },
    plateNumber: {
      type: String,
      required: true,
      unique: true
    },
    color: {
      type: String,
      required: true
    },
    image: String,
    registrationDocument: String
  },
  insuranceInformation:{
    insuranceProvider:{
      type:String
    },
    policyNumber:{
      type:String
    },
    expiryDate:{
      type:String
    }
  },
  serviceTypes: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Service'
  }],
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'suspended'],
    default: 'pending'
  },
  isOnline: {
    type: Boolean,
    default: false
  },
  isAvailable: {
    type: Boolean,
    default: true
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
    }
  },
  ratings: {
    average: {
      type: Number,
      default: 1
    },
    count: {
      type: Number,
      default: 1
    }
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
  withdrawals: [{
    amount: Number,
    bankDetails: {
      accountNumber: String,
      bankName: String,
      accountHolderName: String
    },
    status: {
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
  suspensions: [{
    reason: String,
    duration: Number, // days
    startDate: {
      type: Date,
      default: Date.now
    },
    endDate: Date,
    isActive: {
      type: Boolean,
      default: true
    }
  }],
  documents: {
    licenseExpiry: Date,
    nidExpiry: Date,
    vehicleRegistrationExpiry: Date
  },
   stripeDriverId: {
    type:String
  },
  street_address:{
    type:String
  },
  city:{
    type:String,
  },
  state:{
    type:String
  },
  zipcode:{
    type:String
  },
  date_of_birth:{
    type:String,
  },
  emergency_contact:{
    name:{
      type:String
    },
    phoneNumber:{
      type:String
    }
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
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