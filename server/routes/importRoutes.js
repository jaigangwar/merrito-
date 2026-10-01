// ===== IMPORT ROUTES =====
import express from 'express';
import { requireAuth, requireAdmin } from '../auth.js';
import { importLeads, downloadTemplate, validateCSV } from '../controllers/importController.js';

const router = express.Router();

// Import leads from CSV (Admin only)
router.post('/leads', requireAdmin, importLeads);

// Download CSV template
router.get('/template', requireAuth, downloadTemplate);

// Validate CSV before import
router.post('/validate', requireAdmin, validateCSV);

export default router;
