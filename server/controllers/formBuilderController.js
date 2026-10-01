import * as db from '../supabase.js';
import { calculateLeadScore } from './leadController.js';

// Form builder - admins can create custom lead capture forms
export async function getForms(req, res) {
  try {
    const forms = db.getDB().forms || [];
    res.json({ data: forms, total: forms.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export async function getFormById(req, res) {
  try {
    const { id } = req.params;
    const forms = db.getDB().forms || [];
    const form = forms.find(f => f.id === id);
    if (!form) return res.status(404).json({ error: 'Form not found' });
    res.json(form);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export async function createForm(req, res) {
  try {
    const { name, description, fields, course_id, redirectUrl } = req.body;

    if (!name || !fields || fields.length === 0) {
      return res.status(400).json({ error: 'Name and fields required' });
    }

    const newForm = {
      id: db.generateId?.() || Math.random().toString(36).substr(2, 9),
      name,
      description,
      fields,
      course_id: course_id || null,
      redirectUrl: redirectUrl || '',
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      submissions_count: 0
    };

    const data = db.getDB();
    if (!data.forms) data.forms = [];
    data.forms.push(newForm);
    db.saveDB(data);

    res.status(201).json(newForm);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export async function updateForm(req, res) {
  try {
    const { id } = req.params;
    const updates = req.body;

    const data = db.getDB();
    const forms = data.forms || [];
    const formIndex = forms.findIndex(f => f.id === id);

    if (formIndex === -1) return res.status(404).json({ error: 'Form not found' });

    forms[formIndex] = {
      ...forms[formIndex],
      ...updates,
      id: forms[formIndex].id,
      created_at: forms[formIndex].created_at,
      updated_at: new Date().toISOString()
    };

    data.forms = forms;
    db.saveDB(data);
    res.json(forms[formIndex]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export async function deleteForm(req, res) {
  try {
    const { id } = req.params;
    const data = db.getDB();
    data.forms = (data.forms || []).filter(f => f.id !== id);
    db.saveDB(data);
    res.json({ message: 'Form deleted' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

// Get form embed code
export async function getFormEmbed(req, res) {
  try {
    const { id } = req.params;
    const forms = db.getDB().forms || [];
    const form = forms.find(f => f.id === id);

    if (!form) return res.status(404).json({ error: 'Form not found' });

    const embedCode = `<iframe
  src="${process.env.BASE_URL || 'http://localhost:3001'}/form/${id}"
  width="100%"
  height="600"
  frameborder="0"
  scrolling="auto">
</iframe>`;

    res.json({ embed_code: embedCode, form_url: `/form/${id}` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

// Submit form (public, no auth required)
export async function submitFormPublic(req, res) {
  try {
    const { id } = req.params;
    const formData = req.body;

    const data = db.getDB();
    const forms = data.forms || [];
    const form = forms.find(f => f.id === id);

    if (!form) return res.status(404).json({ error: 'Form not found' });
    if (form.status !== 'active') return res.status(400).json({ error: 'Form is not active' });

    // Validate required fields
    for (const field of form.fields) {
      if (field.required && !formData[field.name]) {
        return res.status(400).json({ error: `${field.label} is required` });
      }
    }

    // Create lead from form submission
    const leadData = {
      first_name: formData.first_name || '',
      last_name: formData.last_name || '',
      email: formData.email || '',
      phone: formData.phone || '',
      course_id: form.course_id,
      source: `Form: ${form.name}`,
      stage: 'enquiry',
      priority: 'medium',
      city: formData.city || '',
      notes: `Submitted via form: ${form.name}. Additional info: ${JSON.stringify(formData)}`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    // Calculate lead score
    leadData.lead_score = calculateLeadScore(leadData);
    leadData.id = db.generateId?.() || Math.random().toString(36).substr(2, 9);

    // Add to leads
    if (!data.leads) data.leads = [];
    data.leads.push(leadData);

    // Update submission count
    const formIndex = forms.findIndex(f => f.id === id);
    forms[formIndex].submissions_count = (forms[formIndex].submissions_count || 0) + 1;
    data.forms = forms;

    // Store form submission
    if (!data.form_submissions) data.form_submissions = [];
    data.form_submissions.push({
      id: db.generateId?.() || Math.random().toString(36).substr(2, 9),
      form_id: id,
      lead_id: leadData.id,
      data: formData,
      submitted_at: new Date().toISOString()
    });

    db.saveDB(data);

    // Return success with redirect
    res.json({
      success: true,
      message: 'Form submitted successfully!',
      lead_id: leadData.id,
      redirect_url: form.redirectUrl || '/thank-you'
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

// Get form submissions
export async function getFormSubmissions(req, res) {
  try {
    const { id } = req.params;
    const submissions = (db.getDB().form_submissions || []).filter(s => s.form_id === id);
    res.json({ data: submissions, total: submissions.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
