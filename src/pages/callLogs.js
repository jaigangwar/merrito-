// ===== CALL LOGS PAGE =====
import { fetchCallLogs, createCallLog, fetchLeads } from '../lib/api.js';
import { openModal } from '../components/modal.js';
import { getAvatarColor, formatDate } from '../components/utils.js';

function escapeHtml(v = '') {
  return String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));
}

function fmtDuration(secs = 0) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function directionBadge(dir) {
  const isIn = dir === 'inbound';
  const cls = isIn ? 'badge-inbound' : 'badge-outbound';
  return `<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;" class="${cls}">
    <i data-lucide="${isIn ? 'phone-incoming' : 'phone-outgoing'}" style="width:11px;height:11px;"></i> ${isIn ? 'Inbound' : 'Outbound'}
  </span>`;
}

function statusBadge(status) {
  const cls = `badge-${status || 'completed'}`;
  return `<span style="padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;" class="${cls}">${escapeHtml(status || 'completed')}</span>`;
}

export async function renderCallLogs(container) {
  container.innerHTML = `
    <div class="cl-shell">
      <div class="page-header">
        <div>
          <h1 class="page-title">Call Logs</h1>
          <p class="page-subtitle">Track all counselor calls, IVR logs, and manual call notes.</p>
        </div>
        <div class="header-actions">
          <button class="btn btn-primary" id="btn-log-call">
            <i data-lucide="phone-call" style="width:16px;height:16px;"></i> Log Call
          </button>
        </div>
      </div>

      <!-- KPI row -->
      <div id="call-kpis" class="cl-kpis">
        ${[1,2,3,4].map(() => `<div class="chart-card" style="padding:20px;"><div class="skeleton-block" style="height:48px;border-radius:8px;background:var(--color-bg);"></div></div>`).join('')}
      </div>

      <!-- Filters -->
      <div class="chart-card cl-filters">
        <input type="text" id="call-search" class="form-input" placeholder="Search student or phone..." style="max-width:240px;" />
        <select id="call-filter-dir" class="form-input" style="max-width:160px;">
          <option value="">All directions</option>
          <option value="outbound">Outbound</option>
          <option value="inbound">Inbound</option>
        </select>
        <select id="call-filter-status" class="form-input" style="max-width:160px;">
          <option value="">All statuses</option>
          <option value="completed">Completed</option>
          <option value="missed">Missed</option>
          <option value="busy">Busy</option>
        </select>
        <button class="btn btn-secondary btn-sm" id="btn-clear-filters">Clear</button>
      </div>

      <!-- Table -->
      <div class="chart-card" id="call-table-wrap">
        <div style="padding:40px;text-align:center;"><div class="spinner" style="margin:0 auto;"></div></div>
      </div>
    </div>
  `;

  window.renderIcons?.();

  let allLogs = [];

  async function loadLogs() {
    const wrap = container.querySelector('#call-table-wrap');
    wrap.innerHTML = `<div style="padding:40px;text-align:center;"><div class="spinner" style="margin:0 auto;"></div></div>`;
    try {
      allLogs = await fetchCallLogs();
      renderKPIs(allLogs);
      renderTable(allLogs);
    } catch (err) {
      wrap.innerHTML = `<div style="padding:32px;text-align:center;color:#dc2626;">Failed to load call logs: ${escapeHtml(err.message)}</div>`;
    }
  }

  function renderKPIs(logs) {
    const total = logs.length;
    const completed = logs.filter(l => l.status === 'completed').length;
    const missed = logs.filter(l => l.status === 'missed').length;
    const totalDuration = logs.reduce((sum, l) => sum + (l.duration_seconds || 0), 0);
    const avgDuration = total > 0 ? Math.round(totalDuration / total) : 0;

    const kpis = [
      { label: 'Total Calls', value: total, icon: 'phone', color: '#6366f1' },
      { label: 'Completed', value: completed, icon: 'phone-check', color: '#10b981' },
      { label: 'Missed', value: missed, icon: 'phone-missed', color: '#ef4444' },
      { label: 'Avg Duration', value: fmtDuration(avgDuration), icon: 'clock', color: '#f59e0b' }
    ];

    container.querySelector('#call-kpis').innerHTML = kpis.map(k => `
      <div class="cl-kpi-card">
        <div class="cl-kpi-icon-wrap" style="background:${k.color}20;">
          <i data-lucide="${k.icon}" style="width:22px;height:22px;color:${k.color};"></i>
        </div>
        <div>
          <div class="cl-kpi-val">${k.value}</div>
          <div class="cl-kpi-label">${k.label}</div>
        </div>
      </div>
    `).join('');
    window.renderIcons?.();
  }

  function getFiltered() {
    const search = container.querySelector('#call-search')?.value.toLowerCase() || '';
    const dir = container.querySelector('#call-filter-dir')?.value || '';
    const status = container.querySelector('#call-filter-status')?.value || '';
    return allLogs.filter(l => {
      const matchSearch = !search || (l.student_name || '').toLowerCase().includes(search) || (l.phone || '').includes(search) || (l.summary || '').toLowerCase().includes(search);
      const matchDir = !dir || l.direction === dir;
      const matchStatus = !status || l.status === status;
      return matchSearch && matchDir && matchStatus;
    });
  }

  function renderTable(logs) {
    const filtered = getFiltered();
    const wrap = container.querySelector('#call-table-wrap');

    if (!filtered.length) {
      wrap.innerHTML = `<div style="padding:48px;text-align:center;color:var(--color-text-muted);">
        <i data-lucide="phone-off" style="width:40px;height:40px;opacity:0.3;margin-bottom:12px;"></i>
        <p style="font-size:15px;">No call logs found.</p>
      </div>`;
      window.renderIcons?.();
      return;
    }

    wrap.innerHTML = `
      <div style="overflow-x:auto;">
        <table class="data-table">
          <thead>
            <tr>
              <th>Student</th>
              <th>Phone</th>
              <th>Direction</th>
              <th>Status</th>
              <th>Duration</th>
              <th>Provider</th>
              <th>Summary</th>
              <th>Date</th>
              <th>Recording</th>
            </tr>
          </thead>
          <tbody>
            ${filtered.map(log => {
              const initials = (log.student_name || 'S').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
              return `
              <tr>
                <td>
                  <div style="display:flex;align-items:center;gap:10px;">
                    <div class="cl-avatar-text" style="background:${getAvatarColor(log.student_name || '')};">${initials}</div>
                    <span style="font-weight:600;font-size:13px;">${escapeHtml(log.student_name)}</span>
                  </div>
                </td>
                <td style="font-size:13px;color:var(--color-text-secondary);">${escapeHtml(log.phone)}</td>
                <td>${directionBadge(log.direction)}</td>
                <td>${statusBadge(log.status)}</td>
                <td style="font-size:13px;font-weight:600;color:var(--color-text);">${fmtDuration(log.duration_seconds)}</td>
                <td style="font-size:12px;color:var(--color-text-muted);">${escapeHtml(log.provider || '—')}</td>
                <td style="font-size:12px;color:var(--color-text-secondary);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeHtml(log.summary)}">${escapeHtml(log.summary || '—')}</td>
                <td style="font-size:12px;color:var(--color-text-muted);white-space:nowrap;">${formatDate(log.created_at)}</td>
                <td>
                  ${log.recording_url
                    ? `<a href="${escapeHtml(log.recording_url)}" target="_blank" rel="noreferrer" class="cl-play-btn"><i data-lucide="play-circle" style="width:14px;height:14px;"></i> Play</a>`
                    : `<span style="font-size:12px;color:var(--color-border);">—</span>`
                  }
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
      <div style="padding:12px 20px;border-top:1px solid var(--color-border-light);font-size:13px;color:var(--color-text-muted);">
        Showing ${filtered.length} of ${logs.length} calls
      </div>
    `;
    window.renderIcons?.();
  }

  // Filter events
  container.querySelector('#call-search')?.addEventListener('input', () => renderTable(allLogs));
  container.querySelector('#call-filter-dir')?.addEventListener('change', () => renderTable(allLogs));
  container.querySelector('#call-filter-status')?.addEventListener('change', () => renderTable(allLogs));
  container.querySelector('#btn-clear-filters')?.addEventListener('click', () => {
    container.querySelector('#call-search').value = '';
    container.querySelector('#call-filter-dir').value = '';
    container.querySelector('#call-filter-status').value = '';
    renderTable(allLogs);
  });

  // Log call modal
  container.querySelector('#btn-log-call')?.addEventListener('click', async () => {
    let leads = [];
    try { leads = (await fetchLeads({ limit: 100 })).data || []; } catch {}

    openModal('Log a Call', `
      <div class="form-grid">
        <div class="form-group">
          <label class="form-label">Student Name *</label>
          ${leads.length
            ? `<select id="cl-student" class="form-input">
                <option value="">Select student...</option>
                ${leads.map(l => `<option value="${escapeHtml(l.name)}" data-phone="${escapeHtml(l.phone)}">${escapeHtml(l.name)} — ${escapeHtml(l.phone)}</option>`).join('')}
                <option value="__manual__">Enter manually...</option>
              </select>`
            : `<input id="cl-student-name" class="form-input" placeholder="Student name" />`
          }
        </div>
        <div class="form-group">
          <label class="form-label">Phone</label>
          <input id="cl-phone" class="form-input" placeholder="+91 98765 43210" />
        </div>
        <div class="form-group">
          <label class="form-label">Direction</label>
          <select id="cl-direction" class="form-input">
            <option value="outbound">Outbound (I called)</option>
            <option value="inbound">Inbound (They called)</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Status</label>
          <select id="cl-status" class="form-input">
            <option value="completed">Completed</option>
            <option value="missed">Missed</option>
            <option value="busy">Busy</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Duration (seconds)</label>
          <input id="cl-duration" class="form-input" type="number" min="0" placeholder="e.g. 180" />
        </div>
        <div class="form-group">
          <label class="form-label">Provider</label>
          <input id="cl-provider" class="form-input" placeholder="e.g. Exotel, Manual" value="Manual" />
        </div>
        <div class="form-group form-full">
          <label class="form-label">Call Summary / Notes</label>
          <textarea id="cl-summary" class="form-input" rows="3" placeholder="What was discussed? Any follow-up needed?"></textarea>
        </div>
      </div>
    `, {
      submitLabel: 'Save Call Log',
      onSubmit: async (body) => {
        const studentEl = body.querySelector('#cl-student');
        const studentName = studentEl
          ? (studentEl.value === '__manual__' ? '' : studentEl.value)
          : body.querySelector('#cl-student-name')?.value?.trim();
        const phone = body.querySelector('#cl-phone')?.value?.trim();

        // Auto-fill phone from lead selection
        if (studentEl && studentEl.value && studentEl.value !== '__manual__') {
          const opt = studentEl.options[studentEl.selectedIndex];
          if (!phone) body.querySelector('#cl-phone').value = opt.dataset.phone || '';
        }

        if (!studentName) {
          alert('Please select or enter a student name.');
          return false;
        }

        await createCallLog({
          student_name: studentName,
          phone: body.querySelector('#cl-phone')?.value?.trim() || '',
          direction: body.querySelector('#cl-direction')?.value || 'outbound',
          status: body.querySelector('#cl-status')?.value || 'completed',
          duration_seconds: parseInt(body.querySelector('#cl-duration')?.value || '0') || 0,
          provider: body.querySelector('#cl-provider')?.value?.trim() || 'Manual',
          summary: body.querySelector('#cl-summary')?.value?.trim() || ''
        });
        await loadLogs();
      }
    });

    // Auto-fill phone when student selected
    setTimeout(() => {
      document.querySelector('#cl-student')?.addEventListener('change', (e) => {
        const opt = e.target.options[e.target.selectedIndex];
        const phoneInput = document.querySelector('#cl-phone');
        if (phoneInput && opt.dataset.phone) phoneInput.value = opt.dataset.phone;
      });
    }, 100);
  });

  await loadLogs();
}
