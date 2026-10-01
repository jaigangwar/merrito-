// ===== ADVANCED REPORT ROUTES =====
import express from 'express';
import { requireAuth, requireAdmin } from '../auth.js';
import { generateCustomReport, scheduleReport } from '../controllers/advancedReportController.js';

const router = express.Router();

router.post('/generate', requireAuth, generateCustomReport);
router.post('/schedule', requireAdmin, scheduleReport);

export default router;
