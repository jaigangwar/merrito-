import * as appStore from '../appStore.js';

export const getApplications = async (req, res) => {
  try {
    const items = await appStore.listApplications(req.user);
    res.json(items);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const exportApplicationsCSV = async (req, res) => {
  try {
    const items = await appStore.listApplications(req.user);
    const headers = ['Student', 'Email', 'Course', 'Status', 'Docs', 'Counselor', 'Priority', 'Date'];
    const rows = items.map(i => [
      i.student_name, i.email || '', i.course_name || '',
      i.status, i.documents_status, i.counselor_name,
      i.priority, new Date(i.created_at).toLocaleDateString('en-IN')
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
    const csv = [headers.join(','), ...rows].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="applications.csv"');
    res.send(csv);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const createApplication = async (req, res) => {
  try {
    const item = await appStore.insertApplication(req.user, req.body);
    res.status(201).json(item);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const updateApplication = async (req, res) => {
  try {
    const item = await appStore.patchApplication(req.user, req.params.id, req.body);
    res.json(item);
  } catch (error) {
    const code = error.message === 'Application not found' ? 404 : error.message === 'Access denied' ? 403 : 500;
    res.status(code).json({ error: error.message });
  }
};

export const getQueries = async (req, res) => {
  try {
    const items = await appStore.listQueries(req.user);
    res.json(items);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const createQuery = async (req, res) => {
  try {
    const item = await appStore.insertQuery(req.user, req.body);
    res.status(201).json(item);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const updateQuery = async (req, res) => {
  try {
    const item = await appStore.patchQuery(req.user, req.params.id, req.body);
    res.json(item);
  } catch (error) {
    const code = error.message === 'Query not found' ? 404 : error.message === 'Access denied' ? 403 : 500;
    res.status(code).json({ error: error.message });
  }
};

export const getPayments = async (req, res) => {
  try {
    const items = await appStore.listPayments(req.user);
    res.json(items);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const exportPaymentsCSV = async (req, res) => {
  try {
    const items = await appStore.listPayments(req.user);
    const headers = ['Student', 'Title', 'Amount', 'Status', 'Method', 'Due Date', 'Receipt No', 'Date'];
    const rows = items.map(i => [
      i.student_name, i.title, i.amount, i.status,
      i.method || '', i.due_date || '', i.receipt_no || '',
      new Date(i.created_at).toLocaleDateString('en-IN')
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
    const csv = [headers.join(','), ...rows].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="payments.csv"');
    res.send(csv);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const createPayment = async (req, res) => {
  try {
    if (req.user.role === 'student') return res.status(403).json({ error: 'Admin or counselor access required' });
    const item = await appStore.insertPayment(req.user, req.body);
    res.status(201).json(item);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const updatePayment = async (req, res) => {
  try {
    const item = await appStore.patchPayment(req.user, req.params.id, req.body);
    res.json(item);
  } catch (error) {
    const code = error.message === 'Payment not found' ? 404 : error.message === 'Access denied' ? 403 : 500;
    res.status(code).json({ error: error.message });
  }
};

export const getLetterTemplates = async (req, res) => {
  try {
    const items = await appStore.listLetterTemplates();
    res.json(items);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const createLetterTemplate = async (req, res) => {
  try {
    const item = await appStore.insertLetterTemplate(req.body);
    res.status(201).json(item);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const updateLetterTemplate = async (req, res) => {
  try {
    const item = await appStore.patchLetterTemplate(req.params.id, req.body);
    res.json(item);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getOfferLetters = async (req, res) => {
  try {
    const items = await appStore.listOfferLetters(req.query.application_id);
    res.json(items);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const generateOfferLetter = async (req, res) => {
  try {
    const { applicationId, templateId } = req.body;
    const item = await appStore.generateOfferLetter(applicationId, templateId);
    res.status(201).json(item);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

