// ===== SCHOLARSHIP ROUTES =====
import express from 'express';
import { requireAuth, requireAdmin } from '../auth.js';
import {
  getScholarships,
  createScholarship,
  applyForScholarship,
  reviewScholarshipApplication,
  getScholarshipApplications
} from '../controllers/scholarshipController.js';

const router = express.Router();

router.get('/', requireAuth, getScholarships);
router.post('/', requireAdmin, createScholarship);
router.post('/apply', requireAuth, applyForScholarship);
router.post('/review', requireAdmin, reviewScholarshipApplication);
router.get('/applications', requireAuth, getScholarshipApplications);

export default router;
