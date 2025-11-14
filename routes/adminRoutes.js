import express from 'express';
import Pump from '../models/Pump.js';
import Transaction from '../models/Transaction.js';
import Gift from '../models/Gift.js';
import User from '../models/User.js';
import CustomerTier from '../models/CustomerTier.js';
import PumpAssignment from '../models/PumpAssignment.js';

const router = express.Router();

// Admin Dashboard Stats
router.get('/dashboard/stats', async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Today's Revenue
    const todayRevenue = await Transaction.aggregate([
      {
        $match: {
          createdAt: { $gte: today },
          status: 'Completed',
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$amount' },
        },
      },
    ]);
    const revenue = todayRevenue.length > 0 ? todayRevenue[0].total : 0;

    // Total Transactions
    const totalTransactions = await Transaction.countDocuments();
    const todayTransactions = await Transaction.countDocuments({
      createdAt: { $gte: today },
    });

    // Active Pumps
    const totalPumps = await Pump.countDocuments();
    const activePumps = await Pump.countDocuments({ status: 'ACTIVE' });

    // Total Users (excluding admin)
    const totalUsers = await User.countDocuments({ role: { $ne: 'admin' } });

    // Total Gifts
    const totalGifts = await Gift.countDocuments();

    res.json({
      success: true,
      data: {
        todayRevenue: revenue,
        totalTransactions,
        todayTransactions,
        activePumps,
        totalPumps,
        totalUsers,
        totalGifts,
      },
    });
  } catch (error) {
    console.error('Admin dashboard stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching dashboard stats',
    });
  }
});

// Get all pumps
router.get('/pumps', async (req, res) => {
  try {
    const pumps = await Pump.find().populate('supervisor', 'email').sort({ createdAt: -1 });
    res.json({
      success: true,
      data: pumps,
    });
  } catch (error) {
    console.error('Error fetching pumps:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching pumps',
    });
  }
});

// Create pump
router.post('/pumps', async (req, res) => {
  try {
    const { name, fuelTypes, supervisor } = req.body;
    const mongoose = (await import('mongoose')).default;
    
    // Convert supervisor to ObjectId if it's a valid ObjectId string
    let supervisorId = null;
    if (supervisor) {
      if (mongoose.Types.ObjectId.isValid(supervisor)) {
        supervisorId = new mongoose.Types.ObjectId(supervisor);
      } else {
        supervisorId = supervisor; // Keep as string for backward compatibility
      }
    }
    
    // Check for duplicate pump name
    const existingPump = await Pump.findOne({ name: name.trim() });
    if (existingPump) {
      return res.status(400).json({
        success: false,
        message: 'Pump with this name already exists',
      });
    }

    const pump = new Pump({
      name,
      fuelTypes: Array.isArray(fuelTypes) ? fuelTypes : [fuelTypes],
      supervisor: supervisorId,
    });
    
    try {
      await pump.save();
    } catch (error) {
      if (error.code === 11000 || error.message.includes('duplicate')) {
        return res.status(400).json({
          success: false,
          message: 'Pump with this name already exists',
        });
      }
      throw error;
    }
    res.status(201).json({
      success: true,
      data: pump,
    });
  } catch (error) {
    console.error('Error creating pump:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating pump',
    });
  }
});

// Update pump
router.put('/pumps/:id', async (req, res) => {
  try {
    const mongoose = (await import('mongoose')).default;
    const updateData = { ...req.body, updatedAt: Date.now() };
    
    // Convert supervisor to ObjectId if it's a valid ObjectId string
    if (updateData.supervisor !== undefined) {
      if (updateData.supervisor && mongoose.Types.ObjectId.isValid(updateData.supervisor)) {
        updateData.supervisor = new mongoose.Types.ObjectId(updateData.supervisor);
      } else if (updateData.supervisor === '' || updateData.supervisor === null) {
        updateData.supervisor = null;
      }
      // If not valid ObjectId, keep as string for backward compatibility
    }
    
    const pump = await Pump.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    ).populate('supervisor', 'email');
    if (!pump) {
      return res.status(404).json({
        success: false,
        message: 'Pump not found',
      });
    }
    res.json({
      success: true,
      data: pump,
    });
  } catch (error) {
    console.error('Error updating pump:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating pump',
    });
  }
});

// Delete pump
router.delete('/pumps/:id', async (req, res) => {
  try {
    const pump = await Pump.findByIdAndDelete(req.params.id);
    if (!pump) {
      return res.status(404).json({
        success: false,
        message: 'Pump not found',
      });
    }
    res.json({
      success: true,
      message: 'Pump deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting pump:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting pump',
    });
  }
});

// Get pump stats
router.get('/pumps/stats', async (req, res) => {
  try {
    const totalPumps = await Pump.countDocuments();
    const activePumps = await Pump.countDocuments({ status: 'ACTIVE' });
    const totalGifts = await Gift.countDocuments({ active: true });
    const totalCustomers = await User.countDocuments({ role: 'user' });

    res.json({
      success: true,
      data: {
        totalPumps,
        activePumps,
        totalGifts,
        totalCustomers,
      },
    });
  } catch (error) {
    console.error('Error fetching pump stats:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching pump stats',
    });
  }
});

// Get transaction stats
router.get('/transactions/stats', async (req, res) => {
  try {
    const totalRevenue = await Transaction.aggregate([
      {
        $match: { status: 'Completed' },
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$amount' },
        },
      },
    ]);
    const revenue = totalRevenue.length > 0 ? totalRevenue[0].total : 0;

    const completed = await Transaction.countDocuments({ status: 'Completed' });
    const pending = await Transaction.countDocuments({ status: 'Pending' });
    const total = await Transaction.countDocuments();

    res.json({
      success: true,
      data: {
        totalRevenue: revenue,
        completed,
        pending,
        total,
      },
    });
  } catch (error) {
    console.error('Error fetching transaction stats:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching transaction stats',
    });
  }
});

// Get all transactions
router.get('/transactions', async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Cleanup: Delete orphaned transactions (where userId exists but user doesn't)
    // This handles old transactions from before we added delete logic
    const allTransactionsForCleanup = await Transaction.find({ userId: { $exists: true, $ne: null } })
      .populate('userId');
    
    const orphanedTransactionIds = allTransactionsForCleanup
      .filter(t => !t.userId || !t.userId._id)
      .map(t => t._id);
    
    if (orphanedTransactionIds.length > 0) {
      await Transaction.deleteMany({ _id: { $in: orphanedTransactionIds } });
      console.log(`Cleaned up ${orphanedTransactionIds.length} orphaned transactions`);
    }
    
    // Get all transactions and populate userId
    let transactions = await Transaction.find()
      .populate('userId', 'email')
      .populate('pumpId', 'name')
      .populate('employerId', 'email name')
      .sort({ createdAt: -1 });

    // Filter out transactions where user was deleted (userId is null after populate)
    // Keep transactions if: userId exists OR customerEmail exists (guest transactions)
    transactions = transactions.filter(transaction => {
      return (transaction.userId && transaction.userId._id) || transaction.customerEmail;
    });

    // Calculate total after filtering
    const total = transactions.length;

    // Apply pagination after filtering
    const paginatedTransactions = transactions.slice(skip, skip + parseInt(limit));

    res.json({
      success: true,
      data: paginatedTransactions,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error('Error fetching transactions:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching transactions',
    });
  }
});


// Get customer tiers
router.get('/customer-tiers', async (req, res) => {
  try {
    const tiers = await CustomerTier.find()
      .populate('userId', 'email')
      .sort({ points: -1 });
    res.json({
      success: true,
      data: tiers,
    });
  } catch (error) {
    console.error('Error fetching customer tiers:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching customer tiers',
    });
  }
});

// Save settings
router.post('/settings', async (req, res) => {
  try {
    // In a real app, you'd save this to a Settings model
    // For now, just return success
    res.json({
      success: true,
      message: 'Settings saved successfully',
    });
  } catch (error) {
    console.error('Error saving settings:', error);
    res.status(500).json({
      success: false,
      message: 'Error saving settings',
    });
  }
});

// Assign pump to employer
router.post('/assign-pump', async (req, res) => {
  try {
    const { pumpId, employerId } = req.body;

    if (!pumpId || !employerId) {
      return res.status(400).json({
        success: false,
        message: 'Pump ID and employer ID are required',
      });
    }

    // Check if pump exists
    const pump = await Pump.findById(pumpId);
    if (!pump) {
      return res.status(404).json({
        success: false,
        message: 'Pump not found',
      });
    }

    // Check if employer exists and has role 'employer'
    const employer = await User.findById(employerId);
    if (!employer) {
      return res.status(404).json({
        success: false,
        message: 'Employer not found',
      });
    }

    if (employer.role !== 'employer') {
      return res.status(400).json({
        success: false,
        message: 'User is not an employer',
      });
    }

    // Check if pump is already assigned to this employer (active assignment)
    const existingAssignment = await PumpAssignment.findOne({
      pumpId,
      employerId,
      status: 'ACTIVE',
    });

    if (existingAssignment) {
      return res.status(400).json({
        success: false,
        message: 'This pump is already assigned to this employer',
      });
    }

    // Check if pump is assigned to another employer (active assignment)
    const existingOtherAssignment = await PumpAssignment.findOne({
      pumpId,
      status: 'ACTIVE',
      employerId: { $ne: employerId },
    });

    if (existingOtherAssignment) {
      // Deactivate old assignment and create new one
      existingOtherAssignment.status = 'INACTIVE';
      existingOtherAssignment.updatedAt = Date.now();
      await existingOtherAssignment.save();
    }

    // In production, get admin ID from authenticated user (req.user)
    const adminId = req.body.assignedBy || employerId; // Temporary fallback

    // Create new assignment
    try {
      const assignment = new PumpAssignment({
        pumpId,
        employerId,
        assignedBy: adminId,
        status: 'ACTIVE',
      });

      await assignment.save();
    } catch (assignmentError) {
      // Handle duplicate assignment error
      if (assignmentError.code === 11000) {
        return res.status(400).json({
          success: false,
          message: 'This pump is already assigned to this employer',
        });
      }
      throw assignmentError;
    }

    // Populate for response
    await assignment.populate('pumpId');
    await assignment.populate('employerId', 'email');
    await assignment.populate('assignedBy', 'email');

    res.status(201).json({
      success: true,
      data: assignment,
      message: 'Pump assigned successfully',
    });
  } catch (error) {
    console.error('Error assigning pump:', error);
    res.status(500).json({
      success: false,
      message: 'Error assigning pump',
      error: process.env.NODE_ENV === 'development' ? error.message : {},
    });
  }
});

// Get all pump assignments
router.get('/pump-assignments', async (req, res) => {
  try {
    const assignments = await PumpAssignment.find()
      .populate('pumpId')
      .populate('employerId', 'email')
      .populate('assignedBy', 'email')
      .sort({ assignedAt: -1 });

    res.json({
      success: true,
      data: assignments,
    });
  } catch (error) {
    console.error('Error fetching pump assignments:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching pump assignments',
    });
  }
});

// Update pump assignment status
router.put('/pump-assignments/:id', async (req, res) => {
  try {
    const { status } = req.body;

    if (status && !['ACTIVE', 'INACTIVE'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be ACTIVE or INACTIVE',
      });
    }

    const assignment = await PumpAssignment.findByIdAndUpdate(
      req.params.id,
      { ...req.body, updatedAt: Date.now() },
      { new: true }
    )
      .populate('pumpId')
      .populate('employerId', 'email')
      .populate('assignedBy', 'email');

    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: 'Assignment not found',
      });
    }

    res.json({
      success: true,
      data: assignment,
      message: 'Assignment updated successfully',
    });
  } catch (error) {
    console.error('Error updating assignment:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating assignment',
    });
  }
});

// Delete pump assignment
router.delete('/pump-assignments/:id', async (req, res) => {
  try {
    const assignment = await PumpAssignment.findByIdAndDelete(req.params.id);

    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: 'Assignment not found',
      });
    }

    res.json({
      success: true,
      message: 'Assignment deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting assignment:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting assignment',
    });
  }
});

// Backfill CustomerTier for existing transactions
router.post('/backfill-customer-tiers', async (req, res) => {
  try {
    console.log('Starting CustomerTier backfill...');
    
    // Get all completed transactions with userId
    const transactions = await Transaction.find({
      userId: { $ne: null },
      status: 'Completed',
    }).select('userId rewardPoints amount');

    console.log(`Found ${transactions.length} transactions with userId`);

    // Group transactions by userId
    const userTransactionsMap = {};
    transactions.forEach(transaction => {
      const userIdStr = transaction.userId?.toString();
      if (userIdStr) {
        if (!userTransactionsMap[userIdStr]) {
          userTransactionsMap[userIdStr] = [];
        }
        userTransactionsMap[userIdStr].push(transaction);
      }
    });

    console.log(`Found ${Object.keys(userTransactionsMap).length} unique users with transactions`);

    let createdCount = 0;
    let updatedCount = 0;
    let errorCount = 0;

    // Process each user
    for (const [userIdStr, userTransactions] of Object.entries(userTransactionsMap)) {
      try {
        // Calculate total points from all transactions
        let totalPoints = 0;
        let transactionCount = 0;

        userTransactions.forEach(transaction => {
          transactionCount++;
          if (transaction.rewardPoints !== undefined && transaction.rewardPoints !== null) {
            totalPoints += transaction.rewardPoints;
          } else if (transaction.amount) {
            totalPoints += Math.floor(transaction.amount / 100);
          }
        });

        // Find or create CustomerTier
        const mongoose = (await import('mongoose')).default;
        const userId = mongoose.Types.ObjectId.isValid(userIdStr) 
          ? new mongoose.Types.ObjectId(userIdStr) 
          : userIdStr;

        let customerTier = await CustomerTier.findOne({ userId });

        if (!customerTier) {
          // Create new CustomerTier
          customerTier = new CustomerTier({
            userId,
            tier: 'Bronze',
            points: totalPoints,
            transactions: transactionCount,
            lastActivity: new Date(),
          });
          createdCount++;
        } else {
          // Update existing CustomerTier with correct totals
          customerTier.points = totalPoints;
          customerTier.transactions = transactionCount;
          customerTier.lastActivity = new Date();
          customerTier.updatedAt = new Date();
          updatedCount++;
        }

        // Update tier based on points
        if (customerTier.points >= 10000) {
          customerTier.tier = 'Platinum';
        } else if (customerTier.points >= 5000) {
          customerTier.tier = 'Gold';
        } else if (customerTier.points >= 2000) {
          customerTier.tier = 'Silver';
        } else {
          customerTier.tier = 'Bronze';
        }

        await customerTier.save();
        console.log(`Processed user ${userIdStr}: ${totalPoints} points, ${transactionCount} transactions`);
      } catch (userError) {
        console.error(`Error processing user ${userIdStr}:`, userError);
        errorCount++;
      }
    }

    res.json({
      success: true,
      message: 'CustomerTier backfill completed',
      data: {
        totalUsers: Object.keys(userTransactionsMap).length,
        created: createdCount,
        updated: updatedCount,
        errors: errorCount,
      },
    });
  } catch (error) {
    console.error('Error in CustomerTier backfill:', error);
    res.status(500).json({
      success: false,
      message: 'Error during CustomerTier backfill',
      error: process.env.NODE_ENV === 'development' ? error.message : {},
    });
  }
});

export default router;

