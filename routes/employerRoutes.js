import express from 'express';
import PumpAssignment from '../models/PumpAssignment.js';
import GiftAssignment from '../models/GiftAssignment.js';
import UserAssignment from '../models/UserAssignment.js';
import Pump from '../models/Pump.js';
import Gift from '../models/Gift.js';
import Transaction from '../models/Transaction.js';
import CustomerTier from '../models/CustomerTier.js';
import User from '../models/User.js';

const router = express.Router();

// Get assigned pumps for logged-in employer
router.get('/pumps', async (req, res) => {
  try {
    // In production, get employerId from authenticated user (req.user)
    // For now, using query parameter
    const { employerId } = req.query;

    if (!employerId) {
      return res.status(400).json({
        success: false,
        message: 'Employer ID is required',
      });
    }

    const assignments = await PumpAssignment.find({
      employerId,
      status: 'ACTIVE',
    })
      .populate('pumpId')
      .populate('assignedBy', 'email')
      .sort({ assignedAt: -1 });

    const pumps = assignments.map((assignment) => ({
      ...assignment.pumpId.toObject(),
      assignmentId: assignment._id,
      assignedAt: assignment.assignedAt,
      assignedBy: assignment.assignedBy,
    }));

    res.json({
      success: true,
      data: pumps,
    });
  } catch (error) {
    console.error('Error fetching employer pumps:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching assigned pumps',
    });
  }
});

// Get assigned gifts for logged-in employer
router.get('/gifts', async (req, res) => {
  try {
    // In production, get assignedToId from authenticated user (req.user)
    // For now, using query parameter
    const { employerId } = req.query;

    if (!employerId) {
      return res.status(400).json({
        success: false,
        message: 'Employer ID is required',
      });
    }

    const assignments = await GiftAssignment.find({
      assignedToId: employerId,
      assignedToRole: 'employer',
    })
      .populate('giftId')
      .populate('assignedBy', 'email')
      .populate('assignedToId', 'email')
      .sort({ assignedAt: -1 });

    const gifts = assignments.map((assignment) => ({
      assignmentId: assignment._id,
      gift: assignment.giftId.toObject(),
      pointsAvailable: assignment.pointsAvailable,
      pointsRequired: assignment.pointsRequired,
      isAvailable: assignment.isAvailable,
      status: assignment.status,
      assignedAt: assignment.assignedAt,
      assignedBy: assignment.assignedBy,
    }));

    res.json({
      success: true,
      data: gifts,
    });
  } catch (error) {
    console.error('Error fetching employer gifts:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching assigned gifts',
    });
  }
});

// Update gift availability status
router.put('/gifts/:id/availability', async (req, res) => {
  try {
    const { id } = req.params;
    const { availabilityStatus } = req.body;
    const { employerId } = req.query;

    if (!employerId) {
      return res.status(400).json({
        success: false,
        message: 'Employer ID is required',
      });
    }

    // Find the gift assignment
    const assignment = await GiftAssignment.findById(id);

    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: 'Gift assignment not found',
      });
    }

    // Verify the assignment belongs to this employer
    if (assignment.assignedToId.toString() !== employerId || assignment.assignedToRole !== 'employer') {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to update this gift assignment',
      });
    }

    // Update availability status
    if (availabilityStatus !== undefined) {
      assignment.isAvailable = availabilityStatus === true || availabilityStatus === 'true';
      assignment.status = assignment.isAvailable ? 'AVAILABLE' : 'PENDING';
      assignment.updatedAt = new Date();
    }

    await assignment.save();

    // Populate for response
    await assignment.populate('giftId');
    await assignment.populate('assignedBy', 'email');
    await assignment.populate('assignedToId', 'email');

    res.json({
      success: true,
      data: {
        assignmentId: assignment._id,
        gift: assignment.giftId.toObject(),
        pointsAvailable: assignment.pointsAvailable,
        pointsRequired: assignment.pointsRequired,
        isAvailable: assignment.isAvailable,
        status: assignment.status,
        assignedAt: assignment.assignedAt,
        assignedBy: assignment.assignedBy,
      },
      message: 'Gift availability updated successfully',
    });
  } catch (error) {
    console.error('Error updating gift availability:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating gift availability',
      error: process.env.NODE_ENV === 'development' ? error.message : {},
    });
  }
});

// Update gift assignment status (Approve PENDING to AVAILABLE)
router.put('/gifts/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const { employerId } = req.query;
    const { createNotification } = await import('../utils/notifications.js');

    if (!employerId) {
      return res.status(400).json({
        success: false,
        message: 'Employer ID is required',
      });
    }

    if (!status || !['PENDING', 'AVAILABLE', 'REDEEMED', 'EXPIRED'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Valid status (PENDING, AVAILABLE, REDEEMED, or EXPIRED) is required',
      });
    }

    // Find the gift assignment
    const assignment = await GiftAssignment.findById(id);

    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: 'Gift assignment not found',
      });
    }

    // Verify the assignment belongs to this employer
    if (assignment.assignedToId.toString() !== employerId || assignment.assignedToRole !== 'employer') {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to update this gift assignment',
      });
    }

    // Update status
    assignment.status = status;
    if (status === 'AVAILABLE') {
      assignment.isAvailable = true;
    } else if (status === 'PENDING') {
      assignment.isAvailable = false;
    }
    assignment.updatedAt = new Date();

    await assignment.save();

    // Populate for response
    await assignment.populate('giftId');
    await assignment.populate('assignedBy', 'email');
    await assignment.populate('assignedToId', 'email');

    // Create notification when status is approved
    if (status === 'AVAILABLE') {
      await createNotification({
        userId: assignment.assignedBy._id || assignment.assignedBy,
        title: 'Gift Approved by Employer',
        message: `The gift "${assignment.giftId.name}" has been approved and is now available for redemption.`,
        type: 'success',
        category: 'gift',
        link: '/supervisor/gifts',
        metadata: { assignmentId: assignment._id, giftId: assignment.giftId._id },
      });
    }

    res.json({
      success: true,
      data: {
        assignmentId: assignment._id,
        gift: assignment.giftId.toObject(),
        pointsAvailable: assignment.pointsAvailable,
        pointsRequired: assignment.pointsRequired,
        isAvailable: assignment.isAvailable,
        status: assignment.status,
        assignedAt: assignment.assignedAt,
        assignedBy: assignment.assignedBy,
      },
      message: 'Gift status updated successfully',
    });
  } catch (error) {
    console.error('Error updating gift status:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating gift status',
      error: process.env.NODE_ENV === 'development' ? error.message : {},
    });
  }
});

// Get employer dashboard stats
router.get('/dashboard/stats', async (req, res) => {
  try {
    const { employerId } = req.query;

    if (!employerId) {
      return res.status(400).json({
        success: false,
        message: 'Employer ID is required',
      });
    }

    // Get assigned pump IDs for this employer
    const pumpAssignments = await PumpAssignment.find({
      employerId,
      status: 'ACTIVE',
    });
    const assignedPumpIds = pumpAssignments.map(assignment => assignment.pumpId);

    const assignedPumpsCount = pumpAssignments.length;

    const assignedGiftsCount = await GiftAssignment.countDocuments({
      assignedToId: employerId,
      assignedToRole: 'employer',
    });

    const availableGiftsCount = await GiftAssignment.countDocuments({
      assignedToId: employerId,
      assignedToRole: 'employer',
      status: 'AVAILABLE',
    });

    const pendingGiftsCount = await GiftAssignment.countDocuments({
      assignedToId: employerId,
      assignedToRole: 'employer',
      status: 'PENDING',
    });

    // Get all transactions for this employer (same query as transactions endpoint)
    const allTransactions = await Transaction.find({ employerId })
      .select('amount liters createdAt status');

    // Calculate today's fuel sales (today's transactions)
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let dailyFuelSales = 0;
    let totalLiters = 0;
    let totalInvoices = 0;

    // Calculate stats from actual transaction data
    allTransactions.forEach((transaction) => {
      if (transaction.status === 'Completed') {
        // All-time totals
        totalLiters += transaction.liters || 0;
        totalInvoices += 1;

        // Today's totals
        const transactionDate = new Date(transaction.createdAt);
        transactionDate.setHours(0, 0, 0, 0);
        if (transactionDate.getTime() === today.getTime()) {
          dailyFuelSales += transaction.amount || 0;
        }
      }
    });

    res.json({
      success: true,
      data: {
        assignedPumpsCount,
        assignedGiftsCount,
        availableGiftsCount,
        pendingGiftsCount,
        dailyFuelSales,
        totalLiters,
        totalInvoices,
      },
    });
  } catch (error) {
    console.error('Error fetching employer dashboard stats:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching dashboard stats',
    });
  }
});

// Get transactions for employer
router.get('/transactions', async (req, res) => {
  try {
    const { employerId, page = 1, limit = 50, transactionId } = req.query;

    // Cleanup: Delete orphaned transactions (where userId exists but user doesn't)
    // This handles old transactions from before we added delete logic
    if (employerId) {
      const allTransactions = await Transaction.find({ employerId, userId: { $exists: true, $ne: null } })
        .populate('userId');
      
      const orphanedTransactionIds = allTransactions
        .filter(t => !t.userId || !t.userId._id)
        .map(t => t._id);
      
      if (orphanedTransactionIds.length > 0) {
        await Transaction.deleteMany({ _id: { $in: orphanedTransactionIds } });
        console.log(`Cleaned up ${orphanedTransactionIds.length} orphaned transactions for employer ${employerId}`);
      }
    }

    // If transactionId is provided, return single transaction
    if (transactionId) {
      if (!employerId) {
        return res.status(400).json({
          success: false,
          message: 'Employer ID is required when fetching single transaction',
        });
      }

      const transaction = await Transaction.findOne({ 
        _id: transactionId,
        employerId 
      })
        .populate('userId', 'email name')
        .populate('pumpId', 'name')
        .populate('employerId', 'email');

      if (!transaction) {
        return res.status(404).json({
          success: false,
          message: 'Transaction not found',
        });
      }

      return res.json({
        success: true,
        data: transaction,
      });
    }

    if (!employerId) {
      return res.status(400).json({
        success: false,
        message: 'Employer ID is required',
      });
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get all transactions and populate userId
    let transactions = await Transaction.find({ employerId })
      .populate('userId', 'email name')
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
    console.error('Error fetching employer transactions:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching transactions',
    });
  }
});

// Get next sequential invoice number
router.get('/transactions/next-invoice-number', async (req, res) => {
  try {
    // Find all transactions with invoice numbers matching pattern I-XX
    const transactions = await Transaction.find({
      invoiceNumber: { $regex: /^I-\d+$/ }
    }).select('invoiceNumber');

    let maxNumber = 0;

    // Extract numbers from all matching invoices and find the maximum
    transactions.forEach(transaction => {
      const match = transaction.invoiceNumber.match(/^I-(\d+)$/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxNumber) {
          maxNumber = num;
        }
      }
    });

    // Next number is max + 1, starting from 1 if no invoices exist
    const nextNumber = maxNumber + 1;

    // Format with leading zero (I-01, I-02, etc.)
    const invoiceNumber = `I-${String(nextNumber).padStart(2, '0')}`;

    res.json({
      success: true,
      data: { invoiceNumber },
    });
  } catch (error) {
    console.error('Error generating invoice number:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating invoice number',
    });
  }
});

// Create new transaction
router.post('/transactions', async (req, res) => {
  try {
    const {
      invoiceNumber,
      userId,
      pumpId,
      amount,
      liters,
      paymentType,
      employerId,
      description,
      customerEmail,
      customerName,
    } = req.body;

    if (!amount || !pumpId || !employerId) {
      return res.status(400).json({
        success: false,
        message: 'Amount, pump ID, and employer ID are required',
      });
    }

    // Validate amount is positive
    if (parseFloat(amount) <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Amount must be greater than 0',
      });
    }

    // Check for duplicate invoice number if provided
    if (invoiceNumber) {
      const existingTransaction = await Transaction.findOne({ invoiceNumber });
      if (existingTransaction) {
        return res.status(400).json({
          success: false,
          message: 'Transaction with this invoice number already exists',
        });
      }
    }

    // Calculate reward points based on liters
    const { calculateRewardPoints } = await import('../utils/rewardPoints.js');
    const rewardPoints = await calculateRewardPoints(liters);

    // Create transaction
    const transaction = new Transaction({
      invoiceNumber,
      userId: userId || null,
      pumpId,
      employerId,
      amount: parseFloat(amount),
      liters: liters ? parseFloat(liters) : null,
      payment: paymentType || 'Cash',
      description: description || `Fuel sale - ${invoiceNumber || 'N/A'}`,
      type: 'fuel',
      status: 'Completed',
      rewardPoints,
      customerEmail: customerEmail || '',
      customerName: customerName || '',
    });

    await transaction.save();

    // Update CustomerTier if userId is provided (create even if rewardPoints is 0)
    if (userId) {
      try {
        let customerTier = await CustomerTier.findOne({ userId });
        
        if (!customerTier) {
          customerTier = new CustomerTier({
            userId,
            tier: 'Bronze',
            points: 0,
            transactions: 0,
          });
        }

        // Add reward points (even if 0, we still track the transaction)
        customerTier.points = (customerTier.points || 0) + rewardPoints;
        customerTier.transactions = (customerTier.transactions || 0) + 1;
        customerTier.lastActivity = new Date();
        customerTier.updatedAt = new Date();

        // Update tier based on total points
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
        console.log(`CustomerTier updated for user ${userId}: ${customerTier.points} points`);
      } catch (tierError) {
        console.error('Error updating CustomerTier:', tierError);
        // Don't fail the transaction if CustomerTier update fails
      }
    }

    // Populate for response
    await transaction.populate('userId', 'email name');
    await transaction.populate('pumpId', 'name');
    await transaction.populate('employerId', 'email');

    res.status(201).json({
      success: true,
      data: transaction,
      message: 'Transaction created successfully',
    });
  } catch (error) {
    console.error('Error creating transaction:', error);
    
    // Handle duplicate invoice number error
    if (error.code === 11000 || error.message.includes('duplicate')) {
      return res.status(400).json({
        success: false,
        message: 'Transaction with this invoice number already exists',
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Error creating transaction',
      error: process.env.NODE_ENV === 'development' ? error.message : {},
    });
  }
});

// Get reward points for employer (all transactions, including those with 0 points)
router.get('/reward-points', async (req, res) => {
  try {
    const { employerId } = req.query;

    if (!employerId) {
      return res.status(400).json({
        success: false,
        message: 'Employer ID is required',
      });
    }

    // Get all transactions for this employer (including those with 0 reward points)
    const transactions = await Transaction.find({
      employerId,
    })
      .populate('userId', 'email name')
      .populate('pumpId', 'name')
      .sort({ createdAt: -1 });

    // Update transactions that don't have rewardPoints set (backfill for old transactions)
    const mongoose = (await import('mongoose')).default;
    const employerObjectId = mongoose.Types.ObjectId.isValid(employerId) 
      ? new mongoose.Types.ObjectId(employerId) 
      : employerId;

    const transactionsToUpdate = await Transaction.find({
      employerId: employerObjectId,
      $or: [
        { rewardPoints: { $exists: false } },
        { rewardPoints: null }
      ]
    });

    // Update transactions without rewardPoints
    const { calculateRewardPoints } = await import('../utils/rewardPoints.js');
    for (const transaction of transactionsToUpdate) {
      const calculatedPoints = await calculateRewardPoints(transaction.liters);
      transaction.rewardPoints = calculatedPoints;
      await transaction.save();
    }

    // Re-fetch transactions after update
    const updatedTransactions = await Transaction.find({
      employerId: employerObjectId,
    })
      .populate('userId', 'email name')
      .populate('pumpId', 'name')
      .sort({ createdAt: -1 });

    // Format response to match frontend expectations
    const rewardPointsData = updatedTransactions.map((transaction) => ({
      _id: transaction._id,
      transactionId: {
        _id: transaction._id,
        invoiceNumber: transaction.invoiceNumber,
        amount: transaction.amount,
      },
      userId: transaction.userId ? {
        _id: transaction.userId._id,
        email: transaction.userId.email,
        name: transaction.userId.name,
      } : null,
      points: transaction.rewardPoints || 0,
      createdAt: transaction.createdAt,
    }));

    res.json({
      success: true,
      data: rewardPointsData,
    });
  } catch (error) {
    console.error('Error fetching reward points:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching reward points',
    });
  }
});

// Record meter reading for a pump
router.post('/pumps/:pumpId/meter-reading', async (req, res) => {
  try {
    const { pumpId } = req.params;
    const { startReading, endReading, difference, employerId } = req.body;

    if (!startReading || !endReading) {
      return res.status(400).json({
        success: false,
        message: 'Start reading and end reading are required',
      });
    }

    // Verify pump exists and is assigned to employer
    const pump = await Pump.findById(pumpId);
    if (!pump) {
      return res.status(404).json({
        success: false,
        message: 'Pump not found',
      });
    }

    // Check if pump is assigned to this employer
    if (employerId) {
      const assignment = await PumpAssignment.findOne({
        pumpId,
        employerId,
        status: 'ACTIVE',
      });

      if (!assignment) {
        return res.status(403).json({
          success: false,
          message: 'Pump is not assigned to this employer',
        });
      }
    }

    const calculatedDifference = parseFloat(endReading) - parseFloat(startReading);

    // Add meter reading to pump
    const meterReading = {
      startReading: parseFloat(startReading),
      endReading: parseFloat(endReading),
      difference: difference !== undefined ? parseFloat(difference) : calculatedDifference,
      recordedBy: employerId || null,
      recordedAt: new Date(),
    };

    pump.meterReadings.push(meterReading);
    pump.lastMeterReading = {
      startReading: parseFloat(startReading),
      endReading: parseFloat(endReading),
      difference: difference !== undefined ? parseFloat(difference) : calculatedDifference,
      recordedAt: new Date(),
    };
    pump.updatedAt = new Date();

    await pump.save();

    res.status(201).json({
      success: true,
      data: {
        meterReading,
        pump: pump.toObject(),
      },
      message: 'Meter reading recorded successfully',
    });
  } catch (error) {
    console.error('Error recording meter reading:', error);
    res.status(500).json({
      success: false,
      message: 'Error recording meter reading',
      error: process.env.NODE_ENV === 'development' ? error.message : {},
    });
  }
});

// Submit maintenance report for a pump
router.post('/pumps/:pumpId/maintenance', async (req, res) => {
  try {
    const { pumpId } = req.params;
    const { issue, description, employerId } = req.body;

    if (!issue) {
      return res.status(400).json({
        success: false,
        message: 'Issue is required',
      });
    }

    // Verify pump exists
    const pump = await Pump.findById(pumpId);
    if (!pump) {
      return res.status(404).json({
        success: false,
        message: 'Pump not found',
      });
    }

    // Check if pump is assigned to this employer
    if (employerId) {
      const assignment = await PumpAssignment.findOne({
        pumpId,
        employerId,
        status: 'ACTIVE',
      });

      if (!assignment) {
        return res.status(403).json({
          success: false,
          message: 'Pump is not assigned to this employer',
        });
      }
    }

    // Add maintenance report to pump
    const maintenanceReport = {
      issue,
      description: description || '',
      reportedBy: employerId || null,
      status: 'PENDING',
      reportedAt: new Date(),
    };

    pump.maintenanceReports.push(maintenanceReport);
    
    // Optionally update pump status to MAINTENANCE
    // pump.status = 'MAINTENANCE';
    
    pump.updatedAt = new Date();

    await pump.save();

    res.status(201).json({
      success: true,
      data: {
        maintenanceReport,
        pump: pump.toObject(),
      },
      message: 'Maintenance report submitted successfully',
    });
  } catch (error) {
    console.error('Error submitting maintenance report:', error);
    res.status(500).json({
      success: false,
      message: 'Error submitting maintenance report',
      error: process.env.NODE_ENV === 'development' ? error.message : {},
    });
  }
});

// Get all users (for employer to view) - only users assigned to this employer
router.get('/users', async (req, res) => {
  try {
    const { employerId } = req.query;

    if (!employerId) {
      return res.status(400).json({
        success: false,
        message: 'Employer ID is required',
      });
    }

    // Get only users assigned to this employer
    const assignments = await UserAssignment.find({
      employerId,
      status: 'ACTIVE',
    }).populate('userId', 'email role');

    // Extract user IDs from assignments, filtering out null/undefined (deleted users)
    const assignedUserIds = assignments
      .map(assignment => assignment.userId?._id)
      .filter(Boolean); // Remove null/undefined values

    // Get users that are assigned to this employer and still exist
    const users = await User.find({
      _id: { $in: assignedUserIds },
      role: 'user',
    })
      .select('-password')
      .sort({ createdAt: -1 });

    // Get transaction counts and stats for each user
    const usersWithStats = await Promise.all(
      users.map(async (user) => {
        // Get transactions for this user from this employer
        const transactions = await Transaction.find({
          userId: user._id,
          employerId,
          status: 'Completed',
        }).select('rewardPoints amount liters');

        // Calculate reward points from transactions (more accurate)
        const { calculateRewardPoints } = await import('../utils/rewardPoints.js');
        let calculatedPoints = 0;
        for (const transaction of transactions) {
          if (transaction.rewardPoints !== undefined && transaction.rewardPoints !== null) {
            calculatedPoints += transaction.rewardPoints;
          } else {
            // Fallback: calculate from liters/amount if rewardPoints not set
            calculatedPoints += await calculateRewardPoints(transaction.liters);
          }
        }

        const transactionCount = transactions.length;

        // Get CustomerTier for tier information
        const customerTier = await CustomerTier.findOne({ userId: user._id });
        
        // Determine tier based on calculated points
        let tier = 'Bronze';
        if (calculatedPoints >= 10000) {
          tier = 'Platinum';
        } else if (calculatedPoints >= 5000) {
          tier = 'Gold';
        } else if (calculatedPoints >= 2000) {
          tier = 'Silver';
        } else {
          tier = customerTier?.tier || 'Bronze';
        }

        return {
          ...user.toObject(),
          transactionCount,
          rewardPoints: calculatedPoints, // Use calculated points from transactions
          tier: tier,
        };
      })
    );

    res.json({
      success: true,
      data: usersWithStats,
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching users',
    });
  }
});

// Create new user (employer can add users with credentials) and auto-assign to employer
router.post('/users', async (req, res) => {
  try {
    const { email, password, employerId } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required',
      });
    }

    if (!employerId) {
      return res.status(400).json({
        success: false,
        message: 'Employer ID is required',
      });
    }

    // Validate email format
    const emailRegex = /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid email address',
      });
    }

    // Check if user already exists with this email and role 'user'
    let existingUser = await User.findOne({
      email: email.toLowerCase(),
      role: 'user',
    });

    let user;
    if (existingUser) {
      user = existingUser;
    } else {
      // Create new user with role 'user'
      try {
        user = new User({
          email: email.toLowerCase(),
          password,
          role: 'user',
        });
        await user.save();
      } catch (userError) {
        // Handle duplicate user error
        if (userError.code === 11000) {
          // Try to find the existing user
          existingUser = await User.findOne({
            email: email.toLowerCase(),
            role: 'user',
          });
          if (existingUser) {
            user = existingUser;
          } else {
            return res.status(400).json({
              success: false,
              message: 'User with this email already exists',
            });
          }
        } else {
          throw userError;
        }
      }
    }

    // Check if user is already assigned to this employer
    const existingAssignment = await UserAssignment.findOne({
      userId: user._id,
      employerId,
      status: 'ACTIVE',
    });

    if (existingAssignment) {
      // User already assigned, return success without creating duplicate
      return res.status(200).json({
        success: true,
        data: {
          id: user._id,
          email: user.email,
          role: user.role,
        },
        message: existingUser ? 'User already assigned to you' : 'User created and already assigned',
      });
    }

    // Create assignment to this employer
    try {
      const assignment = new UserAssignment({
        userId: user._id,
        employerId,
        assignedBy: employerId, // Employer assigns to themselves
        status: 'ACTIVE',
      });
      await assignment.save();
    } catch (assignmentError) {
      // Handle duplicate assignment error
      if (assignmentError.code === 11000) {
        return res.status(200).json({
          success: true,
          data: {
            id: user._id,
            email: user.email,
            role: user.role,
          },
          message: 'User already assigned to this employer',
        });
      }
      throw assignmentError;
    }

    res.status(201).json({
      success: true,
      data: {
        id: user._id,
        email: user.email,
        role: user.role,
      },
      message: existingUser ? 'User assigned to you successfully' : 'User created and assigned successfully',
    });
  } catch (error) {
    console.error('Error creating user:', error);
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'User with this email already exists',
      });
    }
    res.status(500).json({
      success: false,
      message: 'Error creating user',
      error: process.env.NODE_ENV === 'development' ? error.message : {},
    });
  }
});

// Update user
router.put('/users/:id', async (req, res) => {
  try {
    const { email, password } = req.body;
    const { id } = req.params;

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Only allow updating users with role 'user'
    if (user.role !== 'user') {
      return res.status(403).json({
        success: false,
        message: 'Can only update users with role "user"',
      });
    }

    // Update fields
    if (email !== undefined) {
      // Check if email already exists for another user with role 'user'
      const existingUser = await User.findOne({
        email: email.toLowerCase(),
        role: 'user',
        _id: { $ne: id },
      });
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'User with this email already exists',
        });
      }
      user.email = email.toLowerCase();
    }
    if (password !== undefined && password.trim() !== '') {
      user.password = password; // Will be hashed by pre-save middleware
    }
    user.updatedAt = Date.now();

    await user.save();

    res.json({
      success: true,
      data: {
        id: user._id,
        email: user.email,
        role: user.role,
      },
      message: 'User updated successfully',
    });
  } catch (error) {
    console.error('Error updating user:', error);
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Email already exists',
      });
    }
    res.status(500).json({
      success: false,
      message: 'Error updating user',
      error: process.env.NODE_ENV === 'development' ? error.message : {},
    });
  }
});

// Delete user
router.delete('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Only allow deleting users with role 'user'
    if (user.role !== 'user') {
      return res.status(403).json({
        success: false,
        message: 'Can only delete users with role "user"',
      });
    }

    // Delete all UserAssignment records for this user
    await UserAssignment.deleteMany({ userId: id });

    // Delete CustomerTier records for this user
    await CustomerTier.deleteMany({ userId: id });

    // Delete Redemption records for this user
    const Redemption = (await import('../models/Redemption.js')).default;
    await Redemption.deleteMany({ userId: id });

    // Delete all Transaction records for this user
    await Transaction.deleteMany({ userId: id });

    // Finally, delete the user
    await User.findByIdAndDelete(id);

    res.json({
      success: true,
      message: 'User and all related data deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting user',
      error: process.env.NODE_ENV === 'development' ? error.message : {},
    });
  }
});

export default router;


