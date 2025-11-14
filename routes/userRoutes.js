import express from 'express';
import {
  getUsers,
  getUserById,
  updateUser,
  deleteUser,
  getUserTier,
  getUserRedemptions,
} from '../controller/userController.js';

const router = express.Router();

// @route   GET /api/users
// @desc    Get all users
// @access  Public
router.get('/', getUsers);

// @route   GET /api/users/redemptions
// @desc    Get user redemptions
// @access  Public
router.get('/redemptions', getUserRedemptions);

// @route   GET /api/users/:id
// @desc    Get single user by ID
// @access  Public
router.get('/:id', getUserById);

// @route   GET /api/users/:id/tier
// @desc    Get user tier details
// @access  Public
router.get('/:id/tier', getUserTier);

// @route   PUT /api/users/:id
// @desc    Update user
// @access  Public
router.put('/:id', updateUser);

// @route   DELETE /api/users/:id
// @desc    Delete user
// @access  Public
router.delete('/:id', deleteUser);

export default router;

