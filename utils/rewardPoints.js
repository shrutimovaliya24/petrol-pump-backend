// Reward points calculation utilities

/**
 * Calculate reward points from transaction amount
 * @param {Number} amount - Transaction amount
 * @returns {Number} - Reward points (1 point per ₹100, rounded down)
 */
export const calculateRewardPoints = (amount) => {
  return Math.floor(amount / 100);
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
    } else if (transaction.amount) {
      totalPoints += calculateRewardPoints(transaction.amount);
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

