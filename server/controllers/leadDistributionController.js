// ===== LEAD DISTRIBUTION CONTROLLER - Automatic Lead Assignment =====
import { generateId, getDB, saveDB } from '../db.js';
import * as db from '../supabase.js';

// Get distribution rules
export async function getDistributionRules(req, res) {
  try {
    const dbData = getDB();
    const rules = dbData.distribution_rules || [];
    
    res.json({ data: rules, total: rules.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Create distribution rule
export async function createDistributionRule(req, res) {
  try {
    const {
      name,
      priority,
      conditions,
      assignment_type, // round_robin, least_loaded, specific_counselor, by_course, by_source
      counselor_id,
      counselor_ids,
      is_active
    } = req.body;

    if (!name || !assignment_type) {
      return res.status(400).json({ error: 'name and assignment_type are required' });
    }

    const dbData = getDB();
    if (!dbData.distribution_rules) dbData.distribution_rules = [];

    const rule = {
      id: generateId(),
      name,
      priority: priority || 1,
      conditions: conditions || {}, // { source: 'Website', course: 'MBA', city: 'Delhi' }
      assignment_type,
      counselor_id: counselor_id || null,
      counselor_ids: counselor_ids || [],
      is_active: is_active !== false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    dbData.distribution_rules.push(rule);
    saveDB(dbData);

    res.status(201).json(rule);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Update distribution rule
export async function updateDistributionRule(req, res) {
  try {
    const { id } = req.params;
    const dbData = getDB();
    const rule = dbData.distribution_rules?.find(r => r.id === id);

    if (!rule) {
      return res.status(404).json({ error: 'Rule not found' });
    }

    Object.assign(rule, req.body, { updated_at: new Date().toISOString() });
    saveDB(dbData);

    res.json(rule);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Delete distribution rule
export async function deleteDistributionRule(req, res) {
  try {
    const { id } = req.params;
    const dbData = getDB();
    const index = dbData.distribution_rules?.findIndex(r => r.id === id);

    if (index === -1) {
      return res.status(404).json({ error: 'Rule not found' });
    }

    dbData.distribution_rules.splice(index, 1);
    saveDB(dbData);

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Auto-assign lead based on rules
export async function autoAssignLead(lead) {
  const dbData = getDB();
  const rules = (dbData.distribution_rules || [])
    .filter(r => r.is_active)
    .sort((a, b) => b.priority - a.priority); // Higher priority first

  // Find matching rule
  for (const rule of rules) {
    if (matchesConditions(lead, rule.conditions)) {
      const counselorId = await assignByCriteria(rule, lead);
      if (counselorId) {
        return counselorId;
      }
    }
  }

  // Fallback: least loaded counselor
  return await assignLeastLoaded();
}

// Check if lead matches rule conditions
function matchesConditions(lead, conditions) {
  if (!conditions || Object.keys(conditions).length === 0) {
    return true; // No conditions = match all
  }

  for (const [key, value] of Object.entries(conditions)) {
    if (Array.isArray(value)) {
      if (!value.includes(lead[key])) return false;
    } else {
      if (lead[key] !== value) return false;
    }
  }

  return true;
}

// Assign based on rule criteria
async function assignByCriteria(rule, lead) {
  switch (rule.assignment_type) {
    case 'specific_counselor':
      return rule.counselor_id;

    case 'round_robin':
      return await assignRoundRobin(rule.counselor_ids);

    case 'least_loaded':
      return await assignLeastLoaded(rule.counselor_ids);

    case 'by_course':
      return await assignByCourse(lead.course_id);

    case 'by_source':
      return await assignBySource(lead.source);

    default:
      return null;
  }
}

// Round robin assignment
async function assignRoundRobin(counselorIds) {
  if (!counselorIds || counselorIds.length === 0) {
    const allCounselors = await db.getCounselors();
    counselorIds = allCounselors.map(c => c.id);
  }

  const dbData = getDB();
  if (!dbData.round_robin_index) dbData.round_robin_index = {};

  const key = counselorIds.join(',');
  const currentIndex = dbData.round_robin_index[key] || 0;
  const counselorId = counselorIds[currentIndex % counselorIds.length];

  dbData.round_robin_index[key] = (currentIndex + 1) % counselorIds.length;
  saveDB(dbData);

  return counselorId;
}

// Least loaded assignment
async function assignLeastLoaded(counselorIds = null) {
  const allCounselors = await db.getCounselors();
  let counselors = allCounselors;

  if (counselorIds && counselorIds.length > 0) {
    counselors = allCounselors.filter(c => counselorIds.includes(c.id));
  }

  if (counselors.length === 0) return null;

  const allLeads = await db.getLeads({});
  const workloads = counselors.map(c => ({
    id: c.id,
    active: allLeads.filter(l => 
      l.counselor_id === c.id && 
      !['admitted', 'enrolled'].includes(l.stage)
    ).length
  }));

  workloads.sort((a, b) => a.active - b.active);
  return workloads[0].id;
}

// Assign by course
async function assignByCourse(courseId) {
  const counselors = await db.getCounselors();
  const courseCounselors = counselors.filter(c => 
    c.department && courseId // Match by department if available
  );

  if (courseCounselors.length > 0) {
    return await assignLeastLoaded(courseCounselors.map(c => c.id));
  }

  return await assignLeastLoaded();
}

// Assign by source
async function assignBySource(source) {
  // Can implement source-specific logic here
  // For now, use least loaded
  return await assignLeastLoaded();
}

// Test distribution rule
export async function testDistributionRule(req, res) {
  try {
    const { rule_id, test_lead } = req.body;

    if (!rule_id || !test_lead) {
      return res.status(400).json({ error: 'rule_id and test_lead are required' });
    }

    const dbData = getDB();
    const rule = dbData.distribution_rules?.find(r => r.id === rule_id);

    if (!rule) {
      return res.status(404).json({ error: 'Rule not found' });
    }

    const matches = matchesConditions(test_lead, rule.conditions);
    let assignedCounselor = null;

    if (matches) {
      const counselorId = await assignByCriteria(rule, test_lead);
      if (counselorId) {
        assignedCounselor = await db.getCounselor(counselorId);
      }
    }

    res.json({
      matches,
      rule_name: rule.name,
      assigned_counselor: assignedCounselor ? {
        id: assignedCounselor.id,
        name: assignedCounselor.name,
        email: assignedCounselor.email
      } : null
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
