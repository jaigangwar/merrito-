// ===== DRIP CAMPAIGN BUILDER ROUTES =====
import express from 'express';
import { requireAuth, requireAdmin } from '../auth.js';
import {
  createDripCampaign,
  listDripCampaigns,
  getDripCampaign,
  updateDripCampaign,
  deleteDripCampaign,
  toggleDripCampaignStatus,
  simulateDripTrigger,
  getDripCampaignLogs,
  getAvailableTemplates,
  getDripCampaignReport
} from '../controllers/dripCampaignController.js';

const router = express.Router();

// Public / authenticated routes
router.get('/report', requireAuth, getDripCampaignReport);
router.get('/templates', requireAuth, getAvailableTemplates);
router.get('/logs', requireAuth, getDripCampaignLogs);

// CRUD
router.get('/', requireAuth, listDripCampaigns);
router.post('/', requireAuth, createDripCampaign);
router.get('/:id', requireAuth, getDripCampaign);
router.put('/:id', requireAuth, updateDripCampaign);
router.delete('/:id', requireAdmin, deleteDripCampaign);

// Actions
router.patch('/:id/status', requireAuth, toggleDripCampaignStatus);
router.post('/:id/simulate', requireAuth, simulateDripTrigger);

export default router;
