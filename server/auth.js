import { randomBytes, createHmac, scryptSync } from 'crypto';
import { getDB, saveDB, generateId } from './db.js';
import { USE_SUPABASE, getServerSupabase } from './supabase.js';

const JWT_SECRET = process.env.JWT_SECRET || 'rbmi-crm-secret-2026';

if (!process.env.JWT_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    console.error('FATAL: JWT_SECRET must be set in production. Exiting.');
    process.exit(1);
  } else {
    console.warn('⚠️  JWT_SECRET not set — using insecure default. Set a strong secret before deploying.');
  }
}

function signToken(payload) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify({ ...payload, iat: Date.now() })).toString('base64url');
  const sig = createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${sig}`;
}

// --- PASSWORD HASHING ---
function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  if (!storedHash || !storedHash.includes(':')) return password === storedHash; // Fallback for old plain text
  const [salt, hash] = storedHash.split(':');
  const key = scryptSync(password, salt, 64).toString('hex');
  return key === hash;
}

export function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, body, sig] = parts;
    if (!header || !body || !sig) return null;
    const expected = createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
    if (sig !== expected) return null;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (!payload || !payload.id) return null;
    return payload;
  } catch {
    return null;
  }
}

function buildAppPayload(user, branch) {
  const meta = user.user_metadata || {};
  const rawRole = String(meta.role || 'student').toLowerCase();
  const role = rawRole === 'counsellor' ? 'counselor' : rawRole;
  return {
    id: user.id,
    email: user.email || '',
    name: meta.name || user.email?.split('@')[0] || 'User',
    role: ['admin', 'counselor', 'student'].includes(role) ? role : 'student',
    counselor_id: meta.counselor_id ?? null,
    branch: meta.branch || branch || 'bareilly'
  };
}

function buildTokenResult(user, branch) {
  const payload = buildAppPayload(user, branch);
  const token = signToken(payload);
  return { user: payload, token };
}

// ===== DEMO USERS (seeded into Supabase Auth on startup) =====
const DEMO_USERS = [
  { email: 'admin@rbmi.edu.in', password: 'admin123', name: 'Admin RBMI', role: 'admin', counselor_id: null, branch: 'bareilly' },
  { email: 'priya@rbmi.edu.in', password: 'counselor123', name: 'Neha Khan', role: 'counselor', counselor_id: null, branch: 'bareilly' },
  { email: 'rajesh@rbmi.edu.in', password: 'counselor123', name: 'Rajesh Kumar', role: 'counselor', counselor_id: null, branch: 'bareilly' },
  { email: 'student@demo.in', password: 'student123', name: 'krishna jaiswal', role: 'student', counselor_id: null, branch: 'bareilly' }
];

export async function seedDemoUsers() {
  // Keep the local login accounts available for development, but never push
  // fictional users into a real Supabase project unless explicitly enabled.
  if (!USE_SUPABASE || !getServerSupabase() || process.env.SEED_SUPABASE_USERS !== 'true') {
    seedLegacyUsers();
    return;
  }

  try {
    const supabase = getServerSupabase();
    const { data: allUsers } = await supabase.auth.admin.listUsers();
    const existingMap = Object.fromEntries((allUsers?.users || []).map(u => [u.email, u]));

    for (const demo of DEMO_USERS) {
      const existing = existingMap[demo.email];
      if (existing) {
        const meta = existing.user_metadata || {};
        if (!meta.role || meta.name !== demo.name) {
          await supabase.auth.admin.updateUserById(existing.id, {
            password: demo.password,
            email_confirm: true,
            user_metadata: {
              name: demo.name,
              role: demo.role,
              counselor_id: demo.counselor_id,
              branch: demo.branch
            }
          });
          console.log(`  [Supabase] Updated existing user: ${demo.email} (${demo.role})`);
        }
        continue;
      }

      await supabase.auth.admin.createUser({
        email: demo.email,
        password: demo.password,
        email_confirm: true,
        user_metadata: {
          name: demo.name,
          role: demo.role,
          counselor_id: demo.counselor_id,
          branch: demo.branch
        }
      });
      console.log(`  [Supabase] Seeded demo user: ${demo.email} (${demo.role})`);
    }
  } catch (e) {
    console.warn('Supabase auth admin call failed, using legacy auth fallback:', e.message);
    seedLegacyUsers();
  }
}

function seedLegacyUsers() {
  const db = getDB();
  if (!db.users) db.users = [];
  if (db.users.length > 0) return;

  const now = new Date().toISOString();
  db.users = DEMO_USERS.map(u => ({
    id: generateId(),
    name: u.name,
    email: u.email,
    password: hashPassword(u.password),
    role: u.role,
    counselor_id: u.counselor_id,
    branch: u.branch,
    created_at: now
  }));
  saveDB(db);
}


// ===== LOGIN (Supabase email/password or legacy JSON) =====
export async function loginUser(email, password, branch) {
  if (USE_SUPABASE) {
    try {
      const supabase = getServerSupabase();
      if (!supabase) return await loginUserFallback(email, password, branch);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      clearTimeout(timeout);
      if (error || !data?.user) return await loginUserFallback(email, password, branch);
      return buildTokenResult(data.user, branch);
    } catch {
      return await loginUserFallback(email, password, branch);
    }
  }

  return await loginUserFallback(email, password, branch);
}

async function loginUserFallback(email, password, branch) {
  const db = getDB();
  const users = db.users || [];
  const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (!user || !verifyPassword(password, user.password)) return null;

  const payload = {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    counselor_id: user.counselor_id,
    branch: user.branch || branch || 'bareilly'
  };
  const token = signToken(payload);
  return { user: payload, token };
}

// ===== SUPABASE OAUTH TOKEN EXCHANGE =====
export async function loginWithSupabaseAccessToken(accessToken) {
  if (!USE_SUPABASE || !accessToken || !getServerSupabase()) {
    console.warn('loginWithSupabaseAccessToken: Supabase is disabled or access token is empty');
    return null;
  }

  try {
    const supabase = getServerSupabase();
    const { data, error } = await supabase.auth.getUser(accessToken);
    if (error) {
      console.error('Supabase auth.getUser error:', error.message);
      return null;
    }
    if (!data?.user) {
      console.warn('Supabase auth.getUser returned no user data');
      return null;
    }

    const user = data.user;
    const email = user.email;
    let name = user.user_metadata?.name || user.user_metadata?.full_name || email?.split('@')[0] || 'User';
    let role = user.user_metadata?.role || 'student';
    let branch = user.user_metadata?.branch || 'bareilly';
    let counselor_id = user.user_metadata?.counselor_id || null;

    // 1. Check profiles table for pre-existing configuration
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('email', email)
        .maybeSingle();

      if (profile) {
        role = profile.role || role;
        branch = profile.branch || branch;
        name = profile.full_name || profile.name || name;
        counselor_id = profile.counselor_id || counselor_id;
      } else {
        // 2. Check counselors table if they are a counselor
        const { data: counselor } = await supabase
          .from('counselors')
          .select('*')
          .eq('email', email)
          .maybeSingle();
        if (counselor) {
          role = 'counselor';
          branch = counselor.branch || branch;
          name = counselor.name || name;
        }
      }
    } catch (dbErr) {
      console.warn('Supabase profile/counselor DB lookup failed during login:', dbErr.message);
    }

    // 3. Fallback to check local JSON database
    try {
      const db = getDB();
      const localUser = (db.users || []).find(u => u.email === email);
      if (localUser) {
        role = localUser.role || role;
        branch = localUser.branch || branch;
        name = localUser.name || name;
      }
    } catch (localErr) {
      console.warn('Local JSON fallback lookup failed during login:', localErr.message);
    }

    // Construct merged user payload
    const payload = {
      id: user.id,
      email: email,
      name: name,
      role: ['admin', 'counselor', 'student'].includes(role) ? role : 'student',
      counselor_id: counselor_id,
      branch: branch
    };

    // Google OAuth can create a brand-new Supabase Auth user without the
    // database trigger/profile rows (the project migration may have disabled
    // that trigger during seeding). Provision the default student records on
    // first SSO login so the user can enter the student portal immediately.
    try {
      const { error: profileError } = await supabase.from('profiles').upsert({
        id: user.id,
        email: email || '',
        full_name: name,
        role: payload.role,
        counselor_id: counselor_id,
        branch: branch,
        phone: user.user_metadata?.phone || '',
        updated_at: new Date().toISOString()
      }, { onConflict: 'id' });
      if (profileError) throw profileError;

      const { data: portalProfile, error: portalLookupError } = await supabase
        .from('portal_profiles')
        .select('user_id')
        .eq('user_id', user.id)
        .maybeSingle();
      if (portalLookupError) throw portalLookupError;

      if (!portalProfile) {
        const { error: portalInsertError } = await supabase.from('portal_profiles').insert([{
          user_id: user.id,
          name,
          email: email || '',
          phone: user.user_metadata?.phone || '',
          city: '',
          course_id: null,
          stage: 'enquiry',
          counselor_name: 'Admissions team',
          readiness: 35,
          next_step: 'Complete your profile',
          fee_due: '0',
          scholarship: 'Not reviewed yet',
          branch,
          updated_at: new Date().toISOString()
        }]);
        if (portalInsertError) throw portalInsertError;
      }
    } catch (provisionError) {
      // Authentication can still complete if an optional profile write fails;
      // the portal service also attempts lazy profile creation on first load.
      console.warn('Could not provision SSO student profile:', provisionError.message);
    }

    const token = signToken(payload);
    return { user: payload, token };
  } catch (err) {
    console.error('Exception in loginWithSupabaseAccessToken:', err);
    return null;
  }
}

// ===== SIGNUP (students only) =====
export async function signupStudent(email, password, name, phone, branch) {
  const role = 'student';

  if (USE_SUPABASE) {
    try {
      const supabase = getServerSupabase();
      if (!supabase) throw new Error('Supabase not configured');

      const { data, error: authErr } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { name, role, counselor_id: null, branch: branch || 'bareilly', phone: phone || '' }
      });
      if (authErr) return { error: authErr.message };

      const profile = {
        user_id: data.user.id,
        name, email,
        phone: phone || '',
        city: '', course_id: null, stage: 'enquiry',
        counselor_name: 'Admissions team', readiness: 35,
        next_step: 'Complete your profile', fee_due: '0',
        scholarship: 'Not reviewed yet', branch: branch || 'bareilly',
        updated_at: new Date().toISOString()
      };
      await supabase.from('portal_profiles').insert([profile]);
      return buildTokenResult(data.user, branch);
    } catch (e) {
      console.warn('Supabase signup failed, falling back to local JSON:', e.message);
    }
  }

  const db = getDB();
  if (!db.users) db.users = [];
  const existing = db.users.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (existing) return { error: 'Email already registered' };

  const user = {
    id: generateId(),
    name,
    email,
    password: hashPassword(password),
    role,
    counselor_id: null,
    branch: branch || 'bareilly',
    created_at: new Date().toISOString()
  };
  db.users.push(user);

  if (!db.portalProfiles) db.portalProfiles = {};
  db.portalProfiles[user.id] = {
    user_id: user.id,
    name,
    email,
    phone: phone || '',
    city: '',
    course_id: null,
    stage: 'enquiry',
    counselor_name: 'Admissions team',
    readiness: 35,
    next_step: 'Complete your profile',
    fee_due: '0',
    scholarship: 'Not reviewed yet',
    branch: branch || 'bareilly',
    updated_at: new Date().toISOString()
  };
  saveDB(db);

  return buildTokenResult(user, branch);
}

// ===== USER CRUD (Admin — creates in Supabase Auth) =====
export async function getUsers() {
  if (USE_SUPABASE) {
    try {
      const supabase = getServerSupabase();
      const { data, error } = await supabase.from('profiles').select('*').order('updated_at', { ascending: false });
      if (error) {
        if (error.code === '42P01' || error.message?.includes('does not exist')) return [];
        throw error;
      }
      return (data || []).map(p => ({
        id: p.id,
        name: p.full_name || p.name || p.email,
        email: p.email,
        role: p.role,
        counselor_id: p.counselor_id,
        branch: p.branch || 'bareilly',
        created_at: p.created_at,
        phone: p.phone,
        password: undefined
      }));
    } catch (error) {
      console.warn('Supabase users read failed, using local JSON fallback:', error.message);
    }
  }

  const db = getDB();
  return (db.users || []).map(u => ({ ...u, password: undefined }));
}

export async function createUser(data) {
  if (USE_SUPABASE) {
    const supabase = getServerSupabase();
    const pw = data.password || randomBytes(12).toString('base64url');
    const { data: created, error } = await supabase.auth.admin.createUser({
      email: data.email,
      password: pw,
      email_confirm: true,
      user_metadata: {
        name: data.name,
        role: data.role || 'counselor',
        counselor_id: data.counselor_id ?? null,
        branch: data.branch || 'bareilly',
        phone: data.phone || ''
      }
    });
    if (error) throw new Error(error.message);

    const uid = created.user.id;
    await supabase.from('profiles').upsert({
      id: uid,
      email: data.email,
      full_name: data.name,
      role: data.role || 'counselor',
      counselor_id: data.counselor_id ?? null,
      branch: data.branch || 'bareilly',
      phone: data.phone || '',
      updated_at: new Date().toISOString()
    }, { onConflict: 'id' });

    return {
      id: uid,
      email: data.email,
      name: data.name,
      role: data.role || 'counselor',
      counselor_id: data.counselor_id ?? null,
      branch: data.branch || 'bareilly'
    };
  }

  const db = getDB();
  if (!db.users) db.users = [];
  const existing = db.users.find(u => u.email.toLowerCase() === data.email.toLowerCase());
  if (existing) throw new Error('Email already exists');
  const user = {
    id: generateId(),
    ...data,
    password: hashPassword(data.password || 'changeme123'),
    created_at: new Date().toISOString()
  };
  db.users.push(user);
  saveDB(db);
  return { ...user, password: undefined };
}

export async function updateUser(id, data) {
  if (USE_SUPABASE) {
    const supabase = getServerSupabase();
    const { data: authData, error: guErr } = await supabase.auth.admin.getUserById(id);
    if (guErr || !authData?.user) throw new Error('User not found');

    const prevMeta = authData.user.user_metadata || {};
    const meta = { ...prevMeta };
    if (data.name != null) meta.name = data.name;
    if (data.role != null) meta.role = data.role;
    if (data.counselor_id !== undefined) meta.counselor_id = data.counselor_id;
    if (data.branch != null) meta.branch = data.branch;
    if (data.phone !== undefined) meta.phone = data.phone;

    const { error: upErr } = await supabase.auth.admin.updateUserById(id, {
      ...(data.email != null ? { email: data.email } : {}),
      ...(data.password != null ? { password: data.password } : {}),
      user_metadata: meta
    });
    if (upErr) throw new Error(upErr.message);

    const patch = { updated_at: new Date().toISOString() };
    if (data.name != null) patch.full_name = data.name;
    if (data.email != null) patch.email = data.email;
    if (data.role != null) patch.role = data.role;
    if (data.counselor_id !== undefined) patch.counselor_id = data.counselor_id;
    if (data.branch != null) patch.branch = data.branch;
    if (data.phone !== undefined) patch.phone = data.phone;

    await supabase.from('profiles').update(patch).eq('id', id);

    const { data: rows } = await supabase.from('profiles').select('*').eq('id', id).maybeSingle();
    if (!rows) throw new Error('User not found');
    return {
      id: rows.id,
      name: rows.full_name,
      email: rows.email,
      role: rows.role,
      counselor_id: rows.counselor_id,
      branch: rows.branch,
      phone: rows.phone
    };
  }

  const db = getDB();
  const idx = (db.users || []).findIndex(u => u.id === id);
  if (idx === -1) throw new Error('User not found');
  db.users[idx] = { ...db.users[idx], ...data };
  saveDB(db);
  return { ...db.users[idx], password: undefined };
}

export async function deleteUser(id) {
  if (USE_SUPABASE) {
    const supabase = getServerSupabase();
    await supabase.from('profiles').delete().eq('id', id);
    const { error } = await supabase.auth.admin.deleteUser(id);
    if (error) throw new Error(error.message);
    return;
  }

  const db = getDB();
  db.users = (db.users || []).filter(u => u.id !== id);
  saveDB(db);
}

// ===== MIDDLEWARE =====
export function requireAuth(req, res, next) {
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized — no token' });
  }
  const token = auth.slice(7);
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized — empty token' });
  }
  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ error: 'Unauthorized — invalid token' });
  }
  req.user = payload;
  next();
}

export function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    next();
  });
}
