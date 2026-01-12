const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema(
  {
    rideId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Ride", // Reference to your Ride model
      required: true,
    },
    driverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Driver", // Reference to rider (user)
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    adminFee: {
      type: Number,
      required: true,
      min: 0,
    },
    driverAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      default: "usd",
    },
    success_url: {
      type: String,
    },
    paymentMethod: {
      type: String,
      enum: ["card", "wallet", "cash"],
      default: "card",
    },
    status: {
      type: String,
      enum: ["pending", "succeeded", "failed", "refunded"],
      default: "pending",
    },
    description: {
      type: String,
      default: "",
    },
    metadata: {
      type: Object,
      default: {},
    },
    stripeSessionId: {
      type: String
    },
    paidAt: {
      type: Date,
    },
    isStripeVerified:{
      type:Boolean
    }
  },
  { timestamps: true }
);

// export default mongoose.model("Payment", paymentSchema);

module.exports = mongoose.model('Payment', paymentSchema);
