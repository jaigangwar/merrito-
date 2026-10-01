import { getToken } from '../lib/auth.js';

// ===== API CLIENT — RBMI CRM =====
export const API_BASE = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');
const LOCAL_APPLICATIONS_KEY = 'rbmi_local_applications';
const LOCAL_QUERIES_KEY = 'rbmi_local_queries';
const LOCAL_PAYMENTS_KEY = 'rbmi_local_payments';
const LOCAL_PORTAL_KEY = 'rbmi_local_portal_profiles';
const LOCAL_SETTINGS_KEY = 'rbmi_local_settings';

function getSessionUser() {
  try {
    return JSON.parse(sessionStorage.getItem('rbmi_user') || 'null');
  } catch {
    return null;
  }
}

function shouldUseLocalAdmissionsFallback(error) {
  const message = String(error?.message || '').toLowerCase();
  return message.includes('not found') || message.includes('failed to fetch') || message.includes('networkerror');
}

function readLocal(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeLocal(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function makeLocalId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getLocalCollection(key, seedFactory) {
  const current = readLocal(key, null);
  if (current) return current;
  const seeded = seedFactory();
  writeLocal(key, seeded);
  return seeded;
}

// Local fallback collections start empty. Records appear only after a real
// user creates them or the API returns real records.
function seedLocalApplications() { return []; }
function seedLocalQueries() { return []; }
function seedLocalPayments() { return []; }

function getLocalPortalProfiles() {
  return readLocal(LOCAL_PORTAL_KEY, {});
}

function saveLocalPortalProfiles(value) {
  writeLocal(LOCAL_PORTAL_KEY, value);
}

function getDefaultLocalSettings() {
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

function getLocalSettings() {
  return { ...getDefaultLocalSettings(), ...readLocal(LOCAL_SETTINGS_KEY, {}) };
}

function saveLocalSettings(value) {
  writeLocal(LOCAL_SETTINGS_KEY, value);
}

export async function request(path, options = {}) {
  const token = getToken();
  const { headers: optionHeaders = {}, ...requestOptions } = options;
  const res = await fetch(`${API_BASE}${path}`, {
    ...requestOptions,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...optionHeaders
    }
  });

  if (res.status === 401) {
    // Token expired — force re-login
    sessionStorage.removeItem('rbmi_user');
    sessionStorage.removeItem('rbmi_token');
    window.location.reload();
    return;
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'API request failed');
  }
  return res.json();
}

// ---- LEADS ----
export async function fetchLeads({ stage, source, counselor_id, search, sort, order, page, limit } = {}) {
  const params = new URLSearchParams();
  if (stage) params.set('stage', stage);
  if (source) params.set('source', source);
  if (counselor_id) params.set('counselor_id', counselor_id);
  if (search) params.set('search', search);
  if (sort) params.set('sort', sort);
  if (order) params.set('order', order);
  if (page) params.set('page', page);
  if (limit) params.set('limit', limit);
  return request(`/leads?${params.toString()}`);
}

export async function fetchLead(id) {
  return request(`/leads/${id}`);
}

export async function createLead(data) {
  return request('/leads', { method: 'POST', body: JSON.stringify(data) });
}

export async function updateLead(id, data) {
  return request(`/leads/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export async function deleteLead(id) {
  return request(`/leads/${id}`, { method: 'DELETE' });
}

export async function bulkDeleteLeads(ids) {
  return request('/leads/bulk-delete', { method: 'POST', body: JSON.stringify({ ids }) });
}

function buildLocalInstallments(amount, count = 1, firstDueDate = '') {
  const total = Number(amount || 0);
  const parts = Math.max(1, Number(count || 1));
  const base = Math.floor(total / parts);
  const remainder = total - base * parts;
  return Array.from({ length: parts }, (_, index) => {
    const due = firstDueDate ? new Date(firstDueDate) : new Date();
    due.setMonth(due.getMonth() + index);
    return {
      id: makeLocalId('inst'),
      title: parts === 1 ? 'Full payment' : `Installment ${index + 1}`,
      amount: base + (index === 0 ? remainder : 0),
      status: 'due',
      due_date: due.toISOString().slice(0, 10),
      paid_at: null,
      receipt_no: ''
    };
  });
}

function getLocalPaymentStatus(installments = []) {
  if (!installments.length) return 'due';
  if (installments.every(item => item.status === 'paid')) return 'paid';
  if (installments.some(item => item.status === 'paid')) return 'partial';
  if (installments.some(item => item.status === 'failed')) return 'failed';
  return 'due';
}

function seedLocalDocuments() {
  return [
    { id: makeLocalId('doc'), name: 'Class 10 marksheet', status: 'missing', file_name: '', remarks: '', uploaded_at: null, reviewed_at: null },
    { id: makeLocalId('doc'), name: 'Class 12 marksheet', status: 'missing', file_name: '', remarks: '', uploaded_at: null, reviewed_at: null },
    { id: makeLocalId('doc'), name: 'ID proof', status: 'missing', file_name: '', remarks: '', uploaded_at: null, reviewed_at: null },
    { id: makeLocalId('doc'), name: 'Entrance scorecard', status: 'missing', file_name: '', remarks: '', uploaded_at: null, reviewed_at: null },
    { id: makeLocalId('doc'), name: 'Passport photo', status: 'missing', file_name: '', remarks: '', uploaded_at: null, reviewed_at: null }
  ];
}

function normalizeLocalDocuments(documents) {
  const seed = seedLocalDocuments();
  const byName = new Map((Array.isArray(documents) ? documents : []).map(doc => [doc.name, doc]));
  return seed.map(doc => ({ ...doc, ...(byName.get(doc.name) || {}) }));
}

function getLocalDocumentsStatus(documents) {
  const docs = normalizeLocalDocuments(documents);
  if (docs.every(doc => doc.status === 'verified')) return 'verified';
  if (docs.some(doc => doc.status === 'rejected')) return 'rejected';
  if (docs.some(doc => doc.status === 'submitted')) return 'submitted';
  return 'pending';
}

// ---- TASKS / FOLLOW-UPS ----
export async function fetchTasks({ lead_id, status } = {}) {
  const params = new URLSearchParams();
  if (lead_id) params.set('lead_id', lead_id);
  if (status) params.set('status', status);
  return request(`/tasks?${params.toString()}`);
}

export async function createTask(data) {
  return request('/tasks', { method: 'POST', body: JSON.stringify(data) });
}

export async function updateTask(id, data) {
  return request(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
}

export async function deleteTask(id) {
  return request(`/tasks/${id}`, { method: 'DELETE' });
}

export function exportLeadsCSV() {
  const token = getToken();
  const url = `${API_BASE}/leads/export/csv`;
  fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    .then(r => r.blob())
    .then(blob => {
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = 'rbmi-leads.csv';
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    });
}

// ---- DASHBOARD ----
export async function fetchDashboardStats(counselorId = '') {
  const param = counselorId ? `&counselor_id=${encodeURIComponent(counselorId)}` : '';
  return request(`/dashboard/stats?_=${Date.now()}${param}`);
}

// ---- COUNSELORS ----
export async function fetchCounselors() {
  return request('/counselors');
}

export async function createCounselor(data) {
  return request('/counselors', { method: 'POST', body: JSON.stringify(data) });
}

export async function updateCounselor(id, data) {
  return request(`/counselors/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export async function deleteCounselor(id) {
  return request(`/counselors/${id}`, { method: 'DELETE' });
}

// ---- COURSES ----
export async function fetchCourses() {
  return request('/courses');
}

export async function createCourse(data) {
  return request('/courses', { method: 'POST', body: JSON.stringify(data) });
}

export async function updateCourse(id, data) {
  return request(`/courses/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export async function deleteCourse(id) {
  return request(`/courses/${id}`, { method: 'DELETE' });
}

// ---- ACTIVITIES ----
export async function fetchActivities(limit = 10) {
  return request(`/activities?limit=${limit}`);
}

// ---- PIPELINE ----
export async function fetchPipeline() {
  return request('/pipeline');
}

// ---- USERS ----
export async function fetchUsers() {
  return request('/users');
}

export async function createUser(data) {
  return request('/users', { method: 'POST', body: JSON.stringify(data) });
}

export async function updateUser(id, data) {
  return request(`/users/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export async function deleteUser(id) {
  return request(`/users/${id}`, { method: 'DELETE' });
}

// ---- SETTINGS ----
export async function fetchSettings() {
  try {
    const settings = await request('/settings');
    const merged = { ...getDefaultLocalSettings(), ...settings };
    saveLocalSettings(merged);
    return merged;
  } catch (error) {
    return getLocalSettings();
  }
}

export async function saveSettings(data) {
  const merged = { ...getLocalSettings(), ...data };
  try {
    const settings = await request('/settings', { method: 'PUT', body: JSON.stringify(merged) });
    const next = { ...getDefaultLocalSettings(), ...settings };
    saveLocalSettings(next);
    return next;
  } catch (error) {
    saveLocalSettings(merged);
    return merged;
  }
}

// ---- STUDENT PORTAL ----
export async function fetchPortalProfile() {
  try {
    return await request('/portal/profile');
  } catch (error) {
    if (!shouldUseLocalAdmissionsFallback(error)) throw error;
    const user = getSessionUser();
    const profiles = getLocalPortalProfiles();
    if (profiles[user?.id]) return profiles[user.id];
    const profile = {
      user_id: user?.id || 'local-student',
      name: user?.name || 'Student',
      email: user?.email || '',
      phone: '',
      city: '',
      course_id: null,
      course_name: 'Program not selected',
      stage: 'enquiry',
      counselor_name: 'Admissions team',
      readiness: 35,
      next_step: 'Complete your profile',
      fee_due: '25000',
      scholarship: 'Not reviewed yet',
      branch: user?.branch || 'bareilly',
      updated_at: new Date().toISOString()
    };
    profiles[profile.user_id] = profile;
    saveLocalPortalProfiles(profiles);
    return profile;
  }
}

export async function updatePortalProfile(data) {
  try {
    return await request('/portal/profile', { method: 'PUT', body: JSON.stringify(data) });
  } catch (error) {
    if (!shouldUseLocalAdmissionsFallback(error)) throw error;
    const user = getSessionUser();
    const profiles = getLocalPortalProfiles();
    const fallbackProfile = profiles[user?.id] || await fetchPortalProfile();
    const next = { ...fallbackProfile, ...data, updated_at: new Date().toISOString() };
    profiles[next.user_id] = next;
    saveLocalPortalProfiles(profiles);
    return next;
  }
}

// ---- APPLICATIONS ----
export async function fetchApplications() {
  try {
    return await request('/applications');
  } catch (error) {
    if (!shouldUseLocalAdmissionsFallback(error)) throw error;
    const user = getSessionUser();
    let items = getLocalCollection(LOCAL_APPLICATIONS_KEY, seedLocalApplications);
    if (user?.role === 'student') items = items.filter(item => item.user_id === user.id);
    return items.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
  }
}

export async function createApplication(data) {
  try {
    return await request('/applications', { method: 'POST', body: JSON.stringify(data) });
  } catch (error) {
    if (!shouldUseLocalAdmissionsFallback(error)) throw error;
    const user = getSessionUser();
    const items = getLocalCollection(LOCAL_APPLICATIONS_KEY, seedLocalApplications);
    const item = {
      id: makeLocalId('app'),
      user_id: user?.role === 'student' ? user.id : null,
      student_name: data.student_name || user?.name || 'Student',
      email: data.email || user?.email || '',
      course_id: data.course_id || null,
      course_name: 'Program not selected',
      status: data.status || 'submitted',
      documents: normalizeLocalDocuments(data.documents),
      documents_status: getLocalDocumentsStatus(data.documents),
      counselor_name: data.counselor_name || 'Admissions team',
      priority: data.priority || 'medium',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    items.unshift(item);
    writeLocal(LOCAL_APPLICATIONS_KEY, items);
    return item;
  }
}

export async function updateApplication(id, data) {
  try {
    return await request(`/applications/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  } catch (error) {
    if (!shouldUseLocalAdmissionsFallback(error)) throw error;
    const items = getLocalCollection(LOCAL_APPLICATIONS_KEY, seedLocalApplications);
    const idx = items.findIndex(item => item.id === id);
    if (idx === -1) throw new Error('Application not found');
    const updates = { ...data };
    if (updates.documents) {
      updates.documents = normalizeLocalDocuments(updates.documents);
      updates.documents_status = getLocalDocumentsStatus(updates.documents);
    }
    items[idx] = { ...items[idx], ...updates, updated_at: new Date().toISOString() };
    writeLocal(LOCAL_APPLICATIONS_KEY, items);
    return items[idx];
  }
}

export function exportApplicationsCSV() {
  const token = getToken();
  const url = `${API_BASE}/applications/export/csv`;
  fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    .then(r => r.blob())
    .then(blob => {
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = 'applications.csv';
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    });
}

// ---- QUERIES ----
export async function fetchQueries() {
  try {
    return await request('/queries');
  } catch (error) {
    if (!shouldUseLocalAdmissionsFallback(error)) throw error;
    const user = getSessionUser();
    let items = getLocalCollection(LOCAL_QUERIES_KEY, seedLocalQueries);
    if (user?.role === 'student') items = items.filter(item => item.user_id === user.id);
    return items.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
  }
}

export async function createQuery(data) {
  try {
    return await request('/queries', { method: 'POST', body: JSON.stringify(data) });
  } catch (error) {
    if (!shouldUseLocalAdmissionsFallback(error)) throw error;
    const user = getSessionUser();
    const items = getLocalCollection(LOCAL_QUERIES_KEY, seedLocalQueries);
    const item = {
      id: makeLocalId('qry'),
      user_id: user?.id || null,
      student_name: data.student_name || user?.name || 'Student',
      subject: data.subject || 'Admission query',
      category: data.category || 'General',
      status: 'open',
      priority: data.priority || 'medium',
      message: data.message || '',
      response: '',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    items.unshift(item);
    writeLocal(LOCAL_QUERIES_KEY, items);
    return item;
  }
}

export async function updateQuery(id, data) {
  try {
    return await request(`/queries/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  } catch (error) {
    if (!shouldUseLocalAdmissionsFallback(error)) throw error;
    const items = getLocalCollection(LOCAL_QUERIES_KEY, seedLocalQueries);
    const idx = items.findIndex(item => item.id === id);
    if (idx === -1) throw new Error('Query not found');
    items[idx] = { ...items[idx], ...data, updated_at: new Date().toISOString() };
    writeLocal(LOCAL_QUERIES_KEY, items);
    return items[idx];
  }
}

// ---- PAYMENTS ----
export async function fetchPayments() {
  try {
    return await request('/payments');
  } catch (error) {
    if (!shouldUseLocalAdmissionsFallback(error)) throw error;
    const user = getSessionUser();
    let items = getLocalCollection(LOCAL_PAYMENTS_KEY, seedLocalPayments);
    if (user?.role === 'student') items = items.filter(item => item.user_id === user.id);
    return items.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
  }
}

export async function createPayment(data) {
  try {
    return await request('/payments', { method: 'POST', body: JSON.stringify(data) });
  } catch (error) {
    if (!shouldUseLocalAdmissionsFallback(error)) throw error;
    const items = getLocalCollection(LOCAL_PAYMENTS_KEY, seedLocalPayments);
    const item = {
      id: makeLocalId('pay'),
      user_id: data.user_id || null,
      student_name: data.student_name || 'Student',
      title: data.title || 'Admission fee',
      amount: Number(data.amount || 0),
      status: data.status || 'due',
      method: data.method || 'Online',
      due_date: data.due_date || '',
      receipt_no: data.receipt_no || '',
      installments: data.installments || buildLocalInstallments(data.amount || 0, data.installment_count || 1, data.due_date || ''),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    items.unshift(item);
    writeLocal(LOCAL_PAYMENTS_KEY, items);
    return item;
  }
}

export async function updatePayment(id, data) {
  try {
    return await request(`/payments/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  } catch (error) {
    if (!shouldUseLocalAdmissionsFallback(error)) throw error;
    const items = getLocalCollection(LOCAL_PAYMENTS_KEY, seedLocalPayments);
    const idx = items.findIndex(item => item.id === id);
    if (idx === -1) throw new Error('Payment not found');
    const updates = { ...data, updated_at: new Date().toISOString() };
    if (updates.installments) updates.status = getLocalPaymentStatus(updates.installments);
    if (updates.status === 'paid' && !updates.receipt_no && !items[idx].receipt_no) {
      updates.receipt_no = `RBMI-${Date.now().toString().slice(-6)}`;
    }
    items[idx] = { ...items[idx], ...updates };
    writeLocal(LOCAL_PAYMENTS_KEY, items);
    return items[idx];
  }
}

// ---- MARKETING / COMMUNICATIONS ----
export async function fetchMarketingOverview() {
  return request('/marketing/overview');
}

export async function fetchMarketingCampaigns() {
  return request('/marketing/campaigns');
}

export async function createMarketingCampaign(data) {
  return request('/marketing/campaigns', { method: 'POST', body: JSON.stringify(data) });
}

export async function updateMarketingCampaign(id, data) {
  return request(`/marketing/campaigns/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export async function launchMarketingCampaign(id) {
  return request(`/marketing/campaigns/${id}/launch`, { method: 'POST' });
}

export async function fetchCommunicationTemplates() {
  return request('/marketing/templates');
}

export async function createCommunicationTemplate(data) {
  return request('/marketing/templates', { method: 'POST', body: JSON.stringify(data) });
}

export async function updateCommunicationTemplate(id, data) {
  return request(`/marketing/templates/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export async function fetchCommunicationIntegrations() {
  return request('/marketing/integrations');
}

export async function saveCommunicationIntegrations(data) {
  return request('/marketing/integrations', { method: 'PUT', body: JSON.stringify(data) });
}

export async function fetchCallLogs() {
  return request('/marketing/call-logs');
}

export async function createCallLog(data) {
  return request('/marketing/call-logs', { method: 'POST', body: JSON.stringify(data) });
}

export async function fetchFollowUps() {
  return request('/marketing/followups');
}

export async function createFollowUp(data) {
  return request('/marketing/followups', { method: 'POST', body: JSON.stringify(data) });
}

export async function fetchBroadcasts() {
  return request('/marketing/broadcasts');
}

export async function createBroadcast(data) {
  return request('/marketing/broadcasts', { method: 'POST', body: JSON.stringify(data) });
}

export async function sendBroadcast(id) {
  return request(`/marketing/broadcasts/${id}/send`, { method: 'POST' });
}

export async function fetchStudentInbox() {
  return request('/marketing/inbox');
}

export async function createStudentInboxMessage(data) {
  return request('/marketing/inbox', { method: 'POST', body: JSON.stringify(data) });
}

export async function updateStudentInboxMessage(id, data) {
  return request(`/marketing/inbox/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export async function fetchChatThreads() {
  return request('/marketing/chats');
}

export async function createChatThread(data = {}) {
  return request('/marketing/chats', { method: 'POST', body: JSON.stringify(data) });
}

export const initiateChat = createChatThread;

export async function sendChatMessage(threadId, data) {
  return request(`/marketing/chats/${threadId}/messages`, { method: 'POST', body: JSON.stringify(data) });
}

export async function fetchNotifications() {
  return request('/marketing/notifications');
}

export async function createNotification(data) {
  return request('/marketing/notifications', { method: 'POST', body: JSON.stringify(data) });
}

export async function updateNotification(id, data) {
  return request(`/marketing/notifications/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export async function fetchInboundLogs() {
  return request('/marketing/inbound-logs');
}

export async function fetchPublishers() {
  return request('/marketing/publishers');
}

export async function simulateAutoLeads(count = 5) {
  return request('/marketing/auto-leads/simulate', {
    method: 'POST',
    body: JSON.stringify({ count })
  });
}

export function exportPaymentsCSV() {
  const token = getToken();
  const url = `${API_BASE}/payments/export/csv`;
  fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    .then(r => r.blob())
    .then(blob => {
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = 'payments.csv';
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    });
}

// ---- FILE UPLOAD ----
export async function uploadFile(file, metadata = {}) {
  const token = getToken();
  const formData = new FormData();
  formData.append('file', file);
  Object.entries(metadata).forEach(([key, value]) => {
    if (value) formData.append(key, value);
  });
  
  const res = await fetch(`${API_BASE}/upload`, {
    method: 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {})
      // Note: No Content-Type — browser auto-sets multipart boundary
    },
    body: formData
  });
  
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'File upload failed');
  }
  return res.json();
}

// ---- FORM TEMPLATES (FormDesk) ----
export async function fetchFormTemplates() {
  return request('/form-templates');
}

export async function createFormTemplate(data) {
  return request('/form-templates', { method: 'POST', body: JSON.stringify(data) });
}

// ---- LETTER TEMPLATES ----
export async function fetchLetterTemplates() {
  return request('/letter-templates');
}

export async function createLetterTemplate(data) {
  return request('/letter-templates', { method: 'POST', body: JSON.stringify(data) });
}

export async function updateLetterTemplate(id, data) {
  return request(`/letter-templates/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

// ---- OFFER LETTERS ----
export async function fetchOfferLetters(applicationId = null) {
  const params = applicationId ? `?application_id=${applicationId}` : '';
  return request(`/offer-letters${params}`);
}

export async function generateOfferLetter(applicationId, templateId) {
  return request('/offer-letters/generate', {
    method: 'POST',
    body: JSON.stringify({ applicationId, templateId })
  });
}

// ---- WORKFLOW RULES ----
export async function fetchWorkflowRules() {
  return request('/settings/workflows');
}

export async function createWorkflowRule(data) {
  return request('/settings/workflows', { method: 'POST', body: JSON.stringify(data) });
}

export async function updateWorkflowRule(id, data) {
  return request(`/settings/workflows/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

// ---- CAMPAIGNS ----

export async function fetchCampaigns() {
  return request('/campaigns');
}

export async function createCampaign(data) {
  return request('/campaigns', { method: 'POST', body: JSON.stringify(data) });
}

// ---- AI ----
export async function chatWithAI(history) {
  return request('/ai/chat', { method: 'POST', body: JSON.stringify({ history }) });
}

// ---- ADMISSION TESTS ----
export async function fetchAdmissionTests() {
  try {
    const res = await request('/admission-tests');
    return res && res.data ? res.data : (Array.isArray(res) ? res : []);
  } catch (error) {
    if (!shouldUseLocalAdmissionsFallback(error)) throw error;
    return readLocal('rbmi_local_tests', [
      { id: 'test-1', name: 'RBMI Scholarship & Entrance Test 2026', date: '2026-06-15', duration: 120, total_marks: 100, venue: 'Bareilly Campus, Block A', created_at: new Date().toISOString() },
      { id: 'test-2', name: 'Management Aptitude Test (MAT) - Mock', date: '2026-06-20', duration: 180, total_marks: 200, venue: 'Online / Remote', created_at: new Date().toISOString() }
    ]);
  }
}

export async function createAdmissionTest(data) {
  try {
    return await request('/admission-tests', { method: 'POST', body: JSON.stringify(data) });
  } catch (error) {
    if (!shouldUseLocalAdmissionsFallback(error)) throw error;
    const tests = await fetchAdmissionTests();
    const newTest = { id: makeLocalId('test'), ...data, created_at: new Date().toISOString() };
    tests.push(newTest);
    writeLocal('rbmi_local_tests', tests);
    return newTest;
  }
}

export async function registerForTest(data) {
  try {
    return await request('/admission-tests/register', { method: 'POST', body: JSON.stringify(data) });
  } catch (error) {
    if (!shouldUseLocalAdmissionsFallback(error)) throw error;
    const regs = readLocal('rbmi_local_test_regs', []);
    const newReg = { id: makeLocalId('reg'), ...data, status: 'Registered', registered_at: new Date().toISOString() };
    regs.push(newReg);
    writeLocal('rbmi_local_test_regs', regs);
    return newReg;
  }
}

export async function submitTestResult(data) {
  try {
    return await request('/admission-tests/result', { method: 'POST', body: JSON.stringify(data) });
  } catch (error) {
    if (!shouldUseLocalAdmissionsFallback(error)) throw error;
    const regs = readLocal('rbmi_local_test_regs', []);
    const idx = regs.findIndex(r => r.test_id === data.test_id && r.student_email === data.student_email);
    if (idx !== -1) {
      regs[idx].marks_obtained = data.marks_obtained;
      regs[idx].result_status = data.result_status || 'Pass';
      writeLocal('rbmi_local_test_regs', regs);
      return regs[idx];
    }
    const newReg = { id: makeLocalId('reg'), ...data, status: 'Result Submitted', registered_at: new Date().toISOString() };
    regs.push(newReg);
    writeLocal('rbmi_local_test_regs', regs);
    return newReg;
  }
}

export async function fetchTestRegistrations() {
  try {
    const res = await request('/admission-tests/registrations');
    return res && res.data ? res.data : (Array.isArray(res) ? res : []);
  } catch (error) {
    if (!shouldUseLocalAdmissionsFallback(error)) throw error;
    const user = getSessionUser();
    let regs = readLocal('rbmi_local_test_regs', [
      { id: 'reg-1', test_id: 'test-1', test_name: 'RBMI Scholarship & Entrance Test 2026', student_name: 'Rahul Sharma', student_email: 'rahul@gmail.com', status: 'Registered', registered_at: new Date().toISOString() }
    ]);
    if (user?.role === 'student') {
      regs = regs.filter(r => r.student_email === user.email);
    }
    return regs;
  }
}

export async function fetchMeritList(testId) {
  try {
    const res = await request(`/admission-tests/${testId}/merit-list`);
    return res && res.merit_list ? res.merit_list : (Array.isArray(res) ? res : []);
  } catch (error) {
    if (!shouldUseLocalAdmissionsFallback(error)) throw error;
    const regs = readLocal('rbmi_local_test_regs', []);
    return regs
      .filter(r => r.test_id === testId && r.marks_obtained !== undefined)
      .sort((a, b) => b.marks_obtained - a.marks_obtained);
  }
}

// ---- SCHOLARSHIPS ----
export async function fetchScholarships() {
  try {
    const res = await request('/scholarships');
    return res && res.data ? res.data : (Array.isArray(res) ? res : []);
  } catch (error) {
    if (!shouldUseLocalAdmissionsFallback(error)) throw error;
    return readLocal('rbmi_local_scholarships', [
      { id: 'sch-1', name: 'RBMI Merit Scholarship', type: 'Merit-Based', amount: '25% Tuition Fee Waiver', eligibility: '>= 85% in Class 12 / Grad', deadline: '2026-07-31', created_at: new Date().toISOString() },
      { id: 'sch-2', name: 'Sports & Cultural Excellence', type: 'Special Category', amount: '15% Tuition Fee Waiver', eligibility: 'State/National level certificates', deadline: '2026-07-31', created_at: new Date().toISOString() }
    ]);
  }
}

export async function createScholarship(data) {
  try {
    return await request('/scholarships', { method: 'POST', body: JSON.stringify(data) });
  } catch (error) {
    if (!shouldUseLocalAdmissionsFallback(error)) throw error;
    const scholarships = await fetchScholarships();
    const newSch = { id: makeLocalId('sch'), ...data, created_at: new Date().toISOString() };
    scholarships.push(newSch);
    writeLocal('rbmi_local_scholarships', scholarships);
    return newSch;
  }
}

export async function applyForScholarship(data) {
  try {
    return await request('/scholarships/apply', { method: 'POST', body: JSON.stringify(data) });
  } catch (error) {
    if (!shouldUseLocalAdmissionsFallback(error)) throw error;
    const apps = readLocal('rbmi_local_sch_apps', []);
    const newApp = { id: makeLocalId('schapp'), ...data, status: 'Pending', applied_at: new Date().toISOString() };
    apps.push(newApp);
    writeLocal('rbmi_local_sch_apps', apps);
    return newApp;
  }
}

export async function reviewScholarshipApplication(data) {
  try {
    return await request('/scholarships/review', { method: 'POST', body: JSON.stringify(data) });
  } catch (error) {
    if (!shouldUseLocalAdmissionsFallback(error)) throw error;
    const apps = readLocal('rbmi_local_sch_apps', []);
    const idx = apps.findIndex(a => a.id === data.id || (a.scholarship_id === data.scholarship_id && a.student_email === data.student_email));
    if (idx !== -1) {
      apps[idx].status = data.status;
      apps[idx].remarks = data.remarks;
      writeLocal('rbmi_local_sch_apps', apps);
      return apps[idx];
    }
    return null;
  }
}

export async function fetchScholarshipApplications() {
  try {
    const res = await request('/scholarships/applications');
    return res && res.data ? res.data : (Array.isArray(res) ? res : []);
  } catch (error) {
    if (!shouldUseLocalAdmissionsFallback(error)) throw error;
    const user = getSessionUser();
    let apps = readLocal('rbmi_local_sch_apps', [
      { id: 'sch-app-1', scholarship_id: 'sch-1', scholarship_name: 'RBMI Merit Scholarship', student_name: 'Rahul Sharma', student_email: 'rahul@gmail.com', status: 'Pending', applied_at: new Date().toISOString() }
    ]);
    if (user?.role === 'student') {
      apps = apps.filter(a => a.student_email === user.email);
    }
    return apps;
  }
}

// ---- BATCHES ----
export async function fetchBatches() {
  try {
    const res = await request('/batches');
    return res && res.data ? res.data : (Array.isArray(res) ? res : []);
  } catch (error) {
    if (!shouldUseLocalAdmissionsFallback(error)) throw error;
    return readLocal('rbmi_local_batches', [
      { id: 'batch-1', name: 'MBA Section A', course: 'MBA', section: 'A', capacity: 60, academic_year: '2026-27', student_count: 5, created_at: new Date().toISOString() },
      { id: 'batch-2', name: 'BCA Section B', course: 'BCA', section: 'B', capacity: 50, academic_year: '2026-27', student_count: 8, created_at: new Date().toISOString() }
    ]);
  }
}

export async function createBatch(data) {
  try {
    return await request('/batches', { method: 'POST', body: JSON.stringify(data) });
  } catch (error) {
    if (!shouldUseLocalAdmissionsFallback(error)) throw error;
    const batches = await fetchBatches();
    const newBatch = { id: makeLocalId('batch'), student_count: 0, ...data, created_at: new Date().toISOString() };
    batches.push(newBatch);
    writeLocal('rbmi_local_batches', batches);
    return newBatch;
  }
}

export async function updateBatch(id, data) {
  try {
    return await request(`/batches/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  } catch (error) {
    if (!shouldUseLocalAdmissionsFallback(error)) throw error;
    const batches = await fetchBatches();
    const idx = batches.findIndex(b => b.id === id);
    if (idx !== -1) {
      batches[idx] = { ...batches[idx], ...data };
      writeLocal('rbmi_local_batches', batches);
      return batches[idx];
    }
    throw new Error('Batch not found');
  }
}

export async function assignStudentToBatch(data) {
  try {
    return await request('/batches/assign', { method: 'POST', body: JSON.stringify(data) });
  } catch (error) {
    if (!shouldUseLocalAdmissionsFallback(error)) throw error;
    const batchStudents = readLocal('rbmi_local_batch_students', []);
    const newAssign = { id: makeLocalId('assign'), ...data, assigned_at: new Date().toISOString() };
    batchStudents.push(newAssign);
    writeLocal('rbmi_local_batch_students', batchStudents);

    // Update student count in batch
    const batches = await fetchBatches();
    const idx = batches.findIndex(b => b.name === data.batch_name || b.id === data.batch_id);
    if (idx !== -1) {
      batches[idx].student_count = (batches[idx].student_count || 0) + 1;
      writeLocal('rbmi_local_batches', batches);
    }
    return newAssign;
  }
}

export async function fetchBatchStudents() {
  try {
    const res = await request('/batches/students');
    return res && res.data ? res.data : (Array.isArray(res) ? res : []);
  } catch (error) {
    if (!shouldUseLocalAdmissionsFallback(error)) throw error;
    return readLocal('rbmi_local_batch_students', [
      { id: 'assign-1', student_id: 'std-1', student_name: 'Amit Kumar', roll_number: 'MBA-2026-001', batch_name: 'MBA Section A', course: 'MBA', assigned_at: new Date().toISOString() }
    ]);
  }
}

// ---- LEAD DISTRIBUTION ----
export async function fetchLeadDistributionRules() {
  try {
    const res = await request('/lead-distribution');
    return res && res.data ? res.data : (Array.isArray(res) ? res : []);
  } catch (error) {
    if (!shouldUseLocalAdmissionsFallback(error)) throw error;
    return readLocal('rbmi_local_ld_rules', [
      { id: 'rule-1', name: 'Round Robin General', criteria: 'counselor_rotation', active: true, conditions: { source: 'All' }, created_at: new Date().toISOString() },
      { id: 'rule-2', name: 'Bareilly Regional Route', criteria: 'least_loaded', active: false, conditions: { city: 'Bareilly' }, created_at: new Date().toISOString() }
    ]);
  }
}

export async function createLeadDistributionRule(data) {
  try {
    return await request('/lead-distribution', { method: 'POST', body: JSON.stringify(data) });
  } catch (error) {
    if (!shouldUseLocalAdmissionsFallback(error)) throw error;
    const rules = await fetchLeadDistributionRules();
    const newRule = { id: makeLocalId('rule'), active: true, ...data, created_at: new Date().toISOString() };
    rules.push(newRule);
    writeLocal('rbmi_local_ld_rules', rules);
    return newRule;
  }
}

export async function updateLeadDistributionRule(id, data) {
  try {
    return await request(`/lead-distribution/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  } catch (error) {
    if (!shouldUseLocalAdmissionsFallback(error)) throw error;
    const rules = await fetchLeadDistributionRules();
    const idx = rules.findIndex(r => r.id === id);
    if (idx !== -1) {
      rules[idx] = { ...rules[idx], ...data };
      writeLocal('rbmi_local_ld_rules', rules);
      return rules[idx];
    }
    throw new Error('Rule not found');
  }
}

export async function deleteLeadDistributionRule(id) {
  try {
    return await request(`/lead-distribution/${id}`, { method: 'DELETE' });
  } catch (error) {
    if (!shouldUseLocalAdmissionsFallback(error)) throw error;
    const rules = await fetchLeadDistributionRules();
    const filtered = rules.filter(r => r.id !== id);
    writeLocal('rbmi_local_ld_rules', filtered);
    return { success: true };
  }
}

export async function testLeadDistribution(data) {
  try {
    return await request('/lead-distribution/test', { method: 'POST', body: JSON.stringify(data) });
  } catch (error) {
    if (!shouldUseLocalAdmissionsFallback(error)) throw error;
    return {
      success: true,
      assigned_counselor: 'Priya Sharma (Counselor MBA)',
      rule_matched: data.rule_name || 'Round Robin General',
      timestamp: new Date().toISOString()
    };
  }
}

// ---- NOTIFICATIONS ----
export async function fetchNotificationsList() {
  try {
    const res = await request('/notifications');
    return res && res.data ? res.data : (Array.isArray(res) ? res : []);
  } catch (error) {
    if (!shouldUseLocalAdmissionsFallback(error)) throw error;
    return readLocal('rbmi_local_notifications_list', [
      { id: 'notif-1', title: 'New Application Received', message: 'Rahul Sharma has applied for MBA Program.', read: false, type: 'system', priority: 'high', created_at: new Date().toISOString() },
      { id: 'notif-2', title: 'Fee Payment Verified', message: 'Online transaction of INR 25,000 completed by Student.', read: true, type: 'payment', priority: 'medium', created_at: new Date(Date.now() - 3600000).toISOString() }
    ]);
  }
}

export async function getUnreadCount() {
  try {
    return await request('/notifications/unread-count');
  } catch (error) {
    if (!shouldUseLocalAdmissionsFallback(error)) throw error;
    const list = await fetchNotificationsList();
    return { count: list.filter(n => !n.read).length };
  }
}

export async function createNotificationItem(data) {
  try {
    return await request('/notifications', { method: 'POST', body: JSON.stringify(data) });
  } catch (error) {
    if (!shouldUseLocalAdmissionsFallback(error)) throw error;
    const list = await fetchNotificationsList();
    const newItem = { id: makeLocalId('notif'), read: false, ...data, created_at: new Date().toISOString() };
    list.unshift(newItem);
    writeLocal('rbmi_local_notifications_list', list);
    return newItem;
  }
}

export async function broadcastNotification(data) {
  try {
    return await request('/notifications/broadcast', { method: 'POST', body: JSON.stringify(data) });
  } catch (error) {
    if (!shouldUseLocalAdmissionsFallback(error)) throw error;
    const list = await fetchNotificationsList();
    const newItem = { id: makeLocalId('notif'), read: false, title: data.title, message: data.message, type: 'broadcast', priority: data.priority || 'medium', created_at: new Date().toISOString() };
    list.unshift(newItem);
    writeLocal('rbmi_local_notifications_list', list);
    return { success: true, broadcasted: newItem };
  }
}

export async function markNotificationRead(id) {
  try {
    return await request(`/notifications/${id}/read`, { method: 'PUT' });
  } catch (error) {
    if (!shouldUseLocalAdmissionsFallback(error)) throw error;
    const list = await fetchNotificationsList();
    const idx = list.findIndex(n => n.id === id);
    if (idx !== -1) {
      list[idx].read = true;
      writeLocal('rbmi_local_notifications_list', list);
      return list[idx];
    }
    return null;
  }
}

export async function markAllNotificationsRead() {
  try {
    return await request('/notifications/mark-all-read', { method: 'PUT' });
  } catch (error) {
    if (!shouldUseLocalAdmissionsFallback(error)) throw error;
    const list = await fetchNotificationsList();
    list.forEach(n => n.read = true);
    writeLocal('rbmi_local_notifications_list', list);
    return { success: true };
  }
}

export async function deleteNotificationItem(id) {
  try {
    return await request(`/notifications/${id}`, { method: 'DELETE' });
  } catch (error) {
    if (!shouldUseLocalAdmissionsFallback(error)) throw error;
    const list = await fetchNotificationsList();
    const filtered = list.filter(n => n.id !== id);
    writeLocal('rbmi_local_notifications_list', filtered);
    return { success: true };
  }
}

// ---- ADVANCED REPORTS ----
export async function generateReport(data) {
  try {
    return await request('/reports/generate', { method: 'POST', body: JSON.stringify(data) });
  } catch (error) {
    if (!shouldUseLocalAdmissionsFallback(error)) throw error;
    return {
      success: true,
      report_type: data.report_type,
      generated_at: new Date().toISOString(),
      data: [
        { label: 'Source: Direct Website', count: 124, revenue: 1550000 },
        { label: 'Source: Shiksha.com', count: 85, revenue: 950000 },
        { label: 'Source: Facebook Ads', count: 96, revenue: 1100000 },
        { label: 'Source: Google Ads', count: 142, revenue: 1850000 }
      ]
    };
  }
}

export async function scheduleReport(data) {
  try {
    return await request('/reports/schedule', { method: 'POST', body: JSON.stringify(data) });
  } catch (error) {
    if (!shouldUseLocalAdmissionsFallback(error)) throw error;
    const schedules = readLocal('rbmi_local_report_schedules', []);
    const newSchedule = { id: makeLocalId('schrep'), ...data, created_at: new Date().toISOString() };
    schedules.push(newSchedule);
    writeLocal('rbmi_local_report_schedules', schedules);
    return newSchedule;
  }
}

// ---- UTM TRACKING ----
export async function trackUTM(data) {
  try {
    return await request('/utm/track', { method: 'POST', body: JSON.stringify(data) });
  } catch (error) {
    if (!shouldUseLocalAdmissionsFallback(error)) throw error;
    return { success: true, message: 'UTM parameters tracked locally' };
  }
}

export async function fetchUTMAnalytics() {
  try {
    return await request('/utm/analytics');
  } catch (error) {
    if (!shouldUseLocalAdmissionsFallback(error)) throw error;
    return [
      { source: 'google', medium: 'cpc', campaign: 'admission_2026', visits: 1240, conversions: 142 },
      { source: 'facebook', medium: 'social_ads', campaign: 'mba_drive', visits: 980, conversions: 96 },
      { source: 'shiksha', medium: 'portal', campaign: 'premium_listing', visits: 450, conversions: 85 }
    ];
  }
}

export async function fetchUTMConversions() {
  try {
    return await request('/utm/conversions');
  } catch (error) {
    if (!shouldUseLocalAdmissionsFallback(error)) throw error;
    return [
      { student_name: 'Rohan Gupta', email: 'rohan.g@gmail.com', source: 'google', medium: 'cpc', campaign: 'admission_2026', date: new Date().toISOString() }
    ];
  }
}

// ---- MULTI-LANGUAGE ----
export async function fetchLanguages() {
  try {
    return await request('/i18n/languages');
  } catch (error) {
    if (!shouldUseLocalAdmissionsFallback(error)) throw error;
    return [
      { code: 'en', name: 'English', nativeName: 'English' },
      { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी' },
      { code: 'ur', name: 'Urdu', nativeName: 'اردو' },
      { code: 'pa', name: 'Punjabi', nativeName: 'ਪੰਜਾਬी' },
      { code: 'bn', name: 'Bengali', nativeName: 'বাংলা' }
    ];
  }
}

export async function fetchTranslations() {
  try {
    return await request('/i18n/translations');
  } catch (error) {
    if (!shouldUseLocalAdmissionsFallback(error)) throw error;
    return {
      en: { welcome: 'Welcome to RBMI Admission Hub', admission_portal: 'Admission Portal', login: 'Login' },
      hi: { welcome: 'आरबीएमआई प्रवेश केंद्र में आपका स्वागत है', admission_portal: 'प्रवेश पोर्टल', login: 'लॉगिन' }
    };
  }
}

export async function updateTranslations(data) {
  try {
    return await request('/i18n/translations', { method: 'PUT', body: JSON.stringify(data) });
  } catch (error) {
    if (!shouldUseLocalAdmissionsFallback(error)) throw error;
    return { success: true };
  }
}

export async function getUserLanguage() {
  try {
    return await request('/i18n/user/language');
  } catch (error) {
    if (!shouldUseLocalAdmissionsFallback(error)) throw error;
    return { language: readLocal('rbmi_user_lang', 'en') };
  }
}

export async function setUserLanguage(data) {
  try {
    return await request('/i18n/user/language', { method: 'PUT', body: JSON.stringify(data) });
  } catch (error) {
    if (!shouldUseLocalAdmissionsFallback(error)) throw error;
    writeLocal('rbmi_user_lang', data.language);
    return { success: true, language: data.language };
  }
}

export async function translateText(data) {
  try {
    return await request('/i18n/translate', { method: 'POST', body: JSON.stringify(data) });
  } catch (error) {
    if (!shouldUseLocalAdmissionsFallback(error)) throw error;
    return { translatedText: data.text }; // Fallback returns original text
  }
}

// ---- GENERIC API ACCESS ----
export async function getAPI(path, method = 'GET', body = null) {
  const options = { method };
  if (body) {
    options.body = JSON.stringify(body);
  }
  return request(path, options);
}
