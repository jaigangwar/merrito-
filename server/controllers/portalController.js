import * as appStore from '../appStore.js';
import * as db from '../supabase.js';
import { REAL_DATA_MODE } from '../supabase.js';
import { getDB, saveDB, generateId } from '../db.js';

// Helper functions that were in index.js but are needed for marketing/portal
function ensureMarketingModules() {
  const dbData = getDB();
  if (REAL_DATA_MODE) {
    if (!Array.isArray(dbData.notificationCenter)) dbData.notificationCenter = [];
    return dbData;
  }
  let changed = false;
  const now = new Date().toISOString();
  const leads = dbData.leads || [];
  const lead = leads[0] || {
    id: 'demo-student',
    first_name: 'krishna',
    last_name: 'jaiswal',
    email: 'student@demo.in',
    phone: '+91 90123 45678',
    city: 'Bareilly'
  };
  const leadName = `${lead.first_name || 'Aarav'} ${lead.last_name || 'Mehta'}`.trim();

  if (!dbData.communicationIntegrations) {
    dbData.communicationIntegrations = {
      email: { enabled: true, provider: 'SMTP relay', sender: 'admissions@rbmi.edu.in' },
      sms: { enabled: true, provider: 'MSG91', sender: 'RBMIAD' },
      whatsapp: { enabled: true, provider: 'WhatsApp Business Cloud', sender: '+91 581 250 0000' },
      ivr: { enabled: true, provider: 'Exotel', sender: 'IVR Queue A' },
      push: { enabled: true, provider: 'Firebase Cloud Messaging', sender: 'RBMI Hub App' }
    };
    changed = true;
  }

  if (!dbData.communicationTemplates || dbData.communicationTemplates.length === 0) {
    dbData.communicationTemplates = [
      {
        id: generateId(),
        name: 'Open House Invite',
        channel: 'email',
        category: 'campaign',
        subject: 'Join RBMI open house this Saturday',
        content: 'Hi {{name}}, visit {{campus}} this Saturday for our open house and course guidance session.',
        variables: ['name', 'campus'],
        active: true,
        created_at: now,
        updated_at: now
      },
      {
        id: generateId(),
        name: 'Callback Reminder',
        channel: 'sms',
        category: 'follow_up',
        subject: '',
        content: 'Hi {{name}}, our counselor will call you today regarding {{course}} admission.',
        variables: ['name', 'course'],
        active: true,
        created_at: now,
        updated_at: now
      },
      {
        id: generateId(),
        name: 'Document Nudge',
        channel: 'whatsapp',
        category: 'drip',
        subject: '',
        content: 'Hello {{name}}, please upload your pending documents to keep your admission moving.',
        variables: ['name'],
        active: true,
        created_at: now,
        updated_at: now
      }
    ];
    changed = true;
  }

  // ... (Other initializations skipped for brevity in ensureMarketingModules)
  // Note: I will move the full ensureMarketingModules and other helpers to a utils or marketingController later.
  // For portalController, I only need a few.
  
  if (changed) saveDB(dbData);
  return dbData;
}

function createNotificationEntry(dbData, payload) {
  const item = {
    id: generateId(),
    title: payload.title,
    message: payload.message,
    channel: payload.channel || 'push',
    target_type: payload.target_type || 'marketing',
    status: payload.status || 'unread',
    created_at: new Date().toISOString()
  };
  dbData.notificationCenter = [item, ...(dbData.notificationCenter || [])];
  return item;
}

export const getProfile = async (req, res) => {
  try {
    if (req.user.role !== 'student') return res.status(403).json({ error: 'Student portal access required' });
    const profile = await appStore.getPortalProfileForUser(req.user);
    const course = profile.course_id ? await db.getCourse(profile.course_id) : null;
    res.json({
      ...profile,
      course_name: course?.name || 'Program not selected'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const updateProfile = async (req, res) => {
  try {
    if (req.user.role !== 'student') return res.status(403).json({ error: 'Student portal access required' });
    const next = await appStore.updatePortalProfile(req.user, req.body);
    
    // Notify counselor of significant student actions
    if (req.body.next_step && req.body.next_step !== 'Complete your profile') {
      const dbData = ensureMarketingModules(); // This might be better as a shared util
      let title = 'Student Update';
      if (req.body.next_step.toLowerCase().includes('callback')) title = 'Callback Requested';
      if (req.body.next_step.toLowerCase().includes('application')) title = 'New Application Request';

      createNotificationEntry(dbData, {
        title,
        message: `${req.user.name}: ${req.body.next_step}`,
        channel: 'push',
        target_type: 'student_inbox'
      });
      saveDB(dbData);
    }

    res.json(next);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getDocuments = async (req, res) => {
  try {
    if (req.user.role !== 'student') return res.status(403).json({ error: 'Student portal access required' });
    const uploads = await appStore.listDocumentUploads(req.user);
    res.json(uploads);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const uploadDocument = async (req, res) => {
  try {
    if (req.user.role !== 'student') return res.status(403).json({ error: 'Student portal access required' });
    const uploaded = await appStore.submitDocumentUpload(req.user, req.body);
    const dbData = ensureMarketingModules();
    createNotificationEntry(dbData, {
      title: 'Document uploaded',
      message: `${req.user.name} uploaded ${uploaded.document_type}`,
      channel: 'push',
      target_type: 'student_inbox'
    });
    saveDB(dbData);
    res.status(201).json(uploaded);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
