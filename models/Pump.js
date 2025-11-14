import mongoose from 'mongoose';

const PumpSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  fuelTypes: [{
    type: String,
    enum: ['PETROL', 'DIESEL', 'LPG', 'CNG'],
    required: true,
  }],
  status: {
    type: String,
    enum: ['ACTIVE', 'INACTIVE', 'MAINTENANCE'],
    default: 'ACTIVE',
  },
  supervisor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  customers: {
    type: Number,
    default: 0,
  },
  meterReadings: [{
    startReading: { type: Number, required: true },
    endReading: { type: Number, required: true },
    difference: { type: Number, required: true },
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    recordedAt: { type: Date, default: Date.now },
  }],
  maintenanceReports: [{
    issue: { type: String, required: true },
    description: { type: String, default: '' },
    reportedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    status: { type: String, enum: ['PENDING', 'IN_PROGRESS', 'RESOLVED'], default: 'PENDING' },
    reportedAt: { type: Date, default: Date.now },
  }],
  lastMeterReading: {
    startReading: { type: Number, default: 0 },
    endReading: { type: Number, default: 0 },
    difference: { type: Number, default: 0 },
    recordedAt: { type: Date },
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

export default mongoose.model('Pump', PumpSchema);


