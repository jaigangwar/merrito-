import express from 'express';
import { requireAuth, requireAdmin } from '../auth.js';
import {
  getForms,
  getFormById,
  createForm,
  updateForm,
  deleteForm,
  getFormEmbed,
  submitFormPublic,
  getFormSubmissions
} from '../controllers/formBuilderController.js';

const router = express.Router();

// Admin routes (require authentication)
router.get('/', requireAuth, getForms);
router.get('/:id', requireAuth, getFormById);
router.post('/', requireAuth, requireAdmin, createForm);
router.put('/:id', requireAuth, requireAdmin, updateForm);
router.delete('/:id', requireAuth, requireAdmin, deleteForm);
router.get('/:id/embed', requireAuth, getFormEmbed);
router.get('/:id/submissions', requireAuth, requireAdmin, getFormSubmissions);

// Public routes (no auth required)
router.post('/public/:id/submit', submitFormPublic);

export default router;
