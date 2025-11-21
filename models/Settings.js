import mongoose from 'mongoose';

const SettingsSchema = new mongoose.Schema({
  // Company Info
  stationName: {
    type: String,
    default: 'Fuel Station',
  },
  address: {
    type: String,
    default: '',
  },
  phone: {
    type: String,
    default: '',
  },
  email: {
    type: String,
    default: '',
  },
  // Fuel Prices
  petrolPrice: {
    type: Number,
    default: 0,
  },
  dieselPrice: {
    type: Number,
    default: 0,
  },
  lpgPrice: {
    type: Number,
    default: 0,
  },
  cngPrice: {
    type: Number,
    default: 0,
  },
  // Reward Calculation
  rewardMultiplier: {
    type: Number,
    default: 1,
  },
  pointsPerLiter: {
    type: Number,
    default: 1, // Points per liter
  },
}, {
  timestamps: true,
});

// Ensure only one settings document exists
SettingsSchema.statics.getSettings = async function() {
  let settings = await this.findOne();
  if (!settings) {
    settings = await this.create({});
  }
  return settings;
};

export default mongoose.model('Settings', SettingsSchema);

