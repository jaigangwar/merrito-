import { getAPI } from '../lib/api.js';

export async function formBuilderPage() {
  const container = document.getElementById('page-content');
  container.innerHTML = `
    <div class="form-builder-container">
      <div class="page-header">
        <h1>Form Builder</h1>
        <p>Create custom lead capture forms</p>
      </div>

      <div class="form-builder-main">
        <div class="forms-list-section">
          <div class="section-header">
            <h2>Your Forms</h2>
            <button class="btn btn-primary" id="createFormBtn">+ Create New Form</button>
          </div>

          <div id="formsList" class="forms-grid">
            <div class="loading">Loading forms...</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Create/Edit Form Modal -->
    <div id="formModal" class="modal hidden">
      <div class="modal-content">
        <div class="modal-header">
          <h2 id="modalTitle">Create New Form</h2>
          <button class="close-btn" id="closeFormModal">&times;</button>
        </div>

        <div class="modal-body">
          <div class="form-group">
            <label>Form Name *</label>
            <input type="text" id="formName" placeholder="e.g., MBA Inquiry Form" required>
          </div>

          <div class="form-group">
            <label>Description</label>
            <textarea id="formDescription" placeholder="What is this form for?"></textarea>
          </div>

          <div class="form-group">
            <label>Target Course</label>
            <select id="formCourse">
              <option value="">Select Course (Optional)</option>
              <option value="mba">MBA</option>
              <option value="bba">BBA</option>
              <option value="bca">BCA</option>
              <option value="mca">MCA</option>
              <option value="btech">B.Tech</option>
            </select>
          </div>

          <div class="form-group">
            <label>Redirect URL (After submission)</label>
            <input type="url" id="formRedirect" placeholder="https://yoursite.com/thank-you">
          </div>

          <div class="form-group">
            <label>Form Fields *</label>
            <div id="fieldsList" class="fields-list">
              <!-- Fields will be added here -->
            </div>
            <button type="button" class="btn btn-secondary" id="addFieldBtn">+ Add Field</button>
          </div>
        </div>

        <div class="modal-footer">
          <button class="btn btn-secondary" id="cancelFormBtn">Cancel</button>
          <button class="btn btn-primary" id="saveFormBtn">Save Form</button>
        </div>
      </div>
    </div>

    <!-- Form Details Modal -->
    <div id="detailsModal" class="modal hidden">
      <div class="modal-content modal-lg">
        <div class="modal-header">
          <h2 id="detailsTitle">Form Details</h2>
          <button class="close-btn" id="closeDetailsModal">&times;</button>
        </div>

        <div class="modal-body">
          <div class="tabs">
            <button class="tab-btn active" data-tab="embed">Embed Code</button>
            <button class="tab-btn" data-tab="submissions">Submissions</button>
            <button class="tab-btn" data-tab="preview">Preview</button>
          </div>

          <!-- Embed Code Tab -->
          <div id="embed-tab" class="tab-content active">
            <h3>Embed This Form on Your Website</h3>
            <p>Copy and paste this code on your website:</p>
            <div class="code-block">
              <pre id="embedCode"></pre>
              <button class="btn btn-small" id="copyEmbedBtn">Copy Code</button>
            </div>
            <p><strong>Or share this link:</strong></p>
            <div class="code-block">
              <input type="text" id="formLink" readonly>
              <button class="btn btn-small" id="copyLinkBtn">Copy Link</button>
            </div>
          </div>

          <!-- Submissions Tab -->
          <div id="submissions-tab" class="tab-content">
            <h3>Form Submissions</h3>
            <div id="submissionsList" class="submissions-table">
              <div class="loading">Loading submissions...</div>
            </div>
          </div>

          <!-- Preview Tab -->
          <div id="preview-tab" class="tab-content">
            <h3>Form Preview</h3>
            <div id="formPreview" class="form-preview">
              <!-- Form preview will be rendered here -->
            </div>
          </div>
        </div>

        <div class="modal-footer">
          <button class="btn btn-danger" id="deleteFormBtn">Delete Form</button>
          <button class="btn btn-secondary" id="closeDetailsBtn">Close</button>
        </div>
      </div>
    </div>
  `;

  setupFormBuilderListeners();
  loadForms();
}

function setupFormBuilderListeners() {
  // Create form
  document.getElementById('createFormBtn')?.addEventListener('click', () => {
    document.getElementById('modalTitle').textContent = 'Create New Form';
    document.getElementById('formName').value = '';
    document.getElementById('formDescription').value = '';
    document.getElementById('formCourse').value = '';
    document.getElementById('formRedirect').value = '';
    document.getElementById('fieldsList').innerHTML = `
      <div class="field-item">
        <input type="text" class="field-name" placeholder="Field name" value="first_name">
        <input type="text" class="field-label" placeholder="Label" value="First Name">
        <select class="field-type">
          <option value="text">Text</option>
          <option value="email">Email</option>
          <option value="phone">Phone</option>
          <option value="select">Select</option>
          <option value="textarea">Textarea</option>
        </select>
        <label><input type="checkbox" class="field-required"> Required</label>
        <button type="button" class="btn-icon" onclick="this.parentElement.remove()">🗑️</button>
      </div>
      <div class="field-item">
        <input type="text" class="field-name" placeholder="Field name" value="email">
        <input type="text" class="field-label" placeholder="Label" value="Email">
        <select class="field-type">
          <option value="text">Text</option>
          <option value="email" selected>Email</option>
          <option value="phone">Phone</option>
          <option value="select">Select</option>
          <option value="textarea">Textarea</option>
        </select>
        <label><input type="checkbox" class="field-required" checked> Required</label>
        <button type="button" class="btn-icon" onclick="this.parentElement.remove()">🗑️</button>
      </div>
      <div class="field-item">
        <input type="text" class="field-name" placeholder="Field name" value="phone">
        <input type="text" class="field-label" placeholder="Label" value="Phone">
        <select class="field-type">
          <option value="text">Text</option>
          <option value="email">Email</option>
          <option value="phone" selected>Phone</option>
          <option value="select">Select</option>
          <option value="textarea">Textarea</option>
        </select>
        <label><input type="checkbox" class="field-required" checked> Required</label>
        <button type="button" class="btn-icon" onclick="this.parentElement.remove()">🗑️</button>
      </div>
      <div class="field-item">
        <input type="text" class="field-name" placeholder="Field name" value="city">
        <input type="text" class="field-label" placeholder="Label" value="City">
        <select class="field-type">
          <option value="text" selected>Text</option>
          <option value="email">Email</option>
          <option value="phone">Phone</option>
          <option value="select">Select</option>
          <option value="textarea">Textarea</option>
        </select>
        <label><input type="checkbox" class="field-required"> Required</label>
        <button type="button" class="btn-icon" onclick="this.parentElement.remove()">🗑️</button>
      </div>
    `;
    document.getElementById('formModal').classList.remove('hidden');
  });

  // Add field
  document.getElementById('addFieldBtn')?.addEventListener('click', () => {
    const fieldItem = document.createElement('div');
    fieldItem.className = 'field-item';
    fieldItem.innerHTML = `
      <input type="text" class="field-name" placeholder="Field name" value="field_name">
      <input type="text" class="field-label" placeholder="Label" value="Field Label">
      <select class="field-type">
        <option value="text">Text</option>
        <option value="email">Email</option>
        <option value="phone">Phone</option>
        <option value="select">Select</option>
        <option value="textarea">Textarea</option>
      </select>
      <label><input type="checkbox" class="field-required"> Required</label>
      <button type="button" class="btn-icon" onclick="this.parentElement.remove()">🗑️</button>
    `;
    document.getElementById('fieldsList').appendChild(fieldItem);
  });

  // Save form
  document.getElementById('saveFormBtn')?.addEventListener('click', async () => {
    const fields = Array.from(document.querySelectorAll('.field-item')).map(item => ({
      name: item.querySelector('.field-name').value,
      label: item.querySelector('.field-label').value,
      type: item.querySelector('.field-type').value,
      required: item.querySelector('.field-required').checked
    }));

    const formData = {
      name: document.getElementById('formName').value,
      description: document.getElementById('formDescription').value,
      course_id: document.getElementById('formCourse').value,
      redirectUrl: document.getElementById('formRedirect').value,
      fields
    };

    try {
      const result = await getAPI('/forms', 'POST', formData);
      alert('Form created successfully!');
      document.getElementById('formModal').classList.add('hidden');
      loadForms();
    } catch (e) {
      alert('Error: ' + e.message);
    }
  });

  // Close modals
  document.getElementById('closeFormModal')?.addEventListener('click', () => {
    document.getElementById('formModal').classList.add('hidden');
  });

  document.getElementById('closeDetailsModal')?.addEventListener('click', () => {
    document.getElementById('detailsModal').classList.add('hidden');
  });

  document.getElementById('cancelFormBtn')?.addEventListener('click', () => {
    document.getElementById('formModal').classList.add('hidden');
  });

  document.getElementById('closeDetailsBtn')?.addEventListener('click', () => {
    document.getElementById('detailsModal').classList.add('hidden');
  });

  // Tab switching
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`${tab}-tab`).classList.add('active');
    });
  });
}

async function loadForms() {
  try {
    const response = await getAPI('/forms');
    const forms = response.data || [];

    const container = document.getElementById('formsList');

    if (forms.length === 0) {
      container.innerHTML = '<div class="empty-state">No forms yet. Create your first form!</div>';
      return;
    }

    container.innerHTML = forms.map(form => `
      <div class="form-card">
        <h3>${form.name}</h3>
        <p>${form.description || 'No description'}</p>
        <div class="form-stats">
          <span>📝 ${form.fields?.length || 0} fields</span>
          <span>📊 ${form.submissions_count || 0} submissions</span>
          <span class="badge ${form.status === 'active' ? 'badge-success' : 'badge-gray'}">${form.status}</span>
        </div>
        <div class="form-actions">
          <button class="btn btn-small btn-primary" onclick="viewFormDetails('${form.id}')">View Details</button>
          <button class="btn btn-small btn-secondary" onclick="editForm('${form.id}')">Edit</button>
        </div>
      </div>
    `).join('');
  } catch (e) {
    document.getElementById('formsList').innerHTML = `<div class="error">Error loading forms: ${e.message}</div>`;
  }
}

async function viewFormDetails(formId) {
  try {
    const form = await getAPI(`/forms/${formId}`);
    const embedData = await getAPI(`/forms/${formId}/embed`);

    document.getElementById('detailsTitle').textContent = form.name;
    document.getElementById('embedCode').textContent = embedData.embed_code;
    document.getElementById('formLink').value = `${window.location.origin}${embedData.form_url}`;

    // Load submissions
    const submissions = await getAPI(`/forms/${formId}/submissions`);
    const subTable = document.getElementById('submissionsList');
    subTable.innerHTML = submissions.data.length > 0 ? `
      <table class="submissions-table">
        <thead>
          <tr>
            <th>Submitted</th>
            <th>Name</th>
            <th>Email</th>
            <th>Phone</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          ${submissions.data.map(s => `
            <tr>
              <td>${new Date(s.submitted_at).toLocaleDateString()}</td>
              <td>${s.data.first_name} ${s.data.last_name}</td>
              <td>${s.data.email}</td>
              <td>${s.data.phone}</td>
              <td><a href="/leads?search=${s.lead_id}" class="link">View Lead</a></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    ` : '<p>No submissions yet</p>';

    // Copy buttons
    document.getElementById('copyEmbedBtn')?.addEventListener('click', () => {
      navigator.clipboard.writeText(embedData.embed_code);
      alert('Copied!');
    });

    document.getElementById('copyLinkBtn')?.addEventListener('click', () => {
      navigator.clipboard.writeText(document.getElementById('formLink').value);
      alert('Copied!');
    });

    // Delete form
    document.getElementById('deleteFormBtn')?.addEventListener('click', async () => {
      if (confirm('Delete this form? All submissions will be kept.')) {
        await getAPI(`/forms/${formId}`, 'DELETE');
        alert('Form deleted');
        document.getElementById('detailsModal').classList.add('hidden');
        loadForms();
      }
    });

    document.getElementById('detailsModal').classList.remove('hidden');
  } catch (e) {
    alert('Error: ' + e.message);
  }
}

async function editForm(formId) {
  try {
    const form = await getAPI(`/forms/${formId}`);
    document.getElementById('modalTitle').textContent = 'Edit Form';
    document.getElementById('formName').value = form.name;
    document.getElementById('formDescription').value = form.description;
    document.getElementById('formCourse').value = form.course_id || '';
    document.getElementById('formRedirect').value = form.redirectUrl || '';

    document.getElementById('fieldsList').innerHTML = form.fields.map(field => `
      <div class="field-item">
        <input type="text" class="field-name" placeholder="Field name" value="${field.name}">
        <input type="text" class="field-label" placeholder="Label" value="${field.label}">
        <select class="field-type">
          <option value="text" ${field.type === 'text' ? 'selected' : ''}>Text</option>
          <option value="email" ${field.type === 'email' ? 'selected' : ''}>Email</option>
          <option value="phone" ${field.type === 'phone' ? 'selected' : ''}>Phone</option>
          <option value="select" ${field.type === 'select' ? 'selected' : ''}>Select</option>
          <option value="textarea" ${field.type === 'textarea' ? 'selected' : ''}>Textarea</option>
        </select>
        <label><input type="checkbox" class="field-required" ${field.required ? 'checked' : ''}> Required</label>
        <button type="button" class="btn-icon" onclick="this.parentElement.remove()">🗑️</button>
      </div>
    `).join('');

    document.getElementById('formModal').classList.remove('hidden');
  } catch (e) {
    alert('Error: ' + e.message);
  }
}
