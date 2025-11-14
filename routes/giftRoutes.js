import express from 'express';
import Gift from '../models/Gift.js';

const router = express.Router();

// Get all gifts
router.get('/', async (req, res) => {
  try {
    const gifts = await Gift.find().sort({ createdAt: -1 });
    res.json({
      success: true,
      data: gifts,
      message: 'Gifts retrieved successfully',
    });
  } catch (error) {
    console.error('Error fetching gifts:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching gifts',
      error: process.env.NODE_ENV === 'development' ? error.message : {},
    });
  }
});

// Get single gift by ID
router.get('/:id', async (req, res) => {
  try {
    const gift = await Gift.findById(req.params.id);
    if (!gift) {
      return res.status(404).json({
        success: false,
        message: 'Gift not found',
      });
    }
    res.json({
      success: true,
      data: gift,
      message: 'Gift retrieved successfully',
    });
  } catch (error) {
    console.error('Error fetching gift:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching gift',
      error: process.env.NODE_ENV === 'development' ? error.message : {},
    });
  }
});

// Create new gift
router.post('/', async (req, res) => {
  try {
    const { name, description, pointsRequired, value, category, stock, active } = req.body;

    // Validation
    if (!name || !description || pointsRequired === undefined || value === undefined || !category) {
      return res.status(400).json({
        success: false,
        message: 'Name, description, pointsRequired, value, and category are required',
      });
    }

    // Check for duplicate gift name
    const existingGift = await Gift.findOne({ name: name.trim() });
    if (existingGift) {
      return res.status(400).json({
        success: false,
        message: 'Gift with this name already exists',
      });
    }

    const gift = new Gift({
      name,
      description,
      pointsRequired: parseInt(pointsRequired) || 0,
      value: parseInt(value) || 0,
      category,
      stock: parseInt(stock) || 0,
      active: active !== undefined ? active : true,
    });

    try {
      await gift.save();
    } catch (error) {
      if (error.code === 11000 || error.message.includes('duplicate')) {
        return res.status(400).json({
          success: false,
          message: 'Gift with this name already exists',
        });
      }
      throw error;
    }

    res.status(201).json({
      success: true,
      data: gift,
      message: 'Gift created successfully',
    });
  } catch (error) {
    console.error('Error creating gift:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating gift',
      error: process.env.NODE_ENV === 'development' ? error.message : {},
    });
  }
});

// Update gift
router.put('/:id', async (req, res) => {
  try {
    const { name, description, pointsRequired, value, category, stock, active } = req.body;

    const gift = await Gift.findById(req.params.id);
    if (!gift) {
      return res.status(404).json({
        success: false,
        message: 'Gift not found',
      });
    }

    // Update fields
    if (name !== undefined) gift.name = name;
    if (description !== undefined) gift.description = description;
    if (pointsRequired !== undefined) gift.pointsRequired = parseInt(pointsRequired) || 0;
    if (value !== undefined) gift.value = parseInt(value) || 0;
    if (category !== undefined) gift.category = category;
    if (stock !== undefined) gift.stock = parseInt(stock) || 0;
    if (active !== undefined) gift.active = active;
    gift.updatedAt = Date.now();

    await gift.save();

    res.json({
      success: true,
      data: gift,
      message: 'Gift updated successfully',
    });
  } catch (error) {
    console.error('Error updating gift:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating gift',
      error: process.env.NODE_ENV === 'development' ? error.message : {},
    });
  }
});

// Delete gift
router.delete('/:id', async (req, res) => {
  try {
    const gift = await Gift.findByIdAndDelete(req.params.id);
    if (!gift) {
      return res.status(404).json({
        success: false,
        message: 'Gift not found',
      });
    }

    res.json({
      success: true,
      message: 'Gift deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting gift:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting gift',
      error: process.env.NODE_ENV === 'development' ? error.message : {},
    });
  }
});

export default router;





