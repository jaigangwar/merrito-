// ===== SAVED FILTER ROUTES =====
import express from 'express';
import { requireAuth } from '../auth.js';
import {
  getSavedFilters,
  getSavedFilter,
  createSavedFilter,
  updateSavedFilter,
  deleteSavedFilter,
  getSharedFilters
} from '../controllers/savedFilterController.js';

const router = express.Router();

// Get all saved filters for current user
router.get('/', requireAuth, getSavedFilters);

// Get shared filters
router.get('/shared', requireAuth, getSharedFilters);

// Get single saved filter
router.get('/:id', requireAuth, getSavedFilter);

// Create saved filter
router.post('/', requireAuth, createSavedFilter);

// Update saved filter
router.put('/:id', requireAuth, updateSavedFilter);

// Delete saved filter
router.delete('/:id', requireAuth, deleteSavedFilter);

export default router;
