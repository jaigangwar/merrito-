// ===== LIVE CHAT WIDGET CONTROLLER =====
// Embedded chat for website visitors — stores conversations in DB
import { generateId, getDB, saveDB } from '../db.js';
import * as db from '../supabase.js';

function nowIso() {
  return new Date().toISOString();
}

// Create a new chat session (website visitor)
export async function createChatSession(req, res) {
  try {
    const { visitor_name, visitor_email, visitor_phone, page_url, source } = req.body;
    const session = {
      id: generateId(),
      visitor_name: visitor_name || 'Website Visitor',
      visitor_email: visitor_email || '',
      visitor_phone: visitor_phone || '',
      page_url: page_url || '',
      source: source || 'live_chat_widget',
      status: 'open',
      assigned_to: null,
      messages: [],
      unread_count: 1,
      created_at: nowIso(),
      updated_at: nowIso()
    };

    // Add welcome message
    session.messages.push({
      id: generateId(),
      sender: 'system',
      text: 'Hello! Welcome to RBMI. How can we help you with admissions today?',
      created_at: nowIso()
    });

    // Try Supabase first, fallback to JSON
    if (db.USE_SUPABASE) {
      try {
        const supabase = db.getServerSupabase();
        const { data, error } = await supabase.from('chat_sessions').insert([session]).select().single();
        if (!error && data) return res.status(201).json(data);
      } catch (e) {
        console.warn('Supabase chat session insert failed, using local JSON:', e.message);
      }
    }

    const dbData = getDB();
    if (!dbData.chat_sessions) dbData.chat_sessions = [];
    dbData.chat_sessions.unshift(session);
    saveDB(dbData);
    res.status(201).json(session);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Send a message in a chat session
export async function sendChatMessage(req, res) {
  try {
    const { session_id } = req.params;
    const { text, sender, visitor_name } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'Message text is required' });
    }

    const message = {
      id: generateId(),
      sender: sender || 'visitor',
      text: text.trim(),
      visitor_name: visitor_name || '',
      created_at: nowIso()
    };

    // Try Supabase first
    if (db.USE_SUPABASE) {
      try {
        const supabase = db.getServerSupabase();
        // Get current session
        const { data: session } = await supabase.from('chat_sessions').select('*').eq('id', session_id).single();
        if (!session) return res.status(404).json({ error: 'Chat session not found' });

        const messages = [...(session.messages || []), message];
        const unread_count = sender === 'visitor' ? (session.unread_count || 0) + 1 : 0;

        const { data, error } = await supabase.from('chat_sessions')
          .update({ messages, unread_count, updated_at: nowIso() })
          .eq('id', session_id)
          .select()
          .single();
        if (!error && data) return res.status(201).json(message);
      } catch (e) {
        console.warn('Supabase chat message failed, using local JSON:', e.message);
      }
    }

    const dbData = getDB();
    const sessions = dbData.chat_sessions || [];
    const idx = sessions.findIndex(s => s.id === session_id);
    if (idx === -1) return res.status(404).json({ error: 'Chat session not found' });

    if (!sessions[idx].messages) sessions[idx].messages = [];
    sessions[idx].messages.push(message);
    sessions[idx].unread_count = sender === 'visitor' ? (sessions[idx].unread_count || 0) + 1 : 0;
    sessions[idx].updated_at = nowIso();
    if (visitor_name && !sessions[idx].visitor_name) {
      sessions[idx].visitor_name = visitor_name;
    }
    saveDB(dbData);
    res.status(201).json(message);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// List chat sessions (admin/counselor view)
export async function listChatSessions(req, res) {
  try {
    const { status } = req.query;

    if (db.USE_SUPABASE) {
      try {
        const supabase = db.getServerSupabase();
        let query = supabase.from('chat_sessions').select('*').order('updated_at', { ascending: false });
        if (status) query = query.eq('status', status);
        const { data, error } = await query;
        if (!error) return res.json(data || []);
      } catch (e) {
        console.warn('Supabase list chat sessions failed, using local JSON:', e.message);
      }
    }

    const dbData = getDB();
    let sessions = dbData.chat_sessions || [];
    if (status) sessions = sessions.filter(s => s.status === status);
    res.json(sessions.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at)));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Get single chat session
export async function getChatSession(req, res) {
  try {
    const { id } = req.params;

    if (db.USE_SUPABASE) {
      try {
        const supabase = db.getServerSupabase();
        const { data, error } = await supabase.from('chat_sessions').select('*').eq('id', id).single();
        if (!error && data) return res.json(data);
      } catch (e) {
        console.warn('Supabase get chat session failed, using local JSON:', e.message);
      }
    }

    const dbData = getDB();
    const session = (dbData.chat_sessions || []).find(s => s.id === id);
    if (!session) return res.status(404).json({ error: 'Chat session not found' });
    res.json(session);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Assign chat session to counselor
export async function assignChatSession(req, res) {
  try {
    const { id } = req.params;
    const { counselor_id, counselor_name } = req.body;

    const updates = {
      assigned_to: counselor_id || null,
      assigned_name: counselor_name || null,
      status: counselor_id ? 'assigned' : 'open',
      updated_at: nowIso()
    };

    if (db.USE_SUPABASE) {
      try {
        const supabase = db.getServerSupabase();
        const { data, error } = await supabase.from('chat_sessions')
          .update(updates).eq('id', id).select().single();
        if (!error && data) return res.json(data);
      } catch (e) {
        console.warn('Supabase assign chat failed, using local JSON:', e.message);
      }
    }

    const dbData = getDB();
    const idx = (dbData.chat_sessions || []).findIndex(s => s.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Chat session not found' });
    Object.assign(dbData.chat_sessions[idx], updates);
    saveDB(dbData);
    res.json(dbData.chat_sessions[idx]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Close chat session
export async function closeChatSession(req, res) {
  try {
    const { id } = req.params;

    const updates = {
      status: 'closed',
      updated_at: nowIso()
    };

    if (db.USE_SUPABASE) {
      try {
        const supabase = db.getServerSupabase();
        const { data, error } = await supabase.from('chat_sessions')
          .update(updates).eq('id', id).select().single();
        if (!error && data) return res.json(data);
      } catch (e) {
        console.warn('Supabase close chat failed, using local JSON:', e.message);
      }
    }

    const dbData = getDB();
    const idx = (dbData.chat_sessions || []).findIndex(s => s.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Chat session not found' });
    Object.assign(dbData.chat_sessions[idx], updates);
    saveDB(dbData);
    res.json(dbData.chat_sessions[idx]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Mark chat as read (counselor viewed it)
export async function markChatRead(req, res) {
  try {
    const { id } = req.params;
    const updates = { unread_count: 0, updated_at: nowIso() };

    if (db.USE_SUPABASE) {
      try {
        const supabase = db.getServerSupabase();
        const { data, error } = await supabase.from('chat_sessions')
          .update(updates).eq('id', id).select().single();
        if (!error && data) return res.json(data);
      } catch (e) {
        console.warn('Supabase mark chat read failed, using local JSON:', e.message);
      }
    }

    const dbData = getDB();
    const idx = (dbData.chat_sessions || []).findIndex(s => s.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Chat session not found' });
    dbData.chat_sessions[idx].unread_count = 0;
    saveDB(dbData);
    res.json(dbData.chat_sessions[idx]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Get unread chat count for header badge
export async function getUnreadChatCount(req, res) {
  try {
    if (db.USE_SUPABASE) {
      try {
        const supabase = db.getServerSupabase();
        const { data, error } = await supabase.from('chat_sessions')
          .select('unread_count').gt('unread_count', 0).eq('status', 'open');
        if (!error) {
          const count = (data || []).reduce((sum, s) => sum + (s.unread_count || 0), 0);
          return res.json({ count });
        }
      } catch (e) {
        console.warn('Supabase unread count failed, using local JSON:', e.message);
      }
    }

    const dbData = getDB();
    const sessions = (dbData.chat_sessions || []).filter(s => s.status === 'open');
    const count = sessions.reduce((sum, s) => sum + (s.unread_count || 0), 0);
    res.json({ count });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
