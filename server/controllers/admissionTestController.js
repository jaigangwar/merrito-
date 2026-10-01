// ===== ADMISSION TEST CONTROLLER - Test Management =====
import { generateId, getDB, saveDB } from '../db.js';
import * as db from '../supabase.js';

// Get all admission tests
export async function getAdmissionTests(req, res) {
  try {
    const { status, course_id } = req.query;
    const dbData = getDB();
    let tests = dbData.admission_tests || [];

    if (status) {
      tests = tests.filter(t => t.status === status);
    }
    if (course_id) {
      tests = tests.filter(t => t.course_id === course_id);
    }

    // Enrich with course details
    const courses = await db.getCourses();
    const courseMap = Object.fromEntries(courses.map(c => [c.id, c]));

    const enriched = tests.map(t => ({
      ...t,
      course_name: courseMap[t.course_id]?.name || 'N/A',
      registered_count: (dbData.test_registrations || []).filter(r => r.test_id === t.id).length
    }));

    res.json({ data: enriched, total: enriched.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Create admission test
export async function createAdmissionTest(req, res) {
  try {
    const {
      name,
      course_id,
      test_date,
      duration_minutes,
      total_marks,
      passing_marks,
      venue,
      instructions,
      syllabus
    } = req.body;

    if (!name || !course_id || !test_date) {
      return res.status(400).json({ error: 'name, course_id, and test_date are required' });
    }

    const dbData = getDB();
    if (!dbData.admission_tests) dbData.admission_tests = [];

    const test = {
      id: generateId(),
      name,
      course_id,
      test_date,
      duration_minutes: duration_minutes || 120,
      total_marks: total_marks || 100,
      passing_marks: passing_marks || 40,
      venue: venue || '',
      instructions: instructions || '',
      syllabus: syllabus || '',
      status: 'scheduled', // scheduled, ongoing, completed, cancelled
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    dbData.admission_tests.push(test);
    saveDB(dbData);

    res.status(201).json(test);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Register lead for test
export async function registerForTest(req, res) {
  try {
    const { test_id, lead_id } = req.body;

    if (!test_id || !lead_id) {
      return res.status(400).json({ error: 'test_id and lead_id are required' });
    }

    const dbData = getDB();
    if (!dbData.test_registrations) dbData.test_registrations = [];

    // Check if already registered
    const existing = dbData.test_registrations.find(r => r.test_id === test_id && r.lead_id === lead_id);
    if (existing) {
      return res.status(400).json({ error: 'Already registered for this test' });
    }

    const registration = {
      id: generateId(),
      test_id,
      lead_id,
      roll_number: `ROLL${Date.now()}${Math.floor(Math.random() * 1000)}`,
      status: 'registered', // registered, appeared, absent
      marks_obtained: null,
      result: null, // pass, fail
      registered_at: new Date().toISOString()
    };

    dbData.test_registrations.push(registration);
    saveDB(dbData);

    // Create activity
    await db.createActivity({
      lead_id,
      type: 'test_registered',
      message: `Registered for admission test`
    });

    res.status(201).json(registration);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Submit test result
export async function submitTestResult(req, res) {
  try {
    const { registration_id, marks_obtained, status } = req.body;

    if (!registration_id || marks_obtained === undefined) {
      return res.status(400).json({ error: 'registration_id and marks_obtained are required' });
    }

    const dbData = getDB();
    const registration = dbData.test_registrations?.find(r => r.id === registration_id);

    if (!registration) {
      return res.status(404).json({ error: 'Registration not found' });
    }

    const test = dbData.admission_tests?.find(t => t.id === registration.test_id);
    const result = marks_obtained >= test.passing_marks ? 'pass' : 'fail';

    registration.marks_obtained = marks_obtained;
    registration.status = status || 'appeared';
    registration.result = result;
    registration.result_date = new Date().toISOString();

    saveDB(dbData);

    // Create activity
    await db.createActivity({
      lead_id: registration.lead_id,
      type: 'test_result',
      message: `Test result: ${result.toUpperCase()} (${marks_obtained}/${test.total_marks})`
    });

    res.json(registration);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Get test registrations
export async function getTestRegistrations(req, res) {
  try {
    const { test_id, lead_id } = req.query;
    const dbData = getDB();
    let registrations = dbData.test_registrations || [];

    if (test_id) {
      registrations = registrations.filter(r => r.test_id === test_id);
    }
    if (lead_id) {
      registrations = registrations.filter(r => r.lead_id === lead_id);
    }

    // Enrich with lead and test details
    const leads = await db.getLeads({});
    const tests = dbData.admission_tests || [];
    const leadMap = Object.fromEntries(leads.map(l => [l.id, l]));
    const testMap = Object.fromEntries(tests.map(t => [t.id, t]));

    const enriched = registrations.map(r => {
      const lead = leadMap[r.lead_id];
      const test = testMap[r.test_id];
      return {
        ...r,
        lead_name: lead ? `${lead.first_name} ${lead.last_name}` : 'Unknown',
        test_name: test?.name || 'Unknown'
      };
    });

    res.json({ data: enriched, total: enriched.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Generate merit list
export async function generateMeritList(req, res) {
  try {
    const { test_id } = req.params;

    const dbData = getDB();
    const registrations = (dbData.test_registrations || [])
      .filter(r => r.test_id === test_id && r.result === 'pass')
      .sort((a, b) => (b.marks_obtained || 0) - (a.marks_obtained || 0));

    const leads = await db.getLeads({});
    const leadMap = Object.fromEntries(leads.map(l => [l.id, l]));

    const meritList = registrations.map((r, index) => {
      const lead = leadMap[r.lead_id];
      return {
        rank: index + 1,
        roll_number: r.roll_number,
        name: lead ? `${lead.first_name} ${lead.last_name}` : 'Unknown',
        marks_obtained: r.marks_obtained,
        result: r.result
      };
    });

    res.json({ test_id, merit_list: meritList, total: meritList.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
