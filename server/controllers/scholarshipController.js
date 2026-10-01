// ===== SCHOLARSHIP CONTROLLER - Scholarship Management =====
import { generateId, getDB, saveDB } from '../db.js';
import * as db from '../supabase.js';

// Get all scholarships
export async function getScholarships(req, res) {
  try {
    const { status, type } = req.query;
    const dbData = getDB();
    let scholarships = dbData.scholarships || [];

    if (status) {
      scholarships = scholarships.filter(s => s.status === status);
    }
    if (type) {
      scholarships = scholarships.filter(s => s.type === type);
    }

    res.json({ data: scholarships, total: scholarships.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Create scholarship
export async function createScholarship(req, res) {
  try {
    const {
      name,
      type, // merit, need-based, sports, minority, etc.
      amount,
      percentage,
      eligibility_criteria,
      required_documents,
      deadline,
      max_recipients
    } = req.body;

    if (!name || !type) {
      return res.status(400).json({ error: 'name and type are required' });
    }

    const dbData = getDB();
    if (!dbData.scholarships) dbData.scholarships = [];

    const scholarship = {
      id: generateId(),
      name,
      type,
      amount: amount || 0,
      percentage: percentage || 0,
      eligibility_criteria: eligibility_criteria || '',
      required_documents: required_documents || [],
      deadline: deadline || null,
      max_recipients: max_recipients || null,
      status: 'active', // active, inactive, closed
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    dbData.scholarships.push(scholarship);
    saveDB(dbData);

    res.status(201).json(scholarship);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Apply for scholarship
export async function applyForScholarship(req, res) {
  try {
    const { scholarship_id, lead_id, documents, justification } = req.body;

    if (!scholarship_id || !lead_id) {
      return res.status(400).json({ error: 'scholarship_id and lead_id are required' });
    }

    const dbData = getDB();
    if (!dbData.scholarship_applications) dbData.scholarship_applications = [];

    // Check if already applied
    const existing = dbData.scholarship_applications.find(
      a => a.scholarship_id === scholarship_id && a.lead_id === lead_id
    );
    if (existing) {
      return res.status(400).json({ error: 'Already applied for this scholarship' });
    }

    const application = {
      id: generateId(),
      scholarship_id,
      lead_id,
      documents: documents || [],
      justification: justification || '',
      status: 'pending', // pending, under_review, approved, rejected
      applied_at: new Date().toISOString(),
      reviewed_at: null,
      reviewed_by: null,
      remarks: ''
    };

    dbData.scholarship_applications.push(application);
    saveDB(dbData);

    // Create activity
    await db.createActivity({
      lead_id,
      type: 'scholarship_applied',
      message: `Applied for scholarship`
    });

    res.status(201).json(application);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Review scholarship application
export async function reviewScholarshipApplication(req, res) {
  try {
    const { application_id, status, remarks } = req.body;

    if (!application_id || !status) {
      return res.status(400).json({ error: 'application_id and status are required' });
    }

    const dbData = getDB();
    const application = dbData.scholarship_applications?.find(a => a.id === application_id);

    if (!application) {
      return res.status(404).json({ error: 'Application not found' });
    }

    application.status = status;
    application.remarks = remarks || '';
    application.reviewed_at = new Date().toISOString();
    application.reviewed_by = req.user.id;

    saveDB(dbData);

    // Create activity
    await db.createActivity({
      lead_id: application.lead_id,
      type: 'scholarship_reviewed',
      message: `Scholarship application ${status}: ${remarks || 'No remarks'}`
    });

    res.json(application);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Get scholarship applications
export async function getScholarshipApplications(req, res) {
  try {
    const { scholarship_id, lead_id, status } = req.query;
    const dbData = getDB();
    let applications = dbData.scholarship_applications || [];

    if (scholarship_id) {
      applications = applications.filter(a => a.scholarship_id === scholarship_id);
    }
    if (lead_id) {
      applications = applications.filter(a => a.lead_id === lead_id);
    }
    if (status) {
      applications = applications.filter(a => a.status === status);
    }

    // Enrich with details
    const leads = await db.getLeads({});
    const scholarships = dbData.scholarships || [];
    const leadMap = Object.fromEntries(leads.map(l => [l.id, l]));
    const scholarshipMap = Object.fromEntries(scholarships.map(s => [s.id, s]));

    const enriched = applications.map(a => {
      const lead = leadMap[a.lead_id];
      const scholarship = scholarshipMap[a.scholarship_id];
      return {
        ...a,
        lead_name: lead ? `${lead.first_name} ${lead.last_name}` : 'Unknown',
        scholarship_name: scholarship?.name || 'Unknown',
        scholarship_amount: scholarship?.amount || 0
      };
    });

    res.json({ data: enriched, total: enriched.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
