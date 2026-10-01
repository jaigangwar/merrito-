import * as db from '../supabase.js';
import { generateId, getDB, saveDB } from '../db.js';

function normalizePhone(value = '') {
  const digits = String(value).replace(/\D/g, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
}

function normalizeEmail(value = '') {
  return String(value).trim().toLowerCase();
}

function resolveIdempotencyKey(req, payload, publisher) {
  const headerKey = req.headers['x-idempotency-key'];
  const candidate = headerKey || payload.event_id || payload.lead_id || payload.id || payload.request_id || payload.CallSid || '';
  if (candidate) return String(candidate).trim();
  const fingerprint = [
    String(publisher || payload.source || 'website').toLowerCase(),
    normalizePhone(payload.phone || payload.MobileNo || payload.student_mobile || payload.From || ''),
    normalizeEmail(payload.email || payload.EmailId || payload.student_email || '')
  ].join('|');
  return fingerprint;
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

export const captureLead = async (req, res) => {
  try {
    const payload = req.body;
    const publisher = req.query.publisher || payload.source || 'Website';
    
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
    if (!dbData.webhookDeliveries || typeof dbData.webhookDeliveries !== 'object') dbData.webhookDeliveries = {};
    const deliveryKey = resolveIdempotencyKey(req, payload, publisher);
    const existingDelivery = dbData.webhookDeliveries[deliveryKey];
    if (existingDelivery) {
      return res.status(200).json({
        success: true,
        duplicate_delivery: true,
        lead_id: existingDelivery.lead_id || null,
        message: 'Duplicate webhook delivery ignored'
      });
    }

    // --- PUBLISHER ADAPTERS ---
    let data = { ...payload };

    // Shiksha Adapter
    if (publisher.toLowerCase().includes('shiksha')) {
      data = {
        first_name: payload.FirstName || payload.name,
        last_name: payload.LastName || '',
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
        name: payload.student_name,
        email: payload.student_email,
        phone: payload.student_mobile,
        course: payload.interested_course,
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

    const normalizedPhone = normalizePhone(phone || '');
    if (!String(fname || '').trim() || !normalizedPhone) {
      logEntry.status = 'failed';
      logEntry.error = 'Missing name or phone';
      dbData.inboundLogs.unshift(logEntry);
      saveDB(dbData);
      return res.status(400).json({ error: 'name and phone are required' });
    }
    if (normalizedPhone.length !== 10) {
      logEntry.status = 'failed';
      logEntry.error = 'Invalid phone number format';
      dbData.inboundLogs.unshift(logEntry);
      saveDB(dbData);
      return res.status(400).json({ error: 'phone must contain a valid 10-digit mobile number' });
    }

    const duplicate = await findDuplicateLead({ phone, email });
    if (duplicate) {
      logEntry.status = 'duplicate';
      logEntry.lead_id = duplicate.id;
      dbData.inboundLogs.unshift(logEntry);
      dbData.webhookDeliveries[deliveryKey] = { lead_id: duplicate.id, received_at: new Date().toISOString() };
      saveDB(dbData);
      await db.createActivity({
        lead_id: duplicate.id,
        type: 'duplicate_blocked',
        message: `Duplicate lead blocked from ${publisher} integration for ${fname} ${lname}`.trim()
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

    // --- LEAD ALLOCATION RULES (Round Robin) ---
    const counselors = await db.getCounselors();
    if (counselors.length > 0) {
      // Find the counselor with the fewest active leads.
      const leads = await db.getLeads({});
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
    dbData.webhookDeliveries[deliveryKey] = { lead_id: lead.id, received_at: new Date().toISOString() };
    if (dbData.inboundLogs.length > 100) dbData.inboundLogs.pop(); // Keep last 100
    const retentionMs = 24 * 60 * 60 * 1000;
    const cutoff = Date.now() - retentionMs;
    for (const [key, value] of Object.entries(dbData.webhookDeliveries)) {
      const t = new Date(value?.received_at || 0).getTime();
      if (!t || t < cutoff) delete dbData.webhookDeliveries[key];
    }
    saveDB(dbData);

    res.status(201).json({ success: true, lead_id: lead.id, message: 'Lead captured successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
