const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { refreshTokenSecret, refreshTokenExpires, accessTokenSecret, accessTokenExpires } = require('../config/config');
const jwt = require('jsonwebtoken');

const userSchema = new mongoose.Schema({
  fullName: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  phoneNumber: {
    type: String,
    required: true,
    unique: true
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  role: {
    type: String,
    enum: ['customer', 'driver', 'admin'],
    default: 'customer'
  },
  profileImage: {
    type: String,
    default: null
  },
  isEmailVerified: {
    type: Boolean,
    default: false
  },
  isPhoneVerified: {
    type: Boolean,
    default: false
  },
  licenseNumber: {
    type: String,
    sparse: true
  },
  licenseImage: {
    type: String,
    defualt:null
  },
  nidNumber: {
    type: String,
    sparse: true,
  },
  nidImage: {
    type: String,
    defualt:null
  },
  selfieImage: {
    type: String,
    defualt:null
  },
  serviceTypes: {
    type: [String]
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
  savedPlaces: [{
    name: String,
    address: String,
    coordinates: [Number],
    type: {
      type: String,
      default: ''
    }
  }],
  wallet: {
    balance: {
      type: Number,
      default: 0
    },
    transactions: [{
      type: {
        type: String,
        enum: ['credit', 'debit']
      },
      amount: Number,
      description: String,
      date: {
        type: Date,
        default: Date.now
      }
    }]
  },
 
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
  notificationSettings: {
    pushNotifications: {
      type: Boolean,
      default: true
    },
    emailNotifications: {
      type: Boolean,
      default: true
    },
    smsNotifications: {
      type: Boolean,
      default: true
    }
  },
  loginHistory: [{
    device: String,
    ipAddress: String,
    loginTime: {
      type: Date,
      default: Date.now
    }
  }],

  refreshToken: {
    type: String,
    default: null
  },
  country:{
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

  isActive: {
    type: Boolean,
    default: true
  },
  lastSeen: {
    type: Date,
    default: Date.now
  },
  lastActive: {
    type: Date,
    default: Date.now
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});


userSchema.index({ currentLocation: '2dsphere' });
userSchema.index(
  { licenseNumber: 1 },
  { unique: true, partialFilterExpression: { licenseNumber: { $type: "string" } } }
);
userSchema.index(
  { nidNumber: 1 },
  { unique: true, partialFilterExpression: { nidNumber: { $exists: true, $ne: null } } }
);
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.generateRefreshToken = function (payload) {
  return jwt.sign(payload, refreshTokenSecret, { expiresIn: refreshTokenExpires });
};

userSchema.methods.generateAccessToken = function (payload) {
  return jwt.sign(payload, accessTokenSecret, { expiresIn: accessTokenExpires });
};

userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema);