import express from 'express';
import GiftAssignment from '../models/GiftAssignment.js';
import Gift from '../models/Gift.js';
import UserAssignment from '../models/UserAssignment.js';
import User from '../models/User.js';
import CustomerTier from '../models/CustomerTier.js';

const router = express.Router();

// Assign gift to employer or user
router.post('/assign-gift', async (req, res) => {
  try {
    const { giftId, assignedToId, assignedToRole, pointsAvailable } = req.body;

    // Validate input
    if (!giftId || !assignedToId || !assignedToRole) {
      return res.status(400).json({
        success: false,
        message: 'Gift ID, assigned to ID, and role are required',
      });
    }

    if (!['employer', 'user'].includes(assignedToRole)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid role. Must be employer or user',
      });
    }

    // Check if gift exists and is active
    const gift = await Gift.findById(giftId);
    if (!gift) {
      return res.status(404).json({
        success: false,
        message: 'Gift not found',
      });
    }

    if (!gift.active) {
      return res.status(400).json({
        success: false,
        message: 'Gift is not active',
      });
    }

    // Check if user exists and has correct role
    const assignedToUser = await User.findById(assignedToId);
    if (!assignedToUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    if (assignedToUser.role !== assignedToRole) {
      return res.status(400).json({
        success: false,
        message: `User role does not match. Expected ${assignedToRole}, got ${assignedToUser.role}`,
      });
    }

    // Get user's current points (from CustomerTier or use provided pointsAvailable)
    let userPoints = pointsAvailable || 0;
    if (assignedToRole === 'user') {
      const customerTier = await CustomerTier.findOne({ userId: assignedToId });
      if (customerTier) {
        userPoints = customerTier.points || 0;
      }
    }

    // Calculate availability
    // For employers: available if stock > 0 (no points required)
    // For users: available if they have enough points AND stock > 0
    const isAvailable = assignedToRole === 'employer' 
      ? gift.stock > 0 
      : userPoints >= gift.pointsRequired && gift.stock > 0;

    // Get supervisor ID from request body (assignedBy) or use assignedToId as fallback
    const supervisorId = req.body.assignedBy || assignedToId;

    // Check if already assigned - allow updating existing assignment instead of blocking
    const existingAssignment = await GiftAssignment.findOne({
      giftId,
      assignedToId,
      assignedToRole,
      status: { $in: ['PENDING', 'AVAILABLE'] },
    });

    if (existingAssignment) {
      // Update existing assignment instead of creating duplicate
      existingAssignment.pointsAvailable = userPoints;
      existingAssignment.pointsRequired = gift.pointsRequired;
      existingAssignment.isAvailable = isAvailable;
      existingAssignment.status = isAvailable ? 'AVAILABLE' : 'PENDING';
      existingAssignment.assignedBy = supervisorId;
      existingAssignment.updatedAt = Date.now();
      
      await existingAssignment.save();
      
      // Populate for response
      await existingAssignment.populate('giftId');
      await existingAssignment.populate('assignedBy', 'email');
      await existingAssignment.populate('assignedToId', 'email');

      return res.status(200).json({
        success: true,
        data: existingAssignment,
        message: 'Gift assignment updated successfully',
      });
    }

    // Create assignment
    let assignment;
    try {
      assignment = new GiftAssignment({
        giftId,
        assignedToId,
        assignedToRole,
        assignedBy: supervisorId,
        pointsAvailable: userPoints,
        pointsRequired: gift.pointsRequired,
        isAvailable,
        status: isAvailable ? 'AVAILABLE' : 'PENDING',
      });

      await assignment.save();

      // Create notification for the assigned user/employer
      const { createNotification } = await import('../utils/notifications.js');
      await createNotification({
        userId: assignedToId,
        title: 'New Gift Assigned',
        message: `You have been assigned a new gift: "${gift.name}". ${isAvailable ? 'It is now available.' : 'Please approve it to make it available.'}`,
        type: isAvailable ? 'success' : 'info',
        category: 'gift',
        link: assignedToRole === 'employer' ? '/employer/gifts' : '/user/rewards',
        metadata: { assignmentId: assignment._id, giftId: gift._id },
      });
    } catch (assignmentError) {
      // Handle duplicate assignment error
      if (assignmentError.code === 11000) {
        // Try to find and return existing assignment
        const existingAssignment = await GiftAssignment.findOne({
          giftId,
          assignedToId,
          assignedToRole,
          status: { $in: ['PENDING', 'AVAILABLE'] },
        });
        
        if (existingAssignment) {
          await existingAssignment.populate('giftId');
          await existingAssignment.populate('assignedBy', 'email');
          await existingAssignment.populate('assignedToId', 'email');
          
          return res.status(200).json({
            success: true,
            data: existingAssignment,
            message: 'Gift assignment already exists',
          });
        }
      }
      throw assignmentError;
    }

    // If assigned to a user (not employer), automatically create a redemption request
    if (assignedToRole === 'user') {
      try {
        const Redemption = (await import('../models/Redemption.js')).default;
        
        // Check if redemption already exists for this user and gift
        const existingRedemption = await Redemption.findOne({
          userId: assignedToId,
          giftId,
          status: { $in: ['Pending', 'Approved'] }
        });

        if (!existingRedemption) {
          // Create a redemption request automatically
          const redemption = new Redemption({
            userId: assignedToId,
            giftId,
            pointsUsed: gift.pointsRequired || 0,
            quantity: 1,
            status: 'Pending',
          });
          await redemption.save();
        }
      } catch (redemptionError) {
        console.error('Error auto-creating redemption:', redemptionError);
        // Don't fail the assignment if redemption creation fails
      }
    }

    // Populate for response
    await assignment.populate('giftId');
    await assignment.populate('assignedBy', 'email');
    await assignment.populate('assignedToId', 'email');

    console.log(`Gift assignment created: ${assignedToRole} - ${assignedToId}, Available: ${isAvailable}, Status: ${assignment.status}`);

    res.status(201).json({
      success: true,
      data: assignment,
      message: assignedToRole === 'user' 
        ? 'Gift assigned successfully and redemption request created' 
        : 'Gift assigned successfully',
    });
  } catch (error) {
    console.error('Error assigning gift:', error);
    res.status(500).json({
      success: false,
      message: 'Error assigning gift',
      error: process.env.NODE_ENV === 'development' ? error.message : {},
    });
  }
});

// Get all gift assignments made by supervisor
router.get('/assignments', async (req, res) => {
  try {
    // In production, get supervisorId from authenticated user (req.user)
    const { supervisorId } = req.query;

    if (!supervisorId) {
      return res.status(400).json({
        success: false,
        message: 'Supervisor ID is required',
      });
    }

    const assignments = await GiftAssignment.find({ assignedBy: supervisorId })
      .populate('giftId')
      .populate('assignedToId', 'email')
      .populate('assignedBy', 'email')
      .sort({ assignedAt: -1 });

    res.json({
      success: true,
      data: assignments,
    });
  } catch (error) {
    console.error('Error fetching assignments:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching assignments',
    });
  }
});

// Assign user to employer
router.post('/assign-user', async (req, res) => {
  try {
    const { userId, employerId, supervisorId } = req.body;

    if (!userId || !employerId || !supervisorId) {
      return res.status(400).json({
        success: false,
        message: 'User ID, employer ID, and supervisor ID are required',
      });
    }

    // Check if user exists and has role 'user'
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    if (user.role !== 'user') {
      return res.status(400).json({
        success: false,
        message: 'Can only assign users with role "user"',
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

    // Check if assignment already exists
    const existingAssignment = await UserAssignment.findOne({
      userId,
      employerId,
      status: 'ACTIVE',
    });

    if (existingAssignment) {
      return res.status(400).json({
        success: false,
        message: 'User is already assigned to this employer',
      });
    }

    // Create new assignment
    try {
      const assignment = new UserAssignment({
        userId,
        employerId,
        assignedBy: supervisorId,
        status: 'ACTIVE',
      });

      await assignment.save();
    } catch (assignmentError) {
      // Handle duplicate assignment error
      if (assignmentError.code === 11000) {
        return res.status(400).json({
          success: false,
          message: 'User is already assigned to this employer',
        });
      }
      throw assignmentError;
    }

    // Populate for response
    await assignment.populate('userId', 'email');
    await assignment.populate('employerId', 'email');
    await assignment.populate('assignedBy', 'email');

    res.status(201).json({
      success: true,
      data: assignment,
      message: 'User assigned to employer successfully',
    });
  } catch (error) {
    console.error('Error assigning user to employer:', error);
    res.status(500).json({
      success: false,
      message: 'Error assigning user to employer',
      error: process.env.NODE_ENV === 'development' ? error.message : {},
    });
  }
});

// Get user assignments (which employer a user is assigned to)
router.get('/user-assignments', async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required',
      });
    }

    const assignments = await UserAssignment.find({
      userId,
      status: 'ACTIVE',
    })
      .populate('employerId', 'email')
      .populate('assignedBy', 'email')
      .sort({ assignedAt: -1 });

    res.json({
      success: true,
      data: assignments,
    });
  } catch (error) {
    console.error('Error fetching user assignments:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching user assignments',
    });
  }
});

export default router;



