// ===== LEADS MANAGEMENT PAGE — API-connected =====
import { fetchLeads, createLead, updateLead, deleteLead, bulkDeleteLeads, fetchCounselors, fetchCourses, exportLeadsCSV, fetchTasks, createTask, updateTask, fetchCallLogs, createCallLog, fetchStudentInbox, createStudentInboxMessage, chatWithAI } from '../lib/api.js';
import { getStageInfo, getPriorityInfo, formatDate, getAvatarColor, debounce } from '../components/utils.js';
import { openModal } from '../components/modal.js';

const STAGES = [
  { id: 'enquiry', label: 'Enquiry' }, { id: 'counseling_scheduled', label: 'Counseling Scheduled' },
  { id: 'counseling_done', label: 'Counseling Done' }, { id: 'application_submitted', label: 'Application Submitted' },
  { id: 'documents_verified', label: 'Documents Verified' }, { id: 'admitted', label: 'Admitted' }, { id: 'enrolled', label: 'Enrolled' }
];
const SOURCES = ['Website', 'Walk-in', 'Referral', 'Social Media', 'Education Fair', 'Google Ads', 'Phone Inquiry', 'JustDial', 'Shiksha', 'CollegeDekho'];

function getCurrentUser() {
  try { return JSON.parse(sessionStorage.getItem('rbmi_user') || 'null'); } catch { return null; }
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  }[char]));
}

let counselorsCache = [];
let coursesCache = [];
let currentFilters = { stage: '', source: '', counselor_id: '', search: '' };
let currentSort = { field: 'created_at', order: 'desc' };
let currentPage = 1;

async function loadLeads(container) {
  const tableWrap = container.querySelector('#leads-table-wrap');
  if (!tableWrap) return;

  tableWrap.innerHTML = '<div class="table-loading"><div class="spinner"></div> Loading leads...</div>';

  try {
    const result = await fetchLeads({
      stage: currentFilters.stage,
      source: currentFilters.source,
      counselor_id: currentFilters.counselor_id,
      search: currentFilters.search,
      sort: currentSort.field,
      order: currentSort.order,
      page: currentPage,
      limit: 12
    });

    renderLeadsTable(tableWrap, result, container);
  } catch (err) {
    tableWrap.innerHTML = `<div class="table-loading error-state"><p>Failed to load leads: ${err.message}</p><p style="color:var(--color-text-muted);">Make sure API server is running: <code>npm run server</code></p></div>`;
  }
}

function updateBulkBar(tableWrap, container) {
  const checked = [...tableWrap.querySelectorAll('.lead-check:checked')];
  let bar = container.querySelector('#bulk-action-bar');
  if (checked.length === 0) {
    if (bar) bar.remove();
    return;
  }
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'bulk-action-bar';
    bar.style.cssText = 'position:sticky;top:0;z-index:10;background:var(--color-sidebar);color:white;padding:10px 16px;display:flex;align-items:center;gap:12px;border-radius:8px;margin-bottom:8px;';
    container.querySelector('#leads-table-wrap').before(bar);
  }
  bar.innerHTML = `
    <span style="font-weight:600;">${checked.length} selected</span>
    <button id="bulk-delete-btn" style="background:#ef4444;color:white;border:none;padding:6px 14px;border-radius:6px;cursor:pointer;font-size:13px;font-weight:600;">Delete Selected</button>
    <button id="bulk-stage-btn" style="background:#6366f1;color:white;border:none;padding:6px 14px;border-radius:6px;cursor:pointer;font-size:13px;font-weight:600;">Change Stage</button>
    <button id="bulk-counselor-btn" style="background:#10b981;color:white;border:none;padding:6px 14px;border-radius:6px;cursor:pointer;font-size:13px;font-weight:600;">Change Counselor</button>
    <button id="bulk-cancel-btn" style="background:rgba(255,255,255,0.15);color:white;border:none;padding:6px 14px;border-radius:6px;cursor:pointer;font-size:13px;">Cancel</button>
  `;
  bar.querySelector('#bulk-cancel-btn').addEventListener('click', () => {
    tableWrap.querySelectorAll('.lead-check').forEach(cb => cb.checked = false);
    tableWrap.querySelector('#select-all').checked = false;
    bar.remove();
  });
  bar.querySelector('#bulk-delete-btn').addEventListener('click', async () => {
    const ids = checked.map(cb => cb.dataset.id);
    if (!confirm(`Delete ${ids.length} leads? This cannot be undone.`)) return;
    try {
      await bulkDeleteLeads(ids);
      bar.remove();
      loadLeads(container);
    } catch (err) { alert('Failed: ' + err.message); }
  });
  bar.querySelector('#bulk-stage-btn').addEventListener('click', () => {
    const ids = checked.map(cb => cb.dataset.id);
    openModal('Change Stage for ' + ids.length + ' leads', `
      <div class="form-group">
        <label class="form-label">New Stage</label>
        <select class="form-select" id="bulk-stage-select">
          ${STAGES.map(s => `<option value="${s.id}">${s.label}</option>`).join('')}
        </select>
      </div>
    `, {
      submitLabel: 'Update All',
      onSubmit: async (body) => {
        const stage = body.querySelector('#bulk-stage-select').value;
        await Promise.all(ids.map(id => updateLead(id, { stage })));
        bar.remove();
        loadLeads(container);
      }
    });
  });
  bar.querySelector('#bulk-counselor-btn').addEventListener('click', async () => {
    const ids = checked.map(cb => cb.dataset.id);
    if (counselorsCache.length === 0) counselorsCache = await fetchCounselors();
    openModal('Assign Counselor to ' + ids.length + ' leads', `
      <div class="form-group">
        <label class="form-label">New Counselor</label>
        <select class="form-select" id="bulk-counselor-select">
          ${counselorsCache.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}
        </select>
      </div>
    `, {
      submitLabel: 'Reassign All',
      onSubmit: async (body) => {
        const cid = body.querySelector('#bulk-counselor-select').value;
        await Promise.all(ids.map(id => updateLead(id, { counselor_id: cid })));
        bar.remove();
        loadLeads(container);
      }
    });
  });
}

function renderLeadsTable(tableWrap, result, container) {
  const { data: leads, total, page, totalPages } = result;

  tableWrap.innerHTML = `
    <table class="data-table leads-table" id="leads-data-table">
      <thead>
        <tr>
          <th class="th-check"><input type="checkbox" id="select-all" /></th>
          <th class="sortable" data-sort="last_name">Student <i data-lucide="arrow-up-down" style="width:12px;height:12px;"></i></th>
          <th>Course</th>
          <th>Source</th>
          <th class="sortable" data-sort="stage">Stage <i data-lucide="arrow-up-down" style="width:12px;height:12px;"></i></th>
          <th>Counselor</th>
          <th class="sortable" data-sort="lead_score">Quality <i data-lucide="arrow-up-down" style="width:12px;height:12px;"></i></th>
          <th class="sortable" data-sort="created_at">Date <i data-lucide="arrow-up-down" style="width:12px;height:12px;"></i></th>
          <th>Priority</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${leads.length === 0 ? '<tr><td colspan="10" style="text-align:center;padding:2rem;color:var(--color-text-muted);">No leads found</td></tr>' : ''}
        ${leads.map(l => {
          const stage = getStageInfo(l.stage);
          const priority = getPriorityInfo(l.priority);
          const initials = l.name.split(' ').map(n => n[0]).join('');
          const scoreColor = (l.lead_score || 0) > 60 ? 'var(--color-success)' : (l.lead_score || 0) > 40 ? 'var(--color-warning)' : 'var(--color-text-muted)';
          const strength = l.lead_strength || ((l.lead_score || 0) > 75 ? 'hot' : (l.lead_score || 0) > 55 ? 'warm' : 'nurture');
          const verification = l.verification_status || 'needs_review';
          return `
          <tr class="lead-row" data-id="${l.id}">
            <td><input type="checkbox" class="lead-check" data-id="${l.id}" /></td>
            <td>
              <div class="table-user">
                <div class="avatar-sm" style="background:${getAvatarColor(l.name)}">${initials}</div>
                <div><div class="table-user-name">${l.name}</div><div class="table-user-sub">${l.email || l.phone}</div></div>
              </div>
            </td>
            <td><span class="course-tag">${l.course_name}</span></td>
            <td><span class="source-label">${l.source}</span></td>
            <td><span class="stage-badge" style="background:${stage.bg};color:${stage.color};">${stage.label}</span></td>
            <td><span class="counselor-name">${l.counselor_name}</span></td>
            <td>
              <span class="score-cell" style="color:${scoreColor};font-weight:700;">${l.lead_score || 10}</span>
              <small style="display:block;color:var(--color-text-muted);text-transform:capitalize;">${strength} - ${verification.replace('_', ' ')}</small>
            </td>
            <td><span class="date-cell">${formatDate(l.created_at)}</span></td>
            <td><span class="priority-dot" style="background:${priority.color};" title="${priority.label}"></span></td>
            <td>
              <div class="action-btns">
                <button class="action-btn btn-view-lead" title="View" data-action="view" data-id="${l.id}" style="padding:4px 8px;font-size:11px;font-weight:600;background:var(--color-bg);border-radius:4px;border:1px solid var(--color-border);color:var(--color-text-secondary);">View</button>
                <button class="action-btn btn-stage-lead" title="Change stage" data-action="stage" data-id="${l.id}" style="padding:4px 8px;font-size:11px;font-weight:600;background:rgba(124,58,237,0.1);color:#a78bfa;border-radius:4px;border:1px solid rgba(124,58,237,0.2);">Stage</button>
                <button class="action-btn btn-del-lead" title="Delete" data-action="delete" data-id="${l.id}" style="padding:4px 8px;font-size:11px;font-weight:600;background:rgba(239,68,68,0.1);color:#f87171;border-radius:4px;border:1px solid rgba(239,68,68,0.2);">Del</button>
              </div>
            </td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
    <div class="table-footer">
      <div class="table-info">Showing ${(page-1)*12+1}–${Math.min(page*12, total)} of ${total} leads</div>
      <div class="pagination">
        <button class="page-btn" id="prev-page" ${page===1?'disabled':''}>�</button>
        ${Array.from({length: Math.min(totalPages, 7)}, (_, i) => {
          let p;
          if (totalPages <= 7) p = i+1;
          else if (page <= 4) p = i+1;
          else if (page >= totalPages-3) p = totalPages-6+i;
          else p = page-3+i;
          return `<button class="page-btn ${p===page?'active':''}" data-page="${p}">${p}</button>`;
        }).join('')}
        <button class="page-btn" id="next-page" ${page===totalPages?'disabled':''}>�</button>
      </div>
    </div>
  `;

  window.renderIcons();

  // Bulk select
  tableWrap.querySelector('#select-all')?.addEventListener('change', (e) => {
    tableWrap.querySelectorAll('.lead-check').forEach(cb => cb.checked = e.target.checked);
    updateBulkBar(tableWrap, container);
  });
  tableWrap.querySelectorAll('.lead-check').forEach(cb => {
    cb.addEventListener('change', () => updateBulkBar(tableWrap, container));
  });

  // Sort
  tableWrap.querySelectorAll('.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const f = th.dataset.sort;
      if (currentSort.field === f) currentSort.order = currentSort.order === 'asc' ? 'desc' : 'asc';
      else { currentSort.field = f; currentSort.order = 'asc'; }
      currentPage = 1;
      loadLeads(container);
    });
  });

  // Pagination
  tableWrap.querySelector('#prev-page')?.addEventListener('click', () => { if (page > 1) { currentPage--; loadLeads(container); } });
  tableWrap.querySelector('#next-page')?.addEventListener('click', () => { if (page < totalPages) { currentPage++; loadLeads(container); } });
  tableWrap.querySelectorAll('.page-btn[data-page]').forEach(btn => {
    btn.addEventListener('click', () => { currentPage = parseInt(btn.dataset.page); loadLeads(container); });
  });

  // View details
  tableWrap.querySelectorAll('[data-action="view"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const lead = leads.find(l => l.id === btn.dataset.id);
      if (lead) showLeadDetails(lead);
    });
  });

  // Stage change
  tableWrap.querySelectorAll('[data-action="stage"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const lead = leads.find(l => l.id === btn.dataset.id);
      if (lead) showStageChangeModal(lead, container);
    });
  });

  // Delete
  tableWrap.querySelectorAll('[data-action="delete"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const lead = leads.find(l => l.id === btn.dataset.id);
      if (!lead) return;
      if (!confirm(`Delete lead "${lead.name}"? This cannot be undone.`)) return;
      try {
        await deleteLead(lead.id);
        loadLeads(container);
      } catch (err) {
        alert('Failed to delete: ' + err.message);
      }
    });
  });
}
function showLeadDetails(lead) {
  const stage = getStageInfo(lead.stage);
  const stageOrder = ['enquiry','counseling_scheduled','counseling_done','application_submitted','documents_verified','admitted','enrolled'];
  const stageIdx = stageOrder.indexOf(lead.stage);
  const attribution = lead.source_attribution || { primary: lead.source, secondary: 'Not tracked', tertiary: 'Not tracked' };
  
  const timelineHtml = stageOrder.map((s, i) => {
    const info = getStageInfo(s);
    const done = i <= stageIdx;
    return `
      <div class="profile-timeline-item ${done ? 'done' : ''}">
        <div class="timeline-dot" style="background:${done ? info.color : '#e2e8f0'}"></div>
        <div class="timeline-content">
          <div class="timeline-label">${info.label}</div>
          <div class="timeline-time">${done ? 'Completed' : 'Pending'}</div>
        </div>
      </div>
    `;
  }).join('');

  const fallbackCommsText = 'No communication logs yet.';

  const docsHtml = [
    { name: 'Class 10 Marksheet', status: 'verified' },
    { name: 'Class 12 Marksheet', status: 'pending' },
    { name: 'ID Proof (Aadhar)', status: 'verified' }
  ].map(d => `
    <div class="doc-row-mini">
      <span>${d.name}</span>
      <span class="doc-status ${d.status}">${d.status}</span>
    </div>
  `).join('');

  openModal(`Student 360 — ${lead.name}`, `
    <div class="s360-container">
      <div class="s360-sidebar">
        <div class="s360-user-card">
          <div class="avatar-lg" style="background:${getAvatarColor(lead.name)}">${lead.name.split(' ').map(n => n[0]).join('')}</div>
          <h3>${lead.name}</h3>
          <div class="stage-badge" style="background:${stage.bg};color:${stage.color}">${stage.label}</div>
          <div class="score-meter" style="--score:${lead.lead_score || 15}%">
            <span>Intent Score</span>
            <strong>${lead.lead_score || 15}</strong>
          </div>
        </div>
        <div class="s360-info-list">
          <div class="info-item"><label>Phone</label><span>${lead.phone}</span></div>
          <div class="info-item"><label>Email</label><span>${lead.email || '—'}</span></div>
          <div class="info-item"><label>Source</label><span>${lead.source}</span></div>
          <div class="info-item"><label>Attribution</label><span>${escapeHtml(attribution.primary || 'N/A')} / ${escapeHtml(attribution.secondary || 'N/A')}</span></div>
          <div class="info-item"><label>Verification</label><span>${escapeHtml((lead.verification_status || 'needs_review').replace('_', ' '))}</span></div>
          <div class="info-item"><label>Lead Strength</label><span>${escapeHtml(lead.lead_strength || 'nurture')}</span></div>
          <div class="info-item"><label>Course</label><span>${lead.course_name}</span></div>
          <div class="info-item"><label>Counselor</label><span>${lead.counselor_name}</span></div>
        </div>
        <div class="s360-actions">
          <button class="btn btn-primary btn-full" id="s360-call-btn">Start Call</button>
          <button class="btn btn-secondary btn-full" id="s360-whatsapp-btn">WhatsApp</button>
        </div>
      </div>
      <div class="s360-main">
        <div class="s360-tabs">
          <button class="tab-btn active" data-tab="timeline">Journey</button>
          <button class="tab-btn" data-tab="comm">Communication</button>
          <button class="tab-btn" data-tab="tasks">Tasks</button>
          <button class="tab-btn" data-tab="docs">Documents</button>
          <button class="tab-btn" data-tab="ai" style="color:var(--color-primary);font-weight:700;">
            <i data-lucide="sparkles" style="width:14px;height:14px;margin-right:4px;"></i> Asha AI
          </button>
        </div>
        <div class="tab-pane active" id="pane-timeline">
          <div class="profile-timeline">${timelineHtml}</div>
        </div>
        <div class="tab-pane" id="pane-comm">
          <div class="comm-logs">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;">
              <h4 style="margin:0;">Interaction History</h4>
              <button class="btn btn-secondary btn-sm" id="ai-draft-followup">
                <i data-lucide="sparkles" style="width:12px;height:12px;margin-right:4px;"></i> Draft Follow-up
              </button>
            </div>              <div id="ai-followup-container" style="display:none;margin-bottom:1rem;padding:12px;background:rgba(124,58,237,0.08);border:1px solid rgba(124,58,237,0.2);border-radius:8px;">
              <div style="display:flex;justify-content:space-between;margin-bottom:8px;"><strong style="font-size:12px;color:#a78bfa;">AI Drafted Message</strong><button class="btn-icon" id="close-ai-draft"><i data-lucide="x" style="width:14px;height:14px;"></i></button></div>
              <textarea id="ai-followup-text" class="form-input" rows="4" style="font-size:13px;"></textarea>
              <div style="margin-top:8px;display:flex;gap:8px;">
                <button class="btn btn-primary btn-sm" id="copy-ai-draft">Copy to Clipboard</button>
              </div>
            </div>
            <div id="lead-comm-list">
              <div class="table-loading"><div class="spinner"></div> Loading communication...</div>
            </div>
          </div>
        </div>
        <div class="tab-pane" id="pane-tasks">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;gap:1rem;">
            <h4 style="margin:0;">Follow-up Tasks</h4>
            <button class="btn btn-primary btn-sm" id="add-task-btn">Add Task</button>
          </div>
          <div id="task-inline-form" style="display:none;margin-bottom:1rem;padding:1rem;border:1px solid var(--color-border);border-radius:8px;background:var(--color-bg-alt);">
            <div class="form-grid">
              <div class="form-group form-full">
                <label class="form-label">Task Title</label>
                <input class="form-input" id="task-title" />
              </div>
              <div class="form-group">
                <label class="form-label">Type</label>
                <select class="form-select" id="task-type">
                  <option value="call">Call</option>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="email">Email</option>
                  <option value="meeting">Meeting</option>
                  <option value="visit">Campus Visit</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">Due Date</label>
                <input class="form-input" id="task-due" type="datetime-local" />
              </div>
              <div class="form-group form-full">
                <label class="form-label">Notes</label>
                <textarea class="form-textarea" id="task-notes" rows="2" placeholder="What should the counselor do next?"></textarea>
              </div>
            </div>
            <div style="display:flex;gap:8px;justify-content:flex-end;">
              <button class="btn btn-secondary btn-sm" id="cancel-task-btn">Cancel</button>
              <button class="btn btn-primary btn-sm" id="save-task-btn">Create Task</button>
            </div>
          </div>
          <div id="lead-tasks-list" class="comm-logs">
            <div class="table-loading"><div class="spinner"></div> Loading tasks...</div>
          </div>
        </div>
        <div class="tab-pane" id="pane-docs">
          <div class="docs-list-mini">${docsHtml}</div>
        </div>
        <div class="tab-pane" id="pane-ai">
          <div class="ai-insight-pane">
            <div style="text-align:center;padding:2rem;" id="ai-analysis-loading">
              <div class="spinner" style="margin:0 auto 1rem;"></div>
              <p>Asha AI is analyzing ${lead.name}'s profile...</p>
            </div>
            <div id="ai-analysis-content" style="display:none;">
              <div class="ai-score-card" style="display:flex;gap:1rem;margin-bottom:1.5rem;">
                <div style="flex:1;background:var(--color-bg-alt);padding:1rem;border-radius:8px;text-align:center;">
                  <div style="font-size:12px;color:var(--color-text-muted);margin-bottom:4px;">Conversion Probability</div>
                  <div id="ai-prob-val" style="font-size:24px;font-weight:800;color:var(--color-primary);">--</div>
                </div>
                <div style="flex:1;background:var(--color-bg-alt);padding:1rem;border-radius:8px;text-align:center;">
                  <div style="font-size:12px;color:var(--color-text-muted);margin-bottom:4px;">Intent Level</div>
                  <div id="ai-intent-val" style="font-size:24px;font-weight:800;color:var(--color-success);">--</div>
                </div>
              </div>
              <div class="sqi-insight-box" style="background:rgba(14,165,233,0.1);border-color:rgba(14,165,233,0.2);">
                <h4 class="sqi-insight-heading" style="color:#38bdf8;">Key Insights</h4>
                <div id="ai-insights-list" class="sqi-insight-text"></div>
              </div>
              <div class="sqi-insight-box" style="margin-top:1rem;background:rgba(16,185,129,0.1);border-color:rgba(16,185,129,0.2);">
                <h4 class="sqi-insight-heading" style="color:#34d399;">Recommended Next Action</h4>
                <p id="ai-recommendation" class="sqi-insight-text"></p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `, { 
    width: '900px', 
    showFooter: false,
    onOpen: (body) => {
      window.renderIcons();
      const renderCommunications = async () => {
        const list = body.querySelector('#lead-comm-list');
        if (!list) return;
        list.innerHTML = '<div class="table-loading"><div class="spinner"></div> Loading communication...</div>';
        try {
          const [calls, inbox] = await Promise.all([fetchCallLogs(), fetchStudentInbox()]);
          const phoneKey = String(lead.phone || '').replace(/\D/g, '').slice(-10);
          const nameKey = String(lead.name || '').toLowerCase();
          const items = [
            ...calls
              .filter(item => String(item.phone || '').replace(/\D/g, '').slice(-10) === phoneKey || String(item.student_name || '').toLowerCase() === nameKey)
              .map(item => ({
                type: 'call',
                date: item.created_at,
                msg: item.summary || `Call ${item.status || 'logged'}`,
                meta: `${item.direction || 'outbound'} via ${item.provider || 'IVR'}`
              })),
            ...inbox
              .filter(item => String(item.student_name || '').toLowerCase() === nameKey)
              .map(item => ({
                type: item.channel || 'email',
                date: item.created_at,
                msg: item.message || item.subject || 'Message logged',
                meta: `${item.channel || 'message'} - ${item.status || 'open'}`
              }))
          ].sort((a, b) => new Date(b.date) - new Date(a.date));

          if (!items.length) {
            list.innerHTML = `<div style="padding:1.5rem;text-align:center;color:var(--color-text-muted);background:var(--color-bg-alt);border-radius:8px;">${fallbackCommsText}</div>`;
            return;
          }

          list.innerHTML = items.map(item => `
            <div class="comm-log-item">
              <div class="comm-icon ${item.type}"><i data-lucide="${item.type === 'call' ? 'phone' : item.type === 'whatsapp' ? 'message-square' : 'mail'}"></i></div>
              <div class="comm-body">
                <div class="comm-msg">${escapeHtml(item.msg)}</div>
                <div class="comm-meta">${new Date(item.date).toLocaleString('en-IN')} - ${escapeHtml(item.meta)}</div>
              </div>
            </div>
          `).join('');
          window.renderIcons();
        } catch (err) {
          list.innerHTML = `<div class="table-loading error-state">Failed to load communication: ${err.message}</div>`;
        }
      };

      const renderTasks = async () => {
        const list = body.querySelector('#lead-tasks-list');
        if (!list) return;
        list.innerHTML = '<div class="table-loading"><div class="spinner"></div> Loading tasks...</div>';
        try {
          const tasks = await fetchTasks({ lead_id: lead.id });
          if (!tasks.length) {
            list.innerHTML = '<div style="padding:1.5rem;text-align:center;color:var(--color-text-muted);background:var(--color-bg-alt);border-radius:8px;">No follow-up tasks yet.</div>';
            return;
          }
          list.innerHTML = tasks.map(task => {
            const due = new Date(task.due_date);
            const isOverdue = task.status === 'pending' && due < new Date();                  return `
              <div class="comm-log-item" style="${isOverdue ? 'border-color:rgba(239,68,68,0.3);background:rgba(239,68,68,0.05);' : ''}">
                <div class="comm-icon ${task.type || 'call'}"><i data-lucide="${task.type === 'email' ? 'mail' : task.type === 'meeting' || task.type === 'visit' ? 'calendar' : task.type === 'whatsapp' ? 'message-square' : 'phone'}"></i></div>
                <div class="comm-body">
                  <div class="comm-msg" style="display:flex;justify-content:space-between;gap:1rem;">
                    <span>${task.title}</span>
                    <span class="stage-badge" style="background:${task.status === 'completed' ? 'rgba(16,185,129,0.12)' : isOverdue ? 'rgba(239,68,68,0.12)' : 'rgba(99,102,241,0.12)'};color:${task.status === 'completed' ? '#34d399' : isOverdue ? '#f87171' : '#a78bfa'};">${isOverdue ? 'overdue' : task.status}</span>
                  </div>
                  <div class="comm-meta">${due.toLocaleString('en-IN')} ${task.notes ? ' • ' + task.notes : ''}</div>
                  ${task.status !== 'completed' ? `<button class="btn btn-secondary btn-sm mark-task-done" data-id="${task.id}" style="margin-top:8px;">Mark Done</button>` : ''}
                </div>
              </div>
            `;
          }).join('');
          window.renderIcons();
          list.querySelectorAll('.mark-task-done').forEach(btn => {
            btn.onclick = async () => {
              btn.disabled = true;
              await updateTask(btn.dataset.id, { status: 'completed' });
              await renderTasks();
            };
          });
        } catch (err) {
          list.innerHTML = `<div class="table-loading error-state">Failed to load tasks: ${err.message}</div>`;
        }
      };

      body.querySelectorAll('.tab-btn').forEach(btn => {
        btn.onclick = async () => {
          body.querySelectorAll('.tab-btn, .tab-pane').forEach(el => el.classList.remove('active'));
          btn.classList.add('active');
          body.querySelector('#pane-' + btn.dataset.tab).classList.add('active');

          if (btn.dataset.tab === 'tasks') {
            await renderTasks();
          }

          if (btn.dataset.tab === 'comm') {
            await renderCommunications();
          }
          
          if (btn.dataset.tab === 'ai') {
            const loading = body.querySelector('#ai-analysis-loading');
            const content = body.querySelector('#ai-analysis-content');
            if (loading && loading.style.display !== 'none') {
              try {
                const prompt = `Analyze this student lead for RBMI Admission:
                Name: ${lead.name}
                Stage: ${lead.stage}
                Course: ${lead.course_name}
                Source: ${lead.source}
                Communication History: Recent communication logs are available in the Communication tab.
                
                Provide:
                1. Conversion Probability (0-100%)
                2. Intent Level (Low/Medium/High/Extreme)
                3. 3 Key Insights
                4. Recommended Next Action
                Format as JSON: {"probability": number, "intent": string, "insights": [string], "recommendation": string}`;

                const res = await chatWithAI([{ role: 'user', content: prompt }]);
                let data = { probability: 45, intent: 'Medium', insights: ['Showing interest in Finance', 'Active on WhatsApp', 'Pending fee discussion'], recommendation: 'Schedule a campus visit' };
                try {
                  const jsonStr = res.message.match(/\{.*\}/s)?.[0];
                  if (jsonStr) data = JSON.parse(jsonStr);
                } catch (e) { console.warn('AI JSON parse failed', e); }

                body.querySelector('#ai-prob-val').innerText = data.probability + '%';
                body.querySelector('#ai-intent-val').innerText = data.intent;
                body.querySelector('#ai-insights-list').innerHTML = data.insights.map(i => `<p>• ${i}</p>`).join('');
                body.querySelector('#ai-recommendation').innerText = data.recommendation;
                
                loading.style.display = 'none';
                content.style.display = 'block';
              } catch (err) {
                loading.innerHTML = `<p style="color:var(--color-danger)">AI Analysis failed: ${err.message}</p>`;
              }
            }
          }
        };
      });

      body.querySelector('#add-task-btn').onclick = () => {
        const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 16);
        body.querySelector('#task-title').value = `Call ${lead.name}`;
        body.querySelector('#task-due').value = tomorrow;
        body.querySelector('#task-notes').value = '';
        body.querySelector('#task-inline-form').style.display = 'block';
      };

      body.querySelector('#cancel-task-btn').onclick = () => {
        body.querySelector('#task-inline-form').style.display = 'none';
      };

      body.querySelector('#save-task-btn').onclick = async () => {
        const btn = body.querySelector('#save-task-btn');
        btn.disabled = true;
        try {
          await createTask({
            lead_id: lead.id,
            title: body.querySelector('#task-title').value,
            type: body.querySelector('#task-type').value,
            due_date: body.querySelector('#task-due').value,
            notes: body.querySelector('#task-notes').value
          });
          body.querySelector('#task-inline-form').style.display = 'none';
          await renderTasks();
        } finally {
          btn.disabled = false;
        }
      };

      body.querySelector('#s360-call-btn').onclick = async () => {
        const btn = body.querySelector('#s360-call-btn');
        btn.disabled = true;
        try {
          await createCallLog({
            student_name: lead.name,
            phone: lead.phone,
            direction: 'outbound',
            provider: 'Manual call',
            duration_seconds: 0,
            summary: `Call initiated for ${lead.course_name || 'admission enquiry'}.`,
            status: 'initiated'
          });
          await createTask({
            lead_id: lead.id,
            title: `Log call outcome for ${lead.name}`,
            type: 'call',
            due_date: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
            notes: 'Capture call result, objections, and next step.'
          });
          await renderCommunications();
          alert('Call logged and outcome task created.');
        } finally {
          btn.disabled = false;
        }
      };

      body.querySelector('#s360-whatsapp-btn').onclick = async () => {
        const message = prompt('WhatsApp message', `Hi ${lead.name}, this is RBMI Admissions. I wanted to help you with your ${lead.course_name || 'program'} admission process.`);
        if (!message) return;
        const btn = body.querySelector('#s360-whatsapp-btn');
        btn.disabled = true;
        try {
          await createStudentInboxMessage({
            student_name: lead.name,
            channel: 'whatsapp',
            subject: 'Counselor follow-up',
            message,
            status: 'open',
            priority: lead.priority || 'medium'
          });
          await createTask({
            lead_id: lead.id,
            title: `Check WhatsApp response from ${lead.name}`,
            type: 'whatsapp',
            due_date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            notes: 'Follow up if the student has not replied.'
          });
          await renderCommunications();
          alert('WhatsApp follow-up logged.');
        } finally {
          btn.disabled = false;
        }
      };

      // Draft Follow-up logic
      body.querySelector('#ai-draft-followup').onclick = async () => {
        const container = body.querySelector('#ai-followup-container');
        const textarea = body.querySelector('#ai-followup-text');
        const btn = body.querySelector('#ai-draft-followup');
        
        container.style.display = 'block';
        textarea.value = 'Drafting message...';
        btn.disabled = true;

        try {
          const prompt = `Draft a personalized WhatsApp follow-up message for ${lead.name} who is at "${lead.stage}" stage for ${lead.course_name}. 
          Mention that I noticed their progress and offer to help with any questions. Keep it friendly and professional. 
          Use placeholders like [My Name] for the counselor.`;
          
          const res = await chatWithAI([{ role: 'user', content: prompt }]);
          textarea.value = res.message;
        } catch (err) {
          textarea.value = 'Error drafting: ' + err.message;
        } finally {
          btn.disabled = false;
        }
      };

      body.querySelector('#close-ai-draft').onclick = () => {
        body.querySelector('#ai-followup-container').style.display = 'none';
      };

      body.querySelector('#copy-ai-draft').onclick = () => {
        const text = body.querySelector('#ai-followup-text').value;
        navigator.clipboard.writeText(text);
        const btn = body.querySelector('#copy-ai-draft');
        const oldText = btn.innerText;
        btn.innerText = 'Copied!';
        setTimeout(() => btn.innerText = oldText, 2000);
      };
    }
  });
}

function showStageChangeModal(lead, container) {
  const currentStage = getStageInfo(lead.stage);
  openModal(`Change Stage — ${lead.name}`, `
    <div class="form-group">
      <label class="form-label">Current Stage</label>
      <div class="stage-badge" style="background:${currentStage.bg};color:${currentStage.color};display:inline-flex">${currentStage.label}</div>
    </div>
    <div class="form-group" style="margin-top:1rem;">
      <label class="form-label">New Stage</label>
      <select class="form-select" id="new-stage-select">
        ${STAGES.map(s => `<option value="${s.id}" ${s.id===lead.stage?'selected':''}>${s.label}</option>`).join('')}
      </select>
    </div>
  `, {
    submitLabel: 'Update Stage',
    onSubmit: async (body) => {
      const newStage = body.querySelector('#new-stage-select').value;
      await updateLead(lead.id, { stage: newStage });
      loadLeads(container);
    }
  });
}

async function showAddLeadModal(container) {
  // Load counselors and courses
  if (counselorsCache.length === 0) counselorsCache = await fetchCounselors();
  if (coursesCache.length === 0) coursesCache = await fetchCourses();

  openModal('Add New Lead', `
    <div class="form-grid">
      <div class="form-group">
        <label class="form-label">First Name *</label>
        <input type="text" class="form-input" id="lead-fname" placeholder="Enter first name" />
      </div>
      <div class="form-group">
        <label class="form-label">Last Name *</label>
        <input type="text" class="form-input" id="lead-lname" placeholder="Enter last name" />
      </div>
      <div class="form-group">
        <label class="form-label">Email *</label>
        <input type="email" class="form-input" id="lead-email" placeholder="email@example.com" />
      </div>
      <div class="form-group">
        <label class="form-label">Phone</label>
        <input type="text" class="form-input" id="lead-phone" placeholder="+91 XXXXX XXXXX" />
      </div>
      <div class="form-group">
        <label class="form-label">Course Interest</label>
        <select class="form-select" id="lead-course">
          ${coursesCache.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Source</label>
        <select class="form-select" id="lead-source">
          ${SOURCES.map(s => `<option value="${s}">${s}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Assign Counselor</label>
        <select class="form-select" id="lead-counselor">
          ${counselorsCache.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Priority</label>
        <select class="form-select" id="lead-priority">
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="low">Low</option>
        </select>
      </div>
      <div class="form-group form-full">
        <label class="form-label">Notes</label>
        <textarea class="form-textarea" id="lead-notes" rows="3" placeholder="Add any notes..."></textarea>
      </div>
    </div>
  `, {
    width: '680px',
    submitLabel: 'Add Lead',
    onSubmit: async (body) => {
      const fname = body.querySelector('#lead-fname').value;
      const lname = body.querySelector('#lead-lname').value;
      if (!fname || !lname) return;

      // Duplicate check by phone
      const phone = body.querySelector('#lead-phone').value.trim();
      let allowDuplicate = false;
      if (phone) {
        try {
          const existing = await fetchLeads({ search: phone, limit: 1 });
          if (existing.total > 0) {
            const dup = existing.data[0];
            if (!confirm(`⚠ A lead with this phone already exists: "${dup.name}" (${dup.stage}). Add anyway?`)) return false;
            allowDuplicate = true;
          }
        } catch (e) { /* ignore duplicate check errors */ }
      }

      try {
        await createLead({
          first_name: fname,
          last_name: lname,
          email: body.querySelector('#lead-email').value,
          phone,
          course_id: body.querySelector('#lead-course').value,
          source: body.querySelector('#lead-source').value,
          counselor_id: body.querySelector('#lead-counselor').value,
          priority: body.querySelector('#lead-priority').value,
          notes: body.querySelector('#lead-notes').value,
          allow_duplicate: allowDuplicate
        });
      } catch (err) {
        if (err.message.includes('Duplicate lead found')) {
          alert('Duplicate lead found. Search the student by phone/email and update the existing record instead, or confirm Add anyway from the phone duplicate warning.');
          return false;
        }
        throw err;
      }

      currentPage = 1;
      loadLeads(container);
    }
  });
}

export async function renderLeads(container) {
  currentFilters = { stage: '', source: '', counselor_id: '', search: '' };
  currentSort = { field: 'created_at', order: 'desc' };
  currentPage = 1;

  // Load counselors for filter dropdown
  if (counselorsCache.length === 0) {
    try { counselorsCache = await fetchCounselors(); } catch(e) { counselorsCache = []; }
  }

  container.innerHTML = `
    <div class="leads-page">
      <div class="page-header">
        <div>
          <h1 class="page-title">Leads</h1>
          <p class="page-subtitle">Manage and track student enquiries.</p>
        </div>
        <div class="header-actions">
          <a href="/register.html" target="_blank" class="btn btn-secondary" style="display:flex;align-items:center;gap:6px;text-decoration:none;">
            🔗 Registration Page
          </a>
          <button class="btn btn-secondary" id="export-leads-btn" style="display:flex;align-items:center;gap:6px;">
            ⬇ Export CSV
          </button>
          <button class="btn btn-primary" id="add-lead-btn" style="display:flex;align-items:center;gap:6px;">
            + Add New Lead
          </button>
        </div>
      </div>

      <div class="filters-bar animate-fade-in">
        <div class="filter-group">
          <div class="search-filter">
            <input type="text" placeholder="Search by name, email, phone..." class="filter-search" id="filter-search" style="padding-left:12px;" />
          </div>
        </div>
        <div class="filter-group">
          <select class="filter-select" id="filter-stage">
            <option value="">All Stages</option>
            ${STAGES.map(s => `<option value="${s.id}">${s.label}</option>`).join('')}
          </select>
          <select class="filter-select" id="filter-source">
            <option value="">All Sources</option>
            ${SOURCES.map(s => `<option value="${s}">${s}</option>`).join('')}
          </select>
          <select class="filter-select" id="filter-counselor">
            <option value="">All Counselors</option>
            ${counselorsCache.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}
          </select>
        </div>
      </div>

      <div class="table-card animate-fade-in" id="leads-table-wrap"></div>
    </div>
  `;

  window.renderIcons();

  loadLeads(container);

  // Filters
  container.querySelector('#filter-search')?.addEventListener('input', debounce((e) => {
    currentFilters.search = e.target.value;
    currentPage = 1;
    loadLeads(container);
  }, 300));

  container.querySelector('#filter-stage')?.addEventListener('change', (e) => {
    currentFilters.stage = e.target.value;
    currentPage = 1;
    loadLeads(container);
  });

  container.querySelector('#filter-source')?.addEventListener('change', (e) => {
    currentFilters.source = e.target.value;
    currentPage = 1;
    loadLeads(container);
  });

  container.querySelector('#filter-counselor')?.addEventListener('change', (e) => {
    currentFilters.counselor_id = e.target.value;
    currentPage = 1;
    loadLeads(container);
  });

  container.querySelector('#add-lead-btn')?.addEventListener('click', () => showAddLeadModal(container));
  container.querySelector('#export-leads-btn')?.addEventListener('click', () => exportLeadsCSV());
}
