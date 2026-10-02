import { getDB, saveDB, generateId } from '../db.js';
import { REAL_DATA_MODE } from '../supabase.js';
import * as appStore from '../appStore.js';

export function ensureMarketingModules() {
  const dbData = getDB();
  let changed = false;
  for (const key of ['communicationTemplates', 'communicationCampaigns', 'callLogs', 'autoFollowUps', 'broadcastMessages', 'studentInbox', 'chatThreads', 'notificationCenter']) {
    if (!Array.isArray(dbData[key])) {
      dbData[key] = [];
      changed = true;
    }
  }
  if (!dbData.communicationIntegrations || typeof dbData.communicationIntegrations !== 'object') {
    dbData.communicationIntegrations = {};
    changed = true;
  }
  if (changed || !REAL_DATA_MODE) saveDB(dbData);
  return dbData;
}

function reqUserFallbackId() {
  return 'u001-admin';
}

function buildCampaignAnalytics(dbData) {
  const campaigns = dbData.communicationCampaigns || [];
  const notifications = dbData.notificationCenter || [];
  const inbox = dbData.studentInbox || [];
  const calls = dbData.callLogs || [];

  const totals = campaigns.reduce((acc, item) => {
    acc.total += 1;
    acc.sent += item.status === 'sent' || item.status === 'active' ? 1 : 0;
    acc.delivered += Number(item.metrics?.delivered || 0);
    acc.opened += Number(item.metrics?.opened || 0);
    acc.clicked += Number(item.metrics?.clicked || 0);
    acc.replied += Number(item.metrics?.replied || 0);
    return acc;
  }, { total: 0, sent: 0, delivered: 0, opened: 0, clicked: 0, replied: 0 });

  const byChannel = ['email', 'sms', 'whatsapp', 'ivr', 'push'].map((channel) => {
    const items = campaigns.filter(item => item.channel === channel);
    const delivered = items.reduce((sum, item) => sum + Number(item.metrics?.delivered || 0), 0);
    const opened = items.reduce((sum, item) => sum + Number(item.metrics?.opened || 0), 0);
    return { channel, campaigns: items.length, delivered, opened };
  });

  const byCategory = ['campaign', 'broadcast', 'drip'].map((category) => ({
    category,
    count: campaigns.filter(item => item.category === category).length
  }));

  return {
    totals: {
      ...totals,
      inboxOpen: inbox.filter(item => item.status === 'open').length,
      unreadNotifications: notifications.filter(item => item.status === 'unread').length,
      callLogs: calls.length
    },
    byChannel,
    byCategory
  };
}

export function createNotificationEntry(dbData, payload) {
  const item = {
    id: generateId(),
    title: payload.title,
    message: payload.message,
    channel: payload.channel || 'push',
    target_type: payload.target_type || 'marketing',
    status: payload.status || 'unread',
    created_at: new Date().toISOString()
  };
  dbData.notificationCenter = [item, ...(dbData.notificationCenter || [])];
  return item;
}

export const getMarketingOverview = async (req, res) => {
  try {
    const dbData = ensureMarketingModules();
    res.json({
      integrations: dbData.communicationIntegrations,
      analytics: buildCampaignAnalytics(dbData),
      counts: {
        templates: (dbData.communicationTemplates || []).length,
        campaigns: (dbData.communicationCampaigns || []).length,
        followUps: (dbData.autoFollowUps || []).length,
        broadcasts: (dbData.broadcastMessages || []).length,
        inbox: (dbData.studentInbox || []).length,
        chats: (dbData.chatThreads || []).length
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getTemplates = (req, res) => {
  try {
    const dbData = ensureMarketingModules();
    res.json((dbData.communicationTemplates || []).sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at)));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const createTemplate = (req, res) => {
  try {
    const dbData = ensureMarketingModules();
    const now = new Date().toISOString();
    const item = {
      id: generateId(),
      name: req.body.name || 'Untitled template',
      channel: req.body.channel || 'email',
      category: req.body.category || 'campaign',
      subject: req.body.subject || '',
      content: req.body.content || '',
      variables: Array.isArray(req.body.variables) ? req.body.variables : [],
      active: req.body.active !== false,
      created_at: now,
      updated_at: now
    };
    dbData.communicationTemplates.unshift(item);
    saveDB(dbData);
    res.status(201).json(item);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const updateTemplate = (req, res) => {
  try {
    const dbData = ensureMarketingModules();
    const idx = dbData.communicationTemplates.findIndex(item => item.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Template not found' });
    dbData.communicationTemplates[idx] = {
      ...dbData.communicationTemplates[idx],
      ...req.body,
      updated_at: new Date().toISOString()
    };
    saveDB(dbData);
    res.json(dbData.communicationTemplates[idx]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getCampaigns = (req, res) => {
  try {
    const dbData = ensureMarketingModules();
    res.json((dbData.communicationCampaigns || []).sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at)));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const createCampaign = (req, res) => {
  try {
    const dbData = ensureMarketingModules();
    const now = new Date().toISOString();
    const item = {
      id: generateId(),
      name: req.body.name || 'Untitled campaign',
      channel: req.body.channel || 'email',
      category: req.body.category || 'campaign',
      status: req.body.status || 'draft',
      audience: req.body.audience || 'All leads',
      audience_count: Number(req.body.audience_count || (dbData.leads || []).length || 1),
      template_id: req.body.template_id || null,
      subject: req.body.subject || '',
      message: req.body.message || '',
      auto_followup: !!req.body.auto_followup,
      owner_id: req.user.id,
      metrics: { delivered: 0, opened: 0, clicked: 0, replied: 0, failed: 0 },
      created_at: now,
      updated_at: now,
      sent_at: null
    };
    dbData.communicationCampaigns.unshift(item);
    saveDB(dbData);
    res.status(201).json(item);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const updateCampaign = (req, res) => {
  try {
    const dbData = ensureMarketingModules();
    const idx = dbData.communicationCampaigns.findIndex(item => item.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Campaign not found' });
    dbData.communicationCampaigns[idx] = {
      ...dbData.communicationCampaigns[idx],
      ...req.body,
      updated_at: new Date().toISOString()
    };
    saveDB(dbData);
    res.json(dbData.communicationCampaigns[idx]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const launchCampaign = (req, res) => {
  try {
    const dbData = ensureMarketingModules();
    const idx = dbData.communicationCampaigns.findIndex(item => item.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Campaign not found' });

    const current = dbData.communicationCampaigns[idx];
    const delivered = Math.max(1, Number(current.audience_count || 1));
    const opened = current.channel === 'sms' ? 0 : Math.max(0, Math.floor(delivered * 0.72));
    const clicked = current.channel === 'ivr' ? 0 : Math.max(0, Math.floor(delivered * 0.38));
    const replied = Math.max(0, Math.floor(delivered * 0.18));
    const failed = Math.max(0, Math.floor(delivered * 0.06));
    const now = new Date().toISOString();

    dbData.communicationCampaigns[idx] = {
      ...current,
      status: 'sent',
      metrics: { delivered, opened, clicked, replied, failed },
      sent_at: now,
      updated_at: now
    };

    if (dbData.communicationCampaigns[idx].auto_followup) {
      dbData.autoFollowUps.unshift({
        id: generateId(),
        title: `${current.name} follow-up`,
        trigger: 'campaign_sent',
        channel: current.channel === 'email' ? 'sms' : current.channel,
        delay_hours: 24,
        status: 'active',
        template_id: current.template_id || null,
        created_at: now,
        updated_at: now
      });
    }

    if (current.channel === 'ivr') {
      dbData.callLogs.unshift({
        id: generateId(),
        student_name: 'Campaign audience',
        phone: 'Bulk IVR',
        direction: 'outbound',
        provider: dbData.communicationIntegrations?.ivr?.provider || 'IVR',
        duration_seconds: 95,
        recording_url: `https://recordings.rbmi.local/${current.id}`,
        summary: `IVR campaign "${current.name}" launched to ${delivered} recipients.`,
        status: 'completed',
        created_at: now
      });
    }

    dbData.studentInbox.unshift({
      id: generateId(),
      student_name: 'Campaign audience',
      channel: current.channel,
      subject: current.subject || current.name,
      message: `${current.name} was delivered to ${delivered} recipients.`,
      status: 'open',
      priority: 'medium',
      created_at: now,
      updated_at: now
    });

    createNotificationEntry(dbData, {
      title: 'Campaign launched',
      message: `${current.name} was sent over ${current.channel}.`,
      channel: current.channel === 'push' ? 'push' : 'email',
      target_type: 'campaign'
    });

    saveDB(dbData);
    res.json(dbData.communicationCampaigns[idx]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getIntegrations = (req, res) => {
  try {
    const dbData = ensureMarketingModules();
    res.json(dbData.communicationIntegrations);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const updateIntegrations = (req, res) => {
  try {
    const dbData = ensureMarketingModules();
    dbData.communicationIntegrations = { ...dbData.communicationIntegrations, ...req.body };
    createNotificationEntry(dbData, {
      title: 'Integrations updated',
      message: 'Communication provider settings were updated.',
      channel: 'push',
      target_type: 'integration'
    });
    saveDB(dbData);
    res.json(dbData.communicationIntegrations);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getCallLogs = (req, res) => {
  try {
    const dbData = ensureMarketingModules();
    res.json((dbData.callLogs || []).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const createCallLog = (req, res) => {
  try {
    const dbData = ensureMarketingModules();
    const item = {
      id: generateId(),
      student_name: req.body.student_name || 'Student',
      phone: req.body.phone || '',
      direction: req.body.direction || 'outbound',
      provider: req.body.provider || dbData.communicationIntegrations?.ivr?.provider || 'IVR',
      duration_seconds: Number(req.body.duration_seconds || 0),
      recording_url: req.body.recording_url || '',
      summary: req.body.summary || 'Manual call note added.',
      status: req.body.status || 'completed',
      created_at: new Date().toISOString()
    };
    dbData.callLogs.unshift(item);
    saveDB(dbData);
    res.status(201).json(item);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getFollowups = (req, res) => {
  try {
    const dbData = ensureMarketingModules();
    res.json((dbData.autoFollowUps || []).sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at)));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const createFollowup = (req, res) => {
  try {
    const dbData = ensureMarketingModules();
    const now = new Date().toISOString();
    const item = {
      id: generateId(),
      title: req.body.title || 'Auto follow-up',
      trigger: req.body.trigger || 'lead_created',
      channel: req.body.channel || 'sms',
      delay_hours: Number(req.body.delay_hours || 24),
      status: req.body.status || 'active',
      template_id: req.body.template_id || null,
      created_at: now,
      updated_at: now
    };
    dbData.autoFollowUps.unshift(item);
    saveDB(dbData);
    res.status(201).json(item);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getBroadcasts = (req, res) => {
  try {
    const dbData = ensureMarketingModules();
    res.json((dbData.broadcastMessages || []).sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at)));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const createBroadcast = (req, res) => {
  try {
    const dbData = ensureMarketingModules();
    const now = new Date().toISOString();
    const item = {
      id: generateId(),
      title: req.body.title || 'Broadcast',
      channel: req.body.channel || 'whatsapp',
      audience: req.body.audience || 'All leads',
      message: req.body.message || '',
      status: req.body.status || 'draft',
      metrics: { reached: 0, engaged: 0 },
      created_at: now,
      updated_at: now
    };
    dbData.broadcastMessages.unshift(item);
    saveDB(dbData);
    res.status(201).json(item);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const sendBroadcast = (req, res) => {
  try {
    const dbData = ensureMarketingModules();
    const idx = dbData.broadcastMessages.findIndex(item => item.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Broadcast not found' });
    const reached = Math.max(1, (dbData.leads || []).length || 1);
    const engaged = Math.max(1, Math.floor(reached * 0.64));
    dbData.broadcastMessages[idx] = {
      ...dbData.broadcastMessages[idx],
      status: 'sent',
      metrics: { reached, engaged },
      updated_at: new Date().toISOString()
    };
    createNotificationEntry(dbData, {
      title: 'Broadcast sent',
      message: `${dbData.broadcastMessages[idx].title} reached ${reached} recipients.`,
      channel: 'push',
      target_type: 'broadcast'
    });
    saveDB(dbData);
    res.json(dbData.broadcastMessages[idx]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getInbox = (req, res) => {
  try {
    const dbData = ensureMarketingModules();
    res.json((dbData.studentInbox || []).sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at)));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const createInboxMessage = (req, res) => {
  try {
    const dbData = ensureMarketingModules();
    const now = new Date().toISOString();
    const item = {
      id: generateId(),
      student_name: req.body.student_name || 'Student',
      channel: req.body.channel || 'email',
      subject: req.body.subject || 'Student inbox message',
      message: req.body.message || '',
      status: req.body.status || 'open',
      priority: req.body.priority || 'medium',
      created_at: now,
      updated_at: now
    };
    dbData.studentInbox.unshift(item);
    createNotificationEntry(dbData, {
      title: 'Inbox updated',
      message: `${item.student_name} sent a new ${item.channel} message.`,
      channel: item.channel,
      target_type: 'student_inbox'
    });
    saveDB(dbData);
    res.status(201).json(item);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const updateInboxMessage = (req, res) => {
  try {
    const dbData = ensureMarketingModules();
    const idx = dbData.studentInbox.findIndex(item => item.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Inbox message not found' });
    dbData.studentInbox[idx] = {
      ...dbData.studentInbox[idx],
      ...req.body,
      updated_at: new Date().toISOString()
    };
    saveDB(dbData);
    res.json(dbData.studentInbox[idx]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getChats = (req, res) => {
  try {
    const dbData = ensureMarketingModules();
    let threads = dbData.chatThreads || [];
    
    // Filter by student if applicable
    if (req.user.role === 'student') {
      threads = threads.filter(t => t.student_name === req.user.name);
    }
    
    res.json(threads.sort((a, b) => new Date(b.last_message_at) - new Date(a.last_message_at)));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const initiateChat = async (req, res) => {
  try {
    const dbData = ensureMarketingModules();
    if (req.user.role !== 'student') return res.status(403).json({ error: 'Only students can initiate threads' });

    // Check if thread exists
    let thread = (dbData.chatThreads || []).find(t => t.student_name === req.user.name);
    if (thread) return res.json(thread);

    // Create new thread
    const profile = await appStore.getPortalProfileForUser(req.user);
    thread = {
      id: generateId(),
      student_name: req.user.name,
      counselor_name: profile.counselor_name || 'Admissions team',
      status: 'active',
      last_message_at: new Date().toISOString(),
      messages: []
    };
    dbData.chatThreads.unshift(thread);
    saveDB(dbData);
    res.status(201).json(thread);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const sendChatMessage = (req, res) => {
  try {
    const dbData = ensureMarketingModules();
    const idx = dbData.chatThreads.findIndex(item => item.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Chat thread not found' });
    
    // Authorization check
    const thread = dbData.chatThreads[idx];
    if (req.user.role === 'student' && thread.student_name !== req.user.name) {
      return res.status(403).json({ error: 'Access denied to this chat thread' });
    }

    const message = {
      id: generateId(),
      sender: req.user.role === 'student' ? 'student' : 'counselor',
      text: req.body.text || '',
      created_at: new Date().toISOString()
    };
    dbData.chatThreads[idx].messages.push(message);
    dbData.chatThreads[idx].last_message_at = message.created_at;
    dbData.chatThreads[idx].status = 'active';
    
    createNotificationEntry(dbData, {
      title: 'Chat updated',
      message: `${req.user.role === 'student' ? 'Student' : 'Counselor'} ${req.user.name} sent a message.`,
      channel: 'push',
      target_type: 'chat'
    });
    saveDB(dbData);
    res.status(201).json(dbData.chatThreads[idx]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getNotifications = (req, res) => {
  try {
    const dbData = ensureMarketingModules();
    res.json((dbData.notificationCenter || []).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const createNotification = (req, res) => {
  try {
    const dbData = ensureMarketingModules();
    const item = createNotificationEntry(dbData, req.body);
    saveDB(dbData);
    res.status(201).json(item);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const updateNotification = (req, res) => {
  try {
    const dbData = ensureMarketingModules();
    const idx = dbData.notificationCenter.findIndex(item => item.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Notification not found' });
    dbData.notificationCenter[idx] = { ...dbData.notificationCenter[idx], ...req.body };
    saveDB(dbData);
    res.json(dbData.notificationCenter[idx]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
