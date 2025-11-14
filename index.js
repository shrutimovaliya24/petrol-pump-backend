import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import connectDB from './config/db.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Connect to database
connectDB();

// Routes
app.get('/', (req, res) => {
  res.json({ 
    message: 'Petrol Pump Management API',
    status: 'Running',
    version: '1.0.0'
  });
});

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK',
    timestamp: new Date().toISOString(),
    database: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected'
  });
});

// Import models to register them with mongoose
import './models/User.js';
import './models/Gift.js';
import './models/Transaction.js';
import './models/Redemption.js';
import './models/Pump.js';
import './models/CustomerTier.js';
import './models/PumpAssignment.js';
import './models/GiftAssignment.js';
import './models/UserAssignment.js';
import './models/Notification.js';

// Import routes
import authRoutes from './routes/authRoutes.js';
import giftRoutes from './routes/giftRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js';
import userRoutes from './routes/userRoutes.js';
import redemptionRoutes from './routes/redemptionRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import employerRoutes from './routes/employerRoutes.js';
import supervisorRoutes from './routes/supervisorRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';

app.use('/api/auth', authRoutes);
app.use('/api/gifts', giftRoutes);
app.use('/api/users', userRoutes);
app.use('/api/redemptions', redemptionRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/employer', employerRoutes);
app.use('/api/supervisor', supervisorRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api', dashboardRoutes);

// Error handling middleware (must be after routes)
app.use(notFound);
app.use(errorHandler);

// Start server - listen on all network interfaces (0.0.0.0) to allow access from other devices
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`🌐 Server accessible from network on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
});

