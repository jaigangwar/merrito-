// ===== NOTIFICATION CONTROLLER - Push Notifications & Alerts =====
import { generateId, getDB, saveDB } from '../db.js';
import * as db from '../supabase.js';

// Get notifications for user
export async function getNotifications(req, res) {
  try {
    const { unread_only } = req.query;
    const dbData = getDB();
    let notifications = (dbData.notifications || []).filter(n => n.user_id === req.user.id);

    if (unread_only === 'true') {
      notifications = notifications.filter(n => !n.read);
    }

    notifications.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    res.json({ data: notifications, total: notifications.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Create notification
export async function createNotification(req, res) {
  try {
    const {
      user_id,
      title,
      message,
      type, // info, success, warning, error
      action_url,
      priority // low, medium, high
    } = req.body;

    if (!user_id || !title || !message) {
      return res.status(400).json({ error: 'user_id, title, and message are required' });
    }

    const dbData = getDB();
    if (!dbData.notifications) dbData.notifications = [];

    const notification = {
      id: generateId(),
      user_id,
      title,
      message,
      type: type || 'info',
      action_url: action_url || null,
      priority: priority || 'medium',
      read: false,
      created_at: new Date().toISOString()
    };

    dbData.notifications.push(notification);
    saveDB(dbData);

    res.status(201).json(notification);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Mark notification as read
export async function markAsRead(req, res) {
  try {
    const { id } = req.params;
    const dbData = getDB();
    const notification = dbData.notifications?.find(n => n.id === id && n.user_id === req.user.id);

    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    notification.read = true;
    notification.read_at = new Date().toISOString();
    saveDB(dbData);

    res.json(notification);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Mark all as read
export async function markAllAsRead(req, res) {
  try {
    const dbData = getDB();
    const notifications = dbData.notifications?.filter(n => n.user_id === req.user.id && !n.read);

    notifications?.forEach(n => {
      n.read = true;
      n.read_at = new Date().toISOString();
    });

    saveDB(dbData);

    res.json({ success: true, marked: notifications?.length || 0 });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Delete notification
export async function deleteNotification(req, res) {
  try {
    const { id } = req.params;
    const dbData = getDB();
    const index = dbData.notifications?.findIndex(n => n.id === id && n.user_id === req.user.id);

    if (index === -1) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    dbData.notifications.splice(index, 1);
    saveDB(dbData);

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Get unread count
export async function getUnreadCount(req, res) {
  try {
    const dbData = getDB();
    const count = (dbData.notifications || []).filter(n => n.user_id === req.user.id && !n.read).length;

    res.json({ count });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Broadcast notification to multiple users
export async function broadcastNotification(req, res) {
  try {
    const {
      user_ids,
      title,
      message,
      type,
      action_url,
      priority
    } = req.body;

    if (!user_ids || !Array.isArray(user_ids) || !title || !message) {
      return res.status(400).json({ error: 'user_ids (array), title, and message are required' });
    }

    const dbData = getDB();
    if (!dbData.notifications) dbData.notifications = [];

    const notifications = user_ids.map(user_id => ({
      id: generateId(),
      user_id,
      title,
      message,
      type: type || 'info',
      action_url: action_url || null,
      priority: priority || 'medium',
      read: false,
      created_at: new Date().toISOString()
    }));

    dbData.notifications.push(...notifications);
    saveDB(dbData);

    res.status(201).json({ success: true, sent: notifications.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
