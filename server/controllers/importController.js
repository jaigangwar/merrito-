// ===== IMPORT CONTROLLER - Bulk Lead Import =====
import * as db from '../supabase.js';
import { generateId } from '../db.js';

// Parse CSV content
function parseCSV(content) {
  const lines = content.trim().split('\n');
  if (lines.length < 2) throw new Error('CSV must have at least a header row and one data row');
  
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  const rows = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
    const row = {};
    headers.forEach((header, index) => {
      row[header.toLowerCase().replace(/\s+/g, '_')] = values[index] || '';
    });
    rows.push(row);
  }
  
  return rows;
}

// Normalize phone number
function normalizePhone(value = '') {
  const digits = String(value).replace(/\D/g, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
}

// Normalize email
function normalizeEmail(value = '') {
  return String(value).trim().toLowerCase();
}

// Check for duplicate
async function isDuplicate(phone, email) {
  const phoneKey = normalizePhone(phone);
  const emailKey = normalizeEmail(email);
  if (!phoneKey && !emailKey) return false;

  const leads = await db.getLeads({});
  return leads.some(l => {
    const samePhone = phoneKey && normalizePhone(l.phone) === phoneKey;
    const sameEmail = emailKey && normalizeEmail(l.email) === emailKey;
    return samePhone || sameEmail;
  });
}

// Auto-assign least loaded counselor
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

// Match course by name
async function matchCourse(courseName) {
  if (!courseName) return null;
  const courses = await db.getCourses();
  const found = courses.find(c => 
    c.name.toLowerCase().includes(courseName.toLowerCase()) || 
    c.code.toLowerCase() === courseName.toLowerCase()
  );
  return found?.id || null;
}

// Import leads from CSV
export async function importLeads(req, res) {
  try {
    const { csvContent, skipDuplicates = true } = req.body;
    
    if (!csvContent) {
      return res.status(400).json({ error: 'CSV content is required' });
    }

    const rows = parseCSV(csvContent);
    const results = {
      total: rows.length,
      imported: 0,
      skipped: 0,
      errors: [],
      duplicates: []
    };

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      
      try {
        // Required fields validation
        const firstName = row.first_name || row.name?.split(' ')[0] || '';
        const lastName = row.last_name || row.name?.split(' ').slice(1).join(' ') || '';
        const phone = row.phone || row.mobile || '';
        const email = row.email || '';

        if (!firstName || !phone) {
          results.errors.push({ row: i + 2, error: 'Missing required fields: first_name and phone' });
          results.skipped++;
          continue;
        }

        // Check for duplicates
        if (skipDuplicates && await isDuplicate(phone, email)) {
          results.duplicates.push({ row: i + 2, name: `${firstName} ${lastName}`.trim(), phone, email });
          results.skipped++;
          continue;
        }

        // Match course
        const courseId = await matchCourse(row.course || row.program);

        // Auto-assign counselor
        const counselorId = await assignLeastLoadedCounselor();

        // Create lead
        const lead = await db.createLead({
          first_name: firstName,
          last_name: lastName,
          email: email,
          phone: phone,
          course_id: courseId,
          source: row.source || 'Bulk Import',
          stage: row.stage || 'enquiry',
          counselor_id: counselorId,
          priority: row.priority || 'medium',
          city: row.city || '',
          notes: row.notes || ''
        });

        // Create activity
        await db.createActivity({
          lead_id: lead.id,
          type: 'lead_added',
          message: `Lead ${firstName} ${lastName} imported via CSV`
        });

        results.imported++;
      } catch (error) {
        results.errors.push({ row: i + 2, error: error.message });
        results.skipped++;
      }
    }

    res.json({
      success: true,
      message: `Import completed: ${results.imported} imported, ${results.skipped} skipped`,
      results
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Download sample CSV template
export async function downloadTemplate(req, res) {
  try {
    const headers = [
      'first_name',
      'last_name',
      'email',
      'phone',
      'course',
      'source',
      'city',
      'priority',
      'notes'
    ];

    const sampleRows = [
      ['Rahul', 'Sharma', 'rahul@example.com', '9876543210', 'MBA', 'Website', 'Delhi', 'high', 'Interested in MBA program'],
      ['Priya', 'Singh', 'priya@example.com', '9876543211', 'BBA', 'Referral', 'Mumbai', 'medium', 'Looking for BBA admission']
    ];

    const csv = [
      headers.join(','),
      ...sampleRows.map(row => row.map(v => `"${v}"`).join(','))
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="lead-import-template.csv"');
    res.send(csv);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Validate CSV before import
export async function validateCSV(req, res) {
  try {
    const { csvContent } = req.body;
    
    if (!csvContent) {
      return res.status(400).json({ error: 'CSV content is required' });
    }

    const rows = parseCSV(csvContent);
    const validation = {
      totalRows: rows.length,
      validRows: 0,
      invalidRows: 0,
      errors: [],
      warnings: []
    };

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2;
      let isValid = true;

      // Check required fields
      const firstName = row.first_name || row.name?.split(' ')[0] || '';
      const phone = row.phone || row.mobile || '';

      if (!firstName) {
        validation.errors.push({ row: rowNum, field: 'first_name', message: 'First name is required' });
        isValid = false;
      }

      if (!phone) {
        validation.errors.push({ row: rowNum, field: 'phone', message: 'Phone number is required' });
        isValid = false;
      }

      // Check phone format
      if (phone && !/^\+?[\d\s-]{10,15}$/.test(phone)) {
        validation.warnings.push({ row: rowNum, field: 'phone', message: 'Phone number format may be invalid' });
      }

      // Check email format
      const email = row.email || '';
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        validation.warnings.push({ row: rowNum, field: 'email', message: 'Email format may be invalid' });
      }

      // Check for duplicates
      if (await isDuplicate(phone, email)) {
        validation.warnings.push({ row: rowNum, message: 'Potential duplicate lead' });
      }

      if (isValid) {
        validation.validRows++;
      } else {
        validation.invalidRows++;
      }
    }

    res.json({
      success: true,
      validation
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
