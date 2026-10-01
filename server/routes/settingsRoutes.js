import express from 'express';
import * as settingsController from '../controllers/settingsController.js';
import { requireAuth, requireAdmin } from '../auth.js';

const router = express.Router();

router.get('/', requireAuth, settingsController.getSettings);
router.put('/', requireAdmin, settingsController.updateSettings);

router.get('/workflows', requireAdmin, settingsController.getWorkflowRules);
router.post('/workflows', requireAdmin, settingsController.createWorkflowRule);
router.put('/workflows/:id', requireAdmin, settingsController.updateWorkflowRule);


export default router;
