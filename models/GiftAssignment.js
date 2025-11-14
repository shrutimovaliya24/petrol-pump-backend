import mongoose from 'mongoose';

const GiftAssignmentSchema = new mongoose.Schema({
  giftId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Gift',
    required: true,
  },
  assignedToId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  assignedToRole: {
    type: String,
    enum: ['employer', 'user'],
    required: true,
  },
  assignedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  pointsAvailable: {
    type: Number,
    default: 0,
  },
  pointsRequired: {
    type: Number,
    required: true,
  },
  isAvailable: {
    type: Boolean,
    default: false,
  },
  assignedAt: {
    type: Date,
    default: Date.now,
  },
  status: {
    type: String,
    enum: ['PENDING', 'AVAILABLE', 'REDEEMED', 'EXPIRED'],
    default: 'PENDING',
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Unique index to prevent duplicate active gift assignments
GiftAssignmentSchema.index({ giftId: 1, assignedToId: 1, assignedToRole: 1, status: 1 }, { 
  unique: true,
  partialFilterExpression: { status: { $in: ['PENDING', 'AVAILABLE'] } }
});
GiftAssignmentSchema.index({ assignedBy: 1 });

export default mongoose.models.GiftAssignment || mongoose.model('GiftAssignment', GiftAssignmentSchema);




