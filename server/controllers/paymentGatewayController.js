// ===== PAYMENT GATEWAY CONTROLLER - Razorpay Integration =====
import { generateId, getDB, saveDB } from '../db.js';
import * as db from '../supabase.js';

export async function createOrder(req, res) {
  try {
    if (!process.env.RAZORPAY_KEY_ID) {
      return res.status(503).json({ error: 'Payment gateway is not configured' });
    }

    const { amount, currency = 'INR', receipt, notes, lead_id } = req.body;

    if (!amount || !lead_id) {
      return res.status(400).json({ error: 'amount and lead_id are required' });
    }

    // Verify lead exists
    const lead = await db.getLead(lead_id);
    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    // Create internal payment order record.
    const order = {
      id: `order_${generateId().replace(/-/g, '').substring(0, 14)}`,
      entity: 'order',
      amount: amount * 100, // Razorpay uses paise
      amount_paid: 0,
      amount_due: amount * 100,
      currency,
      receipt: receipt || `receipt_${Date.now()}`,
      status: 'created',
      attempts: 0,
      notes: notes || {},
      created_at: Math.floor(Date.now() / 1000)
    };

    // Store order in database
    const dbData = getDB();
    if (!dbData.payment_orders) dbData.payment_orders = [];
    
    dbData.payment_orders.push({
      ...order,
      lead_id,
      created_at_iso: new Date().toISOString()
    });
    saveDB(dbData);

    // Create activity
    await db.createActivity({
      lead_id,
      type: 'payment_initiated',
      message: `Payment order created for ₹${amount}`
    });

    res.status(201).json(order);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

export async function verifyPayment(req, res) {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      lead_id
    } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !lead_id) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const razorpaySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!razorpaySecret) {
      return res.status(503).json({ error: 'Payment verification is not configured' });
    }
    const { createHmac } = await import('crypto');
    const expectedSignature = createHmac('sha256', razorpaySecret)
      .update(razorpay_order_id + '|' + razorpay_payment_id)
      .digest('hex');
    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({ error: 'Invalid payment signature' });
    }

    // Proceed with payment verification
    const dbData = getDB();
    const order = dbData.payment_orders?.find(o => o.id === razorpay_order_id);

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Update order status
    order.status = 'paid';
    order.amount_paid = order.amount_due;
    order.amount_due = 0;
    saveDB(dbData);

    // Create or update payment record
    const payments = await db.getPayments({ lead_id });
    const existingPayment = payments.find(p => p.order_id === razorpay_order_id);

    if (existingPayment) {
      await db.updatePayment(existingPayment.id, {
        status: 'paid',
        payment_id: razorpay_payment_id,
        paid_at: new Date().toISOString()
      });
    } else {
      await db.createPayment({
        lead_id,
        order_id: razorpay_order_id,
        payment_id: razorpay_payment_id,
        amount: order.amount / 100,
        currency: order.currency,
        status: 'paid',
        method: 'online',
        paid_at: new Date().toISOString()
      });
    }

    // Create activity
    await db.createActivity({
      lead_id,
      type: 'payment_received',
      message: `Payment of ₹${order.amount / 100} received successfully`
    });

    res.json({
      success: true,
      message: 'Payment verified successfully',
      order_id: razorpay_order_id,
      payment_id: razorpay_payment_id
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Get payment status
export async function getPaymentStatus(req, res) {
  try {
    const { order_id } = req.params;

    const dbData = getDB();
    const order = dbData.payment_orders?.find(o => o.id === order_id);

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    res.json({
      order_id: order.id,
      status: order.status,
      amount: order.amount / 100,
      currency: order.currency,
      created_at: order.created_at_iso
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

export async function handleWebhook(req, res) {
  try {
    const event = req.body;

    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    const signature = req.headers['x-razorpay-signature'];
    if (!webhookSecret || !signature) {
      return res.status(503).json({ error: 'Payment webhook is not configured' });
    }
    const { createHmac } = await import('crypto');
    const expectedSignature = createHmac('sha256', webhookSecret)
      .update(JSON.stringify(req.body))
      .digest('hex');
    if (signature !== expectedSignature) {
      return res.status(400).json({ error: 'Invalid signature' });
    }

    console.log('Razorpay webhook received:', event.event);

    // Handle different event types
    switch (event.event) {
      case 'payment.captured':
        // Payment was captured successfully
        const payment = event.payload.payment.entity;
        console.log('Payment captured:', payment.id);
        break;

      case 'payment.failed':
        // Payment failed
        const failedPayment = event.payload.payment.entity;
        console.log('Payment failed:', failedPayment.id);
        break;

      case 'order.paid':
        // Order was paid
        const order = event.payload.order.entity;
        console.log('Order paid:', order.id);
        break;

      default:
        console.log('Unhandled event:', event.event);
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Get Razorpay configuration (for frontend)
export async function getConfig(req, res) {
  try {
    if (!process.env.RAZORPAY_KEY_ID) {
      return res.status(503).json({ error: 'Payment gateway is not configured' });
    }
    res.json({
      key_id: process.env.RAZORPAY_KEY_ID,
      currency: 'INR',
      name: process.env.INSTITUTE_NAME || 'RBMI Admissions',
      description: 'Admission Fee Payment',
      image: '/logo.png',
      theme: {
        color: '#3b82f6'
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
