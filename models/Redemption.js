import mongoose from 'mongoose';

const RedemptionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false,
  },
  giftId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Gift',
    required: true,
  },
  pointsUsed: {
    type: Number,
    required: true,
    min: 0,
  },
  quantity: {
    type: Number,
    default: 1,
    min: 1,
  },
  redemptionCode: {
    type: String,
    trim: true,
    uppercase: true,
  },
  status: {
    type: String,
    enum: ['Pending', 'Approved', 'Rejected', 'Completed'],
    default: 'Pending',
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

// Unique index to prevent duplicate pending/approved redemptions for same user and gift
RedemptionSchema.index({ userId: 1, giftId: 1, status: 1 }, { 
  unique: true,
  partialFilterExpression: { status: { $in: ['Pending', 'Approved'] } }
});

export default mongoose.model('Redemption', RedemptionSchema);

