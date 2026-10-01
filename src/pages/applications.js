import { createApplication, fetchApplications, fetchCourses, updateApplication, exportApplicationsCSV, uploadFile, fetchLetterTemplates, generateOfferLetter, fetchOfferLetters } from '../lib/api.js';
import { openModal } from '../components/modal.js';

function userRole() {
  try { return JSON.parse(sessionStorage.getItem('rbmi_user') || '{}').role || 'admin'; } catch { return 'admin'; }
}

function badge(value) {
  const map = { submitted: 'info', review: 'warn', approved: 'ok', rejected: 'bad', pending: 'warn', verified: 'ok', missing: 'warn', generated: 'ok', sent: 'info' };
  return `<span class="ops-badge ${map[value] || 'info'}">${String(value || 'pending').replace(/_/g, ' ')}</span>`;
}

function normalizeDocs(item) {
  const fallback = ['Class 10 marksheet', 'Class 12 marksheet', 'ID proof', 'Entrance scorecard', 'Passport photo'];
  const byName = new Map((item.documents || []).map(doc => [doc.name, doc]));
  return fallback.map(name => ({ id: name, name, status: 'missing', file_name: '', file_url: '', remarks: '', uploaded_at: null, reviewed_at: null, ...(byName.get(name) || {}) }));
}

function docsSummary(docs) {
  const verified = docs.filter(doc => doc.status === 'verified').length;
  const submitted = docs.filter(doc => doc.status === 'submitted').length;
  return `${verified}/${docs.length} verified${submitted ? `, ${submitted} waiting` : ''}`;
}

async function saveDocuments(application, documents, updates = {}) {
  await updateApplication(application.id, { ...updates, documents });
  window.dispatchEvent(new CustomEvent('rbmi:refresh'));
}

export async function renderApplications(el) {
  const role = userRole();
  let items = [];
  let courses = [];
  try {
    [items, courses] = await Promise.all([fetchApplications(), fetchCourses()]);
  } catch (_) {
    items = await fetchApplications();
    try {
      courses = await fetchCourses();
    } catch {
      courses = [];
    }
  }
  const courseMap = Object.fromEntries(courses.map(course => [course.id, course.name]));
  const total = items.length;
  const approved = items.filter(i => i.status === 'approved').length;
  const pendingDocs = items.filter(i => i.documents_status !== 'verified').length;

  el.innerHTML = `
    <div class="ops-shell">
      <div class="ops-header">
        <div><span class="eyebrow">Applications</span><h1>${role === 'student' ? 'My Applications' : 'Application Manager'}</h1><p>Track applications, documents, review status, and counselor ownership.</p></div>
        <div class="ops-actions">
          ${role !== 'student' ? '<button class="btn btn-secondary" id="export-apps-btn"><i data-lucide="download"></i> Export CSV</button>' : ''}
          ${role !== 'student' ? '<button class="btn btn-warn" id="filter-pending-docs"><i data-lucide="alert-circle"></i> Pending Docs (' + pendingDocs + ')</button>' : ''}
          <button class="btn btn-primary" id="new-application">${role === 'student' ? 'Start Application' : 'Add Application'}</button>
        </div>
      </div>
      
      <div class="settings-tabs" style="margin-bottom: 24px; border-bottom: 1px solid #e2e8f0;">
        <button class="settings-tab active" data-view="all">All Applications</button>
        <button class="settings-tab" data-view="letters">Offer Letters</button>
      </div>

      <div id="applications-view">
        <div class="ops-stats"><div><strong>${total}</strong><span>Total</span></div><div><strong>${approved}</strong><span>Approved</span></div><div><strong>${pendingDocs}</strong><span>Docs pending</span></div></div>
        <div class="ops-table-wrap">
          <table class="data-table"><thead><tr><th>Student</th><th>Program</th><th>Status</th><th>Documents</th><th>Counselor</th><th>Priority</th><th>Action</th></tr></thead><tbody>
            ${items.length ? items.map(item => {
              const docs = normalizeDocs(item);
              return `<tr><td><strong>${item.student_name}</strong><small>${item.email || ''}</small></td><td>${item.course_name || courseMap[item.course_id] || 'Program not selected'}</td><td>${badge(item.status)}</td><td>${badge(item.documents_status)}<small>${docsSummary(docs)}</small></td><td>${item.counselor_name}</td><td>${item.priority}</td><td><div style="display:flex;gap:6px;"><button class="btn btn-secondary btn-sm app-action" data-id="${item.id}">${role === 'student' ? 'Upload Docs' : 'Review'}</button>${item.status === 'approved' && role !== 'student' ? `<button class="btn btn-primary btn-sm offer-action" data-id="${item.id}">Letter</button>` : ''}</div></td></tr>`;
            }).join('') : '<tr><td colspan="7" class="ops-empty">No applications yet</td></tr>'}
          </tbody></table>
        </div>
      </div>
      <div id="letters-view" class="hidden">
        <div style="display:flex;align-items:center;justify-content:center;padding:40px;"><div class="spinner"></div></div>
      </div>
    </div>`;

  window.renderIcons();

  // Tab switching
  const tabs = el.querySelectorAll('.settings-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', async () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const view = tab.dataset.view;
      if (view === 'all') {
        el.querySelector('#applications-view').classList.remove('hidden');
        el.querySelector('#letters-view').classList.add('hidden');
      } else {
        el.querySelector('#applications-view').classList.add('hidden');
        el.querySelector('#letters-view').classList.remove('hidden');
        await renderLettersView(el.querySelector('#letters-view'));
      }
    });
  });

  el.querySelector('#export-apps-btn')?.addEventListener('click', exportApplicationsCSV);

  el.querySelector('#filter-pending-docs')?.addEventListener('click', () => {
    const rows = el.querySelectorAll('tbody tr');
    rows.forEach(row => {
      const docStatus = row.children[3].textContent.toLowerCase();
      row.style.display = docStatus.includes('verified') ? 'none' : '';
    });
  });

  el.querySelector('#new-application')?.addEventListener('click', () => {
    openModal('Start Application', `
      <div class="form-group"><label class="form-label">Program</label><select id="app-course" class="form-input">${courses.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}</select></div>
      ${role !== 'student' ? '<div class="form-group"><label class="form-label">Student name</label><input id="app-name" class="form-input" placeholder="Student name"></div><div class="form-group"><label class="form-label">Email</label><input id="app-email" class="form-input" placeholder="student@email.com"></div>' : ''}
    `, { submitLabel: 'Create', onSubmit: async (body) => {
      await createApplication({ course_id: body.querySelector('#app-course').value, student_name: body.querySelector('#app-name')?.value, email: body.querySelector('#app-email')?.value });
      window.dispatchEvent(new CustomEvent('rbmi:refresh'));
    }});
  });

  el.querySelectorAll('.offer-action').forEach(btn => btn.addEventListener('click', async () => {
    const id = btn.dataset.id;
    const application = items.find(i => i.id === id);
    const templates = await fetchLetterTemplates();
    
    openModal('Generate Offer Letter', `
      <div class="form-group">
        <label class="form-label">Template</label>
        <select id="letter-template-id" class="form-input">
          ${templates.map(t => `<option value="${t.id}">${t.name}</option>`).join('')}
        </select>
      </div>
      <p style="font-size:13px;color:#64748b;margin-top:12px;">This will generate a personalized admission offer letter for <strong>${application.student_name}</strong>.</p>
    `, {
      submitLabel: 'Generate',
      onSubmit: async (body) => {
        const templateId = body.querySelector('#letter-template-id').value;
        await generateOfferLetter(id, templateId);
        alert('Offer letter generated successfully!');
        window.dispatchEvent(new CustomEvent('rbmi:refresh'));
      }
    });
  }));

  el.querySelectorAll('.app-action').forEach(button => button.addEventListener('click', async () => {
    const id = button.dataset.id;
    const application = items.find(item => item.id === id);
    const docs = normalizeDocs(application);

    if (role === 'student') {
      openModal('Upload Documents', `
        <div class="doc-list">
          ${docs.map(doc => `
            <div class="doc-row">
              <div>
                <strong>${doc.name}</strong>
                <small>
                  ${doc.file_url ? `<a href="${doc.file_url}" target="_blank" style="color:var(--color-primary);text-decoration:underline;">${doc.file_name || 'Download'}</a>` : (doc.file_name || 'No file uploaded')}
                  ${doc.remarks ? ' - ' + doc.remarks : ''}
                </small>
              </div>
              ${badge(doc.status)}
            </div>
          `).join('')}
        </div>
        <div class="form-group" style="margin-top:16px;">
          <label class="form-label">Document</label>
          <select class="form-input" id="app-doc-name">
            ${docs.filter(doc => doc.status !== 'verified').map(doc => `<option value="${doc.name}">${doc.name}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">File</label>
          <input class="form-input" type="file" id="app-doc-file" accept=".pdf,.jpg,.jpeg,.png" />
        </div>
      `, {
        submitLabel: 'Submit Document',
        onSubmit: async (body) => {
          const fileInput = body.querySelector('#app-doc-file');
          const file = fileInput?.files?.[0];
          const name = body.querySelector('#app-doc-name').value;
          if (!file) {
            alert('Please choose a file.');
            return false;
          }
          
          // Upload the file to the server
          const submitBtn = body.parentElement.querySelector('#modal-submit-btn');
          if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerText = 'Uploading...';
          }
          
          try {
            const uploadResult = await uploadFile(file, { document_name: name, application_id: application.id });
            const nextDocs = docs.map(doc => doc.name === name ? {
              ...doc,
              status: 'submitted',
              file_name: file.name,
              file_url: uploadResult.url,
              remarks: '',
              uploaded_at: new Date().toISOString(),
              reviewed_at: null
            } : doc);
            await saveDocuments(application, nextDocs);
          } catch (err) {
            alert('Upload failed: ' + err.message);
            if (submitBtn) {
              submitBtn.disabled = false;
              submitBtn.innerText = 'Submit Document';
            }
            return false;
          }
        }
      });
      return;
    }

    openModal('Review Documents', `
      <div class="doc-list">
        ${docs.map(doc => `
          <div class="doc-row">
            <div>
              <strong>${doc.name}</strong>
              <small>
                ${doc.file_url ? `<a href="${doc.file_url}" target="_blank" style="color:var(--color-primary);text-decoration:underline;">${doc.file_name || 'Download'}</a>` : (doc.file_name || 'No file uploaded')}
                ${doc.remarks ? ' - ' + doc.remarks : ''}
              </small>
            </div>
            <div style="display:flex;align-items:center;gap:8px;">
              ${badge(doc.status)}
              ${doc.status === 'submitted' ? `<button class="btn btn-secondary btn-sm doc-reject" data-doc="${doc.name}" type="button">Reject</button><button class="btn btn-primary btn-sm doc-verify" data-doc="${doc.name}" type="button">Verify</button>` : ''}
            </div>
          </div>
        `).join('')}
      </div>
      <div class="form-group" style="margin-top:16px;">
        <label class="form-label">Application status</label>
        <select id="app-review-status" class="form-input">
          <option value="submitted" ${application.status === 'submitted' ? 'selected' : ''}>Submitted</option>
          <option value="review" ${application.status === 'review' ? 'selected' : ''}>Review</option>
          <option value="approved" ${application.status === 'approved' ? 'selected' : ''}>Approved</option>
          <option value="rejected" ${application.status === 'rejected' ? 'selected' : ''}>Rejected</option>
        </select>
      </div>
      `, {
        submitLabel: 'Save Review',
        width: '720px',
        onOpen: (body) => {
          body.querySelectorAll('.doc-verify').forEach(btn => {
            btn.onclick = async () => {
              const nextDocs = docs.map(doc => doc.name === btn.dataset.doc ? { ...doc, status: 'verified', remarks: '', reviewed_at: new Date().toISOString() } : doc);
              await saveDocuments(application, nextDocs, { status: body.querySelector('#app-review-status').value });
            };
          });
          body.querySelectorAll('.doc-reject').forEach(btn => {
            btn.onclick = async () => {
              const remark = prompt('Reason for rejection?', 'Please upload a clearer document.') || 'Rejected during review.';
              const nextDocs = docs.map(doc => doc.name === btn.dataset.doc ? { ...doc, status: 'rejected', remarks: remark, reviewed_at: new Date().toISOString() } : doc);
              await saveDocuments(application, nextDocs, { status: 'review' });
            };
          });
        },
        onSubmit: async (body) => {
          await saveDocuments(application, docs, { status: body.querySelector('#app-review-status').value });
        }
      });
  }));
}

async function renderLettersView(container) {
  try {
    const letters = await fetchOfferLetters();
    const apps = await fetchApplications();
    const appMap = Object.fromEntries(apps.map(a => [a.id, a]));

    container.innerHTML = `
      <div class="ops-table-wrap">
        <table class="data-table">
          <thead><tr><th>Student</th><th>Letter Status</th><th>Generated Date</th><th>Actions</th></tr></thead>
          <tbody>
            ${letters.length ? letters.map(l => {
              const app = appMap[l.application_id];
              return `<tr>
                <td><strong>${app?.student_name || 'Unknown'}</strong><small>${app?.email || ''}</small></td>
                <td>${badge(l.status)}</td>
                <td>${new Date(l.created_at).toLocaleDateString('en-IN')}</td>
                <td>
                  <button class="btn btn-secondary btn-sm view-letter-btn" data-id="${l.id}">View</button>
                </td>
              </tr>`;
            }).join('') : '<tr><td colspan="4" class="ops-empty">No offer letters generated yet</td></tr>'}
          </tbody>
        </table>
      </div>
    `;

    container.querySelectorAll('.view-letter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const letter = letters.find(l => l.id === btn.dataset.id);
        openModal('View Offer Letter', `
          <div style="background:#fff; border:1px solid #e2e8f0; padding:40px; border-radius:8px; font-family:serif; color:#1e293b; line-height:1.6;">
            ${letter.content}
          </div>
        `, { submitLabel: 'Print / Download', onSubmit: () => window.print() });
      });
    });
  } catch (err) {
    container.innerHTML = `<p style="color:var(--color-bad); padding:20px;">Failed to load letters: ${err.message}</p>`;
  }
}


