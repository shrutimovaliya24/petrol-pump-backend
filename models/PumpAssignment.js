import mongoose from 'mongoose';

const PumpAssignmentSchema = new mongoose.Schema({
  pumpId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Pump',
    required: true,
  },
  employerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  assignedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  assignedAt: {
    type: Date,
    default: Date.now,
  },
  status: {
    type: String,
    enum: ['ACTIVE', 'INACTIVE'],
    default: 'ACTIVE',
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Unique index to prevent duplicate active assignments
PumpAssignmentSchema.index({ pumpId: 1, employerId: 1, status: 1 }, { 
  unique: true,
  partialFilterExpression: { status: 'ACTIVE' }
});

export default mongoose.models.PumpAssignment || mongoose.model('PumpAssignment', PumpAssignmentSchema);




