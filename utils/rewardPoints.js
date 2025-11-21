// Reward points calculation utilities

/**
 * Calculate reward points from transaction liters
 * @param {Number} liters - Transaction liters
 * @param {Object} settings - Settings object with rewardMultiplier, pointsPerLiter
 * @returns {Number} - Reward points
 */
export const calculateRewardPoints = async (liters = null, settings = null) => {
  // If settings not provided, fetch from database
  if (!settings) {
    const Settings = (await import('../models/Settings.js')).default;
    settings = await Settings.getSettings();
  }

  const { rewardMultiplier, pointsPerLiter } = settings;

  // Liter-based calculation: points = liters * pointsPerLiter * multiplier
  if (liters !== null && liters !== undefined && liters > 0) {
    return Math.floor(liters * (pointsPerLiter || 1) * (rewardMultiplier || 1));
  }

  return 0;
};

/**
 * Calculate total reward points from transactions
 * @param {Array} transactions - Array of transaction objects
 * @returns {Number} - Total reward points
 */
export const calculateTotalRewardPoints = (transactions) => {
  let totalPoints = 0;
  transactions.forEach(transaction => {
    if (transaction.rewardPoints !== undefined && transaction.rewardPoints !== null) {
      totalPoints += transaction.rewardPoints;
    }
  });
  return totalPoints;
};

/**
 * Determine customer tier based on total points
 * @param {Number} points - Total reward points
 * @returns {String} - Tier name (Bronze, Silver, Gold, Platinum)
 */
export const determineTier = (points) => {
  if (points >= 10000) {
    return 'Platinum';
  } else if (points >= 5000) {
    return 'Gold';
  } else if (points >= 2000) {
    return 'Silver';
  }
  return 'Bronze';
};

