// ===== UTM TRACKING CONTROLLER - Lead Source Attribution =====
import { generateId, getDB, saveDB } from '../db.js';

// Track UTM parameters
export async function trackUTM(req, res) {
  try {
    const {
      utm_source,
      utm_medium,
      utm_campaign,
      utm_term,
      utm_content,
      referrer,
      landing_page,
      ip_address,
      user_agent
    } = req.body;

    const dbData = getDB();
    if (!dbData.utm_tracking) dbData.utm_tracking = [];

    const tracking = {
      id: generateId(),
      utm_source: utm_source || null,
      utm_medium: utm_medium || null,
      utm_campaign: utm_campaign || null,
      utm_term: utm_term || null,
      utm_content: utm_content || null,
      referrer: referrer || null,
      landing_page: landing_page || null,
      ip_address: ip_address || req.ip,
      user_agent: user_agent || req.headers['user-agent'],
      session_id: generateId(),
      created_at: new Date().toISOString()
    };

    dbData.utm_tracking.push(tracking);
    
    // Keep only last 10000 records
    if (dbData.utm_tracking.length > 10000) {
      dbData.utm_tracking = dbData.utm_tracking.slice(-10000);
    }
    
    saveDB(dbData);

    res.status(201).json({
      success: true,
      session_id: tracking.session_id
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Get UTM analytics
export async function getUTMAnalytics(req, res) {
  try {
    const { date_from, date_to, utm_source, utm_campaign } = req.query;
    const dbData = getDB();
    let tracking = dbData.utm_tracking || [];

    // Filter by date
    if (date_from) {
      tracking = tracking.filter(t => new Date(t.created_at) >= new Date(date_from));
    }
    if (date_to) {
      tracking = tracking.filter(t => new Date(t.created_at) <= new Date(date_to));
    }

    // Filter by UTM parameters
    if (utm_source) {
      tracking = tracking.filter(t => t.utm_source === utm_source);
    }
    if (utm_campaign) {
      tracking = tracking.filter(t => t.utm_campaign === utm_campaign);
    }

    // Aggregate data
    const analytics = {
      total_visits: tracking.length,
      by_source: aggregateBy(tracking, 'utm_source'),
      by_medium: aggregateBy(tracking, 'utm_medium'),
      by_campaign: aggregateBy(tracking, 'utm_campaign'),
      by_landing_page: aggregateBy(tracking, 'landing_page'),
      top_referrers: aggregateBy(tracking, 'referrer').slice(0, 10)
    };

    res.json(analytics);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Helper function to aggregate data
function aggregateBy(data, field) {
  const counts = {};
  
  data.forEach(item => {
    const value = item[field] || 'direct';
    counts[value] = (counts[value] || 0) + 1;
  });

  return Object.entries(counts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

// Link UTM to lead
export async function linkUTMToLead(sessionId, leadId) {
  const dbData = getDB();
  const tracking = dbData.utm_tracking?.find(t => t.session_id === sessionId);

  if (tracking) {
    tracking.lead_id = leadId;
    tracking.converted = true;
    tracking.converted_at = new Date().toISOString();
    saveDB(dbData);
  }
}

// Get conversion analytics
export async function getConversionAnalytics(req, res) {
  try {
    const { date_from, date_to } = req.query;
    const dbData = getDB();
    let tracking = dbData.utm_tracking || [];

    // Filter by date
    if (date_from) {
      tracking = tracking.filter(t => new Date(t.created_at) >= new Date(date_from));
    }
    if (date_to) {
      tracking = tracking.filter(t => new Date(t.created_at) <= new Date(date_to));
    }

    const totalVisits = tracking.length;
    const conversions = tracking.filter(t => t.converted).length;
    const conversionRate = totalVisits > 0 ? ((conversions / totalVisits) * 100).toFixed(2) : 0;

    // Conversion by source
    const bySource = {};
    tracking.forEach(t => {
      const source = t.utm_source || 'direct';
      if (!bySource[source]) {
        bySource[source] = { visits: 0, conversions: 0 };
      }
      bySource[source].visits++;
      if (t.converted) bySource[source].conversions++;
    });

    const sourceAnalytics = Object.entries(bySource).map(([source, data]) => ({
      source,
      visits: data.visits,
      conversions: data.conversions,
      conversion_rate: ((data.conversions / data.visits) * 100).toFixed(2)
    })).sort((a, b) => b.conversions - a.conversions);

    res.json({
      total_visits: totalVisits,
      total_conversions: conversions,
      overall_conversion_rate: conversionRate,
      by_source: sourceAnalytics
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
