import express from 'express';
import Gift from '../models/Gift.js';
import User from '../models/User.js';
import Transaction from '../models/Transaction.js';
import Pump from '../models/Pump.js';
import PumpAssignment from '../models/PumpAssignment.js';

const router = express.Router();

// Public route to get transaction by ID (for QR code scanning)
router.get('/transactions/:id', async (req, res) => {
  try {
    const transaction = await Transaction.findById(req.params.id)
      .populate('userId', 'email name')
      .populate('pumpId', 'name')
      .populate('employerId', 'email');

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found',
      });
    }

    res.json({
      success: true,
      data: transaction,
    });
  } catch (error) {
    console.error('Error fetching transaction:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching transaction',
      error: process.env.NODE_ENV === 'development' ? error.message : {},
    });
  }
});

// Public route to get transaction by invoice number (for mobile invoice download)
router.get('/transactions/invoice/:invoiceNumber', async (req, res) => {
  try {
    const { invoiceNumber } = req.params;
    
    if (!invoiceNumber) {
      return res.status(400).json({
        success: false,
        message: 'Invoice number is required',
      });
    }

    const transaction = await Transaction.findOne({ invoiceNumber })
      .populate('userId', 'email name')
      .populate('pumpId', 'name')
      .populate('employerId', 'email name');

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Invoice not found',
      });
    }

    res.json({
      success: true,
      data: transaction,
    });
  } catch (error) {
    console.error('Error fetching transaction by invoice number:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching transaction',
      error: process.env.NODE_ENV === 'development' ? error.message : {},
    });
  }
});

// Get supervisor dashboard stats
router.get('/supervisor/dashboard/stats', async (req, res) => {
  try {
    const supervisorId = req.query.supervisorId || req.user?.id;
    
    if (!supervisorId) {
      return res.status(400).json({
        success: false,
        message: 'Supervisor ID is required',
      });
    }
    
    // Get pump status - pumps assigned to supervisors
    // Handle both ObjectId and string formats for supervisor field
    const mongoose = (await import('mongoose')).default;
    let allPumps = [];
    
    // First, get the supervisor user to get the correct ObjectId
    let supervisorUser = null;
    let supervisorObjectId = null;
    
    try {
      if (mongoose.Types.ObjectId.isValid(supervisorId)) {
        supervisorUser = await User.findById(supervisorId);
        if (supervisorUser) {
          supervisorObjectId = supervisorUser._id;
        } else {
          // If not found by ID, try by email
          supervisorUser = await User.findOne({ email: supervisorId, role: 'supervisor' });
          if (supervisorUser) {
            supervisorObjectId = supervisorUser._id;
          }
        }
      } else {
        // If supervisorId is not a valid ObjectId, try to find by email
        supervisorUser = await User.findOne({ email: supervisorId, role: 'supervisor' });
        if (supervisorUser) {
          supervisorObjectId = supervisorUser._id;
        }
      }
    } catch (err) {
      // Supervisor not found
    }
    
    if (!supervisorObjectId) {
      // Return empty data if supervisor not found
      return res.json({
        success: true,
        data: {
          pumpStatus: { active: 0, total: 0 },
          assignedEmployers: 0,
          dailySales: 0,
          pumps: [],
          employers: [],
          users: [],
        },
        message: 'Supervisor not found or no pumps assigned',
      });
    }
    
    // Query pumps ONLY by the supervisor's ObjectId (exact match)
    allPumps = await Pump.find({ supervisor: supervisorObjectId });
    const activePumps = allPumps.filter(p => p.status === 'ACTIVE').length;
    const totalPumps = allPumps.length;
    
    // Get assigned employers - employers assigned to pumps supervised by this supervisor
    const pumpIds = allPumps.map(p => p._id);
    
    let assignments = [];
    let uniqueEmployers = [];
    let assignedEmployers = 0;
    
    if (pumpIds.length > 0) {
      assignments = await PumpAssignment.find({ 
        pumpId: { $in: pumpIds },
        status: 'ACTIVE'
      }).populate('employerId', 'email');
      
      uniqueEmployers = [...new Set(assignments.map(a => a.employerId?._id?.toString()).filter(Boolean))];
      assignedEmployers = uniqueEmployers.length;
    }
    
    // Get daily sales summary - transactions from pumps supervised by this supervisor
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const dailySalesResult = await Transaction.aggregate([
      {
        $match: {
          createdAt: { $gte: today },
          pumpId: { $in: pumpIds },
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
    const dailySales = dailySalesResult.length > 0 ? dailySalesResult[0].total : 0;

    // Get employers list with their assigned pumps
    const employersList = await User.find({ 
      _id: { $in: uniqueEmployers }
    }).select('email role');

    // Get detailed employer info with assigned pumps
    const employersWithPumps = await Promise.all(
      employersList.map(async (employer) => {
        const employerAssignments = assignments.filter(
          a => a.employerId?._id?.toString() === employer._id.toString()
        );
        const assignedPumpIds = employerAssignments.map(a => a.pumpId?._id || a.pumpId);
        const assignedPumps = allPumps.filter(p => 
          assignedPumpIds.some(id => id?.toString() === p._id.toString())
        );
        
        return {
          _id: employer._id,
          email: employer.email,
          role: employer.role,
          assignedPumps: assignedPumps.map(p => ({
            _id: p._id,
            name: p.name,
            status: p.status,
            fuelTypes: p.fuelTypes,
          })),
          assignedPumpsCount: assignedPumps.length,
        };
      })
    );

    // Get users (role='user') - only users who have transactions with supervisor's assigned employers
    let usersList = [];
    try {
      // Get unique employer IDs from assignments
      const employerIds = uniqueEmployers.map(id => {
        try {
          return mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : id;
        } catch {
          return id;
        }
      }).filter(Boolean);
      
      if (employerIds.length === 0) {
        usersList = [];
      } else {
        // Get all transactions from supervisor's assigned employers
        const transactions = await Transaction.find({
          employerId: { $in: employerIds },
          userId: { $exists: true, $ne: null },
          status: 'Completed'
        }).select('userId employerId');
        
        // Get unique user IDs from transactions
        const uniqueUserIds = [...new Set(transactions.map(t => t.userId?.toString()).filter(Boolean))];
        
        if (uniqueUserIds.length > 0) {
          // Get user details
          const userObjectIds = uniqueUserIds.map(id => {
            try {
              return mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : id;
            } catch {
              return id;
            }
          }).filter(Boolean);
          
          const allUsers = await User.find({
            _id: { $in: userObjectIds },
            role: 'user'
          }).select('email role');
          
          // Calculate reward points from transactions (more accurate than CustomerTier)
          let transactionCountMap = {};
          let userPointsMap = {};
          
          if (employerIds.length > 0 && allUsers.length > 0) {
            // Get all transactions for these users from supervisor's employers
            const userTransactions = await Transaction.find({
              employerId: { $in: employerIds },
              userId: { $in: allUsers.map(u => u._id) },
              status: 'Completed'
            }).select('userId rewardPoints amount');

            // Calculate points and transaction counts from actual transactions
            userTransactions.forEach(transaction => {
              const userIdStr = transaction.userId?.toString();
              if (userIdStr) {
                // Count transactions
                transactionCountMap[userIdStr] = (transactionCountMap[userIdStr] || 0) + 1;
                
                // Calculate reward points
                let points = 0;
                if (transaction.rewardPoints !== undefined && transaction.rewardPoints !== null) {
                  points = transaction.rewardPoints;
                } else if (transaction.amount) {
                  // Fallback: calculate from amount if rewardPoints not set
                  points = Math.floor(transaction.amount / 100);
                }
                userPointsMap[userIdStr] = (userPointsMap[userIdStr] || 0) + points;
              }
            });
          }
          
          // Combine user data with points and transaction counts
          usersList = allUsers.map(user => ({
            _id: user._id,
            email: user.email,
            role: user.role,
            points: userPointsMap[user._id.toString()] || 0,
            rewardPoints: userPointsMap[user._id.toString()] || 0, // Calculate from transactions
            transactionCount: transactionCountMap[user._id.toString()] || 0
          }));
        }
      }
    } catch (err) {
      console.error('Error fetching users for supervisor:', err.message);
      usersList = [];
    }

    const responseData = {
      pumpStatus: {
        active: activePumps,
        total: totalPumps,
      },
      assignedEmployers,
      dailySales,
      pumps: allPumps,
      employers: employersWithPumps,
      users: usersList, // Add users filtered by supervisor's pumps
    };
    
    res.json({
      success: true,
      data: responseData,
      message: 'Dashboard stats retrieved successfully',
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching dashboard stats',
      error: process.env.NODE_ENV === 'development' ? error.message : {},
    });
  }
});

// Get recent transactions
router.get('/transactions/recent', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 5;
    
    const transactions = await Transaction.find()
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('userId', 'email')
      .select('-__v');

    res.json({
      success: true,
      data: transactions,
      message: 'Recent transactions retrieved successfully',
    });
  } catch (error) {
    console.error('Recent transactions error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching recent transactions',
      error: process.env.NODE_ENV === 'development' ? error.message : {},
    });
  }
});

// Helper function to get user's assigned employers from transactions
const getUserAssignedEmployers = async (userId) => {
  try {
    const mongoose = (await import('mongoose')).default;
    const userObjectId = mongoose.Types.ObjectId.isValid(userId) 
      ? new mongoose.Types.ObjectId(userId) 
      : userId;
    
    // Get all transactions for this user
    const transactions = await Transaction.find({
      userId: userObjectId,
      employerId: { $exists: true, $ne: null }
    }).select('employerId');
    
    // Extract unique employer IDs
    const employerIds = [...new Set(transactions.map(t => {
      const empId = t.employerId?.toString() || t.employerId;
      return empId;
    }).filter(Boolean))];
    
    // Convert to ObjectIds
    const employerObjectIds = employerIds.map(id => {
      if (mongoose.Types.ObjectId.isValid(id)) {
        return new mongoose.Types.ObjectId(id);
      }
      return id;
    }).filter(Boolean);
    
    return employerObjectIds;
  } catch (error) {
    return [];
  }
};

// Get user transactions (filtered by assigned employers)
router.get('/user/transactions', async (req, res) => {
  try {
    const { userId } = req.query;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required',
      });
    }
    
    const mongoose = (await import('mongoose')).default;
    const userObjectId = mongoose.Types.ObjectId.isValid(userId) 
      ? new mongoose.Types.ObjectId(userId) 
      : userId;
    
    // Get user's assigned employers
    const assignedEmployerIds = await getUserAssignedEmployers(userId);
    
    // Get transactions only from assigned employers
    const query = { userId: userObjectId };
    if (assignedEmployerIds.length > 0) {
      query.employerId = { $in: assignedEmployerIds };
    } else {
      // If no assigned employers, return empty (user has no transactions with any employer)
      return res.json({
        success: true,
        data: [],
        message: 'No transactions found. You need to make transactions with an employer first.',
      });
    }
    
    const transactions = await Transaction.find(query)
      .populate('pumpId', 'name')
      .populate('employerId', 'email name')
      .sort({ createdAt: -1 });
    
    res.json({
      success: true,
      data: transactions,
      message: 'Transactions retrieved successfully',
    });
  } catch (error) {
    console.error('Error fetching user transactions:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching transactions',
      error: process.env.NODE_ENV === 'development' ? error.message : {},
    });
  }
});

// Get user reward points details (transactions with reward points)
router.get('/user/reward-points-details', async (req, res) => {
  try {
    const { userId } = req.query;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required',
      });
    }
    
    const mongoose = (await import('mongoose')).default;
    const userObjectId = mongoose.Types.ObjectId.isValid(userId) 
      ? new mongoose.Types.ObjectId(userId) 
      : userId;
    
    // Get user's assigned employers
    const assignedEmployerIds = await getUserAssignedEmployers(userId);
    
    if (assignedEmployerIds.length === 0) {
      return res.json({
        success: true,
        data: [],
        message: 'No reward points found. You need to make transactions with an employer first.',
      });
    }
    
    // Get transactions only from assigned employers
    const transactions = await Transaction.find({
      userId: userObjectId,
      employerId: { $in: assignedEmployerIds },
    })
      .populate('pumpId', 'name')
      .populate('employerId', 'email name')
      .sort({ createdAt: -1 });
    
    // Update transactions that don't have rewardPoints set (backfill for old transactions)
    const transactionsToUpdate = transactions.filter(t => !t.rewardPoints && t.rewardPoints !== 0);
    for (const transaction of transactionsToUpdate) {
      const calculatedPoints = Math.floor((transaction.amount || 0) / 100);
      transaction.rewardPoints = calculatedPoints;
      await transaction.save();
    }
    
    // Re-fetch after update
    const updatedTransactions = await Transaction.find({
      userId: userObjectId,
      employerId: { $in: assignedEmployerIds },
    })
      .populate('pumpId', 'name')
      .populate('employerId', 'email name')
      .sort({ createdAt: -1 });
    
    // Format response to match frontend expectations
    const rewardPointsData = updatedTransactions.map((transaction) => ({
      _id: transaction._id,
      transactionId: {
        _id: transaction._id,
        invoiceNumber: transaction.invoiceNumber,
        amount: transaction.amount,
      },
      pumpId: transaction.pumpId ? {
        _id: transaction.pumpId._id,
        name: transaction.pumpId.name,
      } : null,
      employerId: transaction.employerId ? {
        _id: transaction.employerId._id,
        email: transaction.employerId.email,
        name: transaction.employerId.name,
      } : null,
      points: transaction.rewardPoints || 0,
      createdAt: transaction.createdAt,
    }));
    
    res.json({
      success: true,
      data: rewardPointsData,
      message: 'Reward points details retrieved successfully',
    });
  } catch (error) {
    console.error('Error fetching user reward points details:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching reward points details',
      error: process.env.NODE_ENV === 'development' ? error.message : {},
    });
  }
});

// Get user reward points (calculated only from assigned employers)
router.get('/user/reward-points', async (req, res) => {
  try {
    const { userId } = req.query;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required',
      });
    }
    
    // Get user's assigned employers
    const assignedEmployerIds = await getUserAssignedEmployers(userId);
    
    if (assignedEmployerIds.length === 0) {
      return res.json({
        success: true,
        data: {
          totalEarned: 0,
          totalRedeemed: 0,
          availableBalance: 0,
        },
      });
    }
    
    // Get transactions only from assigned employers
    const transactions = await Transaction.find({
      userId,
      employerId: { $in: assignedEmployerIds },
      status: 'Completed'
    }).select('rewardPoints');
    
    // Calculate total earned from assigned employers only
    const totalEarned = transactions.reduce((sum, t) => sum + (t.rewardPoints || 0), 0);
    
    // Get redemptions for this user (from assigned employers' supervisors)
    const Redemption = (await import('../models/Redemption.js')).default;
    const redemptions = await Redemption.find({
      userId,
      status: { $in: ['Approved', 'Completed'] }
    });
    
    const totalRedeemed = redemptions.reduce((sum, r) => sum + (r.pointsUsed || 0), 0);
    const availableBalance = totalEarned - totalRedeemed;
    
    res.json({
      success: true,
      data: {
        totalEarned,
        totalRedeemed,
        availableBalance,
      },
    });
  } catch (error) {
    console.error('Error fetching user reward points:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching reward points',
    });
  }
});

// Get user redemptions (only from assigned employers' supervisors)
router.get('/user/redemptions', async (req, res) => {
  try {
    const { userId } = req.query;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required',
      });
    }

    // Get user's assigned employers
    const assignedEmployerIds = await getUserAssignedEmployers(userId);
    
    if (assignedEmployerIds.length === 0) {
      return res.json({
        success: true,
        data: [],
        message: 'No redemptions found. You need to make transactions with an employer first.',
      });
    }
    
    // Get pumps assigned to these employers
    const PumpAssignment = (await import('../models/PumpAssignment.js')).default;
    const Pump = (await import('../models/Pump.js')).default;
    
    const pumpAssignments = await PumpAssignment.find({
      employerId: { $in: assignedEmployerIds },
      status: 'ACTIVE'
    }).select('pumpId');
    
    const pumpIds = pumpAssignments.map(a => a.pumpId);
    
    // Get supervisors who supervise these pumps
    const pumps = await Pump.find({
      _id: { $in: pumpIds },
      supervisor: { $exists: true, $ne: null }
    }).select('supervisor');
    
    const supervisorIds = [...new Set(pumps.map(p => p.supervisor?.toString() || p.supervisor).filter(Boolean))];
    
    const mongoose = (await import('mongoose')).default;
    const supervisorObjectIds = supervisorIds.map(id => {
      if (mongoose.Types.ObjectId.isValid(id)) {
        return new mongoose.Types.ObjectId(id);
      }
      return id;
    });
    
    // Get gift assignments by these supervisors for this user
    const GiftAssignment = (await import('../models/GiftAssignment.js')).default;
    const giftAssignments = await GiftAssignment.find({
      assignedToId: userId,
      assignedBy: { $in: supervisorObjectIds },
      assignedToRole: 'user'
    }).select('giftId');
    
    const giftIds = [...new Set(giftAssignments.map(a => a.giftId?.toString() || a.giftId).filter(Boolean))];
    
    // Get redemptions for this user and these gifts only
    const Redemption = (await import('../models/Redemption.js')).default;
    const query = { userId };
    
    if (giftIds.length > 0) {
      const giftObjectIds = giftIds.map(id => {
        if (mongoose.Types.ObjectId.isValid(id)) {
          return new mongoose.Types.ObjectId(id);
        }
        return id;
      });
      query.giftId = { $in: giftObjectIds };
    } else {
      // No gifts assigned, return empty
      return res.json({
        success: true,
        data: [],
        message: 'No redemptions found. No gifts have been assigned to you by your employers\' supervisors.',
      });
    }
    
    const redemptions = await Redemption.find(query)
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

    res.json({
      success: true,
      data: formattedRedemptions,
      message: 'Redemptions retrieved successfully',
    });
  } catch (error) {
    console.error('Error fetching user redemptions:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching redemptions',
      error: process.env.NODE_ENV === 'development' ? error.message : {},
    });
  }
});

// Get available gifts for user (only from assigned employers' supervisors)
router.get('/user/available-gifts', async (req, res) => {
  try {
    const { userId } = req.query;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required',
      });
    }
    
    // Get user's assigned employers
    const assignedEmployerIds = await getUserAssignedEmployers(userId);
    
    if (assignedEmployerIds.length === 0) {
      return res.json({
        success: true,
        data: [],
        message: 'No gifts available. You need to make transactions with an employer first.',
      });
    }
    
    // Get pumps assigned to these employers
    const PumpAssignment = (await import('../models/PumpAssignment.js')).default;
    const Pump = (await import('../models/Pump.js')).default;
    
    const pumpAssignments = await PumpAssignment.find({
      employerId: { $in: assignedEmployerIds },
      status: 'ACTIVE'
    }).select('pumpId');
    
    const pumpIds = pumpAssignments.map(a => a.pumpId);
    
    // Get supervisors who supervise these pumps
    const pumps = await Pump.find({
      _id: { $in: pumpIds },
      supervisor: { $exists: true, $ne: null }
    }).select('supervisor');
    
    const supervisorIds = [...new Set(pumps.map(p => p.supervisor?.toString() || p.supervisor).filter(Boolean))];
    
    if (supervisorIds.length === 0) {
      return res.json({
        success: true,
        data: [],
        message: 'No gifts available. No supervisors are assigned to your employers\' pumps.',
      });
    }
    
    const mongoose = (await import('mongoose')).default;
    const supervisorObjectIds = supervisorIds.map(id => {
      if (mongoose.Types.ObjectId.isValid(id)) {
        return new mongoose.Types.ObjectId(id);
      }
      return id;
    });
    
    // Get gifts assigned to this user by these supervisors only
    const GiftAssignment = (await import('../models/GiftAssignment.js')).default;
    const CustomerTier = (await import('../models/CustomerTier.js')).default;
    
    // Get user's current points
    const customerTier = await CustomerTier.findOne({ userId });
    const userPoints = customerTier?.points || 0;
    
    // Get gifts assigned to this user by supervisors of assigned employers
    const assignments = await GiftAssignment.find({
      assignedToId: userId,
      assignedToRole: 'user',
      assignedBy: { $in: supervisorObjectIds },
      status: { $in: ['AVAILABLE', 'PENDING'] },
    })
      .populate('giftId')
      .populate('assignedBy', 'email')
      .sort({ assignedAt: -1 });
    
    // Format response - only include gifts that are active and in stock
    const availableGifts = assignments
      .filter(assignment => {
        const gift = assignment.giftId;
        return gift && gift.active && gift.stock > 0;
      })
      .map(assignment => ({
        _id: assignment._id,
        assignmentId: assignment._id,
        gift: assignment.giftId.toObject(),
        pointsRequired: assignment.pointsRequired,
        pointsAvailable: userPoints,
        isAvailable: userPoints >= assignment.pointsRequired,
        status: assignment.status,
        assignedBy: assignment.assignedBy,
      }));
    
    res.json({
      success: true,
      data: availableGifts,
    });
  } catch (error) {
    console.error('Error fetching available gifts:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching available gifts',
    });
  }
});

export default router;


