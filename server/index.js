// ===== EXPRESS API SERVER — RBMI CRM =====
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import * as db from './supabase.js';
import { generateId, getDB, saveDB } from './db.js';
import { startCronJobs } from './cron.js';
import {
  loginUser,
  loginWithSupabaseAccessToken,
  signupStudent,
  seedDemoUsers,
  getUsers,
  createUser,
  updateUser,
  deleteUser,
  requireAuth,
  requireAdmin
} from './auth.js';
import * as appStore from './appStore.js';
import { assertLeadPayload, assertRequired } from './validate.js';
import { chatWithAsha } from './controllers/aiController.js';
import {
  sendWelcomeEmail,
  sendStageChangeEmail,
  sendTestEmail,
  isEmailConfigured
} from './utils/emailService.js';
import {
  normalizeLeadFromPublisher,
  detectPublisher,
  getValidPublishers
} from './publishers.js';
import formBuilderRoutes from './routes/formBuilderRoutes.js';
import apiRouter from './routes/index.js';
import { autoAssignLead } from './controllers/leadDistributionController.js';

const app = express();
const PORT = Number(process.env.PORT) || 3001;
// Trust first proxy for accurate IP in rate limiting when behind Nginx/Cloudflare
app.set('trust proxy', 1);
const rateBuckets = new Map();

// Periodically evict stale rate-limit entries to prevent memory leak
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of rateBuckets) {
    if (now > bucket.resetAt) rateBuckets.delete(key);
  }
}, 300_000); // every 5 minutes

app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// --- Multer File Upload ---
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/documents');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = file.originalname.split('.').pop();
    cb(null, uniqueSuffix + '-' + file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_'));
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.jpg', '.jpeg', '.png', '.doc', '.docx'];
    const ext = '.' + file.originalname.split('.').pop().toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF, JPG, JPEG, PNG, DOC, DOCX files are allowed'));
    }
  }
});

function rateLimit({ windowMs = 60_000, max = 60 } = {}) {
  return (req, res, next) => {
    const key = `${req.ip || req.socket?.remoteAddress || 'local'}:${req.path}`;
    const now = Date.now();
    const bucket = rateBuckets.get(key) || { count: 0, resetAt: now + windowMs };
    if (now > bucket.resetAt) {
      bucket.count = 0;
      bucket.resetAt = now + windowMs;
    }
    bucket.count += 1;
    rateBuckets.set(key, bucket);
    if (bucket.count > max) return res.status(429).json({ error: 'Too many requests. Please try again later.' });
    next();
  };
}

function requireWebhookSecret(req, res, next) {
  const expected = process.env.WEBHOOK_SECRET;
  if (!expected) return next();
  const provided = req.headers['x-webhook-secret'] || req.query.secret;
  if (provided !== expected) return res.status(401).json({ error: 'Invalid webhook secret' });
  next();
}

// --- LEAD SCORING LOGIC ---
function calculateLeadScore(lead) {
  let score = 20; // Base score
  
  // Source weight
  const sourceScores = { 'Website': 20, 'Google Ads': 25, 'Walk-in': 30, 'Referral': 25, 'Social Media': 15, 'Shiksha': 22, 'CollegeDekho': 22, 'Facebook Ads': 18, 'JustDial': 16, 'Education Fair': 24 };
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

function getSourceAttribution({ source = 'Website', publisher = '', campaign = '', medium = '', keyword = '', source_url = '' } = {}) {
  const primary = publisher || source || 'Website';
  const secondary = campaign || medium || (primary === 'Website' ? 'Organic / direct' : 'Publisher API');
  const tertiary = keyword || source_url || 'First touch';
  return { primary, secondary, tertiary };
}

function getVerificationStatus(lead = {}) {
  const emailOk = !!String(lead.email || '').match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
  const phoneDigits = normalizePhone(lead.phone);
  const phoneOk = phoneDigits.length === 10;
  if (emailOk && phoneOk) return 'verified';
  if (emailOk || phoneOk) return 'partial';
  return 'needs_review';
}

function getLeadStrength(score = 0) {
  if (score >= 75) return 'hot';
  if (score >= 55) return 'warm';
  if (score >= 35) return 'nurture';
  return 'cold';
}

function buildLeadPayload(input = {}) {
  const payload = {
    first_name: input.first_name || '',
    last_name: input.last_name || '',
    email: input.email || '',
    phone: input.phone || '',
    course_id: input.course_id || null,
    source: input.source || input.publisher || 'Website',
    stage: input.stage || 'enquiry',
    counselor_id: input.counselor_id || null,
    priority: input.priority || 'medium',
    city: input.city || '',
    notes: input.notes || ''
  };
  const score = calculateLeadScore(payload);
  return {
    ...payload,
    lead_score: input.lead_score || score,
    lead_strength: input.lead_strength || getLeadStrength(score),
    verification_status: input.verification_status || getVerificationStatus(payload),
    source_attribution: input.source_attribution || getSourceAttribution(input),
    raw_source_payload: input.raw_source_payload || null
  };
}

function logInboundCapture({ publisher = 'Website', source = 'Website', student_name = 'Unknown', status = 'captured', payload = {}, lead_id = null, reason = '' }) {
  try {
    const dbData = getDB();
    if (!dbData.inboundLogs) dbData.inboundLogs = [];
    dbData.inboundLogs.unshift({
      id: generateId(),
      publisher,
      source,
      student_name,
      status,
      lead_id,
      reason,
      payload,
      received_at: new Date().toISOString()
    });
    if (dbData.inboundLogs.length > 100) dbData.inboundLogs = dbData.inboundLogs.slice(0, 100);

    if (!dbData.publishers) dbData.publishers = [];
    const idx = dbData.publishers.findIndex(p => String(p.name).toLowerCase() === String(publisher).toLowerCase());
    if (idx >= 0) {
      if (status === 'captured') dbData.publishers[idx].leads_captured = Number(dbData.publishers[idx].leads_captured || 0) + 1;
      dbData.publishers[idx].last_sync = new Date().toISOString();
      dbData.publishers[idx].status = 'active';
    }
    saveDB(dbData);
  } catch {}
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
  const due = new Date(Date.now() + rule.hours * 60 * 60 * 1000).toISOString();
  return db.createTask({
    lead_id: lead.id,
    title: rule.title,
    type: rule.type,
    due_date: due,
    status: 'pending',
    notes: rule.notes
  });
}

// Health check
app.get('/api/health', (req, res) => res.json({ ok: true }));
app.post('/api/health', (req, res) => res.json({ ok: true, body: req.body }));

// Seed users only when explicitly enabled via environment variables.
const shouldSeedDemoUsers = process.env.SEED_DEMO_USERS === 'true';
if (shouldSeedDemoUsers) await seedDemoUsers();

// ============================================================
//  AUTH
// ============================================================

app.post('/api/auth/login', rateLimit({ windowMs: 60_000, max: 12 }), async (req, res) => {
  try {
    const { email, password, branch } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    const result = await loginUser(email, password, branch);
    if (!result) {
      return res.status(401).json({
        error: db.USE_SUPABASE
          ? 'Invalid credentials. Contact admin to create your account.'
          : 'Invalid email or password'
      });
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/supabase', async (req, res) => {
  try {
    const access_token = req.body?.access_token;
    if (!access_token) return res.status(400).json({ error: 'access_token required' });
    const result = await loginWithSupabaseAccessToken(access_token);
    if (!result) return res.status(401).json({ error: 'Invalid or expired Supabase session' });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json(req.user);
});

app.post('/api/ai/chat', chatWithAsha);

app.post('/api/auth/signup', rateLimit({ windowMs: 60_000, max: 8 }), async (req, res) => {
  try {
    const { email, password, name, phone, branch } = req.body;
    if (!email || !password || !name) return res.status(400).json({ error: 'Name, email and password required' });
    const result = await signupStudent(email, password, name, phone, branch || 'bareilly');
    if (result.error) return res.status(400).json({ error: result.error });
    res.status(201).json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
//  LEADS
// ============================================================

app.get('/api/leads', requireAuth, async (req, res) => {
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
});

app.get('/api/leads/export/csv', requireAuth, async (req, res) => {
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
});

app.get('/api/leads/:id', requireAuth, async (req, res) => {
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
});

app.post('/api/leads', requireAuth, async (req, res) => {
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
    // Auto-assignment logic using rule-based distribution
    let assignedCounselorId = req.body.counselor_id;
    if (!assignedCounselorId) {
      assignedCounselorId = await autoAssignLead(req.body);
    }

    const lead = await db.createLead(buildLeadPayload({
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
      notes: req.body.notes || '',
      source_attribution: getSourceAttribution(req.body)
    }));

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

    const counselor = lead.counselor_id ? await db.getCounselor(lead.counselor_id) : null;
    const course = lead.course_id ? await db.getCourse(lead.course_id) : null;

    // Send welcome email (non-blocking)
    if (lead.email) sendWelcomeEmail(lead).catch(() => {});

    res.status(201).json({
      ...lead,
      name: `${lead.first_name} ${lead.last_name}`,
      counselor_name: counselor?.name || 'Unassigned',
      course_name: course?.name || 'N/A'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/leads/:id', requireAuth, async (req, res) => {
  try {
    const old = await db.getLead(req.params.id);
    if (!old) return res.status(404).json({ error: 'Lead not found' });

    if (req.user.role === 'counselor' && old.counselor_id !== req.user.counselor_id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const current = await db.getLead(req.params.id);
    if (!current) return res.status(404).json({ error: 'Lead not found' });

    const updatedData = { ...req.body };
    if (updatedData.stage || updatedData.priority || updatedData.source) {
      updatedData.lead_score = calculateLeadScore({ ...current, ...updatedData });
      updatedData.lead_strength = getLeadStrength(updatedData.lead_score);
    }
    if (updatedData.email || updatedData.phone) {
      updatedData.verification_status = getVerificationStatus({ ...current, ...updatedData });
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
      const task = await createAutomatedTaskForLead(updated, updated.stage);
      if (task) {
        await db.createActivity({
          lead_id: updated.id,
          type: 'task_added',
          message: `Automation created follow-up: ${task.title}`
        });
      }
      // Send stage change email to student (non-blocking)
      if (updated.email) sendStageChangeEmail(updated, updated.stage).catch(() => {});
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
});

app.delete('/api/leads/:id', requireAdmin, async (req, res) => {
  try {
    await db.deleteLead(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Bulk delete
app.post('/api/leads/bulk-delete', requireAdmin, async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids)) return res.status(400).json({ error: 'ids array required' });
    for (const id of ids) await db.deleteLead(id);
    res.json({ success: true, deleted: ids.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
//  WEBHOOK — Lead Capture (for n8n, website forms, etc.)
// ============================================================

async function assignLeastLoadedCounselor() {
  const allCounselors = await db.getCounselors();
  if (!allCounselors.length) return null;
  const allLeads = await db.getLeads({});
  const workloads = allCounselors.map(c => ({
    id: c.id,
    active: allLeads.filter(l => l.counselor_id === c.id && !['admitted', 'enrolled'].includes(l.stage)).length
  }));
  workloads.sort((a, b) => a.active - b.active);
  return workloads[0].id;
}

app.post('/api/webhook/lead', rateLimit({ windowMs: 60_000, max: 30 }), requireWebhookSecret, async (req, res) => {
  try {
    let {
      first_name, last_name, name, email, phone,
      course, course_id, source, city, notes, priority, publisher,
      campaign, medium, keyword, source_url
    } = req.body;

    let fname = first_name || '';
    let lname = last_name || '';
    let resolvedSource = source || 'Website';

    // If publisher specified, use publisher adapter to normalize
    if (publisher) {
      const normalized = normalizeLeadFromPublisher(publisher, req.body);
      if (normalized) {
        fname = normalized.first_name || fname;
        lname = normalized.last_name || lname;
        email = normalized.email || email;
        phone = normalized.phone || phone;
        course = normalized.course || course;
        resolvedSource = normalized.source || resolvedSource;
        if (!course_id && normalized.course) {
          const courses = await db.getCourses();
          const found = courses.find(c => c.name.toLowerCase().includes(normalized.course.toLowerCase()) || c.code.toLowerCase() === normalized.course.toLowerCase());
          if (found) course_id = found.id;
        }
        if (!city && normalized.city) city = normalized.city;
        if (!notes && normalized.notes) notes = normalized.notes;
      }
    }

    // Support both "name" and "first_name/last_name"
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
        message: `Duplicate lead blocked from ${resolvedSource} for ${fname} ${lname}`.trim()
      });
      logInboundCapture({
        publisher: publisher || resolvedSource,
        source: resolvedSource,
        student_name: `${fname} ${lname}`.trim(),
        status: 'duplicate',
        lead_id: duplicate.id,
        reason: 'Matched existing phone/email',
        payload: req.body
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

    // Auto-assign counselor based on rules
    const assignedCounselorId = await autoAssignLead({
      first_name: fname,
      last_name: lname,
      email: email || '',
      phone: phone || '',
      course_id: resolvedCourseId,
      source: resolvedSource,
      city: city || ''
    });

    const lead = await db.createLead(buildLeadPayload({
      first_name: fname,
      last_name: lname,
      email: email || '',
      phone: phone || '',
      course_id: resolvedCourseId,
      source: resolvedSource,
      stage: 'enquiry',
      counselor_id: assignedCounselorId,
      priority: priority || 'medium',
      city: city || '',
      notes: notes || '',
      publisher: publisher || resolvedSource,
      campaign,
      medium,
      keyword,
      source_url,
      raw_source_payload: req.body
    }));

    await db.createActivity({
      lead_id: lead.id,
      type: 'lead_added',
      message: `New lead ${fname} ${lname} captured via ${resolvedSource}${assignedCounselorId ? ' and auto-assigned' : ''}`
    });

    const task = await createAutomatedTaskForLead(lead, 'enquiry');
    if (task) {
      await db.createActivity({
        lead_id: lead.id,
        type: 'task_added',
        message: `Automation created follow-up: ${task.title}`
      });
    }

    if (lead.email) sendWelcomeEmail(lead).catch(() => {});

    logInboundCapture({
      publisher: publisher || resolvedSource,
      source: resolvedSource,
      student_name: `${fname} ${lname}`.trim(),
      status: 'captured',
      lead_id: lead.id,
      payload: req.body
    });

    res.status(201).json({ success: true, lead_id: lead.id, message: 'Lead captured successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Publisher-specific webhook endpoints (for direct integration with Shiksha, CollegeDekho, etc.)
app.post('/api/webhook/publisher/:name', rateLimit({ windowMs: 60_000, max: 60 }), async (req, res) => {
  try {
    const publisher = req.params.name;
    const adapter = await import('./publishers.js').then(m => m.getPublisher(publisher));
    if (!adapter) return res.status(400).json({ error: `Unknown publisher: ${publisher}. Valid: ${getValidPublishers().join(', ')}` });

    const normalized = normalizeLeadFromPublisher(publisher, req.body);
    if (!normalized) return res.status(400).json({ error: 'Failed to normalize lead data' });

    // Forward to main webhook handler
    const forwardReq = { body: { ...normalized, publisher } };
    const forwardRes = {
      status: (code) => ({ json: (data) => res.status(code).json(data) }),
      _raw: true
    };

    const duplicate = await findDuplicateLead({ phone: normalized.phone, email: normalized.email });
    if (duplicate) {
      await db.createActivity({
        lead_id: duplicate.id,
        type: 'duplicate_blocked',
        message: `Duplicate lead blocked from ${publisher} for ${normalized.first_name} ${normalized.last_name}`
      });
      logInboundCapture({
        publisher,
        source: publisher,
        student_name: `${normalized.first_name} ${normalized.last_name}`.trim(),
        status: 'duplicate',
        lead_id: duplicate.id,
        reason: 'Matched existing phone/email',
        payload: req.body
      });
      return res.status(200).json({ success: true, duplicate: true, lead_id: duplicate.id, message: 'Existing lead updated.' });
    }

    let resolvedCourseId = null;
    if (normalized.course) {
      const courses = await db.getCourses();
      const found = courses.find(c => c.name.toLowerCase().includes(normalized.course.toLowerCase()) || c.code.toLowerCase() === normalized.course.toLowerCase());
      if (found) resolvedCourseId = found.id;
    }

    const assignedCounselorId = await assignLeastLoadedCounselor();

    const lead = await db.createLead(buildLeadPayload({
      first_name: normalized.first_name,
      last_name: normalized.last_name,
      email: normalized.email || '',
      phone: normalized.phone || '',
      course_id: resolvedCourseId,
      source: publisher,
      stage: 'enquiry',
      counselor_id: assignedCounselorId,
      priority: 'medium',
      city: normalized.city || '',
      notes: normalized.notes || '',
      publisher,
      campaign: req.body.campaign || req.body.form_name || req.body.fb_form_name,
      keyword: req.body.keyword || req.body.gclid || '',
      source_url: req.body.source_url || '',
      raw_source_payload: req.body
    }));

    await db.createActivity({
      lead_id: lead.id,
      type: 'lead_added',
      message: `New lead ${lead.first_name} ${lead.last_name} captured via ${publisher}${assignedCounselorId ? ' and auto-assigned' : ''}`
    });

    const task = await createAutomatedTaskForLead(lead, 'enquiry');
    if (task) {
      await db.createActivity({
        lead_id: lead.id,
        type: 'task_added',
        message: `Automation created follow-up: ${task.title}`
      });
    }

    if (lead.email) sendWelcomeEmail(lead).catch(() => {});

    logInboundCapture({
      publisher,
      source: publisher,
      student_name: `${lead.first_name} ${lead.last_name}`.trim(),
      status: 'captured',
      lead_id: lead.id,
      payload: req.body
    });

    res.status(201).json({ success: true, lead_id: lead.id, publisher, message: `Lead captured via ${publisher}` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
//  DASHBOARD STATS
// ============================================================

app.get('/api/dashboard/stats', requireAuth, async (req, res) => {
  try {
    // Role-specific scoping for dashboard metrics (Counselors see only their own leads, Admins see all)
    const filterCounselorId = req.user.role === 'counselor' ? req.user.counselor_id : req.query.counselor_id;
    let leads;
    if (filterCounselorId) {
      leads = await db.getLeads({ counselor_id: filterCounselorId });
    } else {
      leads = await db.getLeads({});
    }
    const counselors = await db.getCounselors();

    const totalLeads = leads.length;
    const activeApplications = leads.filter(l => ['application_submitted', 'documents_verified'].includes(l.stage)).length;
    const admissions = leads.filter(l => l.stage === 'admitted' || l.stage === 'enrolled').length;
    const conversionRate = totalLeads > 0 ? ((admissions / totalLeads) * 100).toFixed(1) : '0';

    const stageDistribution = {};
    leads.forEach(l => { stageDistribution[l.stage] = (stageDistribution[l.stage] || 0) + 1; });

    const sourceDistribution = {};
    leads.forEach(l => { sourceDistribution[l.source] = (sourceDistribution[l.source] || 0) + 1; });

    const priorityDistribution = { high: 0, medium: 0, low: 0 };
    leads.forEach(l => { if (priorityDistribution[l.priority] !== undefined) priorityDistribution[l.priority]++; });

    const months = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ label: d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }), year: d.getFullYear(), month: d.getMonth() });
    }

    const monthlyEnquiries = months.map(m => leads.filter(l => { const d = new Date(l.created_at); return d.getFullYear() === m.year && d.getMonth() === m.month; }).length);
    const monthlyAdmissions = months.map(m => leads.filter(l => { const d = new Date(l.updated_at); return d.getFullYear() === m.year && d.getMonth() === m.month && (l.stage === 'admitted' || l.stage === 'enrolled'); }).length);
    const monthlyEnrollments = months.map(m => leads.filter(l => { const d = new Date(l.updated_at); return d.getFullYear() === m.year && d.getMonth() === m.month && l.stage === 'enrolled'; }).length);

    const globalLeads = req.user.role === 'counselor' ? await db.getLeads({}) : leads;
    const counselorStats = counselors.map(c => {
      const assigned = globalLeads.filter(l => l.counselor_id === c.id).length;
      const converted = globalLeads.filter(l => l.counselor_id === c.id && (l.stage === 'admitted' || l.stage === 'enrolled')).length;
      return { ...c, leads_assigned: assigned, conversions: converted, active_leads: globalLeads.filter(l => l.counselor_id === c.id && !['admitted', 'enrolled'].includes(l.stage)).length };
    });

    res.json({
      scope: 'global',
      requestRole: req.user.role,
      requestCounselorId: req.user.counselor_id || null,
      totalLeads, activeApplications, admissions,
      conversionRate: parseFloat(conversionRate),
      stageDistribution, sourceDistribution, priorityDistribution,
      monthly: { labels: months.map(m => m.label), enquiries: monthlyEnquiries, admissions: monthlyAdmissions, enrollments: monthlyEnrollments },
      counselorStats
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
//  COUNSELORS (full CRUD)
// ============================================================

app.get('/api/counselors', requireAuth, async (req, res) => {
  try {
    const counselors = await db.getCounselors();
    const leads = await db.getLeads({});
    const enriched = counselors.map(c => {
      const assigned = leads.filter(l => l.counselor_id === c.id).length;
      const converted = leads.filter(l => l.counselor_id === c.id && (l.stage === 'admitted' || l.stage === 'enrolled')).length;
      const active = leads.filter(l => l.counselor_id === c.id && !['admitted', 'enrolled'].includes(l.stage)).length;
      return { ...c, leads_assigned: assigned, conversions: converted, active_leads: active };
    });
    res.json(enriched);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/counselors/:id', requireAuth, async (req, res) => {
  try {
    const counselor = await db.getCounselor(req.params.id);
    if (!counselor) return res.status(404).json({ error: 'Counselor not found' });
    res.json(counselor);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/counselors', requireAdmin, async (req, res) => {
  try {
    assertRequired(req.body, ['name']);
    const counselor = await db.createCounselor(req.body);
    res.status(201).json(counselor);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.put('/api/counselors/:id', requireAdmin, async (req, res) => {
  try {
    const updated = await db.updateCounselor(req.params.id, req.body);
    res.json(updated);
  } catch (error) {
    res.status(error.message === 'Counselor not found' ? 404 : 400).json({ error: error.message });
  }
});

app.delete('/api/counselors/:id', requireAdmin, async (req, res) => {
  try {
    await db.deleteCounselor(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ============================================================
//  COURSES (full CRUD)
// ============================================================

app.get('/api/courses', requireAuth, async (req, res) => {
  try {
    const courses = await db.getCourses();
    const leads = await db.getLeads({});
    const enriched = courses.map(c => ({ ...c, lead_count: leads.filter(l => l.course_id === c.id).length }));
    res.json(enriched);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/courses', requireAdmin, async (req, res) => {
  try {
    assertRequired(req.body, ['name']);
    const course = await db.createCourse(req.body);
    res.status(201).json(course);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.put('/api/courses/:id', requireAdmin, async (req, res) => {
  try {
    const course = await db.updateCourse(req.params.id, req.body);
    res.json(course);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/courses/:id', requireAdmin, async (req, res) => {
  try {
    await db.deleteCourse(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ============================================================
//  ACTIVITIES (Audit Log)
// ============================================================

app.get('/api/activities', requireAuth, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const activities = await db.getActivities(limit);
    const users = await getUsers();
    const userMap = Object.fromEntries(users.map(u => [u.id, u]));
    const dbData = getDB();
    const portalProfiles = dbData.portalProfiles || {};
    const enriched = activities.map(a => ({
      ...a,
      user_name: userMap[a.user_id]?.name || portalProfiles[a.user_id]?.name || (a.type === 'student_portal' ? 'Student' : 'System'),
      user_role: userMap[a.user_id]?.role || (portalProfiles[a.user_id] ? 'student' : (a.type === 'student_portal' ? 'student' : 'system'))
    }));
    res.json(enriched);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
//  TASKS / FOLLOW-UPS
// ============================================================

app.get('/api/tasks', requireAuth, async (req, res) => {
  try {
    const { lead_id, status } = req.query;
    const tasks = await db.getTasks({ lead_id, status });
    const leads = await db.getLeads();
    const leadMap = Object.fromEntries(leads.map(l => [l.id, l]));

    const enriched = tasks.map(t => ({
      ...t,
      lead_name: leadMap[t.lead_id] ? `${leadMap[t.lead_id].first_name} ${leadMap[t.lead_id].last_name}` : 'Unknown Lead'
    }));

    res.json(enriched);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/tasks', requireAuth, async (req, res) => {
  try {
    assertRequired(req.body, ['title', 'lead_id', 'due_date']);
    const task = await db.createTask({
      title: req.body.title,
      lead_id: req.body.lead_id,
      due_date: req.body.due_date,
      type: req.body.type || 'call',
      status: req.body.status || 'pending',
      notes: req.body.notes || ''
    });

    await db.createActivity({
      lead_id: task.lead_id,
      type: 'task_added',
      message: `New task added: ${task.title} (Due: ${new Date(task.due_date).toLocaleDateString('en-IN')})`
    });

    res.status(201).json(task);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.patch('/api/tasks/:id', requireAuth, async (req, res) => {
  try {
    const task = await db.updateTask(req.params.id, req.body);

    if (req.body.status === 'completed') {
      await db.createActivity({
        lead_id: task.lead_id,
        type: 'task_completed',
        message: `Task completed: ${task.title}`
      });
    }

    res.json(task);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.delete('/api/tasks/:id', requireAdmin, async (req, res) => {
  try {
    await db.deleteTask(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ============================================================
//  PIPELINE
// ============================================================

app.get('/api/pipeline', requireAuth, async (req, res) => {
  try {
    const filterCounselorId = req.user.role === 'counselor' ? req.user.counselor_id : undefined;
    const leads = await db.getLeads({ counselor_id: filterCounselorId });
    const counselors = await db.getCounselors();
    const courses = await db.getCourses();

    const counselorMap = Object.fromEntries(counselors.map(c => [c.id, c]));
    const courseMap = Object.fromEntries(courses.map(c => [c.id, c]));

    const stages = ['enquiry', 'counseling_scheduled', 'counseling_done', 'application_submitted', 'documents_verified', 'admitted', 'enrolled'];
    const pipeline = {};
    stages.forEach(stage => {
      pipeline[stage] = leads
        .filter(l => l.stage === stage)
        .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
        .map(l => ({
          ...l,
          name: `${l.first_name} ${l.last_name}`,
          counselor_name: counselorMap[l.counselor_id]?.name || 'Unassigned',
          course_name: courseMap[l.course_id]?.name || 'N/A'
        }));
    });

    res.json(pipeline);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
//  APPLICATIONS, QUERIES, PAYMENTS
// ============================================================

app.get('/api/applications', requireAuth, async (req, res) => {
  try {
    const items = await appStore.listApplications(req.user);
    res.json(items);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/applications/export/csv', requireAuth, async (req, res) => {
  try {
    const items = await appStore.listApplications(req.user);
    const headers = ['Student', 'Email', 'Course', 'Status', 'Docs', 'Counselor', 'Priority', 'Date'];
    const rows = items.map(i => [
      i.student_name, i.email || '', i.course_name || '',
      i.status, i.documents_status, i.counselor_name,
      i.priority, new Date(i.created_at).toLocaleDateString('en-IN')
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
    const csv = [headers.join(','), ...rows].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="applications.csv"');
    res.send(csv);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/applications', requireAuth, async (req, res) => {
  try {
    const item = await appStore.insertApplication(req.user, req.body);
    res.status(201).json(item);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- File Upload ---
app.post('/api/upload', requireAuth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file provided' });
    const fullUrl = `${req.protocol}://${req.get('host')}/uploads/documents/${req.file.filename}`;
    res.status(201).json({
      success: true,
      url: fullUrl,
      filename: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype
    });
  } catch (error) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large. Maximum size is 10MB.' });
    }
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/applications/:id', requireAuth, async (req, res) => {
  try {
    const item = await appStore.patchApplication(req.user, req.params.id, req.body);
    res.json(item);
  } catch (error) {
    const code = error.message === 'Application not found' ? 404 : error.message === 'Access denied' ? 403 : 500;
    res.status(code).json({ error: error.message });
  }
});

app.get('/api/queries', requireAuth, async (req, res) => {
  try {
    const items = await appStore.listQueries(req.user);
    res.json(items);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/queries', requireAuth, async (req, res) => {
  try {
    const item = await appStore.insertQuery(req.user, req.body);
    res.status(201).json(item);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/queries/:id', requireAuth, async (req, res) => {
  try {
    const item = await appStore.patchQuery(req.user, req.params.id, req.body);
    res.json(item);
  } catch (error) {
    const code = error.message === 'Query not found' ? 404 : error.message === 'Access denied' ? 403 : 500;
    res.status(code).json({ error: error.message });
  }
});

app.get('/api/payments', requireAuth, async (req, res) => {
  try {
    const items = await appStore.listPayments(req.user);
    res.json(items);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/payments/export/csv', requireAuth, async (req, res) => {
  try {
    const items = await appStore.listPayments(req.user);
    const headers = ['Student', 'Title', 'Amount', 'Status', 'Method', 'Due Date', 'Receipt No', 'Date'];
    const rows = items.map(i => [
      i.student_name, i.title, i.amount, i.status,
      i.method || '', i.due_date || '', i.receipt_no || '',
      new Date(i.created_at).toLocaleDateString('en-IN')
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
    const csv = [headers.join(','), ...rows].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="payments.csv"');
    res.send(csv);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/payments', requireAuth, async (req, res) => {
  try {
    if (req.user.role === 'student') return res.status(403).json({ error: 'Admin or counselor access required' });
    const item = await appStore.insertPayment(req.user, req.body);
    res.status(201).json(item);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/payments/:id', requireAuth, async (req, res) => {
  try {
    const item = await appStore.patchPayment(req.user, req.params.id, req.body);
    res.json(item);
  } catch (error) {
    const code = error.message === 'Payment not found' ? 404 : error.message === 'Access denied' ? 403 : 500;
    res.status(code).json({ error: error.message });
  }
});

// ============================================================
//  STUDENT PORTAL
// ============================================================

app.get('/api/portal/profile', requireAuth, async (req, res) => {
  try {
    if (req.user.role !== 'student') return res.status(403).json({ error: 'Student portal access required' });
    const profile = await appStore.getPortalProfileForUser(req.user);
    const course = profile.course_id ? await db.getCourse(profile.course_id) : null;
    res.json({
      ...profile,
      course_name: course?.name || 'Program not selected'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/portal/profile', requireAuth, async (req, res) => {
  try {
    if (req.user.role !== 'student') return res.status(403).json({ error: 'Student portal access required' });
    const next = await appStore.updatePortalProfile(req.user, req.body);
    
    // Notify counselor of significant student actions
    if (req.body.next_step && req.body.next_step !== 'Complete your profile') {
      const dbData = ensureMarketingModules();
      let title = 'Student Update';
      if (req.body.next_step.toLowerCase().includes('callback')) title = 'Callback Requested';
      if (req.body.next_step.toLowerCase().includes('application')) title = 'New Application Request';

      createNotificationEntry(dbData, {
        title,
        message: `${req.user.name}: ${req.body.next_step}`,
        channel: 'push',
        target_type: 'student_inbox'
      });
      saveDB(dbData);
    }

    res.json(next);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
//  USERS (admin only)
// ============================================================

app.get('/api/users', requireAdmin, async (req, res) => {
  try {
    res.json(await getUsers());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/users', requireAdmin, async (req, res) => {
  try {
    assertRequired(req.body, ['email', 'name', 'role']);
    const user = await createUser(req.body);
    res.status(201).json(user);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.put('/api/users/:id', requireAdmin, async (req, res) => {
  try {
    const user = await updateUser(req.params.id, req.body);
    res.json(user);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.delete('/api/users/:id', requireAdmin, async (req, res) => {
  try {
    await deleteUser(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ============================================================
//  SETTINGS (institute profile)
// ============================================================

app.get('/api/settings', requireAuth, async (req, res) => {
  try {
    const settings = await appStore.loadSettings();
    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/settings', requireAdmin, async (req, res) => {
  try {
    const settings = await appStore.storeSettings(req.body);
    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
//  FORMS & CAMPAIGNS (FormDesk / Campaign manager persistence)
// ============================================================

app.get('/api/form-templates', requireAuth, async (req, res) => {
  try {
    res.json(await appStore.listFormTemplates());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/form-templates', requireAdmin, async (req, res) => {
  try {
    const row = await appStore.insertFormTemplate(req.body);
    res.status(201).json(row);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/campaigns', requireAuth, async (req, res) => {
  try {
    res.json(await appStore.listCampaigns());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/campaigns', requireAdmin, async (req, res) => {
  try {
    const row = await appStore.insertCampaign(req.body);
    res.status(201).json(row);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ============================================================
//  MARKETING / COMMUNICATIONS
// ============================================================

function ensureMarketingModules() {
  const dbData = getDB();
  if (db.REAL_DATA_MODE) {
    for (const key of ['communicationTemplates', 'communicationCampaigns', 'callLogs', 'autoFollowUps', 'broadcastMessages', 'studentInbox', 'chatThreads', 'notificationCenter']) {
      if (!Array.isArray(dbData[key])) dbData[key] = [];
    }
    if (!dbData.communicationIntegrations || typeof dbData.communicationIntegrations !== 'object') {
      dbData.communicationIntegrations = {};
    }
    return dbData;
  }
  let changed = false;
  const now = new Date().toISOString();
  const leads = dbData.leads || [];
  const lead = leads[0] || {
    id: 'demo-student',
    first_name: 'krishna',
    last_name: 'jaiswal',
    email: 'student@demo.in',
    phone: '+91 90123 45678',
    city: 'Bareilly'
  };
  const leadName = `${lead.first_name || 'Aarav'} ${lead.last_name || 'Mehta'}`.trim();

  if (!dbData.communicationIntegrations) {
    dbData.communicationIntegrations = {
      email: { enabled: true, provider: 'SMTP relay', sender: 'admissions@rbmi.edu.in' },
      sms: { enabled: true, provider: 'MSG91', sender: 'RBMIAD' },
      whatsapp: { enabled: true, provider: 'WhatsApp Business Cloud', sender: '+91 581 250 0000' },
      ivr: { enabled: true, provider: 'Exotel', sender: 'IVR Queue A' },
      push: { enabled: true, provider: 'Firebase Cloud Messaging', sender: 'RBMI Hub App' }
    };
    changed = true;
  }

  if (!dbData.communicationTemplates || dbData.communicationTemplates.length === 0) {
    dbData.communicationTemplates = [
      {
        id: generateId(),
        name: 'Open House Invite',
        channel: 'email',
        category: 'campaign',
        subject: 'Join RBMI open house this Saturday',
        content: 'Hi {{name}}, visit {{campus}} this Saturday for our open house and course guidance session.',
        variables: ['name', 'campus'],
        active: true,
        created_at: now,
        updated_at: now
      },
      {
        id: generateId(),
        name: 'Callback Reminder',
        channel: 'sms',
        category: 'follow_up',
        subject: '',
        content: 'Hi {{name}}, our counselor will call you today regarding {{course}} admission.',
        variables: ['name', 'course'],
        active: true,
        created_at: now,
        updated_at: now
      },
      {
        id: generateId(),
        name: 'Document Nudge',
        channel: 'whatsapp',
        category: 'drip',
        subject: '',
        content: 'Hello {{name}}, please upload your pending documents to keep your admission moving.',
        variables: ['name'],
        active: true,
        created_at: now,
        updated_at: now
      }
    ];
    changed = true;
  }

  if (db.REAL_DATA_MODE) {
    if (!dbData.communicationCampaigns) dbData.communicationCampaigns = [];
    if (!dbData.callLogs) dbData.callLogs = [];
    if (!dbData.autoFollowUps) dbData.autoFollowUps = [];
    if (!dbData.broadcastMessages) dbData.broadcastMessages = [];
    if (!dbData.studentInbox) dbData.studentInbox = [];
    if (!dbData.chatThreads) dbData.chatThreads = [];
    if (!dbData.notificationCenter) dbData.notificationCenter = [];
    saveDB(dbData);
    return dbData;
  }

  if (!dbData.communicationCampaigns || dbData.communicationCampaigns.length === 0) {
    dbData.communicationCampaigns = [
      {
        id: generateId(),
        name: 'MBA Priority Outreach',
        channel: 'email',
        category: 'campaign',
        status: 'draft',
        audience: 'MBA prospects',
        audience_count: Math.max(1, leads.length || 1),
        template_id: dbData.communicationTemplates[0]?.id || null,
        subject: 'Admissions guidance for MBA applicants',
        message: 'Shortlist warm MBA leads for a counselor callback.',
        auto_followup: true,
        owner_id: reqUserFallbackId(),
        metrics: { delivered: 0, opened: 0, clicked: 0, replied: 0, failed: 0 },
        created_at: now,
        updated_at: now,
        sent_at: null
      },
      {
        id: generateId(),
        name: 'Application Deadline SMS',
        channel: 'sms',
        category: 'broadcast',
        status: 'scheduled',
        audience: 'All active leads',
        audience_count: Math.max(1, leads.length || 1),
        template_id: dbData.communicationTemplates[1]?.id || null,
        subject: '',
        message: 'Send deadline reminders for pending applicants.',
        auto_followup: false,
        owner_id: reqUserFallbackId(),
        metrics: { delivered: 0, opened: 0, clicked: 0, replied: 0, failed: 0 },
        created_at: now,
        updated_at: now,
        sent_at: null
      },
      {
        id: generateId(),
        name: 'Document Completion Drip',
        channel: 'whatsapp',
        category: 'drip',
        status: 'active',
        audience: 'Document pending students',
        audience_count: 1,
        template_id: dbData.communicationTemplates[2]?.id || null,
        subject: '',
        message: 'Automated nudges for pending document uploads.',
        auto_followup: true,
        owner_id: reqUserFallbackId(),
        metrics: { delivered: 12, opened: 10, clicked: 6, replied: 4, failed: 1 },
        created_at: now,
        updated_at: now,
        sent_at: now
      }
    ];
    changed = true;
  }

  if (!dbData.callLogs || dbData.callLogs.length === 0) {
    dbData.callLogs = [
      {
        id: generateId(),
        student_name: leadName,
        phone: lead.phone || '+91 90123 45678',
        direction: 'outbound',
        provider: 'Exotel',
        duration_seconds: 412,
        recording_url: 'https://recordings.rbmi.local/call-demo-001',
        summary: 'Discussed MBA admission process and scheduled callback.',
        status: 'completed',
        created_at: now
      }
    ];
    changed = true;
  }

  if (!dbData.autoFollowUps || dbData.autoFollowUps.length === 0) {
    dbData.autoFollowUps = [
      {
        id: generateId(),
        title: 'No response in 24 hours',
        trigger: 'lead_created',
        channel: 'sms',
        delay_hours: 24,
        status: 'active',
        template_id: dbData.communicationTemplates[1]?.id || null,
        created_at: now,
        updated_at: now
      }
    ];
    changed = true;
  }

  if (!dbData.broadcastMessages || dbData.broadcastMessages.length === 0) {
    dbData.broadcastMessages = [
      {
        id: generateId(),
        title: 'Scholarship Webinar Alert',
        channel: 'whatsapp',
        audience: 'All scholarship leads',
        message: 'Scholarship webinar starts at 5 PM. Join using the portal link.',
        status: 'sent',
        metrics: { reached: Math.max(1, leads.length || 1), engaged: Math.max(1, Math.floor((leads.length || 1) * 0.6)) },
        created_at: now,
        updated_at: now
      }
    ];
    changed = true;
  }

  if (!dbData.studentInbox || dbData.studentInbox.length === 0) {
    dbData.studentInbox = [
      {
        id: generateId(),
        student_name: leadName,
        channel: 'email',
        subject: 'Admission help required',
        message: 'Can I switch from BBA to MBA after counseling?',
        status: 'open',
        priority: 'high',
        created_at: now,
        updated_at: now
      }
    ];
    changed = true;
  }

  if (!dbData.chatThreads || dbData.chatThreads.length === 0) {
    dbData.chatThreads = [
      {
        id: generateId(),
        student_name: leadName,
        counselor_name: 'Neha Khan',
        status: 'active',
        last_message_at: now,
        messages: [
          {
            id: generateId(),
            sender: 'student',
            text: 'Hello, I need the fee structure for MBA.',
            created_at: now
          },
          {
            id: generateId(),
            sender: 'counselor',
            text: 'Sharing the updated fee structure and scholarship slab now.',
            created_at: now
          }
        ]
      }
    ];
    changed = true;
  }

  if (!dbData.notificationCenter || dbData.notificationCenter.length === 0) {
    dbData.notificationCenter = [
      {
        id: generateId(),
        title: 'Broadcast delivered',
        message: 'Scholarship webinar broadcast reached active leads.',
        channel: 'push',
        target_type: 'marketing',
        status: 'unread',
        created_at: now
      },
      {
        id: generateId(),
        title: 'Inbox waiting',
        message: `${leadName} is waiting for a counselor response.`,
        channel: 'email',
        target_type: 'student_inbox',
        status: 'unread',
        created_at: now
      }
    ];
    changed = true;
  }

  if (changed) saveDB(dbData);
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

function createNotificationEntry(dbData, payload) {
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

app.get('/api/marketing/overview', requireAuth, async (req, res) => {
  try {
    const dbData = ensureMarketingModules();
    res.json({
      integrations: dbData.communicationIntegrations,
      analytics: buildCampaignAnalytics(dbData),
      publishers: dbData.publishers || [],
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
});

app.get('/api/marketing/templates', requireAuth, (req, res) => {
  try {
    const dbData = ensureMarketingModules();
    res.json((dbData.communicationTemplates || []).sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at)));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/marketing/templates', requireAuth, (req, res) => {
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
});

app.put('/api/marketing/templates/:id', requireAuth, (req, res) => {
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
});

app.get('/api/marketing/campaigns', requireAuth, (req, res) => {
  try {
    const dbData = ensureMarketingModules();
    res.json((dbData.communicationCampaigns || []).sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at)));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/marketing/campaigns', requireAuth, (req, res) => {
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
});

app.put('/api/marketing/campaigns/:id', requireAuth, (req, res) => {
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
});

app.post('/api/marketing/campaigns/:id/launch', requireAuth, (req, res) => {
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
});

app.get('/api/marketing/integrations', requireAuth, (req, res) => {
  try {
    const dbData = ensureMarketingModules();
    res.json(dbData.communicationIntegrations);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/marketing/integrations', requireAuth, (req, res) => {
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
});

app.get('/api/marketing/call-logs', requireAuth, (req, res) => {
  try {
    const dbData = ensureMarketingModules();
    res.json((dbData.callLogs || []).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/marketing/call-logs', requireAuth, (req, res) => {
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
});

app.get('/api/marketing/followups', requireAuth, (req, res) => {
  try {
    const dbData = ensureMarketingModules();
    res.json((dbData.autoFollowUps || []).sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at)));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/marketing/followups', requireAuth, (req, res) => {
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
});

app.get('/api/marketing/broadcasts', requireAuth, (req, res) => {
  try {
    const dbData = ensureMarketingModules();
    res.json((dbData.broadcastMessages || []).sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at)));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/marketing/broadcasts', requireAuth, (req, res) => {
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
});

app.post('/api/marketing/broadcasts/:id/send', requireAuth, (req, res) => {
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
});

app.get('/api/marketing/inbox', requireAuth, (req, res) => {
  try {
    const dbData = ensureMarketingModules();
    res.json((dbData.studentInbox || []).sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at)));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/marketing/inbound-logs', requireAuth, async (req, res) => {
  try {
    const dbData = getDB();
    res.json(dbData.inboundLogs || []);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/marketing/publishers', requireAuth, async (req, res) => {
  try {
    const dbData = getDB();
    if (!dbData.publishers) {
      dbData.publishers = db.REAL_DATA_MODE ? [] : [
        { id: 'pub1', name: 'Shiksha.com', status: 'active', leads_captured: 124, last_sync: new Date().toISOString() },
        { id: 'pub2', name: 'CollegeDekho', status: 'active', leads_captured: 89, last_sync: new Date().toISOString() },
        { id: 'pub3', name: 'Facebook Ads', status: 'active', leads_captured: 245, last_sync: new Date().toISOString() },
        { id: 'pub4', name: 'JustDial', status: 'pending', leads_captured: 0, last_sync: null }
      ];
      saveDB(dbData);
    }
    res.json(dbData.publishers);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/marketing/auto-leads/simulate', requireAuth, async (req, res) => {
  if (db.REAL_DATA_MODE) {
    return res.status(403).json({ error: 'Lead simulation is disabled in real-data mode. Use a publisher webhook or add a lead manually.' });
  }
  try {
    const count = Math.min(12, Math.max(1, Number(req.body?.count || 5)));
    const publisherPool = ['Shiksha', 'CollegeDekho', 'Facebook Ads', 'Google Ads', 'JustDial', 'Website'];
    const courses = await db.getCourses();
    const sampleNames = [
      ['Riya', 'Sharma'], ['Aditya', 'Verma'], ['Sakshi', 'Gupta'], ['Mohit', 'Yadav'],
      ['Ishita', 'Khan'], ['Kunal', 'Singh'], ['Tanvi', 'Agarwal'], ['Nikhil', 'Mishra'],
      ['Priyanshi', 'Saxena'], ['Harsh', 'Tyagi'], ['Aman', 'Srivastava'], ['Megha', 'Joshi']
    ];
    const created = [];
    const duplicates = [];

    for (let i = 0; i < count; i += 1) {
      const publisher = publisherPool[i % publisherPool.length];
      const [first_name, last_name] = sampleNames[(Date.now() + i) % sampleNames.length];
      const course = courses[i % Math.max(1, courses.length)] || null;
      const phone = `+91 9${Math.floor(100000000 + Math.random() * 899999999)}`;
      const payload = {
        first_name,
        last_name,
        email: `${first_name}.${last_name}.${Date.now().toString().slice(-5)}@example.com`.toLowerCase(),
        phone,
        course: course?.code || course?.name || 'MBA',
        source: publisher,
        city: i % 2 ? 'Greater Noida' : 'Bareilly',
        campaign: i % 2 ? 'June admission search' : 'Scholarship lead form',
        medium: publisher.includes('Ads') ? 'Paid campaign' : 'Publisher API',
        keyword: i % 2 ? 'best college admission' : 'mba admission',
        notes: `Auto-synced from ${publisher} integration.`
      };

      const duplicate = await findDuplicateLead({ phone: payload.phone, email: payload.email });
      if (duplicate) {
        duplicates.push(duplicate.id);
        logInboundCapture({
          publisher,
          source: publisher,
          student_name: `${first_name} ${last_name}`,
          status: 'duplicate',
          lead_id: duplicate.id,
          reason: 'Auto-sync duplicate',
          payload
        });
        continue;
      }

      const assignedCounselorId = await assignLeastLoadedCounselor();
      const lead = await db.createLead(buildLeadPayload({
        ...payload,
        course_id: course?.id || null,
        counselor_id: assignedCounselorId,
        priority: i % 3 === 0 ? 'high' : 'medium',
        publisher,
        source_attribution: getSourceAttribution({ ...payload, publisher }),
        raw_source_payload: payload
      }));

      await db.createActivity({
        lead_id: lead.id,
        type: 'lead_added',
        message: `Auto-synced lead ${lead.first_name} ${lead.last_name} from ${publisher}.`
      });
      await createAutomatedTaskForLead(lead, 'enquiry');
      logInboundCapture({
        publisher,
        source: publisher,
        student_name: `${lead.first_name} ${lead.last_name}`.trim(),
        status: 'captured',
        lead_id: lead.id,
        payload
      });
      created.push(lead);
    }

    res.status(201).json({
      success: true,
      created: created.length,
      duplicates: duplicates.length,
      leads: created.map(item => ({ id: item.id, name: `${item.first_name} ${item.last_name}`, source: item.source }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/marketing/inbox', requireAuth, (req, res) => {
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
});

app.put('/api/marketing/inbox/:id', requireAuth, (req, res) => {
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
});

app.get('/api/marketing/chats', requireAuth, (req, res) => {
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
});

app.post('/api/marketing/chats', requireAuth, async (req, res) => {
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
});

app.post('/api/marketing/chats/:id/messages', requireAuth, (req, res) => {
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
});

app.get('/api/marketing/notifications', requireAuth, (req, res) => {
  try {
    const dbData = ensureMarketingModules();
    res.json((dbData.notificationCenter || []).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/marketing/notifications', requireAuth, (req, res) => {
  try {
    const dbData = ensureMarketingModules();
    const item = createNotificationEntry(dbData, req.body);
    saveDB(dbData);
    res.status(201).json(item);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/marketing/notifications/:id', requireAuth, (req, res) => {
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
});

// ============================================================
//  EMAIL
// ============================================================

app.get('/api/email/status', requireAdmin, (req, res) => {
  res.json({
    configured: isEmailConfigured(),
    sender: process.env.GMAIL_USER || null,
    message: isEmailConfigured()
      ? 'Email integration is active.'
      : 'Add GMAIL_USER and GMAIL_APP_PASSWORD to your .env file to enable emails.'
  });
});

app.post('/api/email/test', requireAdmin, async (req, res) => {
  const to = req.body?.to || req.user?.email;
  if (!to) return res.status(400).json({ error: 'Provide a "to" email address' });
  if (!isEmailConfigured()) {
    return res.status(400).json({ error: 'Email not configured. Add GMAIL_USER and GMAIL_APP_PASSWORD to .env' });
  }
  try {
    const result = await sendTestEmail(to);
    if (result.success) {
      res.json({ success: true, message: `Test email sent to ${to}` });
    } else {
      res.status(500).json({ error: result.error || 'Failed to send test email' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
//  FORM BUILDER ROUTES
// ============================================================

app.use('/api/forms', formBuilderRoutes);

// ============================================================
//  MOUNT FALLBACK ROUTER FOR ADDITIONAL CONTROLLERS
// ============================================================
app.use('/api', apiRouter);

// ============================================================
//  START
// ============================================================

// Export app for Vercel serverless deployment
export default app;

// Only listen when running locally (not on Vercel)
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`\n  RBMI CRM API Server running at http://localhost:${PORT}`);
    console.log(`  Webhook: POST http://localhost:${PORT}/api/webhook/lead`);
    console.log(`  Auth: POST http://localhost:${PORT}/api/auth/login`);
    if (db.USE_SUPABASE) console.log(`  Supabase session: POST http://localhost:${PORT}/api/auth/supabase`);
    if (isEmailConfigured()) {
      console.log(`  Email: ✅ Gmail SMTP active (${process.env.GMAIL_USER})`);
    } else {
      console.log(`  Email: ⚠️  Not configured — add GMAIL_USER + GMAIL_APP_PASSWORD to .env`);
    }
    startCronJobs();
    console.log('');
  });
}
