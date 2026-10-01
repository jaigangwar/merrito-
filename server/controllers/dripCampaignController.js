// ===== DRIP CAMPAIGN BUILDER CONTROLLER =====
// Visual automation sequences for marketing communication
import { generateId, getDB, saveDB } from '../db.js';
import * as db from '../supabase.js';

function nowIso() {
  return new Date().toISOString();
}

// Create a drip campaign (visual sequence)
export async function createDripCampaign(req, res) {
  try {
    const {
      name,
      channel,       // email, sms, whatsapp
      trigger,       // lead_created, stage_changed, date_specific, event
      delay_unit,    // hours, days, weeks
      steps,         // array of sequence steps
      audience,      // audience filter description
      audience_count,
      status,
      notes
    } = req.body;

    if (!name) return res.status(400).json({ error: 'Campaign name is required' });

    const campaign = {
      id: generateId(),
      name: name.trim(),
      channel: channel || 'email',
      trigger: trigger || 'lead_created',
      delay_unit: delay_unit || 'days',
      steps: Array.isArray(steps) ? steps.map(s => ({
        id: generateId(),
        step_order: s.step_order || 1,
        delay_value: s.delay_value || 0,
        title: s.title || 'Untitled step',
        template_id: s.template_id || null,
        subject: s.subject || '',
        content: s.content || '',
        channel: s.channel || channel || 'email',
        conditions: s.conditions || null, // optional: { stage: 'enquiry', source: 'website' }
        action: s.action || 'send_message' // send_message, update_stage, assign_counselor
      })) : [],
      audience: audience || 'All leads',
      audience_count: parseInt(audience_count) || 0,
      status: status || 'draft', // draft, active, paused, completed
      metrics: {
        triggered: 0,
        delivered: 0,
        opened: 0,
        clicked: 0,
        converted: 0,
        failed: 0
      },
      notes: notes || '',
      created_at: nowIso(),
      updated_at: nowIso()
    };

    if (db.USE_SUPABASE) {
      try {
        const supabase = db.getServerSupabase();
        const { data, error } = await supabase.from('drip_campaigns').insert([campaign]).select().single();
        if (!error && data) return res.status(201).json(data);
      } catch (e) {
        console.warn('Supabase drip campaign insert failed, using local JSON:', e.message);
      }
    }

    const dbData = getDB();
    if (!dbData.drip_campaigns) dbData.drip_campaigns = [];
    dbData.drip_campaigns.unshift(campaign);
    saveDB(dbData);
    res.status(201).json(campaign);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// List drip campaigns
export async function listDripCampaigns(req, res) {
  try {
    const { status } = req.query;

    if (db.USE_SUPABASE) {
      try {
        const supabase = db.getServerSupabase();
        let q = supabase.from('drip_campaigns').select('*').order('updated_at', { ascending: false });
        if (status) q = q.eq('status', status);
        const { data, error } = await q;
        if (!error) return res.json(data || []);
      } catch (e) {
        console.warn('Supabase list drip campaigns failed, using local JSON:', e.message);
      }
    }

    const dbData = getDB();
    let campaigns = dbData.drip_campaigns || [];
    if (status) campaigns = campaigns.filter(c => c.status === status);
    res.json(campaigns.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at)));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Get single drip campaign
export async function getDripCampaign(req, res) {
  try {
    const { id } = req.params;

    if (db.USE_SUPABASE) {
      try {
        const supabase = db.getServerSupabase();
        const { data, error } = await supabase.from('drip_campaigns').select('*').eq('id', id).single();
        if (!error && data) return res.json(data);
      } catch (e) {
        console.warn('Supabase get drip campaign failed, using local JSON:', e.message);
      }
    }

    const dbData = getDB();
    const campaign = (dbData.drip_campaigns || []).find(c => c.id === id);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    res.json(campaign);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Update drip campaign
export async function updateDripCampaign(req, res) {
  try {
    const { id } = req.params;
    const allowed = ['name', 'channel', 'trigger', 'delay_unit', 'steps', 'audience', 'audience_count', 'status', 'notes', 'metrics'];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    updates.updated_at = nowIso();

    if (db.USE_SUPABASE) {
      try {
        const supabase = db.getServerSupabase();
        const { data, error } = await supabase.from('drip_campaigns')
          .update(updates).eq('id', id).select().single();
        if (!error && data) return res.json(data);
      } catch (e) {
        console.warn('Supabase update drip campaign failed, using local JSON:', e.message);
      }
    }

    const dbData = getDB();
    const idx = (dbData.drip_campaigns || []).findIndex(c => c.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Campaign not found' });
    Object.assign(dbData.drip_campaigns[idx], updates);
    saveDB(dbData);
    res.json(dbData.drip_campaigns[idx]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Delete drip campaign
export async function deleteDripCampaign(req, res) {
  try {
    const { id } = req.params;

    if (db.USE_SUPABASE) {
      try {
        const supabase = db.getServerSupabase();
        await supabase.from('drip_campaigns').delete().eq('id', id);
        return res.json({ success: true });
      } catch (e) {
        console.warn('Supabase delete drip campaign failed, using local JSON:', e.message);
      }
    }

    const dbData = getDB();
    const before = (dbData.drip_campaigns || []).length;
    dbData.drip_campaigns = (dbData.drip_campaigns || []).filter(c => c.id !== id);
    if (dbData.drip_campaigns.length === before) return res.status(404).json({ error: 'Campaign not found' });
    saveDB(dbData);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Activate/pause campaign
export async function toggleDripCampaignStatus(req, res) {
  try {
    const { id } = req.params;
    const { status } = req.body; // 'active', 'paused', 'completed'

    const updates = { status: status || 'active', updated_at: nowIso() };

    if (db.USE_SUPABASE) {
      try {
        const supabase = db.getServerSupabase();
        const { data, error } = await supabase.from('drip_campaigns')
          .update(updates).eq('id', id).select().single();
        if (!error && data) return res.json(data);
      } catch (e) {
        console.warn('Supabase toggle drip campaign failed, using local JSON:', e.message);
      }
    }

    const dbData = getDB();
    const idx = (dbData.drip_campaigns || []).findIndex(c => c.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Campaign not found' });
    Object.assign(dbData.drip_campaigns[idx], updates);
    saveDB(dbData);
    res.json(dbData.drip_campaigns[idx]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Simulate triggering a drip campaign (for demo)
export async function simulateDripTrigger(req, res) {
  try {
    const { id } = req.params;
    const dbData = getDB();
    const campaign = (dbData.drip_campaigns || []).find(c => c.id === id);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

    // Simulate execution
    const steps = campaign.steps || [];
    const results = steps.map(step => ({
      step_id: step.id,
      step_order: step.step_order,
      action: step.action,
      channel: step.channel,
      status: 'simulated',
      message: `[SIMULATED] Step ${step.step_order}: ${step.action} via ${step.channel}`,
      triggered_at: nowIso()
    }));

    // Update metrics
    campaign.metrics.triggered += results.length;
    campaign.metrics.delivered += results.length;

    // Create activity log
    if (!dbData.drip_campaign_logs) dbData.drip_campaign_logs = [];
    dbData.drip_campaign_logs.unshift({
      id: generateId(),
      campaign_id: id,
      campaign_name: campaign.name,
      results,
      executed_at: nowIso()
    });

    saveDB(dbData);

    res.json({
      success: true,
      campaign: campaign.name,
      steps_triggered: results.length,
      results
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Get drip campaign execution logs
export async function getDripCampaignLogs(req, res) {
  try {
    const { campaign_id } = req.query;
    const dbData = getDB();
    let logs = dbData.drip_campaign_logs || [];
    if (campaign_id) logs = logs.filter(l => l.campaign_id === campaign_id);
    res.json(logs.sort((a, b) => new Date(b.executed_at) - new Date(a.executed_at)));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Get available templates for selection in drip builder
export async function getAvailableTemplates(req, res) {
  try {
    if (db.USE_SUPABASE) {
      try {
        const supabase = db.getServerSupabase();
        const { data, error } = await supabase.from('communication_templates')
          .select('*').eq('active', true).order('updated_at', { ascending: false });
        if (!error) return res.json(data || []);
      } catch (e) {
        console.warn('Supabase templates fetch failed, using local JSON:', e.message);
      }
    }

    const dbData = getDB();
    const templates = dbData.communicationTemplates || [];
    res.json(templates.filter(t => t.active !== false));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Bulk campaign report
export async function getDripCampaignReport(req, res) {
  try {
    const dbData = getDB();
    const campaigns = dbData.drip_campaigns || [];
    const logs = dbData.drip_campaign_logs || [];

    const totalTriggers = logs.reduce((sum, l) => sum + (l.results?.length || 0), 0);
    const activeCampaigns = campaigns.filter(c => c.status === 'active').length;
    const totalAudience = campaigns.reduce((sum, c) => sum + (c.audience_count || 0), 0);

    res.json({
      total_campaigns: campaigns.length,
      active_campaigns: activeCampaigns,
      total_triggers: totalTriggers,
      total_audience: totalAudience,
      by_status: {
        draft: campaigns.filter(c => c.status === 'draft').length,
        active: activeCampaigns,
        paused: campaigns.filter(c => c.status === 'paused').length,
        completed: campaigns.filter(c => c.status === 'completed').length
      },
      recent_executions: logs.slice(0, 5)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
