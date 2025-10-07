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
      enum: ['home', 'work', 'other'],
      default: 'other'
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

  isActive: {
    type: Boolean,
    default: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});


userSchema.index({ currentLocation: '2dsphere' });

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