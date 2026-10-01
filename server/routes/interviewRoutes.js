// ===== INTERVIEW ROUTES =====
import express from 'express';
import { requireAuth, requireAdmin } from '../auth.js';
import {
  getInterviews,
  getInterview,
  createInterview,
  updateInterview,
  deleteInterview,
  getAvailableSlots
} from '../controllers/interviewController.js';

const router = express.Router();

// Get all interviews
router.get('/', requireAuth, getInterviews);

// Get available time slots
router.get('/slots', requireAuth, getAvailableSlots);

// Get single interview
router.get('/:id', requireAuth, getInterview);

// Create interview
router.post('/', requireAuth, createInterview);

// Update interview
router.put('/:id', requireAuth, updateInterview);

// Delete interview
router.delete('/:id', requireAdmin, deleteInterview);

export default router;
