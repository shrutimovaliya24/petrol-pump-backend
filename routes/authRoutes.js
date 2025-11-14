import express from 'express';
import { login, register } from '../controller/authController.js';

const router = express.Router();

// @route   POST /api/auth/login
// @desc    Login user
// @access  Public
router.post('/login', login);

// @route   POST /api/auth/register
// @desc    Register new user
// @access  Public
router.post('/register', register);

export default router;



