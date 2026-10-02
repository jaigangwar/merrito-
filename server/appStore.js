// ===== Application data: JSON fallback or Supabase =====
import {
  USE_SUPABASE,
  getServerSupabase,
  createActivity,
  getCourse,
  getCourses
} from './supabase.js';
import { getDB, saveDB, generateId } from './db.js';

let supabaseFallbackMode = false;

function sb() {
  const c = getServerSupabase();
  if (!c || supabaseFallbackMode) throw new Error('Supabase not configured');
  return c;
}

function nowIso() {
  return new Date().toISOString();
}

const REQUIRED_APPLICATION_DOCUMENTS = [
  'Class 10 marksheet',
  'Class 12 marksheet',
  'ID proof',
  'Entrance scorecard',
  'Passport photo'
];

function normalizeDocuments(documents = []) {
  const byName = new Map((Array.isArray(documents) ? documents : []).map(doc => [doc.name, doc]));
  return REQUIRED_APPLICATION_DOCUMENTS.map(name => {
    const existing = byName.get(name) || {};
    return {
      id: existing.id || generateId(),
      name,
      status: existing.status || (existing.file_name ? 'submitted' : 'missing'),
      file_name: existing.file_name || '',
      file_url: existing.file_url || '',
      remarks: existing.remarks || '',
      uploaded_at: existing.uploaded_at || null,
      reviewed_at: existing.reviewed_at || null
    };
  });
}

function getDocumentsStatus(documents = []) {
  const docs = normalizeDocuments(documents);
  if (docs.every(doc => doc.status === 'verified')) return 'verified';
  if (docs.some(doc => doc.status === 'rejected')) return 'rejected';
  if (docs.some(doc => doc.status === 'submitted')) return 'submitted';
  return 'pending';
}

function buildInstallments(amount, count = 1, firstDueDate = '') {
  const total = Number(amount || 0);
  const parts = Math.max(1, Number(count || 1));
  const base = Math.floor(total / parts);
  const remainder = total - base * parts;
  return Array.from({ length: parts }, (_, index) => {
    const due = firstDueDate ? new Date(firstDueDate) : new Date();
    due.setMonth(due.getMonth() + index);
    return {
      id: generateId(),
      title: parts === 1 ? 'Full payment' : `Installment ${index + 1}`,
      amount: base + (index === 0 ? remainder : 0),
      status: 'due',
      due_date: due.toISOString().slice(0, 10),
      paid_at: null,
      receipt_no: ''
    };
  });
}

function getPaymentStatus(installments = []) {
  if (!installments.length) return 'due';
  if (installments.every(item => item.status === 'paid')) return 'paid';
  if (installments.some(item => item.status === 'failed')) return 'failed';
  if (installments.some(item => item.status === 'paid')) return 'partial';
  return 'due';
}

function jsonEnsureAdmissions() {
  const dbData = getDB();
  if (!dbData.applications) dbData.applications = [];
  if (!dbData.queries) dbData.queries = [];
  if (!dbData.payments) dbData.payments = [];
  if (!dbData.portalProfiles) dbData.portalProfiles = {};
  if (!dbData.settings) dbData.settings = null;
  if (!dbData.form_templates) dbData.form_templates = [];
  if (!dbData.campaigns) dbData.campaigns = [];
  if (!dbData.letter_templates) dbData.letter_templates = [];
  if (!dbData.offer_letters) dbData.offer_letters = [];
  if (!dbData.workflow_rules) dbData.workflow_rules = [];
  saveDB(dbData);
  return dbData;
}

function logSupabaseFallback(label, error) {
  // Once the connection is known to be unavailable, keep subsequent requests
  // on the local store instead of retrying a slow network call on every page.
  supabaseFallbackMode = true;
  console.warn(`Supabase ${label} failed, using local JSON fallback:`, error?.message || error);
}

function localApplications(reqUser) {
  const dbData = jsonEnsureAdmissions();
  let items = dbData.applications || [];
  if (reqUser?.role === 'student') items = items.filter(item => item.user_id === reqUser.id);
  return items.map(item => enrichApplication(item, dbData.courses || [])).sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
}

function localQueries(reqUser) {
  const dbData = jsonEnsureAdmissions();
  let items = dbData.queries || [];
  if (reqUser?.role === 'student') items = items.filter(item => item.user_id === reqUser.id);
  return items.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
}

function localPayments(reqUser) {
  const dbData = jsonEnsureAdmissions();
  let items = dbData.payments || [];
  if (reqUser?.role === 'student') items = items.filter(item => item.user_id === reqUser.id);
  return items.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
}

export function getDefaultSettings() {
  return {
    institute_name: 'Rakshpal Bahadur Management Institute',
    short_name: 'RBMI',
    email: 'admissions@rbmi.edu.in',
    phone: '+91 581 250 0000',
    address: 'Pilibhit Bypass Road, Bareilly, Uttar Pradesh - 243006',
    website: 'https://www.rbmi.edu.in',
    academic_year: '2025-2026',
    city: 'Bareilly',
    state: 'Uttar Pradesh'
  };
}

export async function loadSettings() {
  if (USE_SUPABASE) {
    try {
      const { data, error } = await sb().from('institute_settings').select('data').eq('id', 'main').maybeSingle();
      if (error) throw error;
      const base = getDefaultSettings();
      return { ...base, ...(data?.data || {}) };
    } catch (error) {
      console.warn('Supabase settings read failed, using local fallback:', error.message);
    }
  }
  const dbData = getDB();
  return { ...getDefaultSettings(), ...(dbData.settings || {}) };
}

export async function storeSettings(partial) {
  const merged = { ...(await loadSettings()), ...partial };
  if (USE_SUPABASE) {
    try {
      const { error } = await sb().from('institute_settings').upsert({
        id: 'main',
        data: merged,
        updated_at: nowIso()
      }, { onConflict: 'id' });
      if (error) throw error;
      return merged;
    } catch (error) {
      console.warn('Supabase settings write failed, saving locally instead:', error.message);
    }
  }
  const dbData = getDB();
  dbData.settings = merged;
  saveDB(dbData);
  return merged;
}

export async function listLetterTemplates() {
  if (USE_SUPABASE) {
    try {
      const { data, error } = await sb().from('letter_templates').select('*').order('updated_at', { ascending: false });
      if (error) throw error;
      return data || [];
    } catch (error) {
      logSupabaseFallback('letter templates read', error);
    }
  }
  const dbData = jsonEnsureAdmissions();
  return [...(dbData.letter_templates || [])].sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
}

export async function insertLetterTemplate(body) {
  const row = {
    id: generateId(),
    name: body.name || 'Untitled template',
    content: body.content || '',
    variables: body.variables || [],
    created_at: nowIso(),
    updated_at: nowIso()
  };
  if (USE_SUPABASE && !supabaseFallbackMode) {
    try {
      const { data, error } = await sb().from('letter_templates').insert([row]).select().single();
      if (error) throw error;
      return data;
    } catch (error) {
      logSupabaseFallback('letter template write', error);
    }
  }
  const dbData = jsonEnsureAdmissions();
  dbData.letter_templates.unshift(row);
  saveDB(dbData);
  return row;
}

export async function patchLetterTemplate(id, body) {
  if (USE_SUPABASE && !supabaseFallbackMode) {
    const { data, error } = await sb().from('letter_templates').update({ ...body, updated_at: nowIso() }).eq('id', id).select().single();
    if (error) throw error;
    return data;
  }
  const dbData = jsonEnsureAdmissions();
  const idx = dbData.letter_templates.findIndex(t => t.id === id);
  if (idx === -1) throw new Error('Template not found');
  dbData.letter_templates[idx] = { ...dbData.letter_templates[idx], ...body, updated_at: nowIso() };
  saveDB(dbData);
  return dbData.letter_templates[idx];
}

export async function listOfferLetters(applicationId = null) {
  if (USE_SUPABASE) {
    try {
      let q = sb().from('offer_letters').select('*').order('created_at', { ascending: false });
      if (applicationId) q = q.eq('application_id', applicationId);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    } catch (error) {
      logSupabaseFallback('offer letters read', error);
    }
  }
  const dbData = jsonEnsureAdmissions();
  let items = dbData.offer_letters || [];
  if (applicationId) items = items.filter(l => l.application_id === applicationId);
  return [...items].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

export async function generateOfferLetter(applicationId, templateId) {
  const courses = await getCourses();
  const dbData = jsonEnsureAdmissions();
  
  let application;
  if (USE_SUPABASE) {
    const { data, error } = await sb().from('applications').select('*').eq('id', applicationId).single();
    if (error) throw error;
    application = data;
  } else {
    application = dbData.applications.find(a => a.id === applicationId);
  }
  if (!application) throw new Error('Application not found');

  let template;
  if (USE_SUPABASE) {
    const { data, error } = await sb().from('letter_templates').select('*').eq('id', templateId).single();
    if (error) throw error;
    template = data;
  } else {
    template = dbData.letter_templates.find(t => t.id === templateId);
  }
  if (!template) throw new Error('Template not found');

  const course = courses.find(c => c.id === application.course_id);
  const now = new Date();
  const dueDate = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000).toLocaleDateString('en-IN'); // 15 days later

  let content = template.content;
  content = content.replace(/\{\{name\}\}/g, application.student_name);
  content = content.replace(/\{\{course\}\}/g, course?.name || 'Selected Program');
  content = content.replace(/\{\{due_date\}\}/g, dueDate);

  const row = {
    id: generateId(),
    application_id: applicationId,
    template_id: templateId,
    content,
    status: 'generated',
    created_at: nowIso()
  };

  if (USE_SUPABASE && !supabaseFallbackMode) {
    try {
      const { data, error } = await sb().from('offer_letters').insert([row]).select().single();
      if (error) throw error;
      return data;
    } catch (error) {
      logSupabaseFallback('offer letter write', error);
    }
  }
  dbData.offer_letters.unshift(row);
  saveDB(dbData);
  return row;
}


export async function getPortalProfileForUser(user) {
  if (USE_SUPABASE && !supabaseFallbackMode) {
    try {
      const { data, error } = await sb().from('portal_profiles').select('*').eq('user_id', user.id).maybeSingle();
      if (error && error.code !== 'PGRST116') throw error;
      if (data) return data;
      const profile = {
        user_id: user.id,
        name: user.name,
        email: user.email,
        phone: '',
        city: '',
        course_id: null,
        stage: 'enquiry',
        counselor_name: 'Admissions team',
        readiness: 35,
        next_step: 'Complete your profile',
        fee_due: '0',
        scholarship: 'Not reviewed yet',
        branch: user.branch || 'bareilly',
        updated_at: nowIso()
      };
      const { error: insErr } = await sb().from('portal_profiles').insert([profile]);
      if (insErr) throw insErr;
      return profile;
    } catch (error) {
      logSupabaseFallback('portal profile read', error);
    }
  }

  const dbData = getDB();
  jsonEnsureAdmissions();
  if (!dbData.portalProfiles) dbData.portalProfiles = {};
  let profile = dbData.portalProfiles[user.id];
  if (!profile) {
    profile = {
      user_id: user.id,
      name: user.name,
      email: user.email,
      phone: '',
      city: '',
      course_id: null,
      stage: 'enquiry',
      counselor_name: 'Admissions team',
      readiness: 35,
      next_step: 'Complete your profile',
      fee_due: '0',
      scholarship: 'Not reviewed yet',
      branch: user.branch || 'bareilly',
      updated_at: nowIso()
    };
    dbData.portalProfiles[user.id] = profile;
    saveDB(dbData);
  }
  return profile;
}

export async function updatePortalProfile(user, body) {
  const current = await getPortalProfileForUser(user);
  const allowed = ['name', 'phone', 'city', 'course_id', 'next_step', 'scholarship', 'stage'];
  const updates = {};
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(body, key)) updates[key] = body[key];
  }
  const next = { ...current, ...updates, updated_at: nowIso() };

  if (USE_SUPABASE && !supabaseFallbackMode) {
    try {
      const { error } = await sb().from('portal_profiles').upsert(next, { onConflict: 'user_id' });
      if (error) throw error;
    } catch (error) {
      logSupabaseFallback('portal profile write', error);
      const dbData = getDB();
      if (!dbData.portalProfiles) dbData.portalProfiles = {};
      dbData.portalProfiles[user.id] = next;
      saveDB(dbData);
    }
  } else {
    const dbData = getDB();
    if (!dbData.portalProfiles) dbData.portalProfiles = {};
    dbData.portalProfiles[user.id] = next;
    saveDB(dbData);
  }

  let actionDesc = 'updated profile';
  if (body.next_step) {
    if (body.next_step.toLowerCase().includes('callback')) actionDesc = 'requested a callback';
    else if (body.next_step.toLowerCase().includes('application')) actionDesc = 'requested a new application';
    else actionDesc = `updated status to "${body.next_step}"`;
  }

  await createActivity({
    user_id: user.id,
    type: 'student_portal',
    message: `${next.name || user.name} ${actionDesc}`
  });

  const course = next.course_id ? await getCourse(next.course_id) : null;
  return { ...next, course_name: course?.name || 'Program not selected' };
}

function enrichApplication(item, courses) {
  const course = courses.find(c => c.id === item.course_id);
  const documents = normalizeDocuments(item.documents);
  return { ...item, documents, documents_status: getDocumentsStatus(documents), course_name: course?.name || 'Program not selected' };
}

export async function listApplications(reqUser) {
  const courses = await getCourses();
  if (USE_SUPABASE) {
    try {
      const { data, error } = await sb().from('applications').select('*').order('updated_at', { ascending: false });
      if (error) throw error;
      let items = data || [];
      if (reqUser.role === 'student') items = items.filter(item => item.user_id === reqUser.id);
      return items.map(item => enrichApplication(item, courses));
    } catch (error) {
      logSupabaseFallback('applications read', error);
    }
  }
  const dbData = jsonEnsureAdmissions();
  let items = dbData.applications || [];
  if (reqUser.role === 'student') items = items.filter(item => item.user_id === reqUser.id);
  return items.map(item => enrichApplication(item, courses)).sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
}

export async function insertApplication(reqUser, body) {
  const profile = reqUser.role === 'student' ? await getPortalProfileForUser(reqUser) : null;
  const item = {
    id: generateId(),
    user_id: reqUser.role === 'student' ? reqUser.id : body.user_id || null,
    student_name: body.student_name || profile?.name || reqUser.name,
    email: body.email || profile?.email || reqUser.email,
    course_id: body.course_id || profile?.course_id || null,
    status: body.status || 'submitted',
    documents: normalizeDocuments(body.documents),
    documents_status: getDocumentsStatus(body.documents),
    counselor_name: body.counselor_name || profile?.counselor_name || 'Admissions team',
    priority: body.priority || 'medium',
    created_at: nowIso(),
    updated_at: nowIso()
  };

  if (USE_SUPABASE && !supabaseFallbackMode) {
    try {
      const { data, error } = await sb().from('applications').insert([item]).select().single();
      if (error) throw error;
      const courses = await getCourses();
      return enrichApplication(data, courses);
    } catch (error) {
      logSupabaseFallback('application write', error);
    }
  }
  const dbData = jsonEnsureAdmissions();
  dbData.applications.unshift(item);
  saveDB(dbData);
  const courses = await getCourses();
  return enrichApplication(item, courses);
}

export async function patchApplication(reqUser, id, body) {
  let oldStatus;
  if (USE_SUPABASE && !supabaseFallbackMode) {
    const { data: row, error: fe } = await sb().from('applications').select('*').eq('id', id).single();
    if (fe || !row) throw new Error('Application not found');
    oldStatus = row.status;
    if (reqUser.role === 'student' && row.user_id !== reqUser.id) throw new Error('Access denied');
    const allowed = reqUser.role === 'student' ? ['documents'] : ['status', 'documents', 'documents_status', 'counselor_name', 'priority'];
    const updates = {};
    for (const key of allowed) if (Object.prototype.hasOwnProperty.call(body, key)) updates[key] = body[key];
    if (updates.documents) {
      updates.documents = normalizeDocuments(updates.documents);
      updates.documents_status = getDocumentsStatus(updates.documents);
    }
    const { data, error } = await sb()
      .from('applications')
      .update({ ...updates, updated_at: nowIso() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    
    if (updates.status && updates.status !== oldStatus) {
      await triggerWorkflows('application_status_changed', { application: data, status: updates.status });
    }

    const courses = await getCourses();
    return enrichApplication(data, courses);
  }

  const dbData = jsonEnsureAdmissions();
  const idx = dbData.applications.findIndex(item => item.id === id);
  if (idx === -1) throw new Error('Application not found');
  const item = dbData.applications[idx];
  oldStatus = item.status;
  if (reqUser.role === 'student' && item.user_id !== reqUser.id) throw new Error('Access denied');
  const allowed = reqUser.role === 'student' ? ['documents'] : ['status', 'documents', 'documents_status', 'counselor_name', 'priority'];
  const updates = {};
  for (const key of allowed) if (Object.prototype.hasOwnProperty.call(body, key)) updates[key] = body[key];
  if (updates.documents) {
    updates.documents = normalizeDocuments(updates.documents);
    updates.documents_status = getDocumentsStatus(updates.documents);
  }
  dbData.applications[idx] = { ...item, ...updates, updated_at: nowIso() };
  saveDB(dbData);

  if (updates.status && updates.status !== oldStatus) {
    await triggerWorkflows('application_status_changed', { application: dbData.applications[idx], status: updates.status });
  }

  const courses = await getCourses();
  return enrichApplication(dbData.applications[idx], courses);
}

// Safe condition evaluator — replaces dangerous eval()
function evaluateCondition(condition, context) {
  if (!condition || typeof condition !== 'string') return false;

  const condStr = condition.trim();

  // Support: "status === 'admitted'" or "status == 'admitted'"
  const eqMatch = condStr.match(/^(\w+)\s*={2,3}\s*['"](.+)['"]$/);
  if (eqMatch) {
    return String(context[eqMatch[1]] || '') === eqMatch[2];
  }

  // Support: "status !== 'rejected'"
  const neqMatch = condStr.match(/^(\w+)\s*!==?\s*['"](.+)['"]$/);
  if (neqMatch) {
    return String(context[neqMatch[1]] || '') !== neqMatch[2];
  }

  // Support: "status.includes('admit')"
  const inclMatch = condStr.match(/^(\w+)\.includes\(['"](.+)['"]\)$/);
  if (inclMatch) {
    return String(context[inclMatch[1]] || '').includes(inclMatch[2]);
  }

  // Support simple truthy check: "status"
  if (/^\w+$/.test(condStr)) {
    return !!context[condStr];
  }

  // Default: condition not understood, don't match
  console.warn(`Workflow condition not recognized: "${condition}"`);
  return false;
}

async function triggerWorkflows(trigger, context) {
  const rules = await listWorkflowRules();
  const activeRules = rules.filter(r => r.active && r.trigger === trigger);

  for (const rule of activeRules) {
    let match = false;
    try {
      if (rule.condition) {
        // Safe condition evaluation — NO eval() to prevent RCE
        match = evaluateCondition(rule.condition, context);
      } else {
        match = true;
      }
    } catch (e) {
      console.error('Workflow condition error:', e);
    }

    if (match) {
      if (rule.action === 'send_offer_letter' && rule.template_id && context.application) {
        try {
          await generateOfferLetter(context.application.id, rule.template_id);
          await createActivity({
            user_id: context.application.user_id,
            type: 'workflow',
            message: `Workflow "${rule.name}" triggered: Offer letter generated.`
          });
        } catch (e) {
          console.error('Workflow action error:', e);
        }
      }
    }
  }
}


export async function listQueries(reqUser) {
  if (USE_SUPABASE) {
    try {
      const { data, error } = await sb().from('queries').select('*').order('updated_at', { ascending: false });
      if (error) throw error;
      let items = data || [];
      if (reqUser.role === 'student') items = items.filter(item => item.user_id === reqUser.id);
      return items;
    } catch (error) {
      logSupabaseFallback('queries read', error);
    }
  }
  return localQueries(reqUser);
}

export async function insertQuery(reqUser, body) {
  const item = {
    id: generateId(),
    user_id: reqUser.role === 'student' ? reqUser.id : body.user_id || null,
    student_name: body.student_name || reqUser.name,
    subject: body.subject || 'Admission query',
    category: body.category || 'General',
    status: 'open',
    priority: body.priority || 'medium',
    message: body.message || '',
    response: '',
    created_at: nowIso(),
    updated_at: nowIso()
  };
  if (USE_SUPABASE && !supabaseFallbackMode) {
    try {
      const { data, error } = await sb().from('queries').insert([item]).select().single();
      if (error) throw error;
      return data;
    } catch (error) {
      logSupabaseFallback('query write', error);
    }
  }
  const dbData = jsonEnsureAdmissions();
  dbData.queries.unshift(item);
  saveDB(dbData);
  return item;
}

export async function patchQuery(reqUser, id, body) {
  if (USE_SUPABASE && !supabaseFallbackMode) {
    const { data: row, error: fe } = await sb().from('queries').select('*').eq('id', id).single();
    if (fe || !row) throw new Error('Query not found');
    if (reqUser.role === 'student' && row.user_id !== reqUser.id) throw new Error('Access denied');
    const allowed = reqUser.role === 'student' ? ['message'] : ['status', 'priority', 'response'];
    const updates = {};
    for (const key of allowed) if (Object.prototype.hasOwnProperty.call(body, key)) updates[key] = body[key];
    const { data, error } = await sb()
      .from('queries')
      .update({ ...updates, updated_at: nowIso() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }
  const dbData = jsonEnsureAdmissions();
  const idx = dbData.queries.findIndex(item => item.id === id);
  if (idx === -1) throw new Error('Query not found');
  const item = dbData.queries[idx];
  if (reqUser.role === 'student' && item.user_id !== reqUser.id) throw new Error('Access denied');
  const allowed = reqUser.role === 'student' ? ['message'] : ['status', 'priority', 'response'];
  const updates = {};
  for (const key of allowed) if (Object.prototype.hasOwnProperty.call(body, key)) updates[key] = body[key];
  dbData.queries[idx] = { ...item, ...updates, updated_at: nowIso() };
  saveDB(dbData);
  return dbData.queries[idx];
}

export async function listPayments(reqUser) {
  if (USE_SUPABASE) {
    try {
      const { data, error } = await sb().from('payments').select('*').order('updated_at', { ascending: false });
      if (error) throw error;
      let items = data || [];
      if (reqUser.role === 'student') items = items.filter(item => item.user_id === reqUser.id);
      return items;
    } catch (error) {
      logSupabaseFallback('payments read', error);
    }
  }
  return localPayments(reqUser);
}

export async function insertPayment(reqUser, body) {
  const installments = Array.isArray(body.installments) && body.installments.length
    ? body.installments
    : buildInstallments(body.amount || 0, body.installment_count || 1, body.due_date || '');
  const item = {
    id: generateId(),
    user_id: body.user_id || null,
    student_name: body.student_name || 'Student',
    title: body.title || 'Admission fee',
    amount: Number(body.amount || 0),
    status: body.status || getPaymentStatus(installments),
    method: body.method || 'Online',
    due_date: body.due_date || '',
    receipt_no: body.receipt_no || '',
    installments,
    created_at: nowIso(),
    updated_at: nowIso()
  };
  if (USE_SUPABASE && !supabaseFallbackMode) {
    try {
      const { data, error } = await sb().from('payments').insert([item]).select().single();
      if (error) throw error;
      return data;
    } catch (error) {
      logSupabaseFallback('payment write', error);
    }
  }
  const dbData = jsonEnsureAdmissions();
  dbData.payments.unshift(item);
  saveDB(dbData);
  return item;
}

export async function patchPayment(reqUser, id, body) {
  if (USE_SUPABASE && !supabaseFallbackMode) {
    const { data: row, error: fe } = await sb().from('payments').select('*').eq('id', id).single();
    if (fe || !row) throw new Error('Payment not found');
    if (reqUser.role === 'student' && row.user_id !== reqUser.id) throw new Error('Access denied');
    const allowed = reqUser.role === 'student' ? ['status', 'method', 'installments'] : ['status', 'method', 'receipt_no', 'amount', 'due_date', 'title', 'installments'];
    const updates = {};
    for (const key of allowed) if (Object.prototype.hasOwnProperty.call(body, key)) updates[key] = body[key];
    if (updates.installments) updates.status = getPaymentStatus(updates.installments);
    if (updates.status === 'paid' && !updates.receipt_no && !row.receipt_no) {
      updates.receipt_no = `RBMI-${Date.now().toString().slice(-6)}`;
    }
    const { data, error } = await sb()
      .from('payments')
      .update({ ...updates, updated_at: nowIso() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }
  const dbData = jsonEnsureAdmissions();
  const idx = dbData.payments.findIndex(item => item.id === id);
  if (idx === -1) throw new Error('Payment not found');
  const item = dbData.payments[idx];
  if (reqUser.role === 'student' && item.user_id !== reqUser.id) throw new Error('Access denied');
  const allowed = reqUser.role === 'student' ? ['status', 'method', 'installments'] : ['status', 'method', 'receipt_no', 'amount', 'due_date', 'title', 'installments'];
  const updates = {};
  for (const key of allowed) if (Object.prototype.hasOwnProperty.call(body, key)) updates[key] = body[key];
  if (updates.installments) updates.status = getPaymentStatus(updates.installments);
  if (updates.status === 'paid' && !updates.receipt_no && !item.receipt_no) {
    updates.receipt_no = `RBMI-${Date.now().toString().slice(-6)}`;
  }
  dbData.payments[idx] = { ...item, ...updates, updated_at: nowIso() };
  saveDB(dbData);
  return dbData.payments[idx];
}

export async function listFormTemplates() {
  if (USE_SUPABASE) {
    try {
      const { data, error } = await sb().from('form_templates').select('*').order('updated_at', { ascending: false });
      if (error) throw error;
      return data || [];
    } catch (error) {
      logSupabaseFallback('form templates read', error);
    }
  }
  const dbData = jsonEnsureAdmissions();
  return [...(dbData.form_templates || [])].sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
}

export async function insertFormTemplate(body) {
  const row = {
    id: generateId(),
    name: body.name || 'Untitled form',
    purpose: body.purpose || 'Lead capture',
    status: body.status || 'draft',
    branch: body.branch || '',
    created_at: nowIso(),
    updated_at: nowIso()
  };
  if (USE_SUPABASE && !supabaseFallbackMode) {
    try {
      const { data, error } = await sb().from('form_templates').insert([row]).select().single();
      if (error) throw error;
      return data;
    } catch (error) {
      logSupabaseFallback('form template write', error);
    }
  }
  const dbData = jsonEnsureAdmissions();
  dbData.form_templates.unshift(row);
  saveDB(dbData);
  return row;
}

export async function listCampaigns() {
  if (USE_SUPABASE) {
    try {
      const { data, error } = await sb().from('campaigns').select('*').order('updated_at', { ascending: false });
      if (error) throw error;
      return data || [];
    } catch (error) {
      logSupabaseFallback('campaigns read', error);
    }
  }
  const dbData = jsonEnsureAdmissions();
  return [...(dbData.campaigns || [])].sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
}

export async function insertCampaign(body) {
  const row = {
    id: generateId(),
    name: body.name || 'Untitled campaign',
    channel: body.channel || 'Other',
    status: body.status || 'draft',
    budget: body.budget || '',
    notes: body.notes || '',
    created_at: nowIso(),
    updated_at: nowIso()
  };
  if (USE_SUPABASE && !supabaseFallbackMode) {
    try {
      const { data, error } = await sb().from('campaigns').insert([row]).select().single();
      if (error) throw error;
      return data;
    } catch (error) {
      logSupabaseFallback('campaign write', error);
    }
  }
  const dbData = jsonEnsureAdmissions();
  dbData.campaigns.unshift(row);
  saveDB(dbData);
  return row;
}

export async function listWorkflowRules() {
  if (USE_SUPABASE) {
    try {
      const { data, error } = await sb().from('workflow_rules').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    } catch (error) {
      logSupabaseFallback('workflow rules read', error);
    }
  }
  const dbData = jsonEnsureAdmissions();
  return [...(dbData.workflow_rules || [])].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

export async function insertWorkflowRule(body) {
  const row = {
    id: generateId(),
    name: body.name || 'Untitled rule',
    trigger: body.trigger || '',
    condition: body.condition || '',
    action: body.action || '',
    template_id: body.template_id || null,
    active: body.active !== false,
    flow_data: body.flow_data || null,
    created_at: nowIso(),
    updated_at: nowIso()
  };
  if (USE_SUPABASE && !supabaseFallbackMode) {
    try {
      const { data, error } = await sb().from('workflow_rules').insert([row]).select().single();
      if (error) throw error;
      return data;
    } catch (error) {
      logSupabaseFallback('workflow rule write', error);
    }
  }
  const dbData = jsonEnsureAdmissions();
  dbData.workflow_rules.unshift(row);
  saveDB(dbData);
  return row;
}

export async function patchWorkflowRule(id, body) {
  if (USE_SUPABASE && !supabaseFallbackMode) {
    const { data, error } = await sb().from('workflow_rules').update({ ...body, updated_at: nowIso() }).eq('id', id).select().single();
    if (error) throw error;
    return data;
  }
  const dbData = jsonEnsureAdmissions();
  const idx = dbData.workflow_rules.findIndex(r => r.id === id);
  if (idx === -1) throw new Error('Rule not found');
  dbData.workflow_rules[idx] = { ...dbData.workflow_rules[idx], ...body, updated_at: nowIso() };
  saveDB(dbData);
  return dbData.workflow_rules[idx];
}
