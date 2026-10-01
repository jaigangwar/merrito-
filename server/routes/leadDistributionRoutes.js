// ===== LEAD DISTRIBUTION ROUTES =====
import express from 'express';
import { requireAuth, requireAdmin } from '../auth.js';
import {
  getDistributionRules,
  createDistributionRule,
  updateDistributionRule,
  deleteDistributionRule,
  testDistributionRule
} from '../controllers/leadDistributionController.js';

const router = express.Router();

router.get('/', requireAuth, getDistributionRules);
router.post('/', requireAdmin, createDistributionRule);
router.put('/:id', requireAdmin, updateDistributionRule);
router.delete('/:id', requireAdmin, deleteDistributionRule);
router.post('/test', requireAdmin, testDistributionRule);

export default router;
