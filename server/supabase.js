import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateId, getDB, saveDB, seedIfEmpty } from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env'), override: true });
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY
  || process.env.SUPABASE_PUBLISHABLE_KEY
  || process.env.VITE_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
  || process.env.SUPABASE_SECRET_KEY;
const SUPABASE_KEY = SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY;
export const USE_SUPABASE = Boolean(
  SUPABASE_URL &&
  SUPABASE_KEY &&
  !SUPABASE_URL.includes('your-project') &&
  SUPABASE_KEY !== 'your-anon-key' &&
  SUPABASE_KEY !== 'your-service-role-key'
);
// Production-safe default: the local fallback must start empty. Demo fixtures
// are only enabled when explicitly requested for a sandbox environment.
export const REAL_DATA_MODE = process.env.REAL_DATA_MODE !== 'false' && process.env.USE_DEMO_DATA !== 'true';

if (!USE_SUPABASE) {
  console.warn('Supabase credentials missing. Using local JSON database fallback.');
  seedIfEmpty();
} else if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.warn('Supabase: server using anon key. If Row Level Security blocks reads/writes, set SUPABASE_SERVICE_ROLE_KEY in .env.');
}

// Kept for auth.js and appStore.js which use the Supabase JS client.
// A bounded request prevents a missing/unreachable Supabase project from
// making the local JSON fallback hang every page load.
let supabaseOffline = false;

async function fetchWithTimeout(input, init = {}) {
  if (supabaseOffline) throw new Error('Supabase unavailable; using local JSON database');
  const controller = new AbortController();
  // Supabase may take longer during startup when several background sync
  // requests are opened at once. Avoid treating a single slow request as a
  // permanent outage for the rest of the server process.
  const timeoutMs = Number(process.env.SUPABASE_TIMEOUT_MS) || 15000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  if (init.signal) {
    if (init.signal.aborted) controller.abort();
    else init.signal.addEventListener('abort', () => controller.abort(), { once: true });
  }
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    // A timeout can be transient (especially during startup). Do not turn a
    // single timed-out request into a permanent local-database fallback.
    if (error?.name !== 'AbortError') supabaseOffline = true;
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

const supabaseClient = USE_SUPABASE
  ? createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false },
      global: { fetch: fetchWithTimeout }
    })
  : null;

export function getServerSupabase() {
  return supabaseClient;
}

const supabaseHeaders = USE_SUPABASE ? {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
  Prefer: 'return=representation'
} : null;

async function supabaseFetch(path, options = {}) {
  if (!USE_SUPABASE) throw new Error('Supabase not configured');
  const url = `${SUPABASE_URL}${path}`;
  const res = await fetchWithTimeout(url, {
    ...options,
    headers: { ...supabaseHeaders, ...options.headers }
  });
  if (res.status === 204) return null;
  const body = await res.json();
  if (!res.ok) {
    const msg = body?.message || body?.error || res.statusText;
    const err = new Error(msg);
    err.status = res.status;
    err.details = body;
    throw err;
  }
  return body;
}

function supabaseSelect(table, filters = {}) {
  const params = new URLSearchParams();
  if (filters.stage) params.append('stage', `eq.${filters.stage}`);
  if (filters.source) params.append('source', `eq.${filters.source}`);
  if (filters.counselor_id) params.append('counselor_id', `eq.${filters.counselor_id}`);
  if (filters.lead_id) params.append('lead_id', `eq.${filters.lead_id}`);
  if (filters.status && table === 'tasks') params.append('status', `eq.${filters.status}`);
  if (filters.id) params.append('id', `eq.${filters.id}`);
  const qs = params.toString();
  return `/rest/v1/${table}?select=*${qs ? '&' + qs : ''}&order=created_at.desc`;
}

function sortByDateDesc(items, key = 'created_at') {
  return [...items].sort((a, b) => new Date(b[key] || 0) - new Date(a[key] || 0));
}

function nowIso() {
  return new Date().toISOString();
}

function hasAnyLocalData(key) {
  const db = getDB();
  return Array.isArray(db[key]) && db[key].length > 0;
}

function localCollection(key, sortKey = 'created_at', limit = null) {
  const db = getDB();
  const rows = Array.isArray(db[key]) ? db[key] : [];
  const sorted = sortByDateDesc(rows, sortKey);
  return typeof limit === 'number' ? sorted.slice(0, limit) : sorted;
}

// ===== LEADS =====
export async function getLeads(filters = {}) {
  if (USE_SUPABASE) {
    try {
      const path = supabaseSelect('leads', filters);
      const data = await supabaseFetch(path);
      console.log('SUPABASE_GET_LEADS ->', Array.isArray(data) ? data.length : 'no-data', 'filters=', filters);
      return data || [];
    } catch (e) {
      console.warn('Supabase getLeads failed, falling back to local JSON:', e.message);
    }
  }

  const db = getDB();
  let leads = db.leads || [];
  if (filters.stage) leads = leads.filter(l => l.stage === filters.stage);
  if (filters.source) leads = leads.filter(l => l.source === filters.source);
  if (filters.counselor_id) leads = leads.filter(l => l.counselor_id === filters.counselor_id);
  return sortByDateDesc(leads, 'created_at');
}

export async function getLead(id) {
  if (USE_SUPABASE) {
    try {
      const data = await supabaseFetch(`/rest/v1/leads?id=eq.${encodeURIComponent(id)}&select=*`);
      if ((data || []).length > 0) return data[0];
    } catch (e) {
      console.warn('Supabase getLead failed, falling back to local JSON:', e.message);
    }
    if (!hasAnyLocalData('leads')) return null;
  }

  const db = getDB();
  return (db.leads || []).find(l => l.id === id) || null;
}

export async function createLead(leadData) {
  const id = generateId();
  const now = nowIso();
  if (USE_SUPABASE) {
    try {
      const data = await supabaseFetch('/rest/v1/leads', {
        method: 'POST',
        body: JSON.stringify([{ id, ...leadData, created_at: now, updated_at: now }]),
        headers: { Prefer: 'return=representation' }
      });
      if (data && data[0]) return data[0];
    } catch (e) {
      // Do not silently split lead data between Supabase and server/data.json.
      // A successful HTTP response from the registration form must mean the
      // lead was actually written to the configured primary database.
      console.error('Supabase lead insert failed:', e.message, e.details || '');
      throw e;
    }
  }

  const db = getDB();
  const lead = { id, ...leadData, created_at: now, updated_at: now };
  db.leads = [lead, ...(db.leads || [])];
  saveDB(db);
  return lead;
}

export async function updateLead(id, leadData) {
  if (USE_SUPABASE) {
    try {
      const data = await supabaseFetch(`/rest/v1/leads?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ ...leadData, updated_at: nowIso() }),
        headers: { Prefer: 'return=representation' }
      });
      if (data && data[0]) return data[0];
    } catch (e) {
      console.warn('Supabase lead update failed, falling back to local JSON:', e.message);
    }
  }
  const db = getDB();
  const idx = (db.leads || []).findIndex(l => l.id === id);
  if (idx === -1) throw new Error('Lead not found');
  db.leads[idx] = { ...db.leads[idx], ...leadData, updated_at: nowIso() };
  saveDB(db);
  return db.leads[idx];
}

export async function deleteLead(id) {
  if (USE_SUPABASE) {
    try {
      await supabaseFetch(`/rest/v1/leads?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
      return true;
    } catch (e) {
      console.warn('Supabase lead delete failed, falling back to local JSON:', e.message);
    }
  }
  const db = getDB();
  const before = (db.leads || []).length;
  db.leads = (db.leads || []).filter(l => l.id !== id);
  if (db.leads.length === before) throw new Error('Lead not found');
  saveDB(db);
  return true;
}

// ===== COUNSELORS =====
export async function getCounselors() {
  if (USE_SUPABASE) {
    try {
      return await supabaseFetch('/rest/v1/counselors?select=*&order=created_at.desc');
    } catch (e) {
      console.warn('Supabase getCounselors failed, falling back to local JSON:', e.message);
    }
  }
  const db = getDB();
  return sortByDateDesc(db.counselors || [], 'created_at');
}

export async function getCounselor(id) {
  if (USE_SUPABASE) {
    try {
      const data = await supabaseFetch(`/rest/v1/counselors?id=eq.${encodeURIComponent(id)}&select=*`);
      if (data && data[0]) return data[0];
    } catch (e) {
      console.warn('Supabase getCounselor failed, falling back to local JSON:', e.message);
    }
  }
  const db = getDB();
  return (db.counselors || []).find(c => c.id === id) || null;
}

export async function createCounselor(row) {
  const now = nowIso();
  const counselor = {
    id: generateId(),
    name: row.name,
    email: row.email || '',
    phone: row.phone || '',
    role: row.role || 'Counselor',
    department: row.department || 'General',
    branch: row.branch || null,
    rating: parseFloat(row.rating) || 4.0,
    created_at: now
  };
  if (USE_SUPABASE) {
    try {
      const data = await supabaseFetch('/rest/v1/counselors', {
        method: 'POST', body: JSON.stringify([counselor]),
        headers: { Prefer: 'return=representation' }
      });
      if (data && data[0]) return data[0];
    } catch (e) {
      console.warn('Supabase counselor insert failed, falling back to local JSON:', e.message);
    }
  }
  const db = getDB();
  if (!db.counselors) db.counselors = [];
  db.counselors.push(counselor);
  saveDB(db);
  return counselor;
}

export async function updateCounselor(id, updates) {
  if (USE_SUPABASE) {
    try {
      const data = await supabaseFetch(`/rest/v1/counselors?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH', body: JSON.stringify(updates),
        headers: { Prefer: 'return=representation' }
      });
      if (data && data[0]) return data[0];
    } catch (e) {
      console.warn('Supabase counselor update failed, falling back to local JSON:', e.message);
    }
  }
  const db = getDB();
  const idx = (db.counselors || []).findIndex(c => c.id === id);
  if (idx === -1) throw new Error('Counselor not found');
  db.counselors[idx] = { ...db.counselors[idx], ...updates };
  saveDB(db);
  return db.counselors[idx];
}

export async function deleteCounselor(id) {
  if (USE_SUPABASE) {
    try {
      await supabaseFetch(`/rest/v1/counselors?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
      return true;
    } catch (e) {
      console.warn('Supabase counselor delete failed, falling back to local JSON:', e.message);
    }
  }
  const db = getDB();
  const before = (db.counselors || []).length;
  db.counselors = (db.counselors || []).filter(c => c.id !== id);
  if (db.counselors.length === before) throw new Error('Counselor not found');
  saveDB(db);
  return true;
}

// ===== COURSES =====
export async function getCourses() {
  if (USE_SUPABASE) {
    try {
      return await supabaseFetch('/rest/v1/courses?select=*&order=created_at.desc');
    } catch (e) {
      console.warn('Supabase getCourses failed, falling back to local JSON:', e.message);
    }
  }
  const db = getDB();
  return sortByDateDesc(db.courses || [], 'created_at');
}

export async function getCourse(id) {
  if (USE_SUPABASE) {
    try {
      const data = await supabaseFetch(`/rest/v1/courses?id=eq.${encodeURIComponent(id)}&select=*`);
      if (data && data[0]) return data[0];
    } catch (e) {
      console.warn('Supabase getCourse failed, falling back to local JSON:', e.message);
    }
  }
  const db = getDB();
  return (db.courses || []).find(c => c.id === id) || null;
}

export async function updateCourse(id, courseData) {
  if (USE_SUPABASE) {
    try {
      const data = await supabaseFetch(`/rest/v1/courses?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH', body: JSON.stringify(courseData),
        headers: { Prefer: 'return=representation' }
      });
      if (data && data[0]) return data[0];
    } catch (e) {
      console.warn('Supabase course update failed, falling back to local JSON:', e.message);
    }
  }
  const db = getDB();
  const idx = (db.courses || []).findIndex(c => c.id === id);
  if (idx === -1) throw new Error('Course not found');
  db.courses[idx] = { ...db.courses[idx], ...courseData };
  saveDB(db);
  return db.courses[idx];
}

export async function createCourse(row) {
  const now = nowIso();
  const course = {
    id: generateId(),
    name: row.name,
    code: row.code || '',
    department: row.department || '',
    duration: row.duration || '',
    total_seats: parseInt(row.total_seats, 10) || 0,
    filled_seats: parseInt(row.filled_seats, 10) || 0,
    fee: row.fee || '',
    status: row.status || 'Active',
    branch: row.branch || null,
    created_at: now
  };
  if (USE_SUPABASE) {
    try {
      const data = await supabaseFetch('/rest/v1/courses', {
        method: 'POST', body: JSON.stringify([course]),
        headers: { Prefer: 'return=representation' }
      });
      if (data && data[0]) return data[0];
    } catch (e) {
      console.warn('Supabase course insert failed, falling back to local JSON:', e.message);
    }
  }
  const db = getDB();
  if (!db.courses) db.courses = [];
  db.courses.push(course);
  saveDB(db);
  return course;
}

export async function deleteCourse(id) {
  if (USE_SUPABASE) {
    try {
      await supabaseFetch(`/rest/v1/courses?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
      return true;
    } catch (e) {
      console.warn('Supabase course delete failed, falling back to local JSON:', e.message);
    }
  }
  const db = getDB();
  const before = (db.courses || []).length;
  db.courses = (db.courses || []).filter(c => c.id !== id);
  if (db.courses.length === before) throw new Error('Course not found');
  saveDB(db);
  return true;
}

// ===== ACTIVITIES =====
export async function getActivities(limit = 10) {
  if (USE_SUPABASE) {
    try {
      return await supabaseFetch(`/rest/v1/activities?select=*&order=created_at.desc&limit=${limit}`);
    } catch (e) {
      console.warn('Supabase getActivities failed, falling back to local JSON:', e.message);
    }
  }
  const db = getDB();
  return sortByDateDesc(db.activities || [], 'created_at').slice(0, limit);
}

export async function createActivity(activityData) {
  const id = generateId();
  const now = nowIso();
  if (USE_SUPABASE) {
    try {
      const data = await supabaseFetch('/rest/v1/activities', {
        method: 'POST',
        body: JSON.stringify([{
          id,
          ...activityData,
          lead_id: activityData.lead_id ?? null,
          message: activityData.message || activityData.description || '',
          created_at: now
        }]),
        headers: { Prefer: 'return=representation' }
      });
      if (data && data[0]) return data[0];
    } catch (e) {
      console.warn('Supabase activity insert failed, falling back to local JSON:', e.message);
    }
  }
  const db = getDB();
  const activity = {
    id, type: activityData.type || 'note',
    ...activityData,
    message: activityData.message || activityData.description || '',
    created_at: now
  };
  db.activities = [activity, ...(db.activities || [])];
  saveDB(db);
  return activity;
}

// ===== TASKS / FOLLOW-UPS =====
export async function getTasks(filters = {}) {
  if (USE_SUPABASE) {
    try {
      const params = new URLSearchParams({ select: '*' });
      if (filters.lead_id) params.append('lead_id', `eq.${filters.lead_id}`);
      if (filters.status) params.append('status', `eq.${filters.status}`);
      const data = await supabaseFetch(`/rest/v1/tasks?${params.toString()}&order=due_date.asc`);
      return data || [];
    } catch (e) {
      console.warn('Supabase getTasks failed, falling back to local JSON:', e.message);
    }
  }
  const db = getDB();
  let tasks = db.tasks || [];
  if (filters.lead_id) tasks = tasks.filter(t => t.lead_id === filters.lead_id);
  if (filters.status) tasks = tasks.filter(t => t.status === filters.status);
  return [...tasks].sort((a, b) => new Date(a.due_date || 0) - new Date(b.due_date || 0));
}

export async function createTask(taskData) {
  const now = nowIso();
  const task = {
    id: generateId(),
    title: taskData.title,
    lead_id: taskData.lead_id,
    due_date: taskData.due_date,
    type: taskData.type || 'call',
    status: taskData.status || 'pending',
    notes: taskData.notes || '',
    created_at: now,
    updated_at: now
  };
  if (USE_SUPABASE) {
    try {
      const data = await supabaseFetch('/rest/v1/tasks', {
        method: 'POST', body: JSON.stringify([task]),
        headers: { Prefer: 'return=representation' }
      });
      if (data && data[0]) return data[0];
    } catch (e) {
      console.warn('Supabase task insert failed, falling back to local JSON:', e.message);
    }
  }
  const db = getDB();
  db.tasks = [task, ...(db.tasks || [])];
  saveDB(db);
  return task;
}

export async function updateTask(id, updates) {
  const payload = { ...updates, updated_at: nowIso() };
  if (USE_SUPABASE) {
    try {
      const data = await supabaseFetch(`/rest/v1/tasks?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH', body: JSON.stringify(payload),
        headers: { Prefer: 'return=representation' }
      });
      if (data && data[0]) return data[0];
    } catch (e) {
      console.warn('Supabase task update failed, falling back to local JSON:', e.message);
    }
  }
  const db = getDB();
  const idx = (db.tasks || []).findIndex(t => t.id === id);
  if (idx === -1) throw new Error('Task not found');
  db.tasks[idx] = { ...db.tasks[idx], ...payload };
  saveDB(db);
  return db.tasks[idx];
}

export async function deleteTask(id) {
  if (USE_SUPABASE) {
    try {
      await supabaseFetch(`/rest/v1/tasks?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
      return true;
    } catch (e) {
      console.warn('Supabase task delete failed, falling back to local JSON:', e.message);
    }
  }
  const db = getDB();
  const before = (db.tasks || []).length;
  db.tasks = (db.tasks || []).filter(t => t.id !== id);
  if (db.tasks.length === before) throw new Error('Task not found');
  saveDB(db);
  return true;
}
