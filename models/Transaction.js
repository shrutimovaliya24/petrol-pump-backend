import mongoose from 'mongoose';

const TransactionSchema = new mongoose.Schema({
  description: {
    type: String,
    required: true,
  },
  invoiceNumber: {
    type: String,
    unique: true,
    sparse: true,
  },
  customerEmail: {
    type: String,
    default: '',
  },
  pumpDetails: {
    type: String,
    default: '',
  },
  amount: {
    type: Number,
    required: true,
    min: 0,
  },
  liters: {
    type: Number,
    min: 0,
  },
  payment: {
    type: String,
    enum: ['Cash', 'Card', 'UPI', 'Credit'],
    default: 'Cash',
  },
  status: {
    type: String,
    enum: ['Completed', 'Pending', 'Cancelled'],
    default: 'Completed',
  },
  type: {
    type: String,
    enum: ['fuel', 'gift', 'other'],
    default: 'fuel',
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  pumpId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Pump',
  },
  employerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  rewardPoints: {
    type: Number,
    default: 0,
    min: 0,
  },
  qrCode: {
    type: String,
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

TransactionSchema.index({ description: 'text' });

export default mongoose.model('Transaction', TransactionSchema);

