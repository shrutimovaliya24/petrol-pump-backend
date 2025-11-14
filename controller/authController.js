import User from '../models/User.js';
import { validateEmail, validateRole } from '../utils/validators.js';
import { successResponse, errorResponse, serverErrorResponse } from '../utils/response.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

/**
 * @desc    Login user
 * @route   POST /api/auth/login
 * @access  Public
 */
export const login = asyncHandler(async (req, res) => {
  const { email, password, role } = req.body;

  // Validate input
  if (!email || !password || !role) {
    return errorResponse(res, 'Email, password, and role are required', 400);
  }

  // Validate email format
  if (!validateEmail(email)) {
    return errorResponse(res, 'Please enter a valid email address', 400);
  }

  // Validate role
  if (!validateRole(role)) {
    return errorResponse(res, 'Invalid role. Must be user, admin, supervisor, or employer', 400);
  }

  // Find user by email and role
  const user = await User.findOne({ email: email.toLowerCase(), role });
  if (!user) {
    return errorResponse(res, 'Invalid credentials', 401);
  }

  // Compare password
  const isPasswordValid = await user.comparePassword(password);
  if (!isPasswordValid) {
    return errorResponse(res, 'Invalid credentials', 401);
  }

  // Return user data (without password)
  return successResponse(res, {
    id: user._id,
    email: user.email,
    role: user.role,
  }, 'Login successful');
});

/**
 * @desc    Register new user
 * @route   POST /api/auth/register
 * @access  Public
 */
export const register = asyncHandler(async (req, res) => {
  const { email, password, role } = req.body;

  // Validate input
  if (!email || !password || !role) {
    return errorResponse(res, 'Email, password, and role are required', 400);
  }

  // Validate email format
  if (!validateEmail(email)) {
    return errorResponse(res, 'Please enter a valid email address', 400);
  }

  // Validate role
  if (!validateRole(role)) {
    return errorResponse(res, 'Invalid role. Must be user, admin, supervisor, or employer', 400);
  }

  // Check if user already exists
  const existingUser = await User.findOne({ email: email.toLowerCase(), role });
  if (existingUser) {
    return errorResponse(res, 'User with this email and role already exists', 400);
  }

  // Create new user
  const user = new User({ email: email.toLowerCase(), password, role });
  await user.save();

  // Return user data (without password)
  return successResponse(res, {
    id: user._id,
    email: user.email,
    role: user.role,
  }, 'User registered successfully', 201);
});

