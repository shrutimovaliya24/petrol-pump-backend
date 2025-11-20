import mongoose from 'mongoose';

const GiftSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  description: {
    type: String,
    required: true,
  },
  pointsRequired: {
    type: Number,
    required: true,
    min: 0,
  },
  value: {
    type: Number,
    required: true,
    min: 0,
  },
  category: {
    type: String,
    required: true,
    enum: ['Beverage', 'Food', 'Electronics', 'Vouchers', 'Other'],
  },
  stock: {
    type: Number,
    default: 0,
    min: 0,
  },
  active: {
    type: Boolean,
    default: true,
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

GiftSchema.index({ name: 'text', description: 'text' });

export default mongoose.model('Gift', GiftSchema);






