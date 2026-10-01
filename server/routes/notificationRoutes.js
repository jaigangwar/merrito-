// ===== NOTIFICATION ROUTES =====
import express from 'express';
import { requireAuth, requireAdmin } from '../auth.js';
import {
  getNotifications,
  createNotification,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  getUnreadCount,
  broadcastNotification
} from '../controllers/notificationController.js';

const router = express.Router();

router.get('/', requireAuth, getNotifications);
router.get('/unread-count', requireAuth, getUnreadCount);
router.post('/', requireAdmin, createNotification);
router.post('/broadcast', requireAdmin, broadcastNotification);
router.put('/:id/read', requireAuth, markAsRead);
router.put('/mark-all-read', requireAuth, markAllAsRead);
router.delete('/:id', requireAuth, deleteNotification);

export default router;
