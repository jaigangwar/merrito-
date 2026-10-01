// ===== LIVE CHAT WIDGET ROUTES =====
import express from 'express';
import { requireAuth } from '../auth.js';
import {
  createChatSession,
  sendChatMessage,
  listChatSessions,
  getChatSession,
  assignChatSession,
  closeChatSession,
  markChatRead,
  getUnreadChatCount
} from '../controllers/chatController.js';

const router = express.Router();

// Public endpoint — no auth required for website visitors
router.post('/sessions', createChatSession);
router.post('/sessions/:session_id/messages', sendChatMessage);
router.get('/sessions/:id', getChatSession);

// Authenticated endpoints — for admin/counselor dashboard
router.get('/sessions', requireAuth, listChatSessions);
router.patch('/sessions/:id/assign', requireAuth, assignChatSession);
router.patch('/sessions/:id/close', requireAuth, closeChatSession);
router.patch('/sessions/:id/read', requireAuth, markChatRead);
router.get('/unread-count', requireAuth, getUnreadChatCount);

export default router;
