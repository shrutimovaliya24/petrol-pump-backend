import mongoose from 'mongoose';

const CustomerTierSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  tier: {
    type: String,
    enum: ['Bronze', 'Silver', 'Gold', 'Platinum'],
    default: 'Bronze',
  },
  points: {
    type: Number,
    default: 0,
    min: 0,
  },
  transactions: {
    type: Number,
    default: 0,
  },
  lastActivity: {
    type: Date,
    default: Date.now,
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

// Unique index to ensure one CustomerTier per user
CustomerTierSchema.index({ userId: 1 }, { unique: true });

export default mongoose.model('CustomerTier', CustomerTierSchema);





