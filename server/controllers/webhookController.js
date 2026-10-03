import * as db from '../supabase.js';
import { generateId, getDB, saveDB } from '../db.js';

function normalizePhone(value = '') {
  const digits = String(value).replace(/\D/g, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
}

function normalizeEmail(value = '') {
  return String(value).trim().toLowerCase();
}

async function findDuplicateLead({ phone, email }) {
  const phoneKey = normalizePhone(phone);
  const emailKey = normalizeEmail(email);
  if (!phoneKey && !emailKey) return null;

  const leads = await db.getLeads({});
  return leads.find(l => {
    const samePhone = phoneKey && normalizePhone(l.phone) === phoneKey;
    const sameEmail = emailKey && normalizeEmail(l.email) === emailKey;
    return samePhone || sameEmail;
  }) || null;
}

export async function handleWebhookLead(publisher = 'Website', payload = {}) {
  // Log the inbound request for the Integration Manager
  const dbData = getDB();
  if (!dbData.inboundLogs) dbData.inboundLogs = [];

  const logEntry = {
    id: generateId(),
    publisher,
    payload: JSON.stringify(payload),
    status: 'success',
    received_at: new Date().toISOString()
  };

  // --- PUBLISHER ADAPTERS ---
  let data = { ...payload };

  // Shiksha Adapter
  if (publisher.toLowerCase().includes('shiksha')) {
    data = {
      first_name: payload.FirstName || payload.first_name || payload.name,
      last_name: payload.LastName || payload.last_name || '',
      email: payload.EmailId || payload.email,
      phone: payload.MobileNo || payload.phone,
      course: payload.CourseName || payload.course,
      city: payload.CityName || payload.city,
      source: 'Shiksha.com'
    };
  } 
  // CollegeDekho Adapter
  else if (publisher.toLowerCase().includes('collegedekho')) {
    data = {
      name: payload.student_name || payload.name,
      email: payload.student_email || payload.email,
      phone: payload.student_mobile || payload.phone,
      course: payload.interested_course || payload.course,
      source: 'CollegeDekho'
    };
  }
  // Facebook Lead Ads Adapter
  else if (payload.lead_id && payload.user_column_data) {
    const nameField = payload.user_column_data.find(c => c.column_name === 'full_name');
    const phoneField = payload.user_column_data.find(c => c.column_name === 'phone_number');
    data = {
      name: nameField?.value || 'FB Lead',
      phone: phoneField?.value || '',
      source: 'Facebook Ads'
    };
  }
  // Missed Call / IVR Adapter
  else if (payload.EventType === 'MissedCall' || payload.CallSid) {
    data = {
      first_name: 'Inbound',
      last_name: 'Caller',
      phone: payload.From || payload.mobile || '',
      source: payload.EventType === 'MissedCall' ? 'Missed Call' : 'IVR Inbound',
      notes: `Automated lead created from inbound call.`
    };
  }

  const {
    first_name, last_name, name, email, phone,
    course, course_id, source, city, notes, priority
  } = data;

  // Support both "name" and "first_name/last_name"
  let fname = first_name || '';
  let lname = last_name || '';
  if (!fname && name) {
    const parts = name.trim().split(' ');
    fname = parts[0];
    lname = parts.slice(1).join(' ');
  }

  if (!String(fname || '').trim() || !String(phone || '').trim()) {
    logEntry.status = 'failed';
    logEntry.error = 'Missing name or phone';
    dbData.inboundLogs.unshift(logEntry);
    saveDB(dbData);
    return { status: 400, data: { error: 'name and phone are required' } };
  }

  const duplicate = await findDuplicateLead({ phone, email });
  if (duplicate) {
    logEntry.status = 'duplicate';
    logEntry.lead_id = duplicate.id;
    dbData.inboundLogs.unshift(logEntry);
    saveDB(dbData);
    await db.createActivity({
      lead_id: duplicate.id,
      type: 'duplicate_blocked',
      message: `Duplicate lead blocked from ${publisher} integration for ${fname} ${lname}`.trim()
    });
    return {
      status: 200,
      data: {
        success: true,
        duplicate: true,
        lead_id: duplicate.id,
        message: 'Duplicate lead detected. Existing lead retained.'
      }
    };
  }

  // Find course by name if course_id not provided
  let resolvedCourseId = course_id || null;
  if (!resolvedCourseId && course) {
    const courses = await db.getCourses();
    const found = courses.find(c => c.name.toLowerCase().includes(course.toLowerCase()) || c.code.toLowerCase() === course.toLowerCase());
    if (found) resolvedCourseId = found.id;
  }

  // --- LEAD ALLOCATION RULES (Round Robin) ---
  const counselors = await db.getCounselors();
  if (counselors.length > 0) {
    // Find the counselor with the fewest leads or use Round Robin
    const leads = (getDB()).leads || [];
    const counts = counselors.map(c => ({
      id: c.id,
      count: leads.filter(l => l.counselor_id === c.id).length
    }));
    counts.sort((a, b) => a.count - b.count);
    data.counselor_id = counts[0].id;
  }

  const lead = await db.createLead({
    first_name: fname,
    last_name: lname,
    email: email || '',
    phone: phone || '',
    course_id: resolvedCourseId,
    source: source || publisher || 'Website',
    stage: 'enquiry',
    counselor_id: data.counselor_id || null,
    priority: priority || 'medium',
    city: city || '',
    notes: notes || `Captured via ${publisher} integration.`
  });

  await db.createActivity({
    lead_id: lead.id,
    type: 'lead_added',
    message: `New lead ${fname} ${lname} captured via ${publisher} integration.`
  });

  logEntry.lead_id = lead.id;
  dbData.inboundLogs.unshift(logEntry);
  if (dbData.inboundLogs.length > 100) dbData.inboundLogs.pop(); // Keep last 100
  saveDB(dbData);

  return { status: 201, data: { success: true, lead_id: lead.id, message: 'Lead captured successfully' } };
}

export const captureLead = async (req, res) => {
  try {
    const payload = req.body;
    const publisher = req.query.publisher || payload.source || 'Website';
    const result = await handleWebhookLead(publisher, payload);
    return res.status(result.status).json(result.data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
