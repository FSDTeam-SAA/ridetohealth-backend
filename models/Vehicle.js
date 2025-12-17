const mongoose = require('mongoose');

const vehicleSchema = new mongoose.Schema({
    serviceId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Service',
        required: true
    },
    serviceImage: String,
    driverId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Driver',
        default: null
    },
    taxiName:{
      type: String
    },
    model:{
      type: String
    },
    plateNumber:{
      type: String,
      unique: true,
      sparse: true
    },
    color:{
      type: String
    },
    year:{
      type: Number
    },
    vin:{
      type: String
    },
    assignedDrivers:{
       type: Boolean,
       default:false
    }
},
{
  timestamps: true
}
);

module.exports = mongoose.model('Vehicle', vehicleSchema);