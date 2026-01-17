// models/PromoCode.js
const mongoose = require('mongoose');

const commissionSchema = new mongoose.Schema({
  title: {
    type: String,
  },
  description: String,
  discountType: {
    type: String,
    enum: ['percentage', 'fixed'],
    default: 'percentage'
  },
  commission: {
    type: Number,
    required: true
  },
  startDate:{
    type: Date,
    default: Date.now
  },
  endDate: {
    type: Date,
    default: Date.now
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'expired'],
    default: 'active'
  },
  usedCount: {
    type: Number,
    default: 0
  },
  applicableServices: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Service'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Commission', commissionSchema);