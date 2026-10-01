// ===== BATCH ROUTES =====
import express from 'express';
import { requireAuth, requireAdmin } from '../auth.js';
import {
  getBatches,
  createBatch,
  assignStudentToBatch,
  getBatchStudents,
  updateBatch
} from '../controllers/batchController.js';

const router = express.Router();

router.get('/', requireAuth, getBatches);
router.post('/', requireAdmin, createBatch);
router.put('/:id', requireAdmin, updateBatch);
router.post('/assign', requireAdmin, assignStudentToBatch);
router.get('/students', requireAuth, getBatchStudents);

export default router;
