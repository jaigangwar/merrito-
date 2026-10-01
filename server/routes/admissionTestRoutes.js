// ===== ADMISSION TEST ROUTES =====
import express from 'express';
import { requireAuth, requireAdmin } from '../auth.js';
import {
  getAdmissionTests,
  createAdmissionTest,
  registerForTest,
  submitTestResult,
  getTestRegistrations,
  generateMeritList
} from '../controllers/admissionTestController.js';

const router = express.Router();

router.get('/', requireAuth, getAdmissionTests);
router.post('/', requireAdmin, createAdmissionTest);
router.post('/register', requireAuth, registerForTest);
router.post('/result', requireAdmin, submitTestResult);
router.get('/registrations', requireAuth, getTestRegistrations);
router.get('/:test_id/merit-list', requireAuth, generateMeritList);

export default router;
