import * as db from '../supabase.js';
import { assertLeadPayload } from '../validate.js';
import { sendWelcomeSMS, sendStageChangeSMS, isSMSConfigured } from '../services/smsService.js';
import { sendWelcomeWhatsApp, sendWhatsApp, isWhatsAppConfigured } from '../services/whatsappService.js';

// --- LEAD SCORING LOGIC ---
export function calculateLeadScore(lead) {
  let score = 20; // Base score
  
  // Source weight
  const sourceScores = { 'Website': 20, 'Google Ads': 25, 'Walk-in': 30, 'Referral': 25, 'Social Media': 15 };
  score += sourceScores[lead.source] || 10;
  
  // Priority weight
  const priorityScores = { 'high': 30, 'medium': 15, 'low': 5 };
  score += priorityScores[lead.priority] || 15;
  
  // Stage weight
  const stageScores = { 
    'enquiry': 0, 'counseling_scheduled': 10, 'counseling_done': 20, 
    'application_submitted': 40, 'documents_verified': 60, 'admitted': 80, 'enrolled': 100 
  };
  score += stageScores[lead.stage] || 0;
  
  // Cap at 100
  return Math.min(100, score);
}

function normalizePhone(value = '') {
  const digits = String(value).replace(/\D/g, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
}

function normalizeEmail(value = '') {
  return String(value).trim().toLowerCase();
}

async function findDuplicateLead({ phone, email }, excludeId = null) {
  const phoneKey = normalizePhone(phone);
  const emailKey = normalizeEmail(email);
  if (!phoneKey && !emailKey) return null;

  const leads = await db.getLeads({});
  return leads.find(l => {
    if (excludeId && l.id === excludeId) return false;
    const samePhone = phoneKey && normalizePhone(l.phone) === phoneKey;
    const sameEmail = emailKey && normalizeEmail(l.email) === emailKey;
    return samePhone || sameEmail;
  }) || null;
}

function getAutomationForStage(stage, leadName) {
  const rules = {
    enquiry: { title: `Call ${leadName}`, type: 'call', hours: 4, notes: 'New enquiry. Qualify course interest, budget, location, and admission timeline.' },
    counseling_scheduled: { title: `Prepare counseling for ${leadName}`, type: 'meeting', hours: 12, notes: 'Share agenda and keep course/fee details ready.' },
    counseling_done: { title: `Send application link to ${leadName}`, type: 'whatsapp', hours: 6, notes: 'Nudge the student to submit the application form.' },
    application_submitted: { title: `Verify documents for ${leadName}`, type: 'other', hours: 8, notes: 'Check required documents and mark missing items.' },
    documents_verified: { title: `Collect admission fee from ${leadName}`, type: 'call', hours: 12, notes: 'Explain fee slip, scholarship status, and payment deadline.' },
    admitted: { title: `Complete enrollment formalities for ${leadName}`, type: 'meeting', hours: 24, notes: 'Confirm joining, orientation, and pending forms.' }
  };
  return rules[stage] || null;
}

async function createAutomatedTaskForLead(lead, stage = lead.stage) {
  const leadName = `${lead.first_name || ''} ${lead.last_name || ''}`.trim() || 'student';
  const rule = getAutomationForStage(stage, leadName);
  if (!rule || stage === 'enrolled') return null;
  return db.createTask({
    lead_id: lead.id,
    title: rule.title,
    type: rule.type,
    due_date: new Date(Date.now() + rule.hours * 60 * 60 * 1000).toISOString(),
    status: 'pending',
    notes: rule.notes
  });
}

export const getLeads = async (req, res) => {
  try {
    const { stage, source, counselor_id, search, sort, order, page, limit } = req.query;

    // Counselors can only see their own leads
    const filterCounselorId = req.user.role === 'counselor' ? req.user.counselor_id : counselor_id;

    let leads = await db.getLeads({ stage, source, counselor_id: filterCounselorId });

    if (search) {
      const q = search.toLowerCase();
      const courses = await db.getCourses();
      const courseMap = Object.fromEntries(courses.map(c => [c.id, c]));
      leads = leads.filter(l =>
        `${l.first_name} ${l.last_name}`.toLowerCase().includes(q) ||
        (l.email && l.email.toLowerCase().includes(q)) ||
        (l.phone && l.phone.includes(q)) ||
        (courseMap[l.course_id]?.name || '').toLowerCase().includes(q) ||
        (l.city && l.city.toLowerCase().includes(q))
      );
    }

    const sortField = sort || 'created_at';
    const sortOrder = order === 'asc' ? 1 : -1;
    leads.sort((a, b) => {
      let av = a[sortField] || '', bv = b[sortField] || '';
      if (typeof av === 'string') av = av.toLowerCase();
      if (typeof bv === 'string') bv = bv.toLowerCase();
      return av < bv ? -sortOrder : av > bv ? sortOrder : 0;
    });

    const total = leads.length;
    const pg = parseInt(page) || 1;
    const lim = parseInt(limit) || 12;
    const start = (pg - 1) * lim;
    const paged = leads.slice(start, start + lim);

    const counselors = await db.getCounselors();
    const courses = await db.getCourses();
    const counselorMap = Object.fromEntries(counselors.map(c => [c.id, c]));
    const courseMap = Object.fromEntries(courses.map(c => [c.id, c]));

    const enriched = paged.map(l => {
      return {
        ...l,
        name: `${l.first_name} ${l.last_name}`,
        counselor_name: counselorMap[l.counselor_id]?.name || 'Unassigned',
        course_name: courseMap[l.course_id]?.name || 'N/A',
        lead_score: l.lead_score || 10
      };
    });

    res.json({ data: enriched, total, page: pg, totalPages: Math.ceil(total / lim) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const exportLeadsCSV = async (req, res) => {
  try {
    const filterCounselorId = req.user.role === 'counselor' ? req.user.counselor_id : undefined;
    const leads = await db.getLeads({ counselor_id: filterCounselorId });
    const counselors = await db.getCounselors();
    const courses = await db.getCourses();
    const counselorMap = Object.fromEntries(counselors.map(c => [c.id, c]));
    const courseMap = Object.fromEntries(courses.map(c => [c.id, c]));

    const headers = ['Name', 'Email', 'Phone', 'City', 'Course', 'Source', 'Stage', 'Priority', 'Counselor', 'Date'];
    const rows = leads.map(l => [
      `${l.first_name} ${l.last_name}`,
      l.email, l.phone, l.city || '',
      courseMap[l.course_id]?.name || '',
      l.source, l.stage, l.priority,
      counselorMap[l.counselor_id]?.name || 'Unassigned',
      new Date(l.created_at).toLocaleDateString('en-IN')
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));

    const csv = [headers.join(','), ...rows].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="rbmi-leads.csv"');
    res.send(csv);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getLead = async (req, res) => {
  try {
    const lead = await db.getLead(req.params.id);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    // Counselors can only view their own leads
    if (req.user.role === 'counselor' && lead.counselor_id !== req.user.counselor_id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const counselor = await db.getCounselor(lead.counselor_id);
    const course = lead.course_id ? await db.getCourse(lead.course_id) : null;

    res.json({
      ...lead,
      name: `${lead.first_name} ${lead.last_name}`,
      counselor_name: counselor?.name || 'Unassigned',
      course_name: course?.name || 'N/A'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const createLead = async (req, res) => {
  try {
    assertLeadPayload(req.body);
    const duplicate = await findDuplicateLead(req.body);
    if (duplicate && !req.body.allow_duplicate) {
      return res.status(409).json({
        error: 'Duplicate lead found',
        duplicate: {
          id: duplicate.id,
          name: `${duplicate.first_name} ${duplicate.last_name}`.trim(),
          phone: duplicate.phone,
          email: duplicate.email,
          stage: duplicate.stage,
          created_at: duplicate.created_at
        }
      });
    }
    
    // Auto-assignment logic: if no counselor_id, assign to the one with least active leads
    let assignedCounselorId = req.body.counselor_id;
    if (!assignedCounselorId && req.user.role === 'admin') {
      const allCounselors = await db.getCounselors();
      if (allCounselors.length > 0) {
        const allLeads = await db.getLeads({});
        const workloads = allCounselors.map(c => ({
          id: c.id,
          active: allLeads.filter(l => l.counselor_id === c.id && !['admitted', 'enrolled'].includes(l.stage)).length
        }));
        workloads.sort((a, b) => a.active - b.active);
        assignedCounselorId = workloads[0].id;
      }
    }

    const lead = await db.createLead({
      first_name: req.body.first_name || '',
      last_name: req.body.last_name || '',
      email: req.body.email || '',
      phone: req.body.phone || '',
      course_id: req.body.course_id || null,
      source: req.body.source || 'Website',
      stage: req.body.stage || 'enquiry',
      counselor_id: assignedCounselorId || null,
      priority: req.body.priority || 'medium',
      city: req.body.city || '',
      notes: req.body.notes || ''
    });

    await db.createActivity({
      lead_id: lead.id,
      type: 'lead_added',
      message: `New lead ${lead.first_name} ${lead.last_name} added via ${lead.source}${assignedCounselorId ? ' and auto-assigned' : ''}`
    });

    const task = await createAutomatedTaskForLead(lead, 'enquiry');
    if (task) {
      await db.createActivity({
        lead_id: lead.id,
        type: 'task_added',
        message: `Automation created follow-up: ${task.title}`
      });
    }

    // Send welcome SMS if configured
    if (lead.phone && isSMSConfigured()) {
      try {
        await sendWelcomeSMS(lead);
      } catch (e) {
        console.error('SMS send failed:', e.message);
      }
    }

    // Send welcome WhatsApp if configured
    if (lead.phone && isWhatsAppConfigured()) {
      try {
        await sendWelcomeWhatsApp(lead);
      } catch (e) {
        console.error('WhatsApp send failed:', e.message);
      }
    }

    const counselor = lead.counselor_id ? await db.getCounselor(lead.counselor_id) : null;
    const course = lead.course_id ? await db.getCourse(lead.course_id) : null;

    res.status(201).json({
      ...lead,
      name: `${lead.first_name} ${lead.last_name}`,
      counselor_name: counselor?.name || 'Unassigned',
      course_name: course?.name || 'N/A'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const updateLead = async (req, res) => {
  try {
    const old = await db.getLead(req.params.id);
    if (!old) return res.status(404).json({ error: 'Lead not found' });

    if (req.user.role === 'counselor' && old.counselor_id !== req.user.counselor_id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const current = await db.getLead(req.params.id);
    if (!current) return res.status(404).json({ error: 'Lead not found' });

    const updatedData = { ...req.body };
    delete updatedData.allow_duplicate;
    if (updatedData.stage || updatedData.priority || updatedData.source) {
      updatedData.lead_score = calculateLeadScore({ ...current, ...updatedData });
    }

    const updated = await db.updateLead(req.params.id, updatedData);

    if (req.body.stage && req.body.stage !== old.stage) {
      const stageLabels = {
        enquiry: 'Enquiry', counseling_scheduled: 'Counseling Scheduled',
        counseling_done: 'Counseling Done', application_submitted: 'Application Submitted',
        documents_verified: 'Documents Verified', admitted: 'Admitted', enrolled: 'Enrolled'
      };
      await db.createActivity({
        lead_id: updated.id,
        type: 'stage_change',
        message: `${updated.first_name} ${updated.last_name} moved to ${stageLabels[updated.stage] || updated.stage}`
      });

      // Send stage change SMS
      if (updated.phone && isSMSConfigured()) {
        try {
          await sendStageChangeSMS(updated, updated.stage);
        } catch (e) {
          console.error('Stage change SMS failed:', e.message);
        }
      }

      // Send stage change WhatsApp
      if (updated.phone && isWhatsAppConfigured()) {
        try {
          const stageMessages = {
            counseling_scheduled: `Hi ${updated.first_name}, your counseling session is scheduled. Our counselor will contact you soon. 📞`,
            application_submitted: `Hi ${updated.first_name}, your application has been received. We'll review it shortly. ✅`,
            documents_verified: `Hi ${updated.first_name}, your documents are verified. Admission process is in progress. 📋`,
            admitted: `Congratulations ${updated.first_name}! 🎉 You've been admitted to RBMI. Check your email for details. 🎓`,
            enrolled: `Welcome to RBMI, ${updated.first_name}! 🎓 Your enrollment is complete. See you on campus! 📚`
          };
          const msg = stageMessages[updated.stage];
          if (msg) await sendWhatsApp(updated.phone, msg);
        } catch (e) {
          console.error('Stage change WhatsApp failed:', e.message);
        }
      }

      const task = await createAutomatedTaskForLead(updated, updated.stage);
      if (task) {
        await db.createActivity({
          lead_id: updated.id,
          type: 'task_added',
          message: `Automation created follow-up: ${task.title}`
        });
      }
    }

    const counselor = updated.counselor_id ? await db.getCounselor(updated.counselor_id) : null;
    const course = updated.course_id ? await db.getCourse(updated.course_id) : null;

    res.json({
      ...updated,
      name: `${updated.first_name} ${updated.last_name}`,
      counselor_name: counselor?.name || 'Unassigned',
      course_name: course?.name || 'N/A'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const deleteLead = async (req, res) => {
  try {
    await db.deleteLead(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const bulkDeleteLeads = async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids)) return res.status(400).json({ error: 'ids array required' });
    for (const id of ids) await db.deleteLead(id);
    res.json({ success: true, deleted: ids.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const webhookLead = async (req, res) => {
  try {
    const {
      first_name, last_name, name, email, phone,
      course, course_id, source, city, notes, priority
    } = req.body;

    // Support both "name" and "first_name/last_name"
    let fname = first_name || '';
    let lname = last_name || '';
    if (!fname && name) {
      const parts = name.trim().split(' ');
      fname = parts[0];
      lname = parts.slice(1).join(' ');
    }

    if (!String(fname || '').trim() || !String(phone || '').trim()) {
      return res.status(400).json({ error: 'name and phone are required' });
    }

    const duplicate = await findDuplicateLead({ phone, email });
    if (duplicate) {
      await db.createActivity({
        lead_id: duplicate.id,
        type: 'duplicate_blocked',
        message: `Duplicate lead blocked from ${source || 'Website'} for ${fname} ${lname}`.trim()
      });
      return res.status(200).json({
        success: true,
        duplicate: true,
        lead_id: duplicate.id,
        message: 'Duplicate lead detected. Existing lead retained.'
      });
    }

    // Find course by name if course_id not provided
    let resolvedCourseId = course_id || null;
    if (!resolvedCourseId && course) {
      const courses = await db.getCourses();
      const found = courses.find(c => c.name.toLowerCase().includes(course.toLowerCase()) || c.code.toLowerCase() === course.toLowerCase());
      if (found) resolvedCourseId = found.id;
    }

    const lead = await db.createLead({
      first_name: fname,
      last_name: lname,
      email: email || '',
      phone: phone || '',
      course_id: resolvedCourseId,
      source: source || 'Website',
      stage: 'enquiry',
      counselor_id: null,
      priority: priority || 'medium',
      city: city || '',
      notes: notes || ''
    });

    await db.createActivity({
      lead_id: lead.id,
      type: 'lead_added',
      message: `New lead ${fname} ${lname} captured via webhook (${source || 'Website'})`
    });

    const task = await createAutomatedTaskForLead(lead, 'enquiry');
    if (task) {
      await db.createActivity({
        lead_id: lead.id,
        type: 'task_added',
        message: `Automation created follow-up: ${task.title}`
      });
    }

    res.status(201).json({ success: true, lead_id: lead.id, message: 'Lead captured successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
