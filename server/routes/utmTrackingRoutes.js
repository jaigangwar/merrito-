// ===== UTM TRACKING ROUTES =====
import express from 'express';
import { requireAuth } from '../auth.js';
import {
  trackUTM,
  getUTMAnalytics,
  getConversionAnalytics
} from '../controllers/utmTrackingController.js';

const router = express.Router();

router.post('/track', trackUTM); // Public endpoint
router.get('/analytics', requireAuth, getUTMAnalytics);
router.get('/conversions', requireAuth, getConversionAnalytics);

export default router;
