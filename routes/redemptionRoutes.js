import express from 'express';
import Redemption from '../models/Redemption.js';
import Gift from '../models/Gift.js';
import User from '../models/User.js';

const router = express.Router();

// Get all redemptions (with role-based filtering)
router.get('/', async (req, res) => {
  try {
    const { supervisorId, userId, status, dateFrom, dateTo } = req.query;
    
    let query = {};
    
    // Filter by user if provided
    if (userId) {
      query.userId = userId;
    }
    
    // Filter by status if provided
    if (status) {
      query.status = status;
    }
    
    // Filter by date range if provided
    if (dateFrom || dateTo) {
      query.createdAt = {};
      if (dateFrom) {
        query.createdAt.$gte = new Date(dateFrom);
      }
      if (dateTo) {
        const endDate = new Date(dateTo);
        endDate.setHours(23, 59, 59, 999);
        query.createdAt.$lte = endDate;
      }
    }
    
    // If supervisorId is provided, filter to only show redemptions from users under their supervision
    if (supervisorId) {
      try {
        // Get all employers assigned to pumps supervised by this supervisor
        const PumpAssignment = (await import('../models/PumpAssignment.js')).default;
        const Pump = (await import('../models/Pump.js')).default;
        const Transaction = (await import('../models/Transaction.js')).default;
        const GiftAssignment = (await import('../models/GiftAssignment.js')).default;
        
        // Convert supervisorId to ObjectId if it's a string
        const mongoose = (await import('mongoose')).default;
        let supervisorObjectId = supervisorId;
        if (typeof supervisorId === 'string' && mongoose.Types.ObjectId.isValid(supervisorId)) {
          supervisorObjectId = new mongoose.Types.ObjectId(supervisorId);
        }
        
        // Method 1: Get users who have gifts assigned by this supervisor
        const giftAssignments = await GiftAssignment.find({
          assignedBy: supervisorObjectId,
          assignedToRole: 'user'
        }).select('assignedToId');
        
        const assignedUserIds = [...new Set(giftAssignments.map(a => a.assignedToId?.toString() || a.assignedToId).filter(Boolean))];
        
        // Method 2: Get users who have transactions with supervisor's employers
        const pumps = await Pump.find({ supervisor: supervisorObjectId }).select('_id');
        const pumpIds = pumps.map(p => p._id);
        
        let transactionUserIds = [];
        if (pumpIds.length > 0) {
          const assignments = await PumpAssignment.find({
            pumpId: { $in: pumpIds },
            status: 'ACTIVE'
          }).select('employerId');
          const employerIds = [...new Set(assignments.map(a => a.employerId?.toString() || a.employerId).filter(Boolean))];
          
          if (employerIds.length > 0) {
            const employerIdsAsObjectIds = employerIds.map(id => {
              if (mongoose.Types.ObjectId.isValid(id)) {
                return new mongoose.Types.ObjectId(id);
              }
              return id;
            });
            
            const transactions = await Transaction.find({
              employerId: { $in: employerIdsAsObjectIds },
              userId: { $exists: true, $ne: null }
            }).select('userId');
            
            transactionUserIds = [...new Set(transactions.map(t => {
              const userId = t.userId?.toString() || t.userId;
              return userId;
            }).filter(Boolean))];
          }
        }
        
        // Combine both methods: users with assigned gifts OR users with transactions
        const allUserIds = [...new Set([...assignedUserIds, ...transactionUserIds])];
        
        if (allUserIds.length > 0) {
          // Convert userIds to ObjectIds for proper querying
          const userIdsAsObjectIds = allUserIds.map(id => {
            if (mongoose.Types.ObjectId.isValid(id)) {
              return new mongoose.Types.ObjectId(id);
            }
            return id;
          });
          
          query.userId = { $in: userIdsAsObjectIds };
        } else {
          // No users found, return empty
          return res.json({
            success: true,
            data: [],
            message: 'No redemptions found. No users have been assigned gifts or have transactions with your supervised employers.',
          });
        }
      } catch (err) {
        // If there's an error in filtering, return empty array instead of crashing
        return res.json({
          success: true,
          data: [],
          message: 'Error filtering redemptions. Please try again.',
        });
      }
    }
    
    const redemptions = await Redemption.find(query)
      .populate('userId', 'email')
      .populate('giftId', 'name pointsRequired stock')
      .sort({ createdAt: -1 });

    // Format the response
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
    console.error('Error fetching redemptions:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching redemptions',
      error: process.env.NODE_ENV === 'development' ? error.message : {},
    });
  }
});

// Create new redemption
router.post('/', async (req, res) => {
  try {
    const { userId, giftId, pointsUsed, quantity } = req.body;

    if (!giftId || pointsUsed === undefined) {
      return res.status(400).json({
        success: false,
        message: 'GiftId and pointsUsed are required',
      });
    }

    // Get the gift and check stock
    const gift = await Gift.findById(giftId);
    if (!gift) {
      return res.status(404).json({
        success: false,
        message: 'Gift not found',
      });
    }

    const qty = parseInt(quantity) || 1;
    if (gift.stock < qty) {
      return res.status(400).json({
        success: false,
        message: `Insufficient stock. Available: ${gift.stock}, Requested: ${qty}`,
      });
    }

    // Check if user has enough points (if userId provided)
    if (userId) {
      const CustomerTier = (await import('../models/CustomerTier.js')).default;
      const customerTier = await CustomerTier.findOne({ userId });
      const userPoints = customerTier?.points || 0;
      const requiredPoints = gift.pointsRequired * qty;
      
      if (userPoints < requiredPoints) {
        return res.status(400).json({
          success: false,
          message: `Insufficient points. Required: ${requiredPoints}, Available: ${userPoints}`,
        });
      }

      // Check for duplicate pending/approved redemption
      const existingRedemption = await Redemption.findOne({
        userId,
        giftId,
        status: { $in: ['Pending', 'Approved'] }
      });

      if (existingRedemption) {
        return res.status(400).json({
          success: false,
          message: 'A pending or approved redemption for this gift already exists',
        });
      }
    }

    // Create redemption
    let redemption;
    try {
      redemption = new Redemption({
        userId: userId || null,
        giftId,
        pointsUsed: parseInt(pointsUsed) || gift.pointsRequired * qty,
        quantity: qty,
        status: 'Pending', // Start as Pending, needs approval
      });

      await redemption.save();

      // Create notifications for supervisors/admins about new redemption request
      if (redemption.userId && redemption.giftId) {
        const { createNotification } = await import('../utils/notifications.js');
        const GiftAssignment = (await import('../models/GiftAssignment.js')).default;
        
        // Find supervisor who assigned this gift
        const giftAssignment = await GiftAssignment.findOne({
          giftId,
          assignedToId: userId,
          assignedToRole: 'user',
        }).populate('assignedBy');

        if (giftAssignment?.assignedBy) {
          await createNotification({
            userId: giftAssignment.assignedBy._id || giftAssignment.assignedBy,
            title: 'New Redemption Request',
            message: `User has requested to redeem "${gift.name}". Please review and approve.`,
            type: 'info',
            category: 'redemption',
            link: '/supervisor/gifts?tab=redemptions',
            metadata: { redemptionId: redemption._id, giftId: redemption.giftId._id, userId: redemption.userId._id || redemption.userId },
          });
        }

        // Also notify admin
        const User = (await import('../models/User.js')).default;
        const adminUsers = await User.find({ role: 'admin' }).select('_id');
        if (adminUsers.length > 0) {
          const { createNotificationsForUsers } = await import('../utils/notifications.js');
          await createNotificationsForUsers(
            adminUsers.map(u => u._id),
            {
              title: 'New Redemption Request',
              message: `A user has requested to redeem "${gift.name}". Please review.`,
              type: 'info',
              category: 'redemption',
              link: '/admin/gifts?tab=redemptions',
              metadata: { redemptionId: redemption._id, giftId: redemption.giftId._id },
            }
          );
        }
      }
    } catch (redemptionError) {
      // Handle duplicate redemption error
      if (redemptionError.code === 11000) {
        return res.status(400).json({
          success: false,
          message: 'A pending or approved redemption for this gift already exists',
        });
      }
      throw redemptionError;
    }

    // Populate the response
    if (redemption.userId) {
      await redemption.populate('userId', 'email');
    }
    await redemption.populate('giftId', 'name');

    res.status(201).json({
      success: true,
      data: {
        _id: redemption._id,
        userEmail: redemption.userId?.email || 'N/A',
        giftName: redemption.giftId?.name || 'N/A',
        pointsUsed: redemption.pointsUsed,
        quantity: redemption.quantity || 1,
        status: redemption.status,
        createdAt: redemption.createdAt,
      },
      message: 'Redemption created successfully',
    });
  } catch (error) {
    console.error('Error creating redemption:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating redemption',
      error: process.env.NODE_ENV === 'development' ? error.message : {},
    });
  }
});

// Update redemption status (Approve/Reject)
router.put('/:id', async (req, res) => {
  try {
    const { status } = req.body;
    
    if (!status || !['Approved', 'Rejected', 'Completed'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Valid status (Approved, Rejected, or Completed) is required',
      });
    }
    
    const redemption = await Redemption.findById(req.params.id)
      .populate('userId')
      .populate('giftId');
    
    if (!redemption) {
      return res.status(404).json({
        success: false,
        message: 'Redemption not found',
      });
    }
    
    // If approving, deduct points and reduce stock
    if (status === 'Approved' && redemption.status === 'Pending') {
      // Deduct points from user
      if (redemption.userId) {
        const CustomerTier = (await import('../models/CustomerTier.js')).default;
        const customerTier = await CustomerTier.findOne({ userId: redemption.userId._id });
        
        if (customerTier) {
          const newPoints = Math.max(0, (customerTier.points || 0) - redemption.pointsUsed);
          customerTier.points = newPoints;
          await customerTier.save();
        }
      }
      
      // Reduce gift stock when approved
      if (redemption.giftId) {
        const gift = await Gift.findById(redemption.giftId._id);
        if (gift) {
          if (gift.stock < redemption.quantity) {
            return res.status(400).json({
              success: false,
              message: `Insufficient stock. Available: ${gift.stock}, Requested: ${redemption.quantity}`,
            });
          }
          gift.stock = Math.max(0, gift.stock - redemption.quantity);
          await gift.save();
        }
      }

      // Create notification for user when redemption is approved
      if (redemption.userId) {
        const { createNotification } = await import('../utils/notifications.js');
        await createNotification({
          userId: redemption.userId._id || redemption.userId,
          title: 'Redemption Approved',
          message: `Your redemption request for "${redemption.giftId.name}" has been approved!`,
          type: 'success',
          category: 'redemption',
          link: '/user/rewards',
          metadata: { redemptionId: redemption._id, giftId: redemption.giftId._id },
        });
      }
    }
    
    // If rejecting, restore stock if it was already reduced (shouldn't happen, but safety check)
    if (status === 'Rejected' && redemption.status === 'Approved') {
      if (redemption.giftId) {
        const gift = await Gift.findById(redemption.giftId._id);
        if (gift) {
          gift.stock = (gift.stock || 0) + redemption.quantity;
          await gift.save();
        }
      }
    }
    
    // Update redemption status
    redemption.status = status;
    redemption.updatedAt = Date.now();
    await redemption.save();
    
    // Populate for response
    await redemption.populate('userId', 'email');
    await redemption.populate('giftId', 'name');
    
    res.json({
      success: true,
      data: {
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
      },
      message: `Redemption ${status.toLowerCase()} successfully`,
    });
  } catch (error) {
    console.error('Error updating redemption:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating redemption',
      error: process.env.NODE_ENV === 'development' ? error.message : {},
    });
  }
});

export default router;




