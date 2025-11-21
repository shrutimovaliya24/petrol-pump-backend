import User from '../models/User.js';
import CustomerTier from '../models/CustomerTier.js';
import Transaction from '../models/Transaction.js';
import Redemption from '../models/Redemption.js';
import UserAssignment from '../models/UserAssignment.js';
import { calculateTotalRewardPoints } from '../utils/rewardPoints.js';
import { successResponse, errorResponse, serverErrorResponse } from '../utils/response.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { validateEmail, validateRole } from '../utils/validators.js';

/**
 * @desc    Get all users
 * @route   GET /api/users
 * @access  Public
 */
export const getUsers = asyncHandler(async (req, res) => {
  const { role, email } = req.query;
  const query = {};
  
  if (role) {
    query.role = role;
  }
  if (email) {
    query.email = email.toLowerCase();
  }
  
  const users = await User.find(query).select('-password').sort({ createdAt: -1 });
  
  // Calculate reward points from transactions for each user
  const usersWithPoints = await Promise.all(
    users.map(async (user) => {
      if (user.role === 'user') {
        const transactions = await Transaction.find({
          userId: user._id,
          status: 'Completed',
        }).select('rewardPoints amount liters');

        const calculatedPoints = calculateTotalRewardPoints(transactions);

        return {
          ...user.toObject(),
          rewardPoints: calculatedPoints,
          points: calculatedPoints,
        };
      } else {
        return {
          ...user.toObject(),
          rewardPoints: 0,
          points: 0,
        };
      }
    })
  );

  return successResponse(res, usersWithPoints, 'Users retrieved successfully');
});

/**
 * @desc    Get single user by ID
 * @route   GET /api/users/:id
 * @access  Public
 */
export const getUserById = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id).select('-password');
  
  if (!user) {
    return errorResponse(res, 'User not found', 404);
  }

  return successResponse(res, user, 'User retrieved successfully');
});

/**
 * @desc    Update user
 * @route   PUT /api/users/:id
 * @access  Public
 */
export const updateUser = asyncHandler(async (req, res) => {
  const { email, password, role } = req.body;
  const user = await User.findById(req.params.id);
  
  if (!user) {
    return errorResponse(res, 'User not found', 404);
  }

  // Update fields
  if (email !== undefined) {
    if (!validateEmail(email)) {
      return errorResponse(res, 'Invalid email format', 400);
    }
    
    const existingUser = await User.findOne({ 
      email: email.toLowerCase(), 
      role: role || user.role,
      _id: { $ne: req.params.id }
    });
    
    if (existingUser) {
      return errorResponse(res, 'User with this email and role already exists', 400);
    }
    user.email = email.toLowerCase();
  }
  
  if (role !== undefined) {
    if (!validateRole(role)) {
      return errorResponse(res, 'Invalid role. Must be user, admin, supervisor, or employer', 400);
    }
    user.role = role;
  }
  
  if (password !== undefined && password.trim() !== '') {
    user.password = password; // Will be hashed by pre-save middleware
  }
  
  user.updatedAt = Date.now();
  await user.save();

  return successResponse(res, {
    id: user._id,
    email: user.email,
    role: user.role,
  }, 'User updated successfully');
});

/**
 * @desc    Delete user
 * @route   DELETE /api/users/:id
 * @access  Public
 */
export const deleteUser = asyncHandler(async (req, res) => {
  const userId = req.params.id;
  
  const user = await User.findById(userId);
  
  if (!user) {
    return errorResponse(res, 'User not found', 404);
  }

  // Delete all UserAssignment records for this user
  await UserAssignment.deleteMany({ userId });

  // Delete CustomerTier records for this user
  await CustomerTier.deleteMany({ userId });

  // Delete Redemption records for this user
  await Redemption.deleteMany({ userId });

  // Delete all Transaction records for this user
  await Transaction.deleteMany({ userId });

  // Finally, delete the user
  await User.findByIdAndDelete(userId);

  return successResponse(res, null, 'User and all related data deleted successfully');
});

/**
 * @desc    Get user tier details
 * @route   GET /api/users/:id/tier
 * @access  Public
 */
export const getUserTier = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  
  if (!user) {
    return errorResponse(res, 'User not found', 404);
  }

  const customerTier = await CustomerTier.findOne({ userId: req.params.id });
  
  return successResponse(res, customerTier || {
    tier: 'Bronze',
    points: 0,
    transactions: 0,
    lastActivity: null,
  }, 'User tier retrieved successfully');
});

/**
 * @desc    Get user redemptions
 * @route   GET /api/users/redemptions
 * @access  Public
 */
export const getUserRedemptions = asyncHandler(async (req, res) => {
  const { userId } = req.query;
  
  if (!userId) {
    return errorResponse(res, 'User ID is required', 400);
  }

  const redemptions = await Redemption.find({ userId })
    .populate('userId', 'email')
    .populate('giftId', 'name pointsRequired stock')
    .sort({ createdAt: -1 });

  const formattedRedemptions = redemptions.map(redemption => ({
    _id: redemption._id,
    userId: redemption.userId,
    giftId: redemption.giftId,
    userEmail: redemption.userId?.email || 'N/A',
    giftName: redemption.giftId?.name || 'N/A',
    pointsUsed: redemption.pointsUsed,
    quantity: redemption.quantity || 1,
    status: redemption.status,
    createdAt: redemption.createdAt,
    updatedAt: redemption.updatedAt,
  }));

  return successResponse(res, formattedRedemptions, 'Redemptions retrieved successfully');
});

