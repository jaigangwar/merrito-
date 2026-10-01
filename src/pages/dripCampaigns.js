// ===== DRIP CAMPAIGNS PAGE — Visual Automation Sequence Builder =====
import { openModal } from '../components/modal.js';
import { getToken } from '../lib/auth.js';
import { API_BASE, request } from '../lib/api.js';

function escapeHtml(v) {
  return String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function fmtDate(v) {
  if (!v) return '-';
  return new Date(v).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function pretty(v) {
  return String(v || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

async function apiFetch(path, opts = {}) {
  return request(`/drip-campaigns${path}`, opts);
}

function openDripEditor(existing, onSave) {
  const c = existing || { name: '', channel: 'email', trigger: 'lead_created', delay_unit: 'days', steps: [], audience: '', audience_count: 0, status: 'draft', notes: '' };

  function renderStepsEditor(steps) {
    if (!steps || steps.length === 0) {
      return `<div id="dd-steps-empty" style="text-align:center;padding:20px;color:var(--color-text-muted);border:2px dashed var(--color-border);border-radius:8px;">
        <p style="font-size:13px;">No automation steps yet. Click "Add Step" to build your sequence.</p>
      </div>`;
    }
    return steps.map((step, i) => `
      <div class="dd-step-card" style="border:1px solid var(--color-border);border-radius:8px;padding:14px;background:var(--color-bg-card);position:relative;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <span style="font-weight:700;font-size:13px;background:var(--color-primary);color:#fff;padding:2px 10px;border-radius:20px;">Step ${i + 1}</span>
          <button class="dd-step-remove" data-idx="${i}" style="background:transparent;border:none;color:#ef4444;cursor:pointer;font-size:11px;font-weight:600;">Remove</button>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
          <div><label style="font-size:10px;font-weight:600;color:var(--color-text-muted);display:block;margin-bottom:2px;">Delay</label>
            <input type="number" class="form-input dd-step-delay" data-idx="${i}" value="${step.delay_value}" style="padding:6px 8px;font-size:12px;" min="0" /></div>
          <div><label style="font-size:10px;font-weight:600;color:var(--color-text-muted);display:block;margin-bottom:2px;">Title</label>
            <input type="text" class="form-input dd-step-title" data-idx="${i}" value="${escapeHtml(step.title)}" style="padding:6px 8px;font-size:12px;" /></div>
          <div><label style="font-size:10px;font-weight:600;color:var(--color-text-muted);display:block;margin-bottom:2px;">Channel</label>
            <select class="form-input dd-step-channel" data-idx="${i}" style="padding:6px 8px;font-size:12px;">
              <option value="email" ${step.channel === 'email' ? 'selected' : ''}>Email</option>
              <option value="sms" ${step.channel === 'sms' ? 'selected' : ''}>SMS</option>
              <option value="whatsapp" ${step.channel === 'whatsapp' ? 'selected' : ''}>WhatsApp</option>
            </select></div>
          <div><label style="font-size:10px;font-weight:600;color:var(--color-text-muted);display:block;margin-bottom:2px;">Action</label>
            <select class="form-input dd-step-action" data-idx="${i}" style="padding:6px 8px;font-size:12px;">
              <option value="send_message" ${step.action === 'send_message' ? 'selected' : ''}>Send Message</option>
              <option value="update_stage" ${step.action === 'update_stage' ? 'selected' : ''}>Update Stage</option>
              <option value="assign_counselor" ${step.action === 'assign_counselor' ? 'selected' : ''}>Assign Counselor</option>
            </select></div>
        </div>
        <div style="margin-top:8px;">
          <textarea class="form-input dd-step-content" data-idx="${i}" rows="2" style="padding:6px 8px;font-size:12px;" placeholder="Message content / template...">${escapeHtml(step.content)}</textarea>
        </div>
        ${i < steps.length - 1 ? `<div style="text-align:center;margin:4px 0;color:var(--color-text-muted);font-size:10px;">▼ ${c.delay_unit || 'days'} delay ▼</div>` : ''}
      </div>
    `).join('');
  }

  function collectSteps(body) {
    const cards = body.querySelectorAll('.dd-step-card');
    const steps = [];
    cards.forEach(card => {
      const idx = card.querySelector('.dd-step-remove')?.dataset?.idx;
      if (idx === undefined) return;
      steps.push({
        step_order: steps.length + 1,
        delay_value: parseInt(card.querySelector(`.dd-step-delay[data-idx="${idx}"]`)?.value || '0'),
        title: card.querySelector(`.dd-step-title[data-idx="${idx}"]`)?.value || 'Untitled',
        channel: card.querySelector(`.dd-step-channel[data-idx="${idx}"]`)?.value || 'email',
        action: card.querySelector(`.dd-step-action[data-idx="${idx}"]`)?.value || 'send_message',
        content: card.querySelector(`.dd-step-content[data-idx="${idx}"]`)?.value || ''
      });
    });
    return steps;
  }

  openModal(existing ? 'Edit Drip Campaign' : 'New Drip Campaign', `
    <style>
      .dd-form { display: flex; flex-direction: column; gap: 12px; }
      .dd-form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
      .dd-steps-container { display: flex; flex-direction: column; gap: 8px; margin-top: 4px; }
      .dd-step-card { animation: fadeSlideUp 0.2s ease-out; }
      @keyframes fadeSlideUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
      .dd-add-step-btn { border: 2px dashed var(--color-border); padding: 10px; border-radius: 8px; background: transparent; cursor: pointer; color: var(--color-primary); font-weight: 600; font-size: 12px; transition: all 0.15s; }
      .dd-add-step-btn:hover { border-color: var(--color-primary); background: var(--color-bg-page); }
    </style>
    <div class="dd-form">
      <div class="dd-form-row">
        <div class="form-group"><label class="form-label">Campaign Name</label><input id="dd-name" class="form-input" value="${escapeHtml(c.name)}" placeholder="MBA Welcome Sequence" /></div>
        <div class="form-group"><label class="form-label">Channel</label>
          <select id="dd-channel" class="form-input">
            <option value="email" ${c.channel === 'email' ? 'selected' : ''}>Email</option>
            <option value="sms" ${c.channel === 'sms' ? 'selected' : ''}>SMS</option>
            <option value="whatsapp" ${c.channel === 'whatsapp' ? 'selected' : ''}>WhatsApp</option>
          </select>
        </div>
      </div>
      <div class="dd-form-row">
        <div class="form-group"><label class="form-label">Trigger Event</label>
          <select id="dd-trigger" class="form-input">
            <option value="lead_created" ${c.trigger === 'lead_created' ? 'selected' : ''}>Lead Created</option>
            <option value="stage_changed" ${c.trigger === 'stage_changed' ? 'selected' : ''}>Stage Changed</option>
            <option value="date_specific" ${c.trigger === 'date_specific' ? 'selected' : ''}>Specific Date</option>
            <option value="event" ${c.trigger === 'event' ? 'selected' : ''}>Custom Event</option>
          </select>
        </div>
        <div class="form-group"><label class="form-label">Delay Unit</label>
          <select id="dd-delay-unit" class="form-input">
            <option value="hours" ${c.delay_unit === 'hours' ? 'selected' : ''}>Hours</option>
            <option value="days" ${c.delay_unit === 'days' ? 'selected' : ''}>Days</option>
            <option value="weeks" ${c.delay_unit === 'weeks' ? 'selected' : ''}>Weeks</option>
          </select>
        </div>
      </div>
      <div class="dd-form-row">
        <div class="form-group"><label class="form-label">Audience</label><input id="dd-audience" class="form-input" value="${escapeHtml(c.audience)}" placeholder="All active leads" /></div>
        <div class="form-group"><label class="form-label">Audience Count</label><input id="dd-audience-count" class="form-input" type="number" value="${c.audience_count}" min="0" /></div>
      </div>
      <div class="form-group"><label class="form-label">Status</label>
        <select id="dd-status" class="form-input">
          <option value="draft" ${c.status === 'draft' ? 'selected' : ''}>Draft</option>
          <option value="active" ${c.status === 'active' ? 'selected' : ''}>Active</option>
          <option value="paused" ${c.status === 'paused' ? 'selected' : ''}>Paused</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Notes</label>
        <textarea id="dd-notes" class="form-input" rows="2" placeholder="Internal notes...">${escapeHtml(c.notes)}</textarea>
      </div>

      <div style="border-top:1px solid var(--color-border);padding-top:12px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
          <span style="font-weight:700;font-size:14px;">🔄 Automation Steps</span>
        </div>
        <div class="dd-steps-container" id="dd-steps-container">
          ${renderStepsEditor(c.steps)}
        </div>
        <button class="dd-add-step-btn" id="dd-add-step" style="width:100%;margin-top:8px;">+ Add Step</button>
      </div>
    </div>
  `, {
    submitLabel: existing ? 'Save Campaign' : 'Create Campaign',
    width: '680px',
    onOpen: (body) => {
      body.querySelector('#dd-add-step')?.addEventListener('click', () => {
        const container = body.querySelector('#dd-steps-container');
        const steps = collectSteps(body);
        const newStep = { step_order: steps.length + 1, delay_value: 1, title: 'New Step', channel: body.querySelector('#dd-channel')?.value || 'email', action: 'send_message', content: '' };
        steps.push(newStep);
        container.innerHTML = renderStepsEditor(steps);
        // Re-bind remove buttons
        body.querySelectorAll('.dd-step-remove').forEach(btn => {
          btn.addEventListener('click', () => {
            const idx = parseInt(btn.dataset.idx);
            const updated = collectSteps(body).filter((_, i) => i !== idx);
            container.innerHTML = renderStepsEditor(updated);
          });
        });
      });

      body.querySelectorAll('.dd-step-remove').forEach(btn => {
        btn.addEventListener('click', () => {
          const container = body.querySelector('#dd-steps-container');
          const updated = collectSteps(body).filter((_, i) => i !== parseInt(btn.dataset.idx));
          container.innerHTML = renderStepsEditor(updated);
        });
      });
    },
    onSubmit: async (body) => {
      const name = body.querySelector('#dd-name').value.trim();
      if (!name) { alert('Campaign name is required'); return false; }
      const steps = collectSteps(body);
      const payload = {
        name,
        channel: body.querySelector('#dd-channel').value,
        trigger: body.querySelector('#dd-trigger').value,
        delay_unit: body.querySelector('#dd-delay-unit').value,
        steps,
        audience: body.querySelector('#dd-audience').value.trim(),
        audience_count: parseInt(body.querySelector('#dd-audience-count').value || '0'),
        status: body.querySelector('#dd-status').value,
        notes: body.querySelector('#dd-notes').value.trim()
      };
      try {
        if (existing) await apiFetch(`/${existing.id}`, { method: 'PUT', body: JSON.stringify(payload) });
        else await apiFetch('/', { method: 'POST', body: JSON.stringify(payload) });
        onSave();
      } catch (err) {
        alert('Failed to save campaign: ' + err.message);
        return false;
      }
    }
  });
}

export async function renderDripCampaigns(el) {
  el.innerHTML = `<div class="table-loading"><div class="spinner"></div><span>Loading drip campaigns...</span></div>`;

  try {
    const [campaigns, report, templates, logs] = await Promise.all([
      apiFetch('/'),
      apiFetch('/report'),
      apiFetch('/templates'),
      apiFetch('/logs')
    ]);

    el.innerHTML = `
      <style>
        .dc-shell { display: flex; flex-direction: column; gap: 20px; }
        .dc-header { display: flex; justify-content: space-between; align-items: center; }
        .dc-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
        .dc-stat-card { padding: 16px; border-radius: 10px; border: 1px solid var(--color-border); background: var(--color-bg-card); }
        .dc-stat-card strong { font-size: 24px; font-weight: 800; color: var(--color-text); display: block; }
        .dc-stat-card span { font-size: 12px; color: var(--color-text-muted); }

        .dc-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        @media (max-width: 900px) { .dc-grid { grid-template-columns: 1fr; } .dc-stats { grid-template-columns: repeat(2, 1fr); } }

        .dc-campaign-card { border: 1px solid var(--color-border); border-radius: 10px; padding: 16px; background: var(--color-bg-card); transition: all 0.2s; }
        .dc-campaign-card:hover { border-color: var(--color-primary-light); box-shadow: var(--shadow-sm); }
        .dc-campaign-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; }
        .dc-campaign-header h3 { font-size: 15px; font-weight: 700; margin: 0; }
        .dc-campaign-meta { font-size: 11px; color: var(--color-text-muted); margin: 4px 0; }
        .dc-steps-preview { display: flex; align-items: center; gap: 4px; margin: 8px 0; flex-wrap: wrap; }
        .dc-step-chip { font-size: 10px; font-weight: 600; padding: 3px 8px; border-radius: 20px; background: var(--color-bg-page); border: 1px solid var(--color-border); }
        .dc-arrow { color: var(--color-text-muted); font-size: 12px; }
        .dc-actions { display: flex; gap: 6px; margin-top: 10px; }

        .dc-logs { margin-top: 16px; }
        .dc-log-item { padding: 10px; border-bottom: 1px solid var(--color-border); font-size: 12px; display: flex; justify-content: space-between; align-items: center; }
      </style>

      <div class="dc-shell">
        <div class="dc-header">
          <div>
            <span class="eyebrow">Marketing Automation</span>
            <h1 style="margin:4px 0 0;">Drip Campaign Builder</h1>
            <p style="color:var(--color-text-muted);font-size:13px;margin-top:4px;">Create visual automation sequences — trigger-based email, SMS, and WhatsApp campaigns.</p>
          </div>
          <button class="btn btn-primary" id="dc-new-btn">+ New Campaign</button>
        </div>

        <div class="dc-stats">
          <div class="dc-stat-card"><strong>${report.total_campaigns || 0}</strong><span>Total Campaigns</span></div>
          <div class="dc-stat-card"><strong>${report.active_campaigns || 0}</strong><span>Active</span></div>
          <div class="dc-stat-card"><strong>${report.total_triggers || 0}</strong><span>Times Triggered</span></div>
          <div class="dc-stat-card"><strong>${report.total_audience || 0}</strong><span>Total Audience</span></div>
        </div>

        ${campaigns.length === 0 ? `
          <div style="text-align:center;padding:40px;color:var(--color-text-muted);background:var(--color-bg-card);border-radius:12px;border:1px solid var(--color-border);">
            <p style="font-size:16px;font-weight:600;">No drip campaigns yet</p>
            <p style="font-size:13px;margin-top:4px;">Create your first automated sequence to nurture leads on autopilot.</p>
            <button class="btn btn-primary" id="dc-empty-btn" style="margin-top:16px;">+ Create Campaign</button>
          </div>
        ` : `
          <div class="dc-grid">
            ${campaigns.map(c => {
              const stepLabels = (c.steps || []).map((s, i) => {
                const icon = s.channel === 'email' ? '📧' : s.channel === 'sms' ? '📱' : '💬';
                return `<span class="dc-step-chip">${icon} ${s.delay_value} ${c.delay_unit || 'days'}</span>`;
              }).join('<span class="dc-arrow"> → </span>');

              const statusBadge = c.status === 'active' ? 'ok' : c.status === 'paused' ? 'warn' : 'info';

              return `
                <div class="dc-campaign-card">
                  <div class="dc-campaign-header">
                    <div>
                      <h3>${escapeHtml(c.name)}</h3>
                      <div class="dc-campaign-meta">
                        ${c.channel.toUpperCase()} · Trigger: ${pretty(c.trigger)} · ${pretty(c.status)}
                      </div>
                    </div>
                    <span class="ops-badge ${statusBadge}">${c.status}</span>
                  </div>
                  <div class="dc-campaign-meta">Audience: ${escapeHtml(c.audience || 'All')} (${c.audience_count || 0})</div>
                  <div class="dc-steps-preview">
                    ${(c.steps || []).length > 0 ? stepLabels : '<span style="font-size:11px;color:var(--color-text-muted);">No steps configured</span>'}
                  </div>
                  <div class="dc-actions">
                    <button class="btn btn-secondary btn-sm dc-edit-btn" data-id="${c.id}">Edit</button>
                    <button class="btn btn-secondary btn-sm dc-toggle-btn" data-id="${c.id}" data-status="${c.status}">
                      ${c.status === 'active' ? 'Pause' : c.status === 'paused' ? 'Activate' : 'Activate'}
                    </button>
                    <button class="btn btn-secondary btn-sm dc-simulate-btn" data-id="${c.id}">▶ Simulate</button>
                    <button class="btn btn-secondary btn-sm dc-delete-btn" data-id="${c.id}" style="color:#ef4444;">Delete</button>
                  </div>
                  <div style="font-size:10px;color:var(--color-text-muted);margin-top:8px;">
                    Metrics: ${c.metrics?.triggered || 0} triggered · ${c.metrics?.delivered || 0} delivered · ${c.metrics?.converted || 0} converted
                  </div>
                  <div style="font-size:10px;color:var(--color-text-muted);margin-top:2px;">Created: ${fmtDate(c.created_at)}</div>
                </div>
              `;
            }).join('')}
          </div>
        `}

        <!-- Execution Logs -->
        ${logs.length > 0 ? `
          <section style="margin-top:16px;">
            <h2 style="font-size:16px;font-weight:700;margin-bottom:12px;">Recent Executions</h2>
            <div style="border:1px solid var(--color-border);border-radius:10px;overflow:hidden;">
              ${logs.slice(0, 10).map(log => `
                <div class="dc-log-item">
                  <div>
                    <strong>${escapeHtml(log.campaign_name)}</strong>
                    <span style="color:var(--color-text-muted);margin-left:8px;">${log.results?.length || 0} steps triggered</span>
                  </div>
                  <span style="font-size:11px;color:var(--color-text-muted);">${fmtDate(log.executed_at)}</span>
                </div>
              `).join('')}
            </div>
          </section>
        ` : ''}
      </div>
    `;

    const refresh = () => renderDripCampaigns(el);

    el.querySelector('#dc-new-btn')?.addEventListener('click', () => openDripEditor(null, refresh));
    el.querySelector('#dc-empty-btn')?.addEventListener('click', () => openDripEditor(null, refresh));

    el.querySelectorAll('.dc-edit-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const c = campaigns.find(c => c.id === btn.dataset.id);
        if (c) openDripEditor(c, refresh);
      });
    });

    el.querySelectorAll('.dc-toggle-btn').forEach(async btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const currentStatus = btn.dataset.status;
        const newStatus = currentStatus === 'active' ? 'paused' : currentStatus === 'paused' ? 'active' : 'active';
        try {
          await apiFetch(`/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status: newStatus }) });
          refresh();
        } catch (err) {
          alert('Failed to update status: ' + err.message);
        }
      });
    });

    el.querySelectorAll('.dc-simulate-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        btn.textContent = 'Running...';
        try {
          const result = await apiFetch(`/${btn.dataset.id}/simulate`, { method: 'POST' });
          openModal('Simulation Complete', `
            <div style="display:flex;flex-direction:column;gap:8px;">
              <p><strong>Campaign:</strong> ${escapeHtml(result.campaign)}</p>
              <p><strong>Steps Triggered:</strong> ${result.steps_triggered}</p>
              ${result.results.map(r => `<div style="padding:8px;border-radius:6px;background:var(--color-bg-page);font-size:12px;">${escapeHtml(r.message)}</div>`).join('')}
            </div>
          `, { showFooter: false, width: '500px' });
          refresh();
        } catch (err) {
          alert('Simulation failed: ' + err.message);
        }
        btn.disabled = false;
        btn.textContent = '▶ Simulate';
      });
    });

    el.querySelectorAll('.dc-delete-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Delete this campaign?')) return;
        try {
          await apiFetch(`/${btn.dataset.id}`, { method: 'DELETE' });
          refresh();
        } catch (err) {
          alert('Failed to delete: ' + err.message);
        }
      });
    });

    window.renderIcons?.();
  } catch (error) {
    el.innerHTML = `
      <div class="error-state">
        <h3>Failed to load drip campaigns</h3>
        <p>${escapeHtml(error.message)}</p>
        <button class="btn btn-primary" onclick="location.reload()">Retry</button>
      </div>
    `;
  }
}
