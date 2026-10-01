// ===== JSON FILE DATABASE =====
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, 'data.json');

// Default empty structure
const DEFAULT_DB = {
  leads: [],
  counselors: [],
  courses: [],
  activities: [],
  tasks: []
};

// Shared mutable in-memory cache — all callers mutate the same object,
// eliminating read-modify-write races. Periodic flushes to disk.
let dbCache = null;
let flushPending = false;
const flushQueue = [];

function readDB() {
  try {
    if (fs.existsSync(DB_PATH)) {
      const raw = fs.readFileSync(DB_PATH, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (e) {
    console.error('Error reading DB:', e.message);
  }
  return { ...DEFAULT_DB };
}

function writeDB(data) {
  try {
    fs.writeFile(DB_PATH, JSON.stringify(data, null, 2), 'utf-8', (err) => {
      if (err) console.error('Error writing DB:', err.message);
    });
  } catch (e) {
    console.error('Error writing DB:', e.message);
  }
}

// Load cache on first access, then always return the same mutable reference
export function getDB() {
  if (!dbCache) {
    dbCache = readDB();
  }
  return dbCache;
}

// Schedule an async flush of the in-memory cache to disk.
// Multiple callers that call saveDB in the same microtask tick are batched.
// The `data` argument is accepted for backward compatibility but ignored —
// all mutations happen in-place on the shared dbCache reference.
export async function saveDB(data) {
  if (!flushPending) {
    flushPending = true;
    // Yield once to batch concurrent synchronous callers
    await Promise.resolve();
    flushPending = false;
    writeDB(dbCache);
  }
}

export function generateId() {
  return randomUUID();
}

// ===== SEED DATA =====
export function seedIfEmpty() {
  const db = readDB();
  if (db.counselors && db.counselors.length > 0) {
    console.log('  Database already initialized, skipping seed.');
    return;
  }

  // Never populate business records with fictional counselors/courses. Real
  // deployments add these through the admin UI or Supabase. Keep this
  // initializer limited to an empty, writable local store.
  const emptyStore = {
    ...db,
    leads: [],
    counselors: [],
    courses: [],
    activities: [],
    tasks: []
  };
  writeDB(emptyStore);
  console.log('  Initialized empty local database (add real counselors and courses from Settings).');
  return;

}
