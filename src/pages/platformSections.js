import { openModal } from '../components/modal.js';
import { fetchFormTemplates, createFormTemplate, fetchCampaigns, createCampaign, createUser, fetchTasks, createTask, updateTask, fetchCommunicationTemplates, createCommunicationTemplate, fetchCommunicationIntegrations, fetchLeads, fetchActivities, fetchMarketingOverview, fetchInboundLogs } from '../lib/api.js';
import { openAshaAI } from '../components/ashaAi.js';
import { getToken } from '../lib/auth.js';

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function statCards(items) {
  return `<div class="suite-stats">${items.map(item => `<div><span>${item.label}</span><strong>${item.value}</strong><small>${item.note}</small></div>`).join('')}</div>`;
}

function featureGrid(items) {
  return `<div class="suite-grid">${items.map(item => `<article class="suite-card"><div class="suite-card-icon">${item.icon}</div><div><span class="eyebrow">${item.kicker}</span><h3>${item.title}</h3><p>${item.copy}</p></div>${item.meta ? `<small>${item.meta}</small>` : ''}</article>`).join('')}</div>`;
}

function statusPill(status) {
  const key = String(status || 'active').toLowerCase();
  const cls = key.includes('live') || key.includes('active') || key.includes('ready') ? 'ok' : key.includes('draft') || key.includes('review') ? 'warn' : 'info';
  return `<span class="suite-pill ${cls}">${status}</span>`;
}

function renderSuitePage(el, config) {
  el.innerHTML = `
    <div class="suite-shell">
      <section class="suite-hero ${config.heroClass || ''}">
        <div>
          <span class="eyebrow">${config.kicker}</span>
          <h1>${config.title}</h1>
          <p>${config.subtitle}</p>
        </div>
        <button class="btn btn-primary" id="suite-primary-action">${config.action}</button>
      </section>
      ${statCards(config.stats)}
      ${config.before || ''}
      ${featureGrid(config.features)}
      ${config.after || ''}
    </div>
  `;

  el.querySelector('#suite-primary-action')?.addEventListener('click', () => {
    if (typeof config.onPrimaryClick === 'function') {
      config.onPrimaryClick(el);
      return;
    }
    openModal(config.action, config.modal || '<p class="portal-muted">This workflow UI is ready. Connect backend integration in the next step.</p>', {
      submitLabel: 'Save Draft',
      width: config.modalWidth || '620px'
    });
  });
}

export async function renderFormDesk(el) {
  let templates = [];
  try {
    templates = await fetchFormTemplates();
  } catch {
    templates = [];
  }
  const live = templates.filter(t => ['live', 'active'].includes(String(t.status || '').toLowerCase())).length;
  const rowsHtml = templates.length
    ? templates
        .slice(0, 24)
        .map(
          t =>
            `<div><strong>${escapeHtml(t.name)}</strong><span>${escapeHtml(t.purpose)} · ${escapeHtml(t.status)}${t.branch ? ` · ${escapeHtml(t.branch)}` : ''}</span></div>`
        )
        .join('')
    : `<div><strong>MBA Enquiry Form</strong><span>Sample row — create a form below to persist your library</span></div><div><strong>Campus Visit Form</strong><span>Sample row</span></div><div><strong>Scholarship Application</strong><span>Sample row</span></div>`;

  renderSuitePage(el, {
    kicker: 'FormDesk',
    title: 'Smart admission forms',
    subtitle: 'Create landing-page forms, application forms, walk-in capture forms, and campaign-specific enquiry forms with source tracking.',
    action: 'Create form',
    stats: [
      { label: 'Saved forms', value: String(templates.length), note: 'In workspace' },
      { label: 'Live forms', value: String(live || 0), note: 'Status live/active' },
      { label: 'Library', value: templates.length ? 'Synced' : 'Local demo', note: 'API-backed when signed in' }
    ],
    features: [
      { icon: 'F', kicker: 'Builder', title: 'Drag-and-drop fields', copy: 'Name, phone, program, campus, documents, payments, consent, and custom fields.', meta: '12 field types' },
      { icon: 'U', kicker: 'Tracking', title: 'UTM and source capture', copy: 'Every submission can carry campaign, ad, keyword, city, device, and counselor routing data.', meta: 'Auto mapped' },
      { icon: 'V', kicker: 'Validation', title: 'Duplicate prevention', copy: 'Phone/email rules, OTP-ready checks, course eligibility warnings, and spam protection UI.', meta: 'Rules ready' },
      { icon: 'E', kicker: 'Embed', title: 'Website embed center', copy: 'Generate form links, iframe snippets, QR codes, and landing page capture blocks for campaigns.', meta: 'Website ready' }
    ],
    after: `<section class="suite-panel"><div class="panel-head"><div><span class="eyebrow">Form Library</span><h2>Active capture points</h2></div>${statusPill('Live')}</div><div class="suite-rows">${rowsHtml}</div></section>`,
    onPrimaryClick: rootEl => {
      openModal(
        'Create form',
        '<div class="form-group"><label class="form-label">Form name</label><input type="text" class="form-input" id="fd-name" placeholder="MBA Enquiry Form"></div><div class="form-group"><label class="form-label">Purpose</label><select class="form-input" id="fd-purpose"><option>Lead capture</option><option>Application form</option><option>Scholarship form</option></select></div><div class="form-group"><label class="form-label">Status</label><select class="form-input" id="fd-status"><option value="draft">Draft</option><option value="live">Live</option></select></div>',
        {
          submitLabel: 'Save',
          width: '620px',
          onSubmit: async body => {
            const name = body.querySelector('#fd-name')?.value?.trim();
            const purpose = body.querySelector('#fd-purpose')?.value || 'Lead capture';
            const status = body.querySelector('#fd-status')?.value || 'draft';
            if (!name) {
              alert('Form name is required');
              return false;
            }
            try {
              await createFormTemplate({ name, purpose, status, branch: '' });
              await renderFormDesk(rootEl);
            } catch (err) {
              alert(err.message || 'Could not save form');
              return false;
            }
          }
        }
      );
    }
  });
}

function getDayName(date) {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return days[date.getDay()];
}

function getMonthName(date) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return months[date.getMonth()];
}

function getDateStr(date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}

// Persistent module variables for monthly grid state
let calendarYear = new Date().getFullYear();
let calendarMonth = new Date().getMonth();

export async function renderCalendar(el) {
  let tasks = [];
  let leads = [];
  try {
    tasks = await fetchTasks();
  } catch { tasks = []; }
  try {
    const result = await fetchLeads({ limit: 200 });
    leads = result?.data || [];
  } catch { leads = []; }

  const now = new Date();
  const todayStr = getDateStr(now);
  const todayTasks = tasks.filter(t => {
    const d = new Date(t.due_date);
    return getDateStr(d) === todayStr;
  });
  const overdueTasks = tasks.filter(t => {
    const d = new Date(t.due_date);
    return d < now && t.status !== 'completed';
  });
  const weekTasks = tasks.filter(t => {
    const d = new Date(t.due_date);
    const diff = Math.ceil((d - now) / (1000 * 60 * 60 * 24));
    return diff >= 0 && diff <= 7;
  });

  // Monthly Grid Calculation
  const calendarDate = new Date(calendarYear, calendarMonth, 1);
  const startDayOfWeek = calendarDate.getDay();
  const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
  const daysInPrevMonth = new Date(calendarYear, calendarMonth, 0).getDate();

  const cells = [];
  // Trailing days from prev month
  for (let i = startDayOfWeek - 1; i >= 0; i--) {
    cells.push({
      day: daysInPrevMonth - i,
      month: calendarMonth === 0 ? 11 : calendarMonth - 1,
      year: calendarMonth === 0 ? calendarYear - 1 : calendarYear,
      isCurrentMonth: false
    });
  }
  // Current month days
  for (let i = 1; i <= daysInMonth; i++) {
    cells.push({
      day: i,
      month: calendarMonth,
      year: calendarYear,
      isCurrentMonth: true
    });
  }
  // Leading days from next month
  const totalCells = 42;
  const remaining = totalCells - cells.length;
  for (let i = 1; i <= remaining; i++) {
    cells.push({
      day: i,
      month: calendarMonth === 11 ? 0 : calendarMonth + 1,
      year: calendarMonth === 11 ? calendarYear + 1 : calendarYear,
      isCurrentMonth: false
    });
  }

  // Render cells HTML
  const gridHtml = cells.map(c => {
    const dateObj = new Date(c.year, c.month, c.day);
    const dateStr = getDateStr(dateObj);
    const isToday = dateStr === todayStr;
    const cellClass = `${c.isCurrentMonth ? '' : 'other-month'} ${isToday ? 'today' : ''}`;
    
    // Filter tasks for this day
    const dayTasks = tasks.filter(t => getDateStr(new Date(t.due_date)) === dateStr);

    const taskPillsHtml = dayTasks.slice(0, 3).map(t => {
      const typeClass = t.type === 'call' ? 'call' : t.type === 'whatsapp' ? 'whatsapp' : t.type === 'meeting' ? 'meeting' : 'other';
      const typeEmoji = t.type === 'call' ? '📞' : t.type === 'whatsapp' ? '💬' : t.type === 'meeting' ? '📅' : '📋';
      return `<span class="cal-cell-task-pill ${typeClass}">${typeEmoji} ${escapeHtml(t.title)}</span>`;
    }).join('');

    const moreLabel = dayTasks.length > 3 ? `<div class="cal-cell-more">+${dayTasks.length - 3} more</div>` : '';

    return `
      <div class="cal-cell ${cellClass}" data-date="${dateStr}">
        <div class="cal-cell-num">${c.day}</div>
        <div class="cal-cell-tasks">
          ${taskPillsHtml}
          ${moreLabel}
        </div>
      </div>
    `;
  }).join('');

  el.innerHTML = `
    <div class="suite-shell">
      <section class="suite-hero">
        <div>
          <span class="eyebrow">Calendar Pro</span>
          <h1>Counseling & Follow-up Calendar</h1>
          <p>Plan callbacks, document deadlines, payment reminders, and counselor meetings.</p>
        </div>
        <button class="btn btn-primary" id="cal-refresh">↻ Refresh</button>
      </section>

      <div class="suite-stats" style="margin-bottom: 24px;">
        <div><span>Today</span><strong>${todayTasks.length}</strong><small>Follow-ups due</small></div>
        <div><span>This week</span><strong>${weekTasks.length}</strong><small>Upcoming tasks</small></div>
        <div><span>Overdue</span><strong>${overdueTasks.length}</strong><small>Needs attention</small></div>
        <div><span>Total tasks</span><strong>${tasks.length}</strong><small>In system</small></div>
      </div>

      <style>
        .cal-grid-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; background: var(--color-bg-card); padding: 12px 20px; border-radius: 8px; border: 1px solid var(--color-border); }
        .cal-nav-btn { background: var(--color-bg-card); border: 1px solid var(--color-border); border-radius: 6px; padding: 6px 12px; cursor: pointer; color: var(--color-text); font-weight: 700; font-size: 13px; transition: all 0.2s; display: flex; align-items: center; gap: 4px; }
        .cal-nav-btn:hover { border-color: var(--color-primary-light); background: var(--color-bg-page); }
        .cal-month-title { font-size: 16px; font-weight: 800; color: var(--color-text); }
        
        .cal-grid-days-header { display: grid; grid-template-columns: repeat(7, 1fr); gap: 8px; text-align: center; font-weight: 800; font-size: 12px; color: var(--color-text-muted); margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.05em; }
        .cal-grid-body { display: grid; grid-template-columns: repeat(7, 1fr); gap: 8px; }
        
        .cal-cell { background: var(--color-bg-card); border: 1px solid var(--color-border); border-radius: 10px; padding: 10px; min-height: 110px; display: flex; flex-direction: column; cursor: pointer; transition: all 0.2s; position: relative; }
        .cal-cell:hover { border-color: var(--color-primary-light); box-shadow: var(--shadow-sm); transform: translateY(-1px); }
        .cal-cell.today { background: var(--color-primary-light); border-color: var(--color-primary); }
        .cal-cell.today .cal-cell-num { color: var(--color-primary); font-weight: 800; }
        .cal-cell.other-month { opacity: 0.45; }
        
        .cal-cell-num { font-size: 14px; font-weight: 700; color: var(--color-text-secondary); margin-bottom: 6px; }
        
        .cal-cell-tasks { display: flex; flex-direction: column; gap: 4px; overflow: hidden; flex-grow: 1; }
        .cal-cell-task-pill { font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%; display: block; }
        .cal-cell-task-pill.call { background: #dbeafe; color: #1e40af; }
        .cal-cell-task-pill.whatsapp { background: #dcfce7; color: #166534; }
        .cal-cell-task-pill.meeting { background: #f3e8ff; color: #6b21a8; }
        .cal-cell-task-pill.other { background: #ffedd5; color: #9a3412; }
        
        .cal-cell-more { font-size: 9px; font-weight: 700; color: var(--color-text-muted); margin-top: 2px; text-align: center; }
      </style>

      <section class="suite-panel">
        <div class="cal-grid-header">
          <button class="cal-nav-btn" id="cal-prev-btn"><i data-lucide="chevron-left" style="width:14px;height:14px;"></i> Prev</button>
          <span class="cal-month-title" id="cal-month-title-lbl">${getMonthName(new Date(calendarYear, calendarMonth))} ${calendarYear}</span>
          <button class="cal-nav-btn" id="cal-next-btn">Next <i data-lucide="chevron-right" style="width:14px;height:14px;"></i></button>
        </div>
        
        <div class="cal-grid-days-header">
          <div>Sun</div><div>Mon</div><div>Tue</div><div>Wed</div><div>Thu</div><div>Fri</div><div>Sat</div>
        </div>

        <div class="cal-grid-body" id="cal-grid-body">
          ${gridHtml}
        </div>
      </section>
    </div>
  `;

  // Bind Month Navigation
  el.querySelector('#cal-prev-btn')?.addEventListener('click', () => {
    calendarMonth--;
    if (calendarMonth < 0) {
      calendarMonth = 11;
      calendarYear--;
    }
    renderCalendar(el);
  });

  el.querySelector('#cal-next-btn')?.addEventListener('click', () => {
    calendarMonth++;
    if (calendarMonth > 11) {
      calendarMonth = 0;
      calendarYear++;
    }
    renderCalendar(el);
  });

  el.querySelector('#cal-refresh')?.addEventListener('click', () => renderCalendar(el));

  // Bind Cell Click for Details and Create Task
  el.querySelectorAll('.cal-cell').forEach(cell => {
    cell.addEventListener('click', () => {
      const cellDateStr = cell.dataset.date;
      showDayTasksModal(cellDateStr, tasks, leads, el);
    });
  });

  window.renderIcons?.();
}

function showDayTasksModal(dateStr, allTasks, allLeads, rootEl) {
  const dayTasks = allTasks.filter(t => getDateStr(new Date(t.due_date)) === dateStr);

  const content = `
    <div style="display:flex;flex-direction:column;gap:16px;">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <h4 style="margin:0;font-size:14px;">Follow-ups for ${dateStr}</h4>
        <button class="btn btn-primary btn-sm" id="btn-create-task-modal" style="padding:4px 8px;font-size:11px;">
          + New Task
        </button>
      </div>
      <div style="display:flex;flex-direction:column;gap:10px;max-height:300px;overflow-y:auto;padding-right:4px;">
        ${dayTasks.length === 0 ? `
          <p style="text-align:center;color:var(--color-text-muted);padding:20px;">No follow-ups scheduled for this day.</p>
        ` : dayTasks.map(t => {
          const lead = allLeads.find(l => l.id === t.lead_id);
          const studentName = lead ? `${lead.first_name || ''} ${lead.last_name || ''}`.trim() : t.lead_name || 'N/A';
          const typeBadge = t.type === 'call' ? '📞' : t.type === 'whatsapp' ? '💬' : t.type === 'meeting' ? '📅' : '📋';
          
          return `
            <div style="border:1px solid var(--color-border);border-radius:var(--radius-md);padding:10px;background:var(--color-bg-card);display:flex;justify-content:space-between;align-items:center;">
              <div>
                <strong style="font-size:13px;">${escapeHtml(t.title)}</strong>
                <div style="font-size:11px;color:var(--color-text-secondary);margin-top:2px;">
                  ${typeBadge} Student: <strong>${escapeHtml(studentName)}</strong>
                </div>
              </div>
              <span class="suite-pill ${t.status === 'completed' ? 'ok' : 'warn'}" style="text-transform:uppercase;font-size:9px;">
                ${t.status}
              </span>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;

  openModal('Day Follow-ups', content, {
    submitLabel: 'Done',
    width: '460px',
    onSubmit: () => true
  });

  // Bind modal Create Task button
  document.getElementById('btn-create-task-modal')?.addEventListener('click', () => {
    // Close day task modal
    const closeBtn = document.querySelector('[data-modal-close]');
    closeBtn?.click();

    // Open create task modal
    showCreateTaskModal(dateStr, allLeads, rootEl);
  });
}

function showCreateTaskModal(dateStr, allLeads, rootEl) {
  const content = `
    <div class="form-grid" style="display:grid;grid-template-columns:1fr;gap:14px;">
      <div class="form-group">
        <label class="form-label">Task Title *</label>
        <input type="text" id="task-title" class="form-input" placeholder="e.g. Call student for marksheet verification" required />
      </div>
      <div class="form-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
        <div class="form-group">
          <label class="form-label">Task Type</label>
          <select id="task-type" class="form-input">
            <option value="call">Callback Call</option>
            <option value="whatsapp">WhatsApp Follow-up</option>
            <option value="meeting">Meeting / Campus Visit</option>
            <option value="other">Other / General Task</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Target Lead *</label>
          <select id="task-lead" class="form-input" required>
            <option value="">-- Select Lead --</option>
            ${allLeads.map(l => `<option value="${l.id}">${l.first_name || ''} ${l.last_name || ''} (${l.course_name})</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Due Date & Time *</label>
        <input type="datetime-local" id="task-due" class="form-input" value="${dateStr}T10:00" required />
      </div>
    </div>
    <div id="tk-error" style="color:#dc2626;font-size:13px;margin-top:8px;display:none;"></div>
  `;

  openModal('Schedule Counselor Task', content, {
    submitLabel: 'Create Task',
    width: '500px',
    onSubmit: async (body) => {
      const title = body.querySelector('#task-title').value.trim();
      const type = body.querySelector('#task-type').value;
      const lead_id = body.querySelector('#task-lead').value;
      const due_date = body.querySelector('#task-due').value;

      const errEl = body.querySelector('#tk-error');
      if (!title || !lead_id || !due_date) {
        errEl.textContent = 'All asterisked fields are required.';
        errEl.style.display = 'block';
        return false;
      }

      try {
        await createTask({ title, type, lead_id, due_date, status: 'pending' });
        alert('Task created successfully!');
        renderCalendar(rootEl);
        return true;
      } catch (err) {
        errEl.textContent = err.message;
        errEl.style.display = 'block';
        return false;
      }
    }
  });
}

export function renderMarketing(el) {
  renderSuitePage(el, {
    kicker: 'Modern Engagement Suite',
    title: 'Email, SMS, WhatsApp and live chat',
    subtitle: 'A communication workspace for nurturing students across channels with automation, segmentation, and performance tracking.',
    action: 'Create workflow',
    stats: [
      { label: 'Messages', value: '12.8k', note: 'This month' },
      { label: 'Open rate', value: '62%', note: 'Across channels' },
      { label: 'Replies', value: '418', note: 'Need counselor action' }
    ],
    features: [
      { icon: 'W', kicker: 'WhatsApp', title: 'Live chat inbox', copy: 'Conversation cards, unread states, assigned counselor, student stage, and quick replies.', meta: 'Echo-style UI' },
      { icon: 'S', kicker: 'SMS', title: 'Instant nudges', copy: 'Payment reminders, application completion nudges, OTP-ready flows, and event alerts.', meta: 'Gateway pending' },
      { icon: 'E', kicker: 'Email', title: 'Campaign emails', copy: 'Rich templates for admission offers, document requests, and scholarship announcements.', meta: 'Templates linked' },
      { icon: 'A', kicker: 'Automation', title: 'Drip workflow builder', copy: 'Trigger-based journeys for new lead, application started, payment due, and document rejected.', meta: 'Rules ready' }
    ],
    after: `<section class="suite-panel"><div class="panel-head"><div><span class="eyebrow">Channels</span><h2>Communication performance</h2></div>${statusPill('Draft')}</div><div class="suite-bars"><div><span>WhatsApp</span><i style="--w:82%"></i><b>82%</b></div><div><span>Email</span><i style="--w:58%"></i><b>58%</b></div><div><span>SMS</span><i style="--w:46%"></i><b>46%</b></div></div></section>`,
    modal: '<div class="form-group"><label class="form-label">Workflow name</label><input class="form-input" placeholder="Application completion nurture"></div><div class="form-group"><label class="form-label">Trigger</label><select class="form-input"><option>New lead captured</option><option>Application incomplete</option><option>Payment due</option></select></div>'
  });
}

export async function renderCampaigns(el) {
  let campaigns = [];
  try {
    campaigns = await fetchCampaigns();
  } catch {
    campaigns = [];
  }
  const live = campaigns.filter(c => ['live', 'active'].includes(String(c.status || '').toLowerCase())).length;
  const rowsHtml = campaigns.length
    ? campaigns
        .slice(0, 24)
        .map(
          c =>
            `<div><strong>${escapeHtml(c.name)}</strong><span>${escapeHtml(c.channel)} · ${escapeHtml(c.status)}${c.budget ? ` · Budget ${escapeHtml(c.budget)}` : ''}</span></div>`
        )
        .join('')
    : `<div><strong>MBA Google Search</strong><span>Sample row — launch a campaign below to persist</span></div><div><strong>BCA Meta Lead Ads</strong><span>Sample row</span></div><div><strong>Campus Visit QR</strong><span>Sample row</span></div>`;

  renderSuitePage(el, {
    kicker: 'Campaign Manager',
    title: 'Campaign ROI and source attribution',
    subtitle: 'Plan, track, and optimize admission campaigns across Google, Meta, education portals, QR campaigns, fairs, and referrals.',
    action: 'Launch campaign',
    stats: [
      { label: 'Campaigns', value: String(campaigns.length), note: 'Saved in workspace' },
      { label: 'Live', value: String(live || 0), note: 'Status live/active' },
      { label: 'Board', value: campaigns.length ? 'Synced' : 'Local demo', note: 'API-backed when signed in' }
    ],
    features: [
      { icon: 'G', kicker: 'Google Ads', title: 'Search campaign tracking', copy: 'Keyword, source, city, device, and program-level campaign cards.', meta: 'Connector pending' },
      { icon: 'M', kicker: 'Meta', title: 'Lead ad import UI', copy: 'Facebook/Instagram campaign cards with cost, lead quality, and application conversion.', meta: 'API pending' },
      { icon: 'Q', kicker: 'Offline', title: 'QR and fair campaigns', copy: 'Education fair, school visit, campus event, and walk-in campaign source tracking.', meta: 'FormDesk linked' },
      { icon: 'R', kicker: 'ROI', title: 'Revenue attribution', copy: 'Map spend to leads, applications, admissions, payments, and counselor conversion.', meta: 'Finance linked' }
    ],
    after: `<section class="suite-panel"><div class="panel-head"><div><span class="eyebrow">Active Campaigns</span><h2>Performance board</h2></div>${statusPill('Live')}</div><div class="suite-rows">${rowsHtml}</div></section>`,
    onPrimaryClick: rootEl => {
      openModal(
        'Launch campaign',
        '<div class="form-group"><label class="form-label">Campaign name</label><input type="text" class="form-input" id="cmp-name" placeholder="MBA Google Search"></div><div class="form-group"><label class="form-label">Channel</label><select class="form-input" id="cmp-channel"><option>Google Ads</option><option>Meta Ads</option><option>Education Fair</option><option>Referral</option></select></div><div class="form-group"><label class="form-label">Budget note</label><input type="text" class="form-input" id="cmp-budget" placeholder="e.g. Rs. 50k / month"></div><div class="form-group"><label class="form-label">Status</label><select class="form-input" id="cmp-status"><option value="draft">Draft</option><option value="live">Live</option></select></div>',
        {
          submitLabel: 'Save campaign',
          width: '620px',
          onSubmit: async body => {
            const name = body.querySelector('#cmp-name')?.value?.trim();
            const channel = body.querySelector('#cmp-channel')?.value || 'Other';
            const status = body.querySelector('#cmp-status')?.value || 'draft';
            const budget = body.querySelector('#cmp-budget')?.value || '';
            if (!name) {
              alert('Campaign name is required');
              return false;
            }
            try {
              await createCampaign({ name, channel, status, budget, notes: '' });
              await renderCampaigns(rootEl);
            } catch (err) {
              alert(err.message || 'Could not save campaign');
              return false;
            }
          }
        }
      );
    }
  });
}

export async function renderTemplates(el) {
  let templates = [];
  try {
    templates = await fetchCommunicationTemplates();
  } catch { templates = []; }

  const channelCounts = {};
  templates.forEach(t => {
    channelCounts[t.channel] = (channelCounts[t.channel] || 0) + 1;
  });

  const VAR_TOKENS = [
    { token: '{{name}}', desc: 'Student name' },
    { token: '{{course}}', desc: 'Course name' },
    { token: '{{campus}}', desc: 'Campus location' },
    { token: '{{counselor}}', desc: 'Assigned counselor' },
    { token: '{{amount}}', desc: 'Fee amount' },
    { token: '{{due_date}}', desc: 'Payment due date' },
    { token: '{{document}}', desc: 'Missing document name' },
    { token: '{{stage}}', desc: 'Application stage' }
  ];

  const rowsHtml = templates.length
    ? templates.slice(0, 24).map(t =>
        `<div><strong>${escapeHtml(t.name)}</strong><span>${escapeHtml(t.channel)} · ${t.active ? statusPill('Active') : statusPill('Draft')}${t.variables?.length ? ` · ${t.variables.length} variables` : ''}</span></div>`
      ).join('')
    : `<div><strong>Application Incomplete Reminder</strong><span>WhatsApp · uses {{name}}, {{course}}</span></div>
       <div><strong>Fee Due Reminder</strong><span>SMS · uses {{amount}}, {{due_date}}</span></div>
       <div><strong>Document Re-upload Request</strong><span>Email · uses {{name}}, {{document}}</span></div>
       <div><strong>Open House Invite</strong><span>Email · uses {{name}}, {{campus}}</span></div>
       <div><strong>Callback Reminder</strong><span>SMS · uses {{name}}, {{course}}</span></div>`;

  el.innerHTML = `
    <div class="suite-shell">
      <section class="suite-hero">
        <div>
          <span class="eyebrow">Template Manager</span>
          <h1>Reusable message and document templates</h1>
          <p>Manage WhatsApp, SMS, email, and letter templates with personalization tokens.</p>
        </div>
        <button class="btn btn-primary" id="new-template-btn">+ New template</button>
      </section>
      <div class="suite-stats">
        <div><span>Templates</span><strong>${templates.length || 5}</strong><small>Across channels</small></div>
        <div><span>WhatsApp</span><strong>${channelCounts['whatsapp'] || 1}</strong><small>${templates.length ? 'Templates' : 'Sample'}</small></div>
        <div><span>Email</span><strong>${channelCounts['email'] || 2}</strong><small>${templates.length ? 'Templates' : 'Sample'}</small></div>
        <div><span>SMS</span><strong>${channelCounts['sms'] || 2}</strong><small>${templates.length ? 'Templates' : 'Sample'}</small></div>
      </div>
      <div class="suite-grid">
        <article class="suite-card"><div class="suite-card-icon">💬</div><div><span class="eyebrow">WhatsApp</span><h3>WhatsApp templates</h3><p>Admission reminders, payment links, event invites, and document requests with template approval flow.</p></div><small>WABA required</small></article>
        <article class="suite-card"><div class="suite-card-icon">✉️</div><div><span class="eyebrow">Email</span><h3>Email builder</h3><p>Offer letters, scholarship announcements, webinar invites, and application completion nudges.</p></div><small>HTML templates</small></article>
        <article class="suite-card"><div class="suite-card-icon">📄</div><div><span class="eyebrow">Documents</span><h3>Letter templates</h3><p>Offer letters, admission confirmations, fee receipts, and application summaries — PDF-ready.</p></div><small>PDF pending</small></article>
        <article class="suite-card"><div class="suite-card-icon">🔤</div><div><span class="eyebrow">Variables</span><h3>Personalization tokens</h3><p>Insert student name, course, campus, amount, due date, and more using <code>{{token}}</code> syntax.</p></div><small>${VAR_TOKENS.length} tokens</small></article>
      </div>
      <section class="suite-panel">
        <div class="panel-head"><div><span class="eyebrow">Library</span><h2>All templates</h2></div>${templates.length ? statusPill(`${templates.length} saved`) : statusPill('Demo')}</div>
        <div class="suite-rows">${rowsHtml}</div>
      </section>
      <section class="suite-panel">
        <div class="panel-head"><div><span class="eyebrow">Variables Reference</span><h2>Available tokens</h2></div></div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px;padding:12px;">
          ${VAR_TOKENS.map(v => `<div style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:#f8fafc;border-radius:6px;font-size:12px;"><code style="background:#e2e8f0;padding:2px 6px;border-radius:4px;font-size:11px;">${escapeHtml(v.token)}</code><span style="color:#475569;">${escapeHtml(v.desc)}</span></div>`).join('')}
        </div>
      </section>
    </div>
  `;

  el.querySelector('#new-template-btn')?.addEventListener('click', () => {
    openModal('Create Template', `
      <div class="form-group"><label class="form-label">Template name</label><input type="text" class="form-input" id="tmpl-name" placeholder="Fee due reminder"></div>
      <div class="form-group"><label class="form-label">Channel</label><select class="form-input" id="tmpl-channel"><option value="whatsapp">WhatsApp</option><option value="email">Email</option><option value="sms">SMS</option></select></div>
      <div class="form-group"><label class="form-label">Subject (email only)</label><input type="text" class="form-input" id="tmpl-subject" placeholder="Your fee payment is due"></div>
      <div class="form-group"><label class="form-label">Message content</label><textarea class="form-input" id="tmpl-content" rows="4" placeholder="Hi {{name}}, your {{course}} fee of {{amount}} is due on {{due_date}}." style="resize:vertical;font-family:monospace;font-size:13px;"></textarea></div>
      <div class="form-group"><label class="form-label">Variables</label><div style="display:flex;gap:8px;flex-wrap:wrap;">${VAR_TOKENS.map(v => `<span style="cursor:pointer;padding:4px 10px;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:6px;font-size:11px;font-family:monospace;" onclick="document.getElementById('tmpl-content').value += '${escapeHtml(v.token)}'">${escapeHtml(v.token)}</span>`).join('')}</div></div>
    `, {
      submitLabel: 'Save template',
      width: '620px',
      onSubmit: async body => {
        const name = body.querySelector('#tmpl-name')?.value?.trim();
        if (!name) { alert('Template name is required'); return false; }
        try {
          await createCommunicationTemplate({
            name,
            channel: body.querySelector('#tmpl-channel')?.value || 'whatsapp',
            subject: body.querySelector('#tmpl-subject')?.value || '',
            content: body.querySelector('#tmpl-content')?.value || '',
            category: 'custom',
            active: true,
            variables: (body.querySelector('#tmpl-content')?.value?.match(/\{\{\w+\}\}/g) || []).map(v => v.replace(/\{\{|\}\}/g, ''))
          });
          await renderTemplates(el);
        } catch (err) {
          alert(err.message || 'Could not save template');
          return false;
        }
      }
    });
  });
}

export function renderAccessControl(el) {
  renderSuitePage(el, {
    kicker: 'Access Control',
    title: 'Roles, teams and permission matrix',
    subtitle: 'Control what admins, counselors, finance teams, marketing teams, and students can see or change.',
    action: 'Invite user',
    stats: [
      { label: 'Users', value: '18', note: 'Across teams' },
      { label: 'Roles', value: '6', note: 'Customizable' },
      { label: 'Branches', value: '2', note: 'Scoped access' }
    ],
    features: [
      { icon: 'A', kicker: 'Admin', title: 'Full administrator role', copy: 'Can manage settings, users, reports, payments, campaigns, forms, and applications.', meta: 'Full access' },
      { icon: 'C', kicker: 'Counselor', title: 'Counselor workspace role', copy: 'Sees assigned leads, queries, callbacks, application updates, and follow-up tasks.', meta: 'Scoped' },
      { icon: 'F', kicker: 'Finance', title: 'Finance approval role', copy: 'Payment records, receipts, waivers, refunds, and settlement reports.', meta: 'Payments' },
      { icon: 'S', kicker: 'Student', title: 'Student portal role', copy: 'Can view own application, query, document, and fee information only.', meta: 'Self access' }
    ],
    after: `<section class="suite-panel"><div class="panel-head"><div><span class="eyebrow">Permission Matrix</span><h2>Module access</h2></div>${statusPill('Review')}</div><div class="permission-grid"><span>Module</span><span>Admin</span><span>Counselor</span><span>Student</span><b>Applications</b><i>Manage</i><i>Update</i><i>Own</i><b>Payments</b><i>Manage</i><i>View</i><i>Own</i><b>Campaigns</b><i>Manage</i><i>View</i><i>-</i></div></section>`,
    onPrimaryClick: () => {
      openModal('Invite New User', `
        <div class="form-group">
          <label class="form-label">Full Name</label>
          <input type="text" class="form-input" id="invite-name" placeholder="e.g. John Doe">
        </div>
        <div class="form-group" style="margin-top:12px;">
          <label class="form-label">Email Address</label>
          <input type="email" class="form-input" id="invite-email" placeholder="john@rbmi.edu.in">
        </div>
        <div class="form-group" style="margin-top:12px;">
          <label class="form-label">Assign Role</label>
          <select class="form-input" id="invite-role">
            <option value="admin">Administrator</option>
            <option value="counselor">Counselor</option>
            <option value="finance">Finance Team</option>
            <option value="marketing">Marketing Team</option>
          </select>
        </div>
        <div class="form-group" style="margin-top:12px;">
          <label class="form-label">Assign Branch</label>
          <select class="form-input" id="invite-branch">
            <option value="bareilly">Bareilly Campus</option>
            <option value="greater_noida">Greater Noida</option>
          </select>
        </div>
        <p class="portal-muted" style="font-size:11px;margin-top:12px;">The user will receive an invite email with their login credentials. Default password will be 'rbmi1234'.</p>
      `, {
        submitLabel: 'Send Invitation',
        onSubmit: async (body) => {
          const name = body.querySelector('#invite-name').value.trim();
          const email = body.querySelector('#invite-email').value.trim();
          const role = body.querySelector('#invite-role').value;
          const branch = body.querySelector('#invite-branch').value;

          if (!name || !email) {
            alert('Please fill in both Name and Email.');
            return false;
          }

          try {
            await createUser({ name, email, role, branch, password: 'rbmi1234' });
            alert(`Invitation sent to ${name} (${email}). They can now log in with the default password.`);
            return true;
          } catch (err) {
            alert('Failed to invite user: ' + err.message);
            return false;
          }
        }
      });
    }
  });
}

export function renderAiAssistant(el) {
  el.innerHTML = `
    <div class="suite-shell">
      <section class="suite-hero ai-hero">
        <div>
          <span class="eyebrow">Asha AI</span>
          <h1>AI admission assistant</h1>
          <p>Student-facing chatbot and staff assistant for FAQs, lead scoring, follow-up drafts, query routing, and application guidance.</p>
        </div>
        <button class="btn btn-primary" id="open-asha-btn">💬 Open Asha AI</button>
      </section>
      <div class="suite-stats">
        <div><span>Bot replies</span><strong>1.2k</strong><small>Monthly volume</small></div>
        <div><span>Lead score</span><strong>84</strong><small>High intent</small></div>
        <div><span>Saved time</span><strong>38h</strong><small>Automation estimate</small></div>
      </div>
      <div class="suite-grid">
        <article class="suite-card"><div class="suite-card-icon">🤖</div><div><span class="eyebrow">Student chatbot</span><h3>Admission FAQ assistant</h3><p>Answers course, fee, document, scholarship, deadline, and campus questions in the student portal.</p></div><small>OpenAI-ready</small></article>
        <article class="suite-card"><div class="suite-card-icon">📊</div><div><span class="eyebrow">Lead scoring</span><h3>Intent and drop-off scoring</h3><p>Highlights hot leads, stuck applications, missing documents, and fee-risk students.</p></div><small>Model pending</small></article>
        <article class="suite-card"><div class="suite-card-icon">✍️</div><div><span class="eyebrow">Drafting</span><h3>Message draft assistant</h3><p>Drafts WhatsApp, SMS, email, and counselor follow-up notes from student context and stage.</p></div><small>Human review</small></article>
        <article class="suite-card"><div class="suite-card-icon">🔀</div><div><span class="eyebrow">Query routing</span><h3>Auto classify support queries</h3><p>Routes documents, payments, applications, and scholarship questions to the right team.</p></div><small>Rules ready</small></article>
      </div>
      <section class="suite-panel">
        <div class="panel-head"><div><span class="eyebrow">Live Demo</span><h2>Try a conversation</h2></div>${statusPill('UI Ready')}</div>
        <div class="ai-chat-demo">
          <div class="ai-chat-head"><strong>Asha AI</strong><span style="font-size:11px;color:#64748b;">admission assistant</span></div>
          <div class="ai-msg student">What documents are pending for my admission?</div>
          <div class="ai-msg bot">Your <strong>Class 12 marksheet</strong> is pending. Upload it from <strong>My Application</strong>, then the document team can verify your file within 24 hours.</div>
          <div class="ai-msg student">What is the fee for MBA?</div>
          <div class="ai-msg bot">The MBA program fee is <strong>₹3,50,000/year</strong> at Bareilly campus. Scholarships are available based on merit. Would you like me to check your scholarship eligibility?</div>
          <div class="ai-suggestions">
            <button onclick="document.querySelector('.ai-chat-demo')?.scrollIntoView({behavior:'smooth'})">Draft reminder</button>
            <button onclick="document.querySelector('.ai-chat-demo')?.scrollIntoView({behavior:'smooth'})">Score lead</button>
            <button onclick="document.querySelector('.ai-chat-demo')?.scrollIntoView({behavior:'smooth'})">Classify query</button>
          </div>
        </div>
      </section>
      <section class="suite-panel">
        <div class="panel-head"><div><span class="eyebrow">Capabilities</span><h2>What Asha AI can do</h2></div></div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px;padding:12px;">
          <div style="padding:12px;background:#f8fafc;border-radius:8px;">
            <strong style="font-size:13px;">📋 Application status</strong>
            <p style="font-size:11px;color:#64748b;margin-top:4px;">Check your application stage, pending documents, and next steps.</p>
          </div>
          <div style="padding:12px;background:#f8fafc;border-radius:8px;">
            <strong style="font-size:13px;">💰 Fee & Scholarship</strong>
            <p style="font-size:11px;color:#64748b;margin-top:4px;">Fee structure, payment deadlines, installment plans, and scholarship eligibility.</p>
          </div>
          <div style="padding:12px;background:#f8fafc;border-radius:8px;">
            <strong style="font-size:13px;">📚 Course guidance</strong>
            <p style="font-size:11px;color:#64748b;margin-top:4px;">Course details, eligibility, duration, career prospects, and campus availability.</p>
          </div>
          <div style="padding:12px;background:#f8fafc;border-radius:8px;">
            <strong style="font-size:13px;">📄 Document help</strong>
            <p style="font-size:11px;color:#64748b;margin-top:4px;">Required documents list, upload guidance, verification status, and re-upload help.</p>
          </div>
          <div style="padding:12px;background:#f8fafc;border-radius:8px;">
            <strong style="font-size:13px;">📞 Counselor connect</strong>
            <p style="font-size:11px;color:#64748b;margin-top:4px;">Request a callback, find your counselor, schedule a campus visit or call.</p>
          </div>
          <div style="padding:12px;background:#f8fafc;border-radius:8px;">
            <strong style="font-size:13px;">🏛️ Campus info</strong>
            <p style="font-size:11px;color:#64748b;margin-top:4px;">Bareilly and Greater Noida campus details, facilities, transport, and accommodation.</p>
          </div>
        </div>
      </section>
    </div>
  `;

  el.querySelector('#open-asha-btn')?.addEventListener('click', () => {
    try { openAshaAI(); } catch {
      openModal('Asha AI Assistant', `
        <div style="display:flex;flex-direction:column;gap:12px;min-height:300px;">
          <div style="flex:1;display:flex;flex-direction:column;gap:8px;overflow-y:auto;padding:8px 0;">
            <div class="ai-msg bot" style="max-width:85%;">Hello! I'm Asha, your RBMI admission assistant. How can I help you today?</div>
            <div class="ai-msg bot" style="max-width:85%;">You can ask me about courses, fees, documents, scholarships, application status, or campus details.</div>
          </div>
          <div style="display:flex;gap:8px;border-top:1px solid #e2e8f0;padding-top:12px;">
            <input type="text" class="form-input" id="asha-chat-input" placeholder="Type your question..." style="flex:1;">
            <button class="btn btn-primary" id="asha-send-btn" style="padding:10px 20px;flex-shrink:0;">Send</button>
          </div>
        </div>
      `, { submitLabel: 'Close', width: '520px', onSubmit: () => true });
    }
  });
}

export function renderMobileApp(el) {
  const isPwaInstalled = window.matchMedia('(display-mode: standalone)').matches;
  const pwaStatus = isPwaInstalled ? statusPill('Installed') : statusPill('Available');

  el.innerHTML = `
    <div class="suite-shell">
      <section class="suite-hero mobile-hero">
        <div>
          <span class="eyebrow">Mobile App</span>
          <h1>Admissions on the go</h1>
          <p>A mobile-first workspace for counselors, field teams, and students with push reminders, calls, and real-time updates.</p>
        </div>
        ${!isPwaInstalled ? '<button class="btn btn-primary" id="install-pwa-btn">📲 Install App</button>' : '<div class="btn btn-primary" style="background:#059669;cursor:default;opacity:0.8;">✓ PWA Installed</div>'}
      </section>
      <div class="suite-stats">
        <div><span>Status</span><strong>${isPwaInstalled ? 'Installed' : 'PWA Ready'}</strong><small>${isPwaInstalled ? 'Running standalone' : 'Add to home screen'}</small></div>
        <div><span>Platform</span><strong>Web App</strong><small>Responsive PWA</small></div>
        <div><span>Push alerts</span><strong>94%</strong><small>Reminder reach</small></div>
      </div>
      <div class="suite-grid">
        <article class="suite-card"><div class="suite-card-icon">📞</div><div><span class="eyebrow">Telephony</span><h3>One-tap calling</h3><p>Call students from lead/application cards and log call outcomes with duration and summaries.</p></div><small>Call log UI ready</small></article>
        <article class="suite-card"><div class="suite-card-icon">📍</div><div><span class="eyebrow">Field force</span><h3>Geo check-in</h3><p>Field teams can check in/out, record school visits, and view route history from mobile.</p></div><small>PWA-ready</small></article>
        <article class="suite-card"><div class="suite-card-icon">🔔</div><div><span class="eyebrow">Push</span><h3>Push reminders</h3><p>Follow-up, payment, query, and document deadline notifications via service worker.</p></div><small>SW registered</small></article>
        <article class="suite-card"><div class="suite-card-icon">📱</div><div><span class="eyebrow">Responsive</span><h3>Mobile-first design</h3><p>Full CRM responsive on mobile — dashboard, pipeline, leads, applications, and chat.</p></div><small>CSS ready</small></article>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">
        <section class="suite-panel">
          <div class="panel-head"><div><span class="eyebrow">Preview</span><h2>Mobile interface</h2></div>${pwaStatus}</div>
          <div class="phone-preview">
            <div class="phone-frame">
              <div class="phone-top"><span style="font-size:10px;color:#94a3b8;">9:41</span></div>
              <div class="phone-screen">
                <div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:#6366f1;color:#fff;border-radius:8px;margin-bottom:12px;">
                  <strong style="font-size:13px;">RBMI Hub</strong>
                </div>
                <div style="display:flex;flex-direction:column;gap:6px;">
                  <div style="background:#f8fafc;border-radius:8px;padding:8px 10px;font-size:11px;"><strong>14</strong> follow-ups today</div>
                  <div style="background:#f8fafc;border-radius:8px;padding:8px 10px;font-size:11px;"><strong>6</strong> campus visits</div>
                  <div style="background:#fef2f2;border-radius:8px;padding:8px 10px;font-size:11px;color:#dc2626;"><strong>3</strong> fee reminders</div>
                </div>
                <button style="width:100%;margin-top:12px;padding:10px;background:#6366f1;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;">Start calling</button>
                <div style="margin-top:8px;font-size:9px;color:#94a3b8;text-align:center;">↗ Leads · Applications · Payments</div>
              </div>
            </div>
          </div>
        </section>
        <section class="suite-panel">
          <div class="panel-head"><div><span class="eyebrow">Setup Guide</span><h2>Install as PWA</h2></div></div>
          <div style="padding:12px;display:flex;flex-direction:column;gap:12px;">
            <div style="display:flex;gap:10px;align-items:flex-start;">
              <span style="background:#6366f1;color:#fff;border-radius:50%;width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0;">1</span>
              <div><strong style="font-size:13px;">Open in Chrome/Edge</strong><p style="font-size:11px;color:#64748b;margin-top:2px;">Visit the CRM URL in your mobile browser.</p></div>
            </div>
            <div style="display:flex;gap:10px;align-items:flex-start;">
              <span style="background:#6366f1;color:#fff;border-radius:50%;width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0;">2</span>
              <div><strong style="font-size:13px;">Tap Share / Menu</strong><p style="font-size:11px;color:#64748b;margin-top:2px;">Tap the share icon or browser menu (three dots).</p></div>
            </div>
            <div style="display:flex;gap:10px;align-items:flex-start;">
              <span style="background:#6366f1;color:#fff;border-radius:50%;width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0;">3</span>
              <div><strong style="font-size:13px;">Add to Home Screen</strong><p style="font-size:11px;color:#64748b;margin-top:2px;">Select "Add to Home Screen" or "Install App".</p></div>
            </div>
            <div style="display:flex;gap:10px;align-items:flex-start;">
              <span style="background:#6366f1;color:#fff;border-radius:50%;width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0;">4</span>
              <div><strong style="font-size:13px;">Launch & Login</strong><p style="font-size:11px;color:#64748b;margin-top:2px;">The app launches standalone — login and start working.</p></div>
            </div>
            <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:12px;margin-top:4px;">
              <strong style="font-size:12px;color:#166534;">✅ Features available on mobile</strong>
              <div style="font-size:11px;color:#15803d;margin-top:6px;display:flex;flex-direction:column;gap:4px;">
                <span>• Dashboard with live stats</span>
                <span>• Lead management & pipeline</span>
                <span>• Call logging</span>
                <span>• Student portal access</span>
                <span>• Chat with counselor</span>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  `;

  el.querySelector('#install-pwa-btn')?.addEventListener('click', async () => {
    if ('onbeforeinstallprompt' in window) {
      const deferredPrompt = window.__pwa_deferred_prompt;
      if (deferredPrompt) {
        deferredPrompt.prompt();
        const result = await deferredPrompt.userChoice;
        if (result.outcome === 'accepted') {
          alert('App installed! 🎉');
          location.reload();
        }
      } else {
        alert('To install: Open in Chrome/Edge browser → Menu → Add to Home Screen / Install App');
      }
    } else {
      alert('To install: Open in Chrome/Edge browser → Menu → Add to Home Screen / Install App');
    }
  });
}

function getWebhookUrl() {
  return `${window.location.protocol}//${window.location.hostname}:3001/api/webhook/lead`;
}

function getPublisherUrl(name) {
  return `${window.location.protocol}//${window.location.hostname}:3001/api/webhook/publisher/${name}`;
}

export async function renderIntegrations(el) {
  let integrations = [];
  let inboundLogs = [];
  let publishers = [];
  try {
    integrations = await fetchCommunicationIntegrations();
  } catch { integrations = []; }
  try {
    inboundLogs = await fetchInboundLogs();
  } catch { inboundLogs = []; }
  try {
    const overview = await fetchMarketingOverview();
    publishers = overview?.publishers || [];
  } catch { publishers = []; }

  const connectedCount = Object.values(integrations).filter(v => v?.enabled).length;
  const webhookCount = 1;
  const connectorCount = 8;

  const logHtml = Array.isArray(inboundLogs) && inboundLogs.length > 0
    ? inboundLogs.slice(0, 8).map(log =>
        `<div><strong>${escapeHtml(log.publisher || log.source || 'Webhook')}</strong><span>${escapeHtml(log.student_name || log.payload?.name || 'Unknown')} · ${new Date(log.received_at || log.created_at).toLocaleString('en-IN')}</span>${log.status === 'duplicate' ? '<span class="suite-pill info">Duplicate</span>' : '<span class="suite-pill ok">Captured</span>'}</div>`
      ).join('')
    : `<div><strong>Website Form</strong><span>Webhook ready · POST /api/webhook/lead</span></div>
       <div><strong>Shiksha</strong><span>POST /api/webhook/publisher/Shiksha</span></div>
       <div><strong>CollegeDekho</strong><span>POST /api/webhook/publisher/CollegeDekho</span></div>
       <div><strong>Facebook Ads</strong><span>POST /api/webhook/publisher/Facebook Ads</span></div>
       <div><strong>Google Ads</strong><span>POST /api/webhook/publisher/Google Ads</span></div>`;

  const publishersList = ['Shiksha', 'CollegeDekho', 'Facebook Ads', 'Google Ads', 'JustDial', 'Website', 'Referral'];

  renderSuitePage(el, {
    kicker: 'Integrations',
    title: 'Connect admission tools and data sources',
    subtitle: 'A central integration center for website forms, publisher portals, WhatsApp, SMS, payment gateway, ad platforms, and automation tools.',
    action: 'View webhook config',
    stats: [
      { label: 'Connectors', value: String(connectorCount), note: 'UI cards ready' },
      { label: 'Webhooks', value: String(webhookCount), note: 'Lead capture endpoint' },
      { label: 'Connected', value: String(connectedCount || 3), note: 'Active integrations' }
    ],
    features: [
      { icon: 'W', kicker: 'Webhook', title: 'Lead capture endpoint', copy: `POST to ${getWebhookUrl()} with name, phone, email, course, source, city. Auto-assigns counselor.`, meta: 'Active' },
      { icon: 'P', kicker: 'Publishers', title: 'Publisher-specific endpoints', copy: 'Dedicated endpoints for Shiksha, CollegeDekho, Facebook Ads, Google Ads — auto-normalizes data.', meta: `${publishersList.length} adapters` },
      { icon: 'SB', kicker: 'Database', title: 'Supabase connected', copy: 'Auth, database, storage, and row-level security. Service role key configured in .env.', meta: integrations?.supabase?.enabled ? 'Connected' : 'Configured' },
      { icon: 'E', kicker: 'Email', title: 'Gmail SMTP', copy: 'Welcome emails, stage change notifications, task reminders sent automatically on lead actions.', meta: integrations?.email?.enabled ? 'Active' : 'Configured' },
      { icon: 'WA', kicker: 'WhatsApp', title: 'WhatsApp Business', copy: 'Template-based messaging for document nudges, payment reminders, and event invites.', meta: 'Credentials needed' },
      { icon: 'AD', kicker: 'Ads', title: 'Google & Meta Ads', copy: 'UTM-based source tracking on lead registration form. Campaign attribution via webhook.', meta: 'UTM ready' },
      { icon: 'CT', kicker: 'Telephony', title: 'Call logging', copy: 'Manual call logs with provider (Exotel), duration, recording links, and auto-summary.', meta: 'Call log UI ready' },
      { icon: 'N8', kicker: 'Automation', title: 'n8n / Zapier', copy: 'Send webhook with any custom payload. Use publisher adapters for normalization.', meta: 'Webhook ready' }
    ],
    before: `<section class="suite-panel"><div class="panel-head"><div><span class="eyebrow">Live Inbound</span><h2>Recent lead captures</h2></div>${statusPill('Active')}</div><div class="suite-rows">${logHtml}</div></section>`,
    after: `<section class="suite-panel"><div class="panel-head"><div><span class="eyebrow">Publisher Endpoints</span><h2>Direct integration URLs</h2></div>${statusPill('Ready')}</div><div class="suite-rows">${publishersList.map(p => `<div><strong>${escapeHtml(p)}</strong><span><code style="font-size:11px;background:#f1f5f9;padding:2px 8px;border-radius:4px;">POST ${getPublisherUrl(encodeURIComponent(p))}</code></span></div>`).join('')}</div></section>`,
    onPrimaryClick: () => {
      const webhookUrl = getWebhookUrl();
      const curlExample = `curl -X POST ${webhookUrl} \\
  -H "Content-Type: application/json" \\
  -H "x-webhook-secret: your-secret-here" \\
  -d '{"first_name":"Aarav","last_name":"Mehta","email":"aarav@example.com","phone":"+919012345678","course":"MBA","source":"Website","city":"Bareilly"}'`;

      openModal('Webhook Configuration', `
        <div style="margin-bottom:16px;">
          <label class="form-label"><strong>Webhook URL</strong></label>
          <div style="display:flex;gap:8px;align-items:center;">
            <code style="flex:1;padding:10px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;font-size:13px;word-break:break-all;">${webhookUrl}</code>
            <button class="btn btn-secondary" style="padding:8px 16px;font-size:13px;white-space:nowrap;flex-shrink:0;" onclick="navigator.clipboard.writeText('${webhookUrl}').then(()=>this.textContent='Copied!').catch(()=>{})">Copy</button>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label"><strong>Webhook Secret</strong></label>
          <input type="text" class="form-input" id="webhook-secret" value="replace-with-a-random-webhook-secret" style="font-family:monospace;font-size:13px;">
          <p style="font-size:11px;color:#64748b;margin-top:4px;">Set WEBHOOK_SECRET in .env. Send it as header: x-webhook-secret</p>
        </div>
        <div class="form-group">
          <label class="form-label"><strong>cURL example</strong></label>
          <pre style="background:#0f172a;color:#e2e8f0;padding:14px;border-radius:8px;font-size:12px;line-height:1.7;overflow-x:auto;white-space:pre-wrap;">${curlExample}</pre>
        </div>
        <div class="form-group">
          <label class="form-label"><strong>Available fields</strong></label>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;font-size:12px;color:#475569;">
            <span><code>first_name</code> (required)</span>
            <span><code>last_name</code> (required)</span>
            <span><code>phone</code> (required)</span>
            <span><code>email</code></span>
            <span><code>course</code> / <code>course_id</code></span>
            <span><code>source</code></span>
            <span><code>city</code></span>
            <span><code>notes</code></span>
            <span><code>priority</code></span>
            <span><code>publisher</code></span>
          </div>
        </div>
        <div style="border-top:1px solid #e2e8f0;padding-top:12px;margin-top:4px;">
          <p style="font-size:12px;color:#64748b;"><strong>Auto-assignment:</strong> Webhook automatically assigns the least-loaded counselor and creates a follow-up task. Duplicate leads are detected by phone/email.</p>
        </div>
      `, { submitLabel: 'Close', width: '680px', onSubmit: () => true });
    }
  });
}
