// ===== BATCH CONTROLLER - Batch & Section Management =====
import { generateId, getDB, saveDB } from '../db.js';
import * as db from '../supabase.js';

// Get all batches
export async function getBatches(req, res) {
  try {
    const { course_id, academic_year, status } = req.query;
    const dbData = getDB();
    let batches = dbData.batches || [];

    if (course_id) {
      batches = batches.filter(b => b.course_id === course_id);
    }
    if (academic_year) {
      batches = batches.filter(b => b.academic_year === academic_year);
    }
    if (status) {
      batches = batches.filter(b => b.status === status);
    }

    // Enrich with course details
    const courses = await db.getCourses();
    const courseMap = Object.fromEntries(courses.map(c => [c.id, c]));

    const enriched = batches.map(b => ({
      ...b,
      course_name: courseMap[b.course_id]?.name || 'N/A',
      student_count: (dbData.batch_students || []).filter(bs => bs.batch_id === b.id).length
    }));

    res.json({ data: enriched, total: enriched.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Create batch
export async function createBatch(req, res) {
  try {
    const {
      name,
      course_id,
      academic_year,
      start_date,
      end_date,
      max_students,
      sections
    } = req.body;

    if (!name || !course_id || !academic_year) {
      return res.status(400).json({ error: 'name, course_id, and academic_year are required' });
    }

    const dbData = getDB();
    if (!dbData.batches) dbData.batches = [];

    const batch = {
      id: generateId(),
      name,
      course_id,
      academic_year,
      start_date: start_date || null,
      end_date: end_date || null,
      max_students: max_students || 60,
      sections: sections || ['A'], // Default section A
      status: 'active', // active, completed, cancelled
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    dbData.batches.push(batch);
    saveDB(dbData);

    res.status(201).json(batch);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Assign student to batch
export async function assignStudentToBatch(req, res) {
  try {
    const { batch_id, lead_id, section, roll_number } = req.body;

    if (!batch_id || !lead_id) {
      return res.status(400).json({ error: 'batch_id and lead_id are required' });
    }

    const dbData = getDB();
    if (!dbData.batch_students) dbData.batch_students = [];

    // Check if already assigned
    const existing = dbData.batch_students.find(
      bs => bs.batch_id === batch_id && bs.lead_id === lead_id
    );
    if (existing) {
      return res.status(400).json({ error: 'Student already assigned to this batch' });
    }

    // Check batch capacity
    const batch = dbData.batches?.find(b => b.id === batch_id);
    if (!batch) {
      return res.status(404).json({ error: 'Batch not found' });
    }

    const currentCount = dbData.batch_students.filter(bs => bs.batch_id === batch_id).length;
    if (currentCount >= batch.max_students) {
      return res.status(400).json({ error: 'Batch is full' });
    }

    const assignment = {
      id: generateId(),
      batch_id,
      lead_id,
      section: section || 'A',
      roll_number: roll_number || `${batch.academic_year}${String(currentCount + 1).padStart(3, '0')}`,
      assigned_at: new Date().toISOString()
    };

    dbData.batch_students.push(assignment);
    saveDB(dbData);

    // Create activity
    await db.createActivity({
      lead_id,
      type: 'batch_assigned',
      message: `Assigned to batch ${batch.name} - Section ${assignment.section}`
    });

    res.status(201).json(assignment);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Get batch students
export async function getBatchStudents(req, res) {
  try {
    const { batch_id, section } = req.query;
    const dbData = getDB();
    let students = dbData.batch_students || [];

    if (batch_id) {
      students = students.filter(s => s.batch_id === batch_id);
    }
    if (section) {
      students = students.filter(s => s.section === section);
    }

    // Enrich with lead details
    const leads = await db.getLeads({});
    const leadMap = Object.fromEntries(leads.map(l => [l.id, l]));

    const enriched = students.map(s => {
      const lead = leadMap[s.lead_id];
      return {
        ...s,
        student_name: lead ? `${lead.first_name} ${lead.last_name}` : 'Unknown',
        email: lead?.email || '',
        phone: lead?.phone || ''
      };
    });

    res.json({ data: enriched, total: enriched.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Update batch
export async function updateBatch(req, res) {
  try {
    const { id } = req.params;
    const dbData = getDB();
    const batch = dbData.batches?.find(b => b.id === id);

    if (!batch) {
      return res.status(404).json({ error: 'Batch not found' });
    }

    Object.assign(batch, req.body, { updated_at: new Date().toISOString() });
    saveDB(dbData);

    res.json(batch);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
