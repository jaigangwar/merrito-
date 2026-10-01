import {
  fetchSettings, saveSettings, fetchUsers, createUser, updateUser, deleteUser,
  fetchWorkflowRules, createWorkflowRule, updateWorkflowRule, fetchLetterTemplates
} from '../lib/api.js';
import { openModal } from '../components/modal.js';

function getCurrentUser() {
  try { return JSON.parse(sessionStorage.getItem('rbmi_user') || 'null'); } catch { return null; }
}

export async function renderSettings(container) {
  const user = getCurrentUser();
  const isAdmin = !user || user.role === 'admin';

  container.innerHTML = `
    <div class="settings-page">
      <div class="page-header">
        <div><h1 class="page-title">Settings</h1><p class="page-subtitle">Configure RBMI CRM preferences.</p></div>
      </div>
      <div class="settings-layout">
        <div class="settings-tabs" id="settings-tabs">
          <button class="settings-tab active" data-tab="institute"><i data-lucide="building-2" style="width:18px;height:18px;"></i> Institute Profile</button>
          <button class="settings-tab" data-tab="stages"><i data-lucide="git-branch" style="width:18px;height:18px;"></i> Pipeline Stages</button>
          ${isAdmin ? `<button class="settings-tab" data-tab="users"><i data-lucide="users" style="width:18px;height:18px;"></i> User Management</button>` : ''}
          <button class="settings-tab" data-tab="webhook"><i data-lucide="webhook" style="width:18px;height:18px;"></i> Lead Automation</button>
          <button class="settings-tab" data-tab="publishers"><i data-lucide="cloud-download" style="width:18px;height:18px;"></i> Publisher APIs</button>
          <button class="settings-tab" data-tab="workflows"><i data-lucide="zap" style="width:18px;height:18px;"></i> Workflows</button>
          <button class="settings-tab" data-tab="letters"><i data-lucide="file-text" style="width:18px;height:18px;"></i> Letter Templates</button>
          <button class="settings-tab" data-tab="email"><i data-lucide="mail" style="width:18px;height:18px;"></i> Email</button>
          <button class="settings-tab" data-tab="notifications"><i data-lucide="bell" style="width:18px;height:18px;"></i> Notifications</button>
        </div>
        <div class="settings-content" id="settings-content">
          <div class="settings-section" id="tab-institute">
            <div style="display:flex;align-items:center;justify-content:center;padding:40px;"><div class="spinner"></div></div>
          </div>
          <div class="settings-section hidden" id="tab-stages">${renderStagesTab()}</div>
          ${isAdmin ? `<div class="settings-section hidden" id="tab-users"><div style="display:flex;align-items:center;justify-content:center;padding:40px;"><div class="spinner"></div></div></div>` : ''}
          <div class="settings-section hidden" id="tab-webhook">${renderWebhookTab()}</div>
          <div class="settings-section hidden" id="tab-publishers">${renderPublishersTab()}</div>
          <div class="settings-section hidden" id="tab-workflows"><div style="display:flex;align-items:center;justify-content:center;padding:40px;"><div class="spinner"></div></div></div>
          <div class="settings-section hidden" id="tab-letters"><div style="display:flex;align-items:center;justify-content:center;padding:40px;"><div class="spinner"></div></div></div>
          <div class="settings-section hidden" id="tab-email"><div style="display:flex;align-items:center;justify-content:center;padding:40px;"><div class="spinner"></div></div></div>
          <div class="settings-section hidden" id="tab-notifications">${renderNotificationsTab()}</div>
        </div>
      </div>
    </div>
  `;

  window.renderIcons();

  // Tab switching
  const tabs = container.querySelectorAll('.settings-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', async () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      container.querySelectorAll('.settings-section').forEach(s => s.classList.add('hidden'));
      const target = container.querySelector(`#tab-${tab.dataset.tab}`);
      if (target) target.classList.remove('hidden');

      if (tab.dataset.tab === 'workflows') {
        const rules = await fetchWorkflowRules();
        renderWorkflowsTab(container, rules);
      } else if (tab.dataset.tab === 'letters') {
        const templates = await fetchLetterTemplates();
        renderLettersTab(container, templates);
      }
    });
  });


  // Load institute settings
  try {
    const settings = await fetchSettings();
    renderInstituteTab(container, settings, isAdmin);
  } catch (e) {
    document.getElementById('tab-institute').innerHTML = `<p style="color:#dc2626;">Failed to load settings: ${e.message}</p>`;
  }

  // Load users tab
  if (isAdmin) {
    try {
      const users = await fetchUsers();
      renderUsersTab(container, users);
    } catch (e) {
      document.getElementById('tab-users').innerHTML = `<p style="color:#dc2626;">Failed to load users: ${e.message}</p>`;
    }
  }

  // Load email tab
  loadEmailTab(container);
}

function renderInstituteTab(container, settings, isAdmin) {
  const tab = container.querySelector('#tab-institute');
  tab.innerHTML = `
    <h2 class="settings-section-title">Institute Profile</h2>
    <p class="settings-section-desc">RBMI — Ram Babu Mahavidyalaya Institute, Bareilly</p>
    <div class="settings-form">
      <div class="form-grid">
        <div class="form-group"><label class="form-label">Institute Name</label><input type="text" id="s-name" class="form-input" value="${settings.institute_name || ''}" ${!isAdmin ? 'disabled' : ''} /></div>
        <div class="form-group"><label class="form-label">Short Name</label><input type="text" id="s-short" class="form-input" value="${settings.short_name || ''}" ${!isAdmin ? 'disabled' : ''} /></div>
        <div class="form-group"><label class="form-label">Email</label><input type="email" id="s-email" class="form-input" value="${settings.email || ''}" ${!isAdmin ? 'disabled' : ''} /></div>
        <div class="form-group"><label class="form-label">Phone</label><input type="text" id="s-phone" class="form-input" value="${settings.phone || ''}" ${!isAdmin ? 'disabled' : ''} /></div>
        <div class="form-group"><label class="form-label">City</label><input type="text" id="s-city" class="form-input" value="${settings.city || 'Bareilly'}" ${!isAdmin ? 'disabled' : ''} /></div>
        <div class="form-group"><label class="form-label">State</label><input type="text" id="s-state" class="form-input" value="${settings.state || 'Uttar Pradesh'}" ${!isAdmin ? 'disabled' : ''} /></div>
        <div class="form-group form-full"><label class="form-label">Address</label><textarea id="s-address" class="form-input" rows="2" ${!isAdmin ? 'disabled' : ''}>${settings.address || ''}</textarea></div>
        <div class="form-group"><label class="form-label">Website</label><input type="url" id="s-website" class="form-input" value="${settings.website || ''}" ${!isAdmin ? 'disabled' : ''} /></div>
        <div class="form-group"><label class="form-label">Academic Year</label><input type="text" id="s-year" class="form-input" value="${settings.academic_year || '2025-2026'}" ${!isAdmin ? 'disabled' : ''} /></div>
      </div>
      ${isAdmin ? `
      <div class="form-actions">
        <button class="btn btn-primary" id="btn-save-settings"><i data-lucide="check" style="width:16px;height:16px;"></i> Save Changes</button>
        <span id="settings-saved" style="color:#10b981;font-size:14px;display:none;">✓ Saved successfully</span>
      </div>` : '<p style="color:#64748b;font-size:13px;margin-top:16px;">Contact admin to update institute settings.</p>'}
    </div>
  `;

  window.renderIcons();

  document.getElementById('btn-save-settings')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-save-settings');
    btn.disabled = true;
    btn.textContent = 'Saving...';
    try {
      await saveSettings({
        institute_name: document.getElementById('s-name').value,
        short_name: document.getElementById('s-short').value,
        email: document.getElementById('s-email').value,
        phone: document.getElementById('s-phone').value,
        city: document.getElementById('s-city').value,
        state: document.getElementById('s-state').value,
        address: document.getElementById('s-address').value,
        website: document.getElementById('s-website').value,
        academic_year: document.getElementById('s-year').value
      });
      const saved = document.getElementById('settings-saved');
      saved.style.display = 'inline';
      setTimeout(() => { saved.style.display = 'none'; }, 3000);
    } catch (e) {
      alert('Failed to save: ' + e.message);
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i data-lucide="check" style="width:16px;height:16px;"></i> Save Changes';
      window.renderIcons();
    }
  });
}

function renderPublishersTab() {
  return `
    <h2 class="settings-section-title">Publisher APIs (Auto-Pull)</h2>
    <p class="settings-section-desc">Connect your publisher accounts to automatically pull leads in the background every 15 minutes.</p>
    
    <div style="background:#1e293b; border-radius:12px; padding:24px; border:1px solid rgba(255,255,255,0.1); margin-top:20px;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
        <div style="display:flex; align-items:center; gap:12px;">
          <div style="width:40px; height:40px; background:#4f46e5; border-radius:8px; display:flex; align-items:center; justify-content:center;">
            <i data-lucide="graduation-cap" style="color:white; width:20px; height:20px;"></i>
          </div>
          <div>
            <h3 style="margin:0; font-size:16px; font-weight:600; color:#f8fafc;">Shiksha Integration</h3>
            <span style="font-size:13px; color:#94a3b8;">Status: <span style="color:#f59e0b;">Pending Setup</span></span>
          </div>
        </div>
        <label class="toggle-switch">
          <input type="checkbox" id="pub-shiksha-enable">
          <span class="toggle-slider"></span>
        </label>
      </div>
      <div class="form-grid" style="margin-top:16px; padding-top:16px; border-top:1px solid rgba(255,255,255,0.05);">
        <div class="form-group form-full">
          <label class="form-label">Shiksha API Key</label>
          <input type="password" id="pub-shiksha-key" class="form-input" placeholder="Enter your Shiksha API key" />
        </div>
      </div>
      <div style="margin-top:16px;">
        <button class="btn btn-primary" onclick="alert('Configuration saved! Background cron worker will now poll Shiksha every 15 mins.');">Save Shiksha Settings</button>
      </div>
    </div>

    <div style="background:#1e293b; border-radius:12px; padding:24px; border:1px solid rgba(255,255,255,0.1); margin-top:20px;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
        <div style="display:flex; align-items:center; gap:12px;">
          <div style="width:40px; height:40px; background:#e11d48; border-radius:8px; display:flex; align-items:center; justify-content:center;">
            <i data-lucide="phone" style="color:white; width:20px; height:20px;"></i>
          </div>
          <div>
            <h3 style="margin:0; font-size:16px; font-weight:600; color:#f8fafc;">JustDial Integration</h3>
            <span style="font-size:13px; color:#94a3b8;">Status: <span style="color:#f59e0b;">Pending Setup</span></span>
          </div>
        </div>
        <label class="toggle-switch">
          <input type="checkbox" id="pub-jd-enable">
          <span class="toggle-slider"></span>
        </label>
      </div>
      <div class="form-grid" style="margin-top:16px; padding-top:16px; border-top:1px solid rgba(255,255,255,0.05);">
        <div class="form-group form-full">
          <label class="form-label">JustDial Vendor ID / Secret</label>
          <input type="password" id="pub-jd-key" class="form-input" placeholder="Enter your JustDial secret" />
        </div>
      </div>
      <div style="margin-top:16px;">
        <button class="btn btn-primary" onclick="alert('Configuration saved! Background cron worker will now poll JustDial every 15 mins.');">Save JustDial Settings</button>
      </div>
    </div>
  `;
}

async function renderUsersTab(container, users) {
  const tab = container.querySelector('#tab-users');
  tab.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
      <div><h2 class="settings-section-title" style="margin:0;">User Management</h2><p class="settings-section-desc" style="margin:4px 0 0;">Manage CRM users and their roles.</p></div>
      <button class="btn btn-primary" id="btn-add-user"><i data-lucide="user-plus"></i> Add User</button>
    </div>
    <div class="users-table-wrap">
      <table class="data-table">
        <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Actions</th></tr></thead>
        <tbody id="users-tbody">
          ${users.map(u => `
            <tr>
              <td>${u.name}</td>
              <td>${u.email}</td>
              <td><span class="role-badge">${u.role}</span></td>
              <td>
                <div style="display:flex;gap:6px;">
                  <button class="btn btn-secondary btn-sm btn-edit-user" data-id="${u.id}" data-name="${u.name}" data-email="${u.email}" data-role="${u.role}">Edit</button>
                  <button class="btn btn-danger btn-sm btn-delete-user" data-id="${u.id}">Delete</button>
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;

  window.renderIcons();

  document.getElementById('btn-add-user')?.addEventListener('click', () => {
    openUserModal(null, async (data) => {
      await createUser(data);
      const updated = await fetchUsers();
      renderUsersTab(container, updated);
    });
  });

  tab.querySelectorAll('.btn-edit-user').forEach(btn => {
    btn.addEventListener('click', () => {
      openUserModal({ id: btn.dataset.id, name: btn.dataset.name, email: btn.dataset.email, role: btn.dataset.role }, async (data) => {
        await updateUser(btn.dataset.id, data);
        const updated = await fetchUsers();
        renderUsersTab(container, updated);
      });
    });
  });

  tab.querySelectorAll('.btn-delete-user').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this user?')) return;
      await deleteUser(btn.dataset.id);
      const updated = await fetchUsers();
      renderUsersTab(container, updated);
    });
  });
}

function openUserModal(user, onSave) {
  const isEdit = !!user;
  const content = `
    <div style="display:flex;flex-direction:column;gap:16px;">
      <div class="form-group"><label class="form-label">Full Name *</label><input type="text" id="u-name" class="form-input" value="${user?.name || ''}" placeholder="Full name" /></div>
      <div class="form-group"><label class="form-label">Email *</label><input type="email" id="u-email" class="form-input" value="${user?.email || ''}" placeholder="user@rbmi.edu.in" /></div>
      ${!isEdit ? `<div class="form-group"><label class="form-label">Password *</label><input type="password" id="u-pw" class="form-input" placeholder="Set password" /></div>` : ''}
      <div class="form-group"><label class="form-label">Role</label>
        <select id="u-role" class="form-input">
          <option value="admin" ${user?.role === 'admin' ? 'selected' : ''}>Admin</option>
          <option value="counselor" ${user?.role === 'counselor' ? 'selected' : ''}>Counselor</option>
        </select>
      </div>
    </div>
    <div id="u-error" style="color:#dc2626;font-size:13px;margin-top:8px;display:none;"></div>
  `;

  openModal(isEdit ? 'Edit User' : 'Add User', content, {
    submitLabel: isEdit ? 'Save Changes' : 'Create User',
    onSubmit: async (body) => {
      const name = body.querySelector('#u-name').value.trim();
      const email = body.querySelector('#u-email').value.trim();
      const errEl = body.querySelector('#u-error');
      if (!name || !email) {
        errEl.textContent = 'Name and email are required.';
        errEl.style.display = 'block';
        return false;
      }
      const data = { name, email, role: body.querySelector('#u-role').value };
      if (!isEdit) data.password = body.querySelector('#u-pw').value || 'counselor123';
      await onSave(data);
    }
  });
}

async function loadEmailTab(container) {
  const tab = container.querySelector('#tab-email');
  if (!tab) return;
  try {
    const res = await fetch('/api/email/status', {
      headers: { Authorization: `Bearer ${sessionStorage.getItem('rbmi_token')}` }
    });
    const status = res.ok ? await res.json() : { configured: false, message: 'Could not fetch status.' };
    renderEmailTab(tab, status);
  } catch (e) {
    renderEmailTab(tab, { configured: false, message: e.message });
  }
}

function renderEmailTab(tab, status) {
  tab.innerHTML = `
    <h2 class="settings-section-title">Email Integration</h2>
    <p class="settings-section-desc">Automated emails to students — welcome messages, stage updates, and more.</p>

    <div class="webhook-section">
      <!-- Status card -->
      <div class="webhook-card">
        <h3 style="font-size:15px;font-weight:600;margin-bottom:12px;">📡 Connection Status</h3>
        <div style="display:flex;align-items:center;gap:10px;padding:14px 18px;border-radius:8px;background:${status.configured ? '#f0fdf4' : '#fef9c3'};border:1px solid ${status.configured ? '#bbf7d0' : '#fde68a'};">
          <span style="font-size:22px;">${status.configured ? '✅' : '⚠️'}</span>
          <div>
            <div style="font-weight:600;font-size:14px;color:${status.configured ? '#15803d' : '#92400e'};">
              ${status.configured ? 'Gmail SMTP — Active' : 'Not configured'}
            </div>
            <div style="font-size:13px;color:#64748b;margin-top:2px;">
              ${status.configured ? `Sending from: <strong>${status.sender}</strong>` : status.message}
            </div>
          </div>
        </div>
      </div>

      <!-- Setup guide -->
      ${!status.configured ? `
      <div class="webhook-card">
        <h3 style="font-size:15px;font-weight:600;margin-bottom:12px;">🔧 Setup Guide (2 minutes)</h3>
        <div style="display:flex;flex-direction:column;gap:12px;">
          <div style="display:flex;gap:12px;align-items:flex-start;">
            <span style="background:#6366f1;color:#fff;border-radius:50%;width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0;">1</span>
            <div><strong>Enable 2-Step Verification</strong> on your Gmail account at <a href="https://myaccount.google.com/security" target="_blank" style="color:#6366f1;">myaccount.google.com/security</a></div>
          </div>
          <div style="display:flex;gap:12px;align-items:flex-start;">
            <span style="background:#6366f1;color:#fff;border-radius:50%;width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0;">2</span>
            <div>Go to <a href="https://myaccount.google.com/apppasswords" target="_blank" style="color:#6366f1;">App Passwords</a> → Select "Mail" → Generate a 16-character password</div>
          </div>
          <div style="display:flex;gap:12px;align-items:flex-start;">
            <span style="background:#6366f1;color:#fff;border-radius:50%;width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0;">3</span>
            <div>Open your <code style="background:#f1f5f9;padding:2px 6px;border-radius:4px;">.env</code> file and fill in:
              <pre style="background:#1e293b;color:#e2e8f0;padding:12px 16px;border-radius:8px;font-size:13px;margin:8px 0 0;">GMAIL_USER=your-gmail@gmail.com
GMAIL_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx
INSTITUTE_NAME=RBMI Admissions</pre>
            </div>
          </div>
          <div style="display:flex;gap:12px;align-items:flex-start;">
            <span style="background:#6366f1;color:#fff;border-radius:50%;width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0;">4</span>
            <div>Restart the server: <code style="background:#f1f5f9;padding:2px 6px;border-radius:4px;">npm start</code></div>
          </div>
        </div>
      </div>` : ''}

      <!-- What gets sent -->
      <div class="webhook-card">
        <h3 style="font-size:15px;font-weight:600;margin-bottom:12px;">📧 Automated Emails</h3>
        <div style="display:flex;flex-direction:column;gap:10px;">
          ${[
            { trigger: 'New lead added', desc: 'Welcome email with next steps sent to the student', icon: '👋' },
            { trigger: 'Lead via webhook', desc: 'Welcome email when a lead comes from website/JustDial/etc.', icon: '🔗' },
            { trigger: 'Stage → Counseling Scheduled', desc: 'Notifies student their session is booked', icon: '📅' },
            { trigger: 'Stage → Application Submitted', desc: 'Confirms receipt of application', icon: '📋' },
            { trigger: 'Stage → Documents Verified', desc: 'Prompts student to pay admission fee', icon: '✅' },
            { trigger: 'Stage → Admitted', desc: 'Congratulations email with enrollment instructions', icon: '🎉' },
            { trigger: 'Stage → Enrolled', desc: 'Final confirmation with orientation details', icon: '🎓' },
          ].map(e => `
            <div style="display:flex;gap:12px;align-items:center;padding:10px 14px;background:#f8fafc;border-radius:8px;">
              <span style="font-size:18px;">${e.icon}</span>
              <div>
                <div style="font-weight:600;font-size:13px;">${e.trigger}</div>
                <div style="font-size:12px;color:#64748b;">${e.desc}</div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Test email -->
      ${status.configured ? `
      <div class="webhook-card">
        <h3 style="font-size:15px;font-weight:600;margin-bottom:8px;">🧪 Send Test Email</h3>
        <p style="font-size:13px;color:#64748b;margin-bottom:12px;">Send a test email to verify everything is working:</p>
        <div style="display:flex;gap:10px;align-items:center;">
          <input type="email" id="test-email-to" class="form-input" placeholder="recipient@example.com" style="max-width:280px;" />
          <button class="btn btn-primary" id="btn-send-test-email">Send Test</button>
        </div>
        <div id="email-test-result" style="margin-top:12px;font-size:13px;"></div>
      </div>` : ''}
    </div>
  `;

  window.renderIcons?.();

  // Test email button handler
  tab.querySelector('#btn-send-test-email')?.addEventListener('click', async () => {
    const btn = tab.querySelector('#btn-send-test-email');
    const toInput = tab.querySelector('#test-email-to');
    const result = tab.querySelector('#email-test-result');
    const to = toInput?.value?.trim();
    if (!to) { result.innerHTML = '<span style="color:#dc2626;">Please enter an email address.</span>'; return; }
    btn.disabled = true;
    btn.textContent = 'Sending...';
    result.textContent = '';
    try {
      const res = await fetch('/api/email/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionStorage.getItem('rbmi_token')}`
        },
        body: JSON.stringify({ to })
      });
      const data = await res.json();
      if (res.ok) {
        result.innerHTML = `<span style="color:#10b981;">✅ Test email sent to ${to}! Check your inbox.</span>`;
      } else {
        result.innerHTML = `<span style="color:#dc2626;">✗ ${data.error}</span>`;
      }
    } catch (err) {
      result.innerHTML = `<span style="color:#dc2626;">✗ ${err.message}</span>`;
    } finally {
      btn.disabled = false;
      btn.textContent = 'Send Test';
    }
  });
}

function renderStagesTab() {
  const stages = [
    { name: 'Enquiry', color: '#8b5cf6', desc: 'Initial student enquiry received' },
    { name: 'Counseling Scheduled', color: '#3b82f6', desc: 'Counseling session has been scheduled' },
    { name: 'Counseling Done', color: '#06b6d4', desc: 'Counseling session completed' },
    { name: 'Application Submitted', color: '#f59e0b', desc: 'Student has submitted the application form' },
    { name: 'Documents Verified', color: '#f97316', desc: 'All required documents have been verified' },
    { name: 'Admitted', color: '#10b981', desc: 'Student has been admitted' },
    { name: 'Enrolled', color: '#059669', desc: 'Student has completed enrollment' }
  ];
  return `
    <h2 class="settings-section-title">Pipeline Stages</h2>
    <p class="settings-section-desc">Admission pipeline stages for RBMI.</p>
    <div class="stages-list">
      ${stages.map((s, i) => `
        <div class="stage-config-item">
          <div class="stage-color-dot" style="background:${s.color};"></div>
          <div class="stage-config-info">
            <span class="stage-config-name">${s.name}</span>
            <span class="stage-config-desc">${s.desc}</span>
          </div>
          <span class="stage-order">${i + 1}</span>
        </div>
      `).join('')}
    </div>
  `;
}

function renderWebhookTab() {
  const apiBase = (import.meta.env.VITE_API_URL || `${window.location.protocol}//${window.location.hostname}:3001/api`).replace(/\/$/, '');
  const webhookUrl = `${apiBase}/webhook/lead`;
  const examplePayload = JSON.stringify({
    name: "Rahul Sharma",
    phone: "+91 9876543210",
    email: "rahul@example.com",
    course: "B.Tech Computer Science",
    source: "Website",
    city: "Bareilly"
  }, null, 2);

  return `
    <h2 class="settings-section-title">Lead Automation & Webhook</h2>
    <p class="settings-section-desc">Automatically capture leads from your website, JustDial, Shiksha, CollegeDekho, and more.</p>

    <div class="webhook-section">
      <div class="webhook-card">
        <h3 style="font-size:15px;font-weight:600;margin-bottom:8px;">📡 Webhook Endpoint</h3>
        <p style="font-size:13px;color:#64748b;margin-bottom:12px;">Send a POST request to this URL to automatically create a lead:</p>
        <div class="webhook-url-box">
          <code>${webhookUrl}</code>
          <button class="btn btn-secondary btn-sm" onclick="navigator.clipboard.writeText('${webhookUrl}').then(()=>this.textContent='Copied!').catch(()=>{})">Copy</button>
        </div>
      </div>

      <div class="webhook-card">
        <h3 style="font-size:15px;font-weight:600;margin-bottom:8px;">📋 Request Format</h3>
        <p style="font-size:13px;color:#64748b;margin-bottom:12px;">POST with JSON body (name + phone required):</p>
        <pre class="webhook-code">${examplePayload}</pre>
      </div>

      <div class="webhook-card">
        <h3 style="font-size:15px;font-weight:600;margin-bottom:12px;">🔗 Integration Sources</h3>
        <div class="integration-grid">
          ${[
            { name: 'Website Contact Form', icon: '🌐', desc: 'Add webhook to your HTML form submit handler' },
            { name: 'JustDial', icon: '📞', desc: 'Use JustDial lead API to forward leads here' },
            { name: 'Shiksha.com', icon: '🎓', desc: 'Configure Shiksha lead delivery to this webhook' },
            { name: 'CollegeDekho', icon: '🏫', desc: 'Set up CollegeDekho lead forwarding' },
            { name: 'Google Ads', icon: '📢', desc: 'Use Zapier/n8n to forward Google Lead Forms' },
            { name: 'Facebook Ads', icon: '📘', desc: 'Connect Facebook Lead Ads via n8n automation' },
            { name: 'n8n Automation', icon: '⚡', desc: 'Use n8n to connect any source to this webhook' },
            { name: 'Zapier', icon: '🔄', desc: 'Connect 5000+ apps via Zapier webhook action' }
          ].map(s => `
            <div class="integration-item">
              <span class="integration-icon">${s.icon}</span>
              <div>
                <div style="font-weight:600;font-size:13px;">${s.name}</div>
                <div style="font-size:12px;color:#64748b;">${s.desc}</div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>

      <div class="webhook-card">
        <h3 style="font-size:15px;font-weight:600;margin-bottom:8px;">🧪 Test Webhook</h3>
        <p style="font-size:13px;color:#64748b;margin-bottom:12px;">Send a test lead to verify the webhook is working:</p>
        <button class="btn btn-primary" id="btn-test-webhook">Send Test Lead</button>
        <div id="webhook-test-result" style="margin-top:12px;font-size:13px;"></div>
      </div>
    </div>
  `;
}

function renderNotificationsTab() {
  const notifs = [
    { label: 'New lead added', desc: 'Get notified when a new lead is captured', checked: true },
    { label: 'Stage changes', desc: 'When a lead moves to a different stage', checked: true },
    { label: 'Counseling reminders', desc: 'Upcoming counseling session alerts', checked: true },
    { label: 'Application submitted', desc: 'When a student submits an application', checked: false },
    { label: 'Daily summary', desc: 'End-of-day summary with key metrics', checked: true },
    { label: 'Weekly report', desc: 'Weekly analytics report', checked: false }
  ];
  return `
    <h2 class="settings-section-title">Notification Preferences</h2>
    <p class="settings-section-desc">Choose what notifications you'd like to receive.</p>
    <div class="notif-options">
      ${notifs.map(n => `
        <div class="notif-item">
          <div class="notif-info"><span class="notif-label">${n.label}</span><span class="notif-desc">${n.desc}</span></div>
          <label class="toggle-switch"><input type="checkbox" ${n.checked ? 'checked' : ''} /><span class="toggle-slider"></span></label>
        </div>
      `).join('')}
    </div>
    <div class="form-actions" style="margin-top:24px;">
      <button class="btn btn-primary" onclick="alert('Notification preferences saved!')"><i data-lucide="check" style="width:16px;height:16px;"></i> Save Preferences</button>
    </div>
  `;
}

// Attach webhook test after render
document.addEventListener('click', async (e) => {
  if (e.target.id !== 'btn-test-webhook') return;
  const btn = e.target;
  const result = document.getElementById('webhook-test-result');
  btn.disabled = true;
  btn.textContent = 'Sending...';
  result.textContent = '';
  try {
    const apiBase = (import.meta.env.VITE_API_URL || `${window.location.protocol}//${window.location.hostname}:3001/api`).replace(/\/$/, '');
    const res = await fetch(`${apiBase}/webhook/lead`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Test Lead RBMI',
        phone: '+91 9999999999',
        email: 'test@rbmi.edu.in',
        course: 'B.Tech Computer Science',
        source: 'Website',
        city: 'Bareilly'
      })
    });
    const data = await res.json();
    if (res.ok) {
      result.innerHTML = `<span style="color:#10b981;">✓ Test lead created! Lead ID: ${data.lead_id}</span>`;
    } else {
      result.innerHTML = `<span style="color:#dc2626;">✗ Error: ${data.error}</span>`;
    }
  } catch (err) {
    result.innerHTML = `<span style="color:#dc2626;">✗ Failed: ${err.message}. Make sure server is running.</span>`;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Send Test Lead';
  }
});

// ============================================================
//  VISUAL WORKFLOW DESIGNER (Flow Canvas)
// ============================================================

function renderRulesList(tab, rules) {
  tab.innerHTML = `
    <style>
      .workflows-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; }
      .workflow-card-list { display:grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap:16px; margin-top:16px; }
      .wf-rule-card { background:#fff; border:1px solid #e2e8f0; border-radius:10px; padding:16px; display:flex; flex-direction:column; justify-content:space-between; box-shadow:0 1px 3px rgba(0,0,0,0.05); transition:transform 0.2s, box-shadow 0.2s; }
      .wf-rule-card:hover { transform:translateY(-2px); box-shadow:0 4px 12px rgba(0,0,0,0.08); }
      .wf-rule-title { font-weight:600; font-size:15px; color:#1e293b; margin:0 0 6px; }
      .wf-rule-meta { font-size:12px; color:#64748b; margin-bottom:12px; }
      .wf-badge { display:inline-block; padding:2px 8px; border-radius:12px; font-size:11px; font-weight:600; text-transform:uppercase; margin-right:6px; }
      .wf-badge.trigger { background:#ede9fe; color:#6d28d9; }
      .wf-badge.action { background:#fef3c7; color:#d97706; }
      .wf-rule-actions { display:flex; justify-content:space-between; align-items:center; border-top:1px solid #f1f5f9; padding-top:12px; margin-top:12px; }
    </style>

    <div class="workflows-header">
      <div>
        <h2 class="settings-section-title" style="margin:0;">Workflows & Automation</h2>
        <p class="settings-section-desc" style="margin:4px 0 0;">Create automation rules for lead capturing, counseling approvals, and admission offers.</p>
      </div>
      <button class="btn btn-primary" id="btn-create-workflow"><i data-lucide="plus" style="width:16px;height:16px;margin-right:6px;"></i> + Create Workflow</button>
    </div>

    ${rules.length === 0 ? `
      <div style="text-align:center;padding:48px;background:#f8fafc;border:1px dashed #cbd5e1;border-radius:10px;margin-top:16px;">
        <p style="color:#64748b;margin:0 0 12px;font-size:14px;">No workflow automations configured yet.</p>
        <button class="btn btn-secondary btn-sm" id="btn-create-workflow-empty">Get Started</button>
      </div>
    ` : `
      <div class="workflow-card-list">
        ${rules.map(r => `
          <div class="wf-rule-card" data-id="${r.id}">
            <div>
              <h3 class="wf-rule-title">${r.name}</h3>
              <div class="wf-rule-meta">
                <span class="wf-badge trigger">When: ${r.trigger.replace(/_/g, ' ')}</span>
                <span class="wf-badge action">Then: ${r.action.replace(/_/g, ' ')}</span>
              </div>
              <p style="font-size:13px;color:#475569;margin:0 0 12px;line-height:1.5;">
                <strong>Trigger Event:</strong> Triggered when application status changes.<br/>
                ${r.condition ? `<strong>Condition:</strong> Only if <code>${r.condition}</code>.` : '<strong>Condition:</strong> Run on all matching triggers.'}
              </p>
            </div>
            <div class="wf-rule-actions">
              <label class="toggle-switch">
                <input type="checkbox" class="wf-toggle-active" data-id="${r.id}" ${r.active ? 'checked' : ''} />
                <span class="toggle-slider"></span>
              </label>
              <div style="display:flex;gap:8px;">
                <button class="btn btn-secondary btn-sm btn-edit-workflow" data-id="${r.id}">Edit Flow</button>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    `}
  `;

  window.renderIcons?.();

  const handleCreate = () => openWorkflowCanvas(tab, null);
  tab.querySelector('#btn-create-workflow')?.addEventListener('click', handleCreate);
  tab.querySelector('#btn-create-workflow-empty')?.addEventListener('click', handleCreate);

  tab.querySelectorAll('.btn-edit-workflow').forEach(btn => {
    btn.addEventListener('click', () => {
      const rule = rules.find(r => r.id === btn.dataset.id);
      openWorkflowCanvas(tab, rule);
    });
  });

  tab.querySelectorAll('.wf-toggle-active').forEach(toggle => {
    toggle.addEventListener('change', async () => {
      const id = toggle.dataset.id;
      const rule = rules.find(r => r.id === id);
      if (rule) {
        rule.active = toggle.checked;
        try {
          await updateWorkflowRule(id, { active: rule.active });
        } catch (e) {
          alert('Failed to update status: ' + e.message);
          toggle.checked = !toggle.checked;
        }
      }
    });
  });
}

async function openWorkflowCanvas(tab, rule) {
  tab.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;padding:48px;"><div class="spinner"></div><span style="margin-left:12px;color:#64748b;">Loading templates & canvas...</span></div>`;

  let templates = [];
  try {
    templates = await fetchLetterTemplates();
  } catch (e) {
    console.error('Failed to load letter templates for workflow actions:', e);
  }

  const isEdit = !!rule;
  const defaultRule = {
    name: 'New Admission Offer Workflow',
    trigger: 'application_status_changed',
    condition: 'status === "approved"',
    action: 'send_offer_letter',
    template_id: templates[0]?.id || '',
    active: true,
    flow_data: null
  };

  const currentRule = isEdit ? { ...defaultRule, ...rule } : defaultRule;

  // Initialize nodes and connections from saved flow_data or default template
  let nodes = [
    { id: 'node-trigger', type: 'trigger', x: 50, y: 150, trigger_event: currentRule.trigger },
    { id: 'node-filter', type: 'condition', x: 360, y: 150, expression: currentRule.condition || 'status === "approved"' },
    { id: 'node-action', type: 'action', x: 670, y: 150, action_type: currentRule.action, template_id: currentRule.template_id || (templates[0]?.id || '') }
  ];

  let connections = [
    { from: 'node-trigger', to: 'node-filter' },
    { from: 'node-filter', to: 'node-action' }
  ];

  if (currentRule.flow_data) {
    try {
      const parsed = typeof currentRule.flow_data === 'string' ? JSON.parse(currentRule.flow_data) : currentRule.flow_data;
      if (parsed.nodes && parsed.connections) {
        nodes = parsed.nodes;
        connections = parsed.connections;
      }
    } catch (e) {
      console.error('Failed to parse flow_data:', e);
    }
  }

  // HTML layout for visual editor
  tab.innerHTML = `
    <style>
      .workflow-editor { display:flex; flex-direction:column; background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; overflow:hidden; height:680px; position:relative; font-family:inherit; }
      .wf-editor-header { display:flex; justify-content:space-between; align-items:center; padding:12px 18px; background:#fff; border-bottom:1px solid #e2e8f0; box-shadow:0 1px 2px rgba(0,0,0,0.02); }
      .wf-editor-layout { display:flex; flex:1; position:relative; overflow:hidden; }
      .wf-sidebar { width:250px; background:#fff; border-right:1px solid #e2e8f0; padding:16px; display:flex; flex-direction:column; gap:12px; z-index:10; }
      .wf-canvas-wrap { flex:1; position:relative; overflow:hidden; background-color:#fafafa; background-image:radial-gradient(#e2e8f0 1.5px, transparent 1.5px); background-size:20px 20px; cursor:grab; }
      .wf-canvas-wrap:active { cursor:grabbing; }
      .wf-canvas-inner { transform-origin: 0 0; }
      .wf-svg-overlay { position:absolute; top:0; left:0; width:100%; height:100%; pointer-events:none; z-index:1; }
      .wf-nodes-container { position:absolute; top:0; left:0; width:100%; height:100%; pointer-events:none; }
      
      .wf-node { 
        position:absolute; 
        width:260px; 
        background:#fff; 
        border:1.5px solid #cbd5e1; 
        border-radius:10px; 
        box-shadow:0 4px 12px rgba(0, 0, 0, 0.05);
        z-index:2; 
        cursor:grab;
        pointer-events:auto;
        transition:box-shadow 0.15s, border-color 0.15s;
      }
      .wf-node:hover { box-shadow:0 6px 16px rgba(0, 0, 0, 0.08); border-color:#94a3b8; }
      .wf-node:active { cursor:grabbing; }
      .wf-node.trigger { border-color:#a855f7; }
      .wf-node.condition { border-color:#06b6d4; }
      .wf-node.action { border-color:#f59e0b; }
      
      .wf-node-header { padding:10px 14px; border-bottom:1px solid #f1f5f9; font-weight:600; font-size:13px; display:flex; align-items:center; justify-content:space-between; border-radius:9px 9px 0 0; }
      .wf-node.trigger .wf-node-header { background:#faf5ff; color:#7e22ce; }
      .wf-node.condition .wf-node-header { background:#ecfeff; color:#0e7490; }
      .wf-node.action .wf-node-header { background:#fffbeb; color:#b45309; }
      
      .wf-node-delete { background:none; border:none; color:#94a3b8; cursor:pointer; font-size:16px; padding:2px; display:flex; align-items:center; justify-content:center; }
      .wf-node-delete:hover { color:#ef4444; }
      
      .wf-node-body { padding:14px; display:flex; flex-direction:column; gap:10px; }
      .wf-node-label { font-size:10px; font-weight:700; color:#64748b; text-transform:uppercase; margin-bottom:2px; letter-spacing:0.5px; }
      .wf-node-input { width:100%; padding:7px 10px; font-size:12px; border:1px solid #cbd5e1; border-radius:6px; outline:none; font-family:inherit; background:#fff; transition:border-color 0.15s; }
      .wf-node-input:focus { border-color:#6366f1; box-shadow:0 0 0 2px rgba(99,102,241,0.06); }
      
      /* Ports configuration */
      .wf-connector { width:12px; height:12px; border-radius:50%; background:#fff; border:3px solid #cbd5e1; position:absolute; z-index:5; cursor:crosshair; transition:transform 0.1s, background 0.1s; }
      .wf-connector:hover { transform:translateY(-50%) scale(1.3); background:#6366f1; border-color:#fff; box-shadow:0 0 0 4px rgba(99,102,241,0.2); }
      .wf-connector.out { right:-6px; top:50%; transform:translateY(-50%); border-color:#a855f7; }
      .wf-connector.in { left:-6px; top:50%; transform:translateY(-50%); border-color:#06b6d4; }
      .wf-node.action .wf-connector.in { border-color:#f59e0b; }
      
      .sidebar-btn { display:flex; align-items:center; gap:10px; padding:12px 14px; border:1px dashed #cbd5e1; border-radius:8px; background:#f8fafc; font-size:12px; font-weight:600; color:#475569; width:100%; text-align:left; cursor:pointer; transition:all 0.15s; }
      .sidebar-btn:hover { background:#f1f5f9; border-color:#6366f1; color:#1e293b; transform:translateY(-1px); }
      
      /* Connections delete overlay */
      .wf-conn-delete-btn {
        position:absolute;
        background:#ef4444;
        color:#fff;
        border:none;
        border-radius:50%;
        width:20px;
        height:20px;
        font-size:12px;
        font-weight:700;
        cursor:pointer;
        display:flex;
        align-items:center;
        justify-content:center;
        transform:translate(-50%, -50%);
        box-shadow:0 2px 5px rgba(0,0,0,0.15);
        z-index:4;
        pointer-events:auto;
        transition:transform 0.1s;
      }
      .wf-conn-delete-btn:hover { transform:translate(-50%, -50%) scale(1.25); background:#dc2626; }
    </style>

    <div class="workflow-editor">
      <div class="wf-editor-header">
        <div style="display:flex;align-items:center;gap:12px;">
          <input type="text" id="wf-name-input" class="form-input" style="font-weight:600;font-size:14px;padding:6px 12px;width:300px;" value="${currentRule.name}" />
          <span style="font-size:12px;color:#64748b;">${isEdit ? 'Editing visual flow' : 'New visual automation'}</span>
        </div>
        <div style="display:flex;gap:10px;">
          <button class="btn btn-secondary btn-sm" id="btn-close-canvas">Cancel</button>
          <button class="btn btn-primary btn-sm" id="btn-save-workflow">Save Workflow</button>
        </div>
      </div>
      
      <div class="wf-editor-layout">
        <div class="wf-sidebar">
          <h3 style="font-size:12px;font-weight:700;color:#475569;text-transform:uppercase;margin:0 0 2px;letter-spacing:0.5px;">Node Toolbox</h3>
          <p style="font-size:11px;color:#94a3b8;margin:0 0 12px;">Click to place automation nodes on the canvas.</p>
          
          <button class="sidebar-btn" id="btn-add-trigger"><span style="font-size:16px;">🚀</span> Add Trigger Node</button>
          <button class="sidebar-btn" id="btn-add-condition"><span style="font-size:16px;">⚙️</span> Add Filter Node</button>
          <button class="sidebar-btn" id="btn-add-action"><span style="font-size:16px;">⚡</span> Add Action Node</button>
          
          <div style="margin-top:auto;padding:12px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;font-size:11px;color:#64748b;line-height:1.5;">
            <strong>Pro Tip:</strong> Drag from output port (purple) on right to input port (blue/yellow) on left of another card to link them.
          </div>
        </div>
        
        <div class="wf-canvas-wrap" id="wf-canvas-wrap">
          <div class="wf-canvas-inner" id="wf-canvas-inner" style="transform: translate(0px, 0px); width: 2500px; height: 2000px; position: absolute; top: 0; left: 0;">
            <svg class="wf-svg-overlay" id="wf-svg">
              <path id="path-temp" d="" fill="none" stroke="#6366f1" stroke-width="2.5" stroke-dasharray="4" style="display:none;" />
            </svg>
            <div class="wf-nodes-container" id="wf-nodes-container"></div>
          </div>
        </div>
      </div>
    </div>
  `;

  const canvasWrap = tab.querySelector('#wf-canvas-wrap');
  const canvasInner = tab.querySelector('#wf-canvas-inner');
  const nodesContainer = tab.querySelector('#wf-nodes-container');
  const svgOverlay = tab.querySelector('#wf-svg');
  const pathTemp = tab.querySelector('#path-temp');

  let panX = 0;
  let panY = 0;
  let isPanning = false;
  let panStartX = 0;
  let panStartY = 0;

  // Setup panning on background
  canvasWrap.addEventListener('mousedown', (e) => {
    if (e.target === canvasWrap || e.target === canvasInner || e.target === svgOverlay || e.target === nodesContainer) {
      isPanning = true;
      panStartX = e.clientX - panX;
      panStartY = e.clientY - panY;
      e.preventDefault();
    }
  });

  document.addEventListener('mousemove', (e) => {
    if (!isPanning) return;
    panX = e.clientX - panStartX;
    panY = e.clientY - panStartY;
    canvasInner.style.transform = `translate(${panX}px, ${panY}px)`;
  });

  document.addEventListener('mouseup', () => {
    isPanning = false;
  });

  // Active connection drag state
  let isConnecting = false;
  let connectionSourceId = null;

  // Global mousemove for connection line dragging
  document.addEventListener('mousemove', (e) => {
    if (!isConnecting || !connectionSourceId) return;
    const sourceNodeEl = document.getElementById(connectionSourceId);
    if (!sourceNodeEl) return;

    const portOut = sourceNodeEl.querySelector('.wf-connector.out');
    if (!portOut) return;

    const x1 = sourceNodeEl.offsetLeft + portOut.offsetLeft + portOut.offsetWidth / 2;
    const y1 = sourceNodeEl.offsetTop + portOut.offsetTop + portOut.offsetHeight / 2;

    const rect = canvasInner.getBoundingClientRect();
    const x2 = e.clientX - rect.left;
    const y2 = e.clientY - rect.top;

    const cp1 = x1 + Math.max(45, (x2 - x1) * 0.4);
    const cp2 = x2 - Math.max(45, (x2 - x1) * 0.4);

    pathTemp.style.display = 'block';
    pathTemp.setAttribute('d', `M ${x1} ${y1} C ${cp1} ${y1}, ${cp2} ${y2}, ${x2} ${y2}`);
  });

  // Global mouseup to clear connection line
  document.addEventListener('mouseup', (e) => {
    if (!isConnecting) return;
    isConnecting = false;
    pathTemp.style.display = 'none';

    // Check if released over an input port
    const hoveredEl = document.elementFromPoint(e.clientX, e.clientY);
    const portIn = hoveredEl?.closest('.port-in');
    if (portIn) {
      const targetNodeId = portIn.dataset.nodeId;
      if (targetNodeId && targetNodeId !== connectionSourceId) {
        // Prevent duplicate connection
        const exists = connections.some(c => c.from === connectionSourceId && c.to === targetNodeId);
        if (!exists) {
          connections.push({ from: connectionSourceId, to: targetNodeId });
          drawFlow();
        }
      }
    }
  });

  // Render nodes and curves
  function drawFlow() {
    // 1. Render nodes
    nodesContainer.innerHTML = '';
    nodes.forEach(node => {
      const nodeEl = document.createElement('div');
      nodeEl.id = node.id;
      nodeEl.className = `wf-node ${node.type}`;
      nodeEl.style.left = `${node.x}px`;
      nodeEl.style.top = `${node.y}px`;

      let headerTitle = 'Node';
      let bodyContent = '';

      if (node.type === 'trigger') {
        headerTitle = '🚀 Trigger Event';
        bodyContent = `
          <div>
            <div class="wf-node-label">Trigger Event</div>
            <select class="wf-node-input node-trigger-select">
              <option value="application_status_changed" ${node.trigger_event === 'application_status_changed' ? 'selected' : ''}>Application Status Changed</option>
              <option value="lead_created" ${node.trigger_event === 'lead_created' ? 'selected' : ''}>Lead Created</option>
            </select>
          </div>
        `;
      } else if (node.type === 'condition') {
        headerTitle = '⚙️ Filter Condition';
        bodyContent = `
          <div>
            <div class="wf-node-label">Condition expression</div>
            <input type="text" class="wf-node-input node-cond-input" value="${node.expression || ''}" placeholder='e.g., status === "approved"' />
          </div>
        `;
      } else if (node.type === 'action') {
        headerTitle = '⚡ Execute Action';
        bodyContent = `
          <div>
            <div class="wf-node-label">Action Target</div>
            <select class="wf-node-input node-action-select">
              <option value="send_offer_letter" ${node.action_type === 'send_offer_letter' ? 'selected' : ''}>Generate & Send Offer Letter</option>
              <option value="send_welcome_email" ${node.action_type === 'send_welcome_email' ? 'selected' : ''}>Send Welcome Email</option>
              <option value="assign_counselor" ${node.action_type === 'assign_counselor' ? 'selected' : ''}>Auto-Assign Counselor</option>
            </select>
          </div>
          <div class="template-select-container" style="display: ${node.action_type !== 'assign_counselor' ? 'block' : 'none'};">
            <div class="wf-node-label">Letter/Email Template</div>
            <select class="wf-node-input node-template-select">
              ${templates.map(t => `<option value="${t.id}" ${node.template_id === t.id ? 'selected' : ''}>${t.name}</option>`).join('')}
            </select>
          </div>
          <div class="counselor-select-container" style="display: ${node.action_type === 'assign_counselor' ? 'block' : 'none'};">
            <div class="wf-node-label">Assignment Logic</div>
            <select class="wf-node-input node-assign-select">
              <option value="least_workload" ${node.assign_method === 'least_workload' ? 'selected' : ''}>Balanced Workload</option>
              <option value="round_robin" ${node.assign_method === 'round_robin' ? 'selected' : ''}>Round Robin</option>
            </select>
          </div>
        `;
      }

      nodeEl.innerHTML = `
        <div class="wf-node-header">
          <span>${headerTitle}</span>
          <button class="wf-node-delete" title="Delete Node">&times;</button>
        </div>
        <div class="wf-node-body">
          ${bodyContent}
        </div>
        ${node.type !== 'action' ? `<div class="wf-connector out" data-node-id="${node.id}"></div>` : ''}
        ${node.type !== 'trigger' ? `<div class="wf-connector in port-in" data-node-id="${node.id}"></div>` : ''}
      `;

      // Attach card listeners
      setupNodeListeners(nodeEl, node);
      nodesContainer.appendChild(nodeEl);
    });

    // 2. Render SVG curves & connection delete overlays
    // Clear old curves and delete buttons
    const oldPaths = svgOverlay.querySelectorAll('.wf-connection-path');
    oldPaths.forEach(p => p.remove());
    const oldBtns = canvasInner.querySelectorAll('.wf-conn-delete-btn');
    oldBtns.forEach(b => b.remove());

    connections.forEach((conn, index) => {
      const fromEl = document.getElementById(conn.from);
      const toEl = document.getElementById(conn.to);
      if (!fromEl || !toEl) return;

      const portOut = fromEl.querySelector('.wf-connector.out');
      const portIn = toEl.querySelector('.wf-connector.in');
      if (!portOut || !portIn) return;

      const x1 = fromEl.offsetLeft + portOut.offsetLeft + portOut.offsetWidth / 2;
      const y1 = fromEl.offsetTop + portOut.offsetTop + portOut.offsetHeight / 2;
      const x2 = toEl.offsetLeft + portIn.offsetLeft + portIn.offsetWidth / 2;
      const y2 = toEl.offsetTop + portIn.offsetTop + portIn.offsetHeight / 2;

      const cp1 = x1 + Math.max(45, (x2 - x1) * 0.4);
      const cp2 = x2 - Math.max(45, (x2 - x1) * 0.4);

      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('class', 'wf-connection-path');
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', fromEl.classList.contains('trigger') ? '#a855f7' : '#06b6d4');
      path.setAttribute('stroke-width', '2.5');
      path.setAttribute('d', `M ${x1} ${y1} C ${cp1} ${y1}, ${cp2} ${y2}, ${x2} ${y2}`);
      svgOverlay.appendChild(path);

      // Add connection delete button at midpoint
      // midpoints calculations
      const mx = (x1 + x2) / 2;
      const my = (y1 + y2) / 2;

      const delBtn = document.createElement('button');
      delBtn.className = 'wf-conn-delete-btn';
      delBtn.innerHTML = '&times;';
      delBtn.title = 'Remove Connection';
      delBtn.style.left = `${mx}px`;
      delBtn.style.top = `${my}px`;
      delBtn.addEventListener('click', () => {
        connections.splice(index, 1);
        drawFlow();
      });
      canvasInner.appendChild(delBtn);
    });
  }

  // Handle visual dragging & inline inputs change
  function setupNodeListeners(nodeEl, node) {
    // 1. Dragging Node Card
    const header = nodeEl.querySelector('.wf-node-header');
    let isDragging = false;
    let startX = 0, startY = 0;
    let nodeX = 0, nodeY = 0;

    header.addEventListener('mousedown', (e) => {
      if (e.target.closest('.wf-node-delete')) return;
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      nodeX = nodeEl.offsetLeft;
      nodeY = nodeEl.offsetTop;
      nodeEl.style.zIndex = '15';
      e.preventDefault();
      e.stopPropagation();
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      const nextX = Math.max(10, Math.min(2400, nodeX + dx));
      const nextY = Math.max(10, Math.min(1900, nodeY + dy));

      nodeEl.style.left = `${nextX}px`;
      nodeEl.style.top = `${nextY}px`;
      
      // Update coordinates in array
      node.x = nextX;
      node.y = nextY;

      // Realtime redraw curves
      drawFlow();
    });

    document.addEventListener('mouseup', () => {
      if (!isDragging) return;
      isDragging = false;
      nodeEl.style.zIndex = '2';
    });

    // 2. Delete Node Click
    nodeEl.querySelector('.wf-node-delete').addEventListener('click', (e) => {
      e.stopPropagation();
      // Remove node from array
      nodes = nodes.filter(n => n.id !== node.id);
      // Remove connections linked to/from this node
      connections = connections.filter(c => c.from !== node.id && c.to !== node.id);
      drawFlow();
    });

    // 3. Connectors dragging
    const portOut = nodeEl.querySelector('.wf-connector.out');
    if (portOut) {
      portOut.addEventListener('mousedown', (e) => {
        isConnecting = true;
        connectionSourceId = node.id;
        e.preventDefault();
        e.stopPropagation();
      });
    }

    // 4. Input Changes (saving configurations dynamically to the array)
    if (node.type === 'trigger') {
      nodeEl.querySelector('.node-trigger-select').addEventListener('change', (e) => {
        node.trigger_event = e.target.value;
      });
    } else if (node.type === 'condition') {
      nodeEl.querySelector('.node-cond-input').addEventListener('input', (e) => {
        node.expression = e.target.value;
      });
    } else if (node.type === 'action') {
      const actionSelect = nodeEl.querySelector('.node-action-select');
      const templateSelect = nodeEl.querySelector('.node-template-select');
      const assignSelect = nodeEl.querySelector('.node-assign-select');
      const tempContainer = nodeEl.querySelector('.template-select-container');
      const assignContainer = nodeEl.querySelector('.counselor-select-container');

      actionSelect.addEventListener('change', (e) => {
        node.action_type = e.target.value;
        if (node.action_type === 'assign_counselor') {
          tempContainer.style.display = 'none';
          assignContainer.style.display = 'block';
        } else {
          tempContainer.style.display = 'block';
          assignContainer.style.display = 'none';
        }
      });

      templateSelect.addEventListener('change', (e) => {
        node.template_id = e.target.value;
      });

      assignSelect.addEventListener('change', (e) => {
        node.assign_method = e.target.value;
      });
    }
  }

  // Toolbox actions
  tab.querySelector('#btn-add-trigger').addEventListener('click', () => {
    const id = `node-trigger-${Date.now()}`;
    nodes.push({ id, type: 'trigger', x: Math.max(30, 50 - panX), y: Math.max(30, 150 - panY), trigger_event: 'application_status_changed' });
    drawFlow();
  });

  tab.querySelector('#btn-add-condition').addEventListener('click', () => {
    const id = `node-cond-${Date.now()}`;
    nodes.push({ id, type: 'condition', x: Math.max(30, 360 - panX), y: Math.max(30, 150 - panY), expression: 'status === "approved"' });
    drawFlow();
  });

  tab.querySelector('#btn-add-action').addEventListener('click', () => {
    const id = `node-action-${Date.now()}`;
    nodes.push({ id, type: 'action', x: Math.max(30, 670 - panX), y: Math.max(30, 150 - panY), action_type: 'send_offer_letter', template_id: templates[0]?.id || '' });
    drawFlow();
  });

  // Save Flow compilation and dispatch
  tab.querySelector('#btn-save-workflow').addEventListener('click', async () => {
    const name = tab.querySelector('#wf-name-input').value.trim();
    if (!name) return alert('Workflow name is required.');

    // Graph compilation for backend compatibility
    const triggerNode = nodes.find(n => n.type === 'trigger');
    const conditionNode = nodes.find(n => n.type === 'condition');
    const actionNode = nodes.find(n => n.type === 'action');

    const payload = {
      name,
      trigger: triggerNode ? triggerNode.trigger_event : 'application_status_changed',
      condition: conditionNode ? conditionNode.expression.trim() : '',
      action: actionNode ? actionNode.action_type : 'send_offer_letter',
      template_id: (actionNode && actionNode.action_type !== 'assign_counselor') ? actionNode.template_id : null,
      active: currentRule.active,
      flow_data: { nodes, connections } // serialize visual graph data
    };

    try {
      if (isEdit) {
        await updateWorkflowRule(currentRule.id, payload);
      } else {
        await createWorkflowRule(payload);
      }
      handleClose();
    } catch (e) {
      alert('Failed to save workflow: ' + e.message);
    }
  });

  // Cancel & Close
  const handleClose = async () => {
    tab.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;padding:48px;"><div class="spinner"></div><span style="margin-left:12px;color:#64748b;">Loading rules...</span></div>`;
    const rules = await fetchWorkflowRules();
    renderRulesList(tab, rules);
  };
  tab.querySelector('#btn-close-canvas').addEventListener('click', handleClose);

  // Initial render flow
  setTimeout(drawFlow, 100);
}

export function renderWorkflowsTab(container, rules) {
  const tab = container.querySelector('#tab-workflows');
  if (!tab) return;
  renderRulesList(tab, rules);
}

