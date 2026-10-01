// ===== PAYMENT GATEWAY ROUTES =====
import express from 'express';
import { requireAuth } from '../auth.js';
import {
  createOrder,
  verifyPayment,
  getPaymentStatus,
  handleWebhook,
  getConfig
} from '../controllers/paymentGatewayController.js';

const router = express.Router();

// Get Razorpay configuration
router.get('/config', requireAuth, getConfig);

// Create payment order
router.post('/order', requireAuth, createOrder);

// Verify payment
router.post('/verify', requireAuth, verifyPayment);

// Get payment status
router.get('/status/:order_id', requireAuth, getPaymentStatus);

// Webhook handler (no auth required - verified by signature)
router.post('/webhook', handleWebhook);

export default router;
