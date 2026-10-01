import {
  createBroadcast,
  createCallLog,
  createCommunicationTemplate,
  createFollowUp,
  createMarketingCampaign,
  createNotification,
  createStudentInboxMessage,
  fetchBroadcasts,
  fetchCallLogs,
  fetchChatThreads,
  fetchCommunicationIntegrations,
  fetchCommunicationTemplates,
  fetchFollowUps,
  fetchMarketingCampaigns,
  fetchMarketingOverview,
  fetchNotifications,
  fetchStudentInbox,
  launchMarketingCampaign,
  saveCommunicationIntegrations,
  sendBroadcast,
  sendChatMessage,
  updateCommunicationTemplate,
  updateNotification,
  updateStudentInboxMessage,
  fetchInboundLogs,
  fetchPublishers,
  simulateAutoLeads,
  API_BASE
} from '../lib/api.js';
import { openModal } from '../components/modal.js';

let selectedChatId = null;
let pollingInterval = null;

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

function badgeTone(value) {
  const map = {
    draft: 'info',
    scheduled: 'warn',
    sent: 'ok',
    active: 'ok',
    open: 'warn',
    unread: 'warn',
    completed: 'ok',
    high: 'bad',
    medium: 'info',
    low: 'ok'
  };
  return map[value] || 'info';
}

function pretty(value = '') {
  return String(value || '').replace(/_/g, ' ');
}

function fmtDate(value) {
  if (!value) return 'Not scheduled';
  return new Date(value).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

function fmtNumber(value) {
  return new Intl.NumberFormat('en-IN').format(Number(value || 0));
}

function attrJson(value) {
  return escapeHtml(JSON.stringify(value || {}, null, 2));
}

function renderChannelBars(items = []) {
  const maxDelivered = Math.max(1, ...items.map(item => item.delivered || 0));
  return items.map((item) => `
    <div class="mk-bar-row">
      <div>
        <strong>${item.channel.toUpperCase()}</strong>
        <small>${item.campaigns} campaigns</small>
      </div>
      <div class="mk-bar-metrics">
        <span>${fmtNumber(item.delivered)} delivered</span>
        <div class="progress-bar"><div class="progress-fill" style="width:${Math.max(6, ((item.delivered || 0) / maxDelivered) * 100)}%;background:${item.channel === 'email' ? '#2563eb' : item.channel === 'sms' ? '#ea580c' : item.channel === 'whatsapp' ? '#16a34a' : item.channel === 'ivr' ? '#7c3aed' : '#0f766e'}"></div></div>
      </div>
    </div>
  `).join('');
}

function renderCategoryPills(items = []) {
  return items.map(item => `<span class="mk-chip">${pretty(item.category)}: ${item.count}</span>`).join('');
}

function refreshPage() {
  window.dispatchEvent(new CustomEvent('rbmi:refresh'));
}

function openCampaignModal(templates) {
  openModal('New campaign', `
    <div class="form-grid">
      <div class="form-group">
        <label class="form-label">Campaign name</label>
        <input id="mk-campaign-name" class="form-input" placeholder="MBA May outreach">
      </div>
      <div class="form-group">
        <label class="form-label">Channel</label>
        <select id="mk-campaign-channel" class="form-select">
          <option value="email">Email campaigns</option>
          <option value="sms">SMS campaigns</option>
          <option value="whatsapp">WhatsApp integration</option>
          <option value="ivr">IVR/calling integration</option>
          <option value="push">Push notifications</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Category</label>
        <select id="mk-campaign-category" class="form-select">
          <option value="campaign">Campaign</option>
          <option value="broadcast">Broadcast message</option>
          <option value="drip">Drip campaign</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Audience</label>
        <input id="mk-campaign-audience" class="form-input" placeholder="All active leads">
      </div>
      <div class="form-group">
        <label class="form-label">Template</label>
        <select id="mk-campaign-template" class="form-select">
          <option value="">No template</option>
          ${templates.map(item => `<option value="${item.id}">${escapeHtml(item.name)} (${item.channel})</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Audience count</label>
        <input id="mk-campaign-count" class="form-input" type="number" min="1" value="1">
      </div>
      <div class="form-group form-full">
        <label class="form-label">Subject</label>
        <input id="mk-campaign-subject" class="form-input" placeholder="Admissions webinar invite">
      </div>
      <div class="form-group form-full">
        <label class="form-label">Message</label>
        <textarea id="mk-campaign-message" class="form-textarea" rows="5" placeholder="Write the campaign message"></textarea>
      </div>
      <label class="mk-inline-toggle form-full">
        <input id="mk-campaign-followup" type="checkbox" checked>
        <span>Auto follow-up messages after launch</span>
      </label>
    </div>
  `, {
    submitLabel: 'Create campaign',
    onSubmit: async (body) => {
      await createMarketingCampaign({
        name: body.querySelector('#mk-campaign-name').value.trim(),
        channel: body.querySelector('#mk-campaign-channel').value,
        category: body.querySelector('#mk-campaign-category').value,
        audience: body.querySelector('#mk-campaign-audience').value.trim(),
        audience_count: body.querySelector('#mk-campaign-count').value,
        template_id: body.querySelector('#mk-campaign-template').value || null,
        subject: body.querySelector('#mk-campaign-subject').value.trim(),
        message: body.querySelector('#mk-campaign-message').value.trim(),
        auto_followup: body.querySelector('#mk-campaign-followup').checked
      });
      refreshPage();
    }
  });
}

function openTemplateModal(template = null) {
  const variables = Array.isArray(template?.variables) ? template.variables.join(', ') : '';
  openModal(template ? 'Edit template' : 'New template', `
    <div class="form-grid">
      <div class="form-group">
        <label class="form-label">Template name</label>
        <input id="mk-template-name" class="form-input" value="${escapeHtml(template?.name || '')}" placeholder="Open house invite">
      </div>
      <div class="form-group">
        <label class="form-label">Channel</label>
        <select id="mk-template-channel" class="form-select">
          ${['email', 'sms', 'whatsapp', 'ivr', 'push'].map(item => `<option value="${item}" ${template?.channel === item ? 'selected' : ''}>${item.toUpperCase()}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Category</label>
        <select id="mk-template-category" class="form-select">
          ${['campaign', 'broadcast', 'drip', 'follow_up'].map(item => `<option value="${item}" ${template?.category === item ? 'selected' : ''}>${pretty(item)}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Subject</label>
        <input id="mk-template-subject" class="form-input" value="${escapeHtml(template?.subject || '')}" placeholder="Message subject">
      </div>
      <div class="form-group form-full">
        <label class="form-label">Variables</label>
        <input id="mk-template-variables" class="form-input" value="${escapeHtml(variables)}" placeholder="name, campus, course">
      </div>
      <div class="form-group form-full">
        <label class="form-label">Content</label>
        <textarea id="mk-template-content" class="form-textarea" rows="6" placeholder="Write the template body">${escapeHtml(template?.content || '')}</textarea>
      </div>
    </div>
  `, {
    submitLabel: template ? 'Save template' : 'Create template',
    onSubmit: async (body) => {
      const payload = {
        name: body.querySelector('#mk-template-name').value.trim(),
        channel: body.querySelector('#mk-template-channel').value,
        category: body.querySelector('#mk-template-category').value,
        subject: body.querySelector('#mk-template-subject').value.trim(),
        content: body.querySelector('#mk-template-content').value.trim(),
        variables: body.querySelector('#mk-template-variables').value.split(',').map(item => item.trim()).filter(Boolean)
      };
      if (template) await updateCommunicationTemplate(template.id, payload);
      else await createCommunicationTemplate(payload);
      refreshPage();
    }
  });
}

export async function renderMarketing(el) {
  el.innerHTML = `
    <div class="mk-shell">
      <div class="table-loading"><div class="spinner"></div><span>Loading marketing workspace...</span></div>
    </div>
  `;

  try {
    const [overview, integrations, campaigns, templates, callLogs, followUps, broadcasts, inbox, chats, notifications, inboundLogs, publishers] = await Promise.all([
      fetchMarketingOverview(),
      fetchCommunicationIntegrations(),
      fetchMarketingCampaigns(),
      fetchCommunicationTemplates(),
      fetchCallLogs(),
      fetchFollowUps(),
      fetchBroadcasts(),
      fetchStudentInbox(),
      fetchChatThreads(),
      fetchNotifications(),
      fetchInboundLogs(),
      fetchPublishers()
    ]);

    const route = window.location.hash.slice(1) || '/marketing';
    const heroTitle = route === '/templates' ? 'Communication templates' : route === '/campaigns' ? 'Campaign manager' : 'Marketing / Campaigns';
    
    if (!selectedChatId && chats.length > 0) {
      selectedChatId = chats[0].id;
    }
    const activeChat = chats.find(c => c.id === selectedChatId) || chats[0];

    // Clear existing interval
    if (pollingInterval) clearInterval(pollingInterval);
    // Start polling
    pollingInterval = setInterval(async () => {
      if (document.getElementById('mk-chat-messages')) {
        const freshChats = await fetchChatThreads();
        const freshActive = freshChats.find(c => c.id === selectedChatId);
        if (freshActive && JSON.stringify(freshActive.messages) !== JSON.stringify(activeChat?.messages)) {
          // New messages! Just refresh the whole page for simplicity, or we could update just the chat
          refreshPage();
        }
      } else {
        clearInterval(pollingInterval);
      }
    }, 5000);

    el.innerHTML = `
      <div class="mk-shell">
        <section class="mk-hero">
          <div>
            <span class="eyebrow">Communication hub</span>
            <h1>${heroTitle}</h1>
            <p>Email campaigns, SMS campaigns, WhatsApp, IVR, broadcasts, drip automations, student inbox, counselor chat, notifications, call recordings, and analytics from one screen.</p>
            <div class="mk-hero-actions">
              <button class="btn btn-primary" id="mk-new-campaign">New campaign</button>
              <button class="btn btn-secondary" id="mk-new-template">New template</button>
              <button class="btn btn-secondary" id="mk-new-broadcast">Broadcast message</button>
            </div>
          </div>
          <div class="mk-kpi-grid">
            <div class="mk-kpi"><strong>${fmtNumber(overview.analytics.totals.total)}</strong><span>Campaigns configured</span></div>
            <div class="mk-kpi"><strong>${fmtNumber(overview.analytics.totals.delivered)}</strong><span>Messages delivered</span></div>
            <div class="mk-kpi"><strong>${fmtNumber(overview.analytics.totals.inboxOpen)}</strong><span>Inbox waiting</span></div>
            <div class="mk-kpi"><strong>${fmtNumber(overview.analytics.totals.callLogs)}</strong><span>Call recordings logged</span></div>
          </div>
        </section>

        <section class="mk-grid mk-grid-top">
          <article class="chart-card">
            <div class="chart-header">
              <div><h3 class="chart-title">Campaign analytics</h3><span class="chart-subtitle">Delivery and engagement by channel</span></div>
            </div>
            <div class="mk-section-body">
              <div class="mk-analytics-mini">
                <div><strong>${fmtNumber(overview.analytics.totals.opened)}</strong><span>Email / WhatsApp opens</span></div>
                <div><strong>${fmtNumber(overview.analytics.totals.clicked)}</strong><span>Clicks</span></div>
                <div><strong>${fmtNumber(overview.analytics.totals.replied)}</strong><span>Replies</span></div>
              </div>
              <div class="mk-bars">${renderChannelBars(overview.analytics.byChannel)}</div>
              <div class="mk-chip-row">${renderCategoryPills(overview.analytics.byCategory)}</div>
            </div>
          </article>

          <article class="chart-card">
            <div class="chart-header">
              <div><h3 class="chart-title">Integrations</h3><span class="chart-subtitle">Email, SMS, WhatsApp, IVR, and push providers</span></div>
              <button class="btn btn-secondary btn-sm" id="mk-save-integrations">Save</button>
            </div>
            <div class="mk-section-body">
              <div class="mk-integrations">
                ${Object.entries(integrations).map(([key, value]) => `
                  <label class="mk-integration-card">
                    <div>
                      <strong>${key === 'ivr' ? 'IVR / Calling' : key.toUpperCase()}</strong>
                      <small>${escapeHtml(value.provider || 'Provider')}</small>
                    </div>
                    <div class="mk-integration-side">
                      <input type="checkbox" class="mk-integration-toggle" data-key="${key}" ${value.enabled ? 'checked' : ''}>
                      <input type="text" class="form-input mk-provider-input" data-provider="${key}" value="${escapeHtml(value.sender || '')}">
                    </div>
                  </label>
                `).join('')}
              </div>
            </div>
          </article>
        </section>

        <section class="mk-grid mk-grid-pub">
          <article class="chart-card">
            <div class="chart-header">
              <div><h3 class="chart-title">Publisher integrations</h3><span class="chart-subtitle">Direct lead capture from higher-ed publishers</span></div>
              <button class="btn btn-primary btn-sm" id="mk-sync-auto-leads">Sync auto leads</button>
            </div>
            <div class="mk-source-summary">
              <div><strong>${fmtNumber(publishers.reduce((sum, pub) => sum + Number(pub.leads_captured || 0), 0))}</strong><span>Total source leads</span></div>
              <div><strong>${publishers.filter(pub => pub.status === 'active').length}</strong><span>Active connectors</span></div>
              <div><strong>${inboundLogs.filter(log => log.status === 'duplicate').length}</strong><span>Duplicates blocked</span></div>
            </div>
            <div class="mk-list">
              ${publishers.map(pub => `
                <div class="mk-list-card static" style="padding:16px;">
                  <div style="display:flex;justify-content:space-between;align-items:center;width:100%;">
                    <div>
                      <strong>${escapeHtml(pub.name)}</strong>
                      <small>Status: <span style="color:var(--color-success);font-weight:700;">${pub.status.toUpperCase()}</span> · ${pub.leads_captured} leads captured</small>
                      <p style="font-size:11px;color:var(--color-text-muted);margin-top:4px;">Webhook: <code>${API_BASE}/webhook/lead?publisher=${pub.name.toLowerCase()}</code></p>
                    </div>
                    <span class="ops-badge ${pub.status === 'active' ? 'ok' : 'warn'}">${pub.status}</span>
                  </div>
                </div>
              `).join('')}
            </div>
          </article>

          <article class="chart-card">
            <div class="chart-header">
              <div><h3 class="chart-title">Lead inbound logs</h3><span class="chart-subtitle">Real-time feed of incoming webhook hits</span></div>
              <button class="btn btn-secondary btn-sm" id="mk-refresh-inbound">Refresh</button>
            </div>
            <div class="ops-table-wrap" style="max-height:300px;overflow-y:auto;">
              <table class="data-table" style="font-size:12px;">
                <thead><tr><th>Publisher</th><th>Status</th><th>Time</th><th>Details</th></tr></thead>
                <tbody>
                  ${inboundLogs.length === 0 ? '<tr><td colspan="4" style="text-align:center;padding:2rem;color:var(--color-text-muted);">No inbound activity yet</td></tr>' : ''}
                  ${inboundLogs.map(log => `
                    <tr>
                      <td><strong>${escapeHtml(log.publisher || log.source || 'Webhook')}</strong><small>${escapeHtml(log.student_name || '')}</small></td>
                      <td><span class="ops-badge ${log.status === 'captured' ? 'ok' : log.status === 'duplicate' ? 'warn' : 'bad'}">${escapeHtml(log.status)}</span></td>
                      <td>${new Date(log.received_at).toLocaleTimeString('en-IN')}</td>
                      <td><button class="btn-icon view-payload" data-payload='${attrJson(log.payload)}' data-reason="${escapeHtml(log.reason || '')}"><i data-lucide="eye" style="width:14px;height:14px;"></i></button></td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </article>
        </section>

        <section class="chart-card" id="mk-campaigns-section">
          <div class="chart-header">
            <div><h3 class="chart-title">Campaigns</h3><span class="chart-subtitle">Email campaigns, SMS campaigns, drip campaigns, and broadcasts</span></div>
          </div>
          <div class="ops-table-wrap">
            <table class="data-table">
              <thead><tr><th>Name</th><th>Channel</th><th>Category</th><th>Status</th><th>Audience</th><th>Performance</th><th>Action</th></tr></thead>
              <tbody>
                ${campaigns.map(item => `
                  <tr>
                    <td><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.subject || item.message || '')}</small></td>
                    <td>${item.channel.toUpperCase()}</td>
                    <td>${pretty(item.category)}</td>
                    <td><span class="ops-badge ${badgeTone(item.status)}">${pretty(item.status)}</span></td>
                    <td>${escapeHtml(item.audience)}<small>${fmtNumber(item.audience_count)} recipients</small></td>
                    <td>${fmtNumber(item.metrics?.delivered)} delivered / ${fmtNumber(item.metrics?.replied)} replies</td>
                    <td><button class="btn btn-secondary btn-sm mk-launch-campaign" data-id="${item.id}">${item.status === 'sent' ? 'Relaunch' : 'Launch'}</button></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </section>

        <section class="mk-grid mk-grid-widgets">
          <article class="chart-card">
            <div class="chart-header">
              <div><h3 class="chart-title">Website widgets</h3><span class="chart-subtitle">Generate JS forms and popups for your website</span></div>
              <button class="btn btn-secondary btn-sm" id="mk-gen-widget">Generate Script</button>
            </div>
            <div class="mk-section-body" style="padding:1.5rem;">
              <div style="background:var(--color-bg-alt);padding:1rem;border-radius:8px;border:1px dashed var(--color-border);text-align:center;">
                <i data-lucide="code" style="width:32px;height:32px;margin-bottom:8px;color:var(--color-primary);"></i>
                <p style="font-size:13px;color:var(--color-text-muted);">Copy the generated script to your website's <code>&lt;head&gt;</code> to enable real-time lead tracking and Asha AI chat.</p>
              </div>
            </div>
          </article>

          <article class="chart-card">
            <div class="chart-header">
              <div><h3 class="chart-title">QR code lead capture</h3><span class="chart-subtitle">For posters, flyers, and physical events</span></div>
              <button class="btn btn-secondary btn-sm" id="mk-gen-qr">Generate QR</button>
            </div>
            <div class="mk-section-body" style="padding:1.5rem;display:flex;justify-content:center;align-items:center;min-height:140px;">
              <div id="qr-preview" style="text-align:center;color:var(--color-text-muted);font-size:13px;">
                <i data-lucide="qr-code" style="width:48px;height:48px;margin-bottom:8px;opacity:0.2;"></i>
                <p>Click Generate to create a trackable QR code</p>
              </div>
            </div>
          </article>
        </section>

        <section class="mk-grid mk-grid-middle">
          <article class="chart-card" id="mk-templates-section">
            <div class="chart-header">
              <div><h3 class="chart-title">Communication templates</h3><span class="chart-subtitle">Reusable content for campaigns and follow-ups</span></div>
            </div>
            <div class="mk-list">
              ${templates.map(item => `
                <button class="mk-list-card mk-template-edit" data-id="${item.id}">
                  <div>
                    <strong>${escapeHtml(item.name)}</strong>
                    <small>${item.channel.toUpperCase()} · ${pretty(item.category)}</small>
                    <p>${escapeHtml(item.content)}</p>
                  </div>
                  <span class="ops-badge ${item.active ? 'ok' : 'warn'}">${item.active ? 'active' : 'paused'}</span>
                </button>
              `).join('')}
            </div>
          </article>

          <article class="chart-card">
            <div class="chart-header">
              <div><h3 class="chart-title">Automations</h3><span class="chart-subtitle">Auto follow-up messages and drip steps</span></div>
              <button class="btn btn-secondary btn-sm" id="mk-new-followup">New automation</button>
            </div>
            <div class="mk-list">
              ${followUps.map(item => `
                <div class="mk-list-card static">
                  <div>
                    <strong>${escapeHtml(item.title)}</strong>
                    <small>${pretty(item.trigger)} · ${item.channel.toUpperCase()} · ${item.delay_hours} hours</small>
                    <p>Status: ${pretty(item.status)}</p>
                  </div>
                  <span class="ops-badge ${badgeTone(item.status)}">${pretty(item.status)}</span>
                </div>
              `).join('')}
            </div>
          </article>
        </section>

        <section class="mk-grid mk-grid-bottom">
          <article class="chart-card">
            <div class="chart-header">
              <div><h3 class="chart-title">Broadcast messages</h3><span class="chart-subtitle">One-to-many announcements</span></div>
            </div>
            <div class="mk-list">
              ${broadcasts.map(item => `
                <div class="mk-list-card static">
                  <div>
                    <strong>${escapeHtml(item.title)}</strong>
                    <small>${item.channel.toUpperCase()} · ${escapeHtml(item.audience)}</small>
                    <p>${escapeHtml(item.message)}</p>
                  </div>
                  <div class="mk-card-actions">
                    <span class="ops-badge ${badgeTone(item.status)}">${pretty(item.status)}</span>
                    <button class="btn btn-secondary btn-sm mk-send-broadcast" data-id="${item.id}">Send</button>
                  </div>
                </div>
              `).join('')}
            </div>
          </article>

          <article class="chart-card">
            <div class="chart-header">
              <div><h3 class="chart-title">Notification center</h3><span class="chart-subtitle">Push notifications and operational alerts</span></div>
              <button class="btn btn-secondary btn-sm" id="mk-new-notification">New notification</button>
            </div>
            <div class="mk-list">
              ${notifications.map(item => `
                <div class="mk-list-card static">
                  <div>
                    <strong>${escapeHtml(item.title)}</strong>
                    <small>${item.channel.toUpperCase()} · ${fmtDate(item.created_at)}</small>
                    <p>${escapeHtml(item.message)}</p>
                  </div>
                  <button class="btn btn-secondary btn-sm mk-mark-read" data-id="${item.id}">${item.status === 'unread' ? 'Mark read' : 'Read'}</button>
                </div>
              `).join('')}
            </div>
          </article>
        </section>

        <section class="mk-grid mk-grid-desk">
          <article class="chart-card">
            <div class="chart-header">
              <div><h3 class="chart-title">Student inbox</h3><span class="chart-subtitle">Incoming communication queue</span></div>
              <button class="btn btn-secondary btn-sm" id="mk-new-inbox">Add inbox item</button>
            </div>
            <div class="mk-list">
              ${inbox.map(item => `
                <div class="mk-list-card static">
                  <div>
                    <strong>${escapeHtml(item.student_name)}</strong>
                    <small>${item.channel.toUpperCase()} · ${escapeHtml(item.subject)}</small>
                    <p>${escapeHtml(item.message)}</p>
                  </div>
                  <button class="btn btn-secondary btn-sm mk-resolve-inbox" data-id="${item.id}">${item.status === 'open' ? 'Resolve' : 'Closed'}</button>
                </div>
              `).join('')}
            </div>
          </article>

          <article class="chart-card">
            <div class="chart-header">
              <div><h3 class="chart-title">Counselor-student chat</h3><span class="chart-subtitle">Live thread for handoff and guidance</span></div>
            </div>
            <div class="mk-chat-container">
              <div class="mk-chat-threads">
                ${chats.map(c => `
                  <div class="mk-thread-item ${c.id === selectedChatId ? 'active' : ''}" data-id="${c.id}">
                    <strong>${escapeHtml(c.student_name)}</strong>
                    <small>${escapeHtml(c.messages[c.messages.length - 1]?.text || 'No messages')}</small>
                  </div>
                `).join('')}
              </div>
              <div class="mk-chat-shell">
                ${activeChat ? `
                  <div class="mk-chat-head">
                    <strong>${escapeHtml(activeChat.student_name)}</strong>
                    <small>${escapeHtml(activeChat.counselor_name)} · ${fmtDate(activeChat.last_message_at)}</small>
                  </div>
                  <div class="mk-chat-messages" id="mk-chat-messages">
                    ${activeChat.messages.map(message => `
                      <div class="mk-chat-bubble ${message.sender}">
                        <span>${escapeHtml(message.text)}</span>
                        <small>${fmtDate(message.created_at)}</small>
                      </div>
                    `).join('')}
                  </div>
                  <div class="mk-chat-compose">
                    <textarea id="mk-chat-text" class="form-textarea" rows="2" placeholder="Send a counselor update (Ctrl+Enter to send)"></textarea>
                    <button class="btn btn-primary" id="mk-send-chat" data-id="${activeChat.id}">Send message</button>
                  </div>
                ` : '<div class="ops-empty">No chat threads yet</div>'}
              </div>
            </div>
          </article>
        </section>

        <section class="chart-card">
          <div class="chart-header">
            <div><h3 class="chart-title">IVR / calling logs</h3><span class="chart-subtitle">Call recording logs and summaries</span></div>
            <button class="btn btn-secondary btn-sm" id="mk-new-call">Log call</button>
          </div>
          <div class="ops-table-wrap">
            <table class="data-table">
              <thead><tr><th>Student</th><th>Direction</th><th>Provider</th><th>Duration</th><th>Recording</th><th>Summary</th></tr></thead>
              <tbody>
                ${callLogs.map(item => `
                  <tr>
                    <td><strong>${escapeHtml(item.student_name)}</strong><small>${escapeHtml(item.phone)}</small></td>
                    <td>${pretty(item.direction)}</td>
                    <td>${escapeHtml(item.provider)}</td>
                    <td>${Math.round((item.duration_seconds || 0) / 60)} min</td>
                    <td><a href="${escapeHtml(item.recording_url || '#')}" target="_blank" rel="noreferrer">Recording</a></td>
                    <td>${escapeHtml(item.summary)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    `;

    el.querySelector('#mk-new-campaign')?.addEventListener('click', () => openCampaignModal(templates));
    el.querySelector('#mk-new-template')?.addEventListener('click', () => openTemplateModal());

    el.querySelector('#mk-save-integrations')?.addEventListener('click', async () => {
      const payload = {};
      el.querySelectorAll('.mk-integration-toggle').forEach((input) => {
        const key = input.dataset.key;
        payload[key] = {
          ...integrations[key],
          enabled: input.checked,
          sender: el.querySelector(`[data-provider="${key}"]`)?.value.trim() || ''
        };
      });
      await saveCommunicationIntegrations(payload);
      refreshPage();
    });

    el.querySelector('#mk-refresh-inbound')?.addEventListener('click', refreshPage);

    el.querySelector('#mk-sync-auto-leads')?.addEventListener('click', async () => {
      const button = el.querySelector('#mk-sync-auto-leads');
      button.disabled = true;
      button.textContent = 'Syncing...';
      try {
        const result = await simulateAutoLeads(6);
        alert(`Auto lead sync complete: ${result.created} new, ${result.duplicates} duplicate.`);
        refreshPage();
      } catch (err) {
        alert(`Auto lead sync failed: ${err.message}`);
        button.disabled = false;
        button.textContent = 'Sync auto leads';
      }
    });

    el.querySelectorAll('.mk-launch-campaign').forEach((button) => button.addEventListener('click', async () => {
      await launchMarketingCampaign(button.dataset.id);
      refreshPage();
    }));

    el.querySelectorAll('.mk-template-edit').forEach((button) => button.addEventListener('click', () => {
      const template = templates.find(item => item.id === button.dataset.id);
      openTemplateModal(template);
    }));

    el.querySelector('#mk-new-followup')?.addEventListener('click', () => {
      openModal('New automation', `
        <div class="form-grid">
          <div class="form-group"><label class="form-label">Title</label><input id="mk-followup-title" class="form-input" placeholder="No answer after 24 hours"></div>
          <div class="form-group"><label class="form-label">Trigger</label><input id="mk-followup-trigger" class="form-input" placeholder="lead_created"></div>
          <div class="form-group"><label class="form-label">Channel</label><select id="mk-followup-channel" class="form-select"><option value="sms">SMS</option><option value="whatsapp">WhatsApp</option><option value="email">Email</option></select></div>
          <div class="form-group"><label class="form-label">Delay hours</label><input id="mk-followup-delay" class="form-input" type="number" value="24"></div>
        </div>
      `, {
        submitLabel: 'Create automation',
        onSubmit: async (body) => {
          await createFollowUp({
            title: body.querySelector('#mk-followup-title').value.trim(),
            trigger: body.querySelector('#mk-followup-trigger').value.trim(),
            channel: body.querySelector('#mk-followup-channel').value,
            delay_hours: body.querySelector('#mk-followup-delay').value
          });
          refreshPage();
        }
      });
    });

    el.querySelector('#mk-new-broadcast')?.addEventListener('click', () => {
      openModal('Broadcast message', `
        <div class="form-grid">
          <div class="form-group"><label class="form-label">Title</label><input id="mk-broadcast-title" class="form-input" placeholder="Webinar alert"></div>
          <div class="form-group"><label class="form-label">Channel</label><select id="mk-broadcast-channel" class="form-select"><option value="whatsapp">WhatsApp</option><option value="sms">SMS</option><option value="push">Push</option><option value="email">Email</option></select></div>
          <div class="form-group form-full"><label class="form-label">Audience</label><input id="mk-broadcast-audience" class="form-input" placeholder="All prospects"></div>
          <div class="form-group form-full"><label class="form-label">Message</label><textarea id="mk-broadcast-message" class="form-textarea" rows="5"></textarea></div>
        </div>
      `, {
        submitLabel: 'Create broadcast',
        onSubmit: async (body) => {
          await createBroadcast({
            title: body.querySelector('#mk-broadcast-title').value.trim(),
            channel: body.querySelector('#mk-broadcast-channel').value,
            audience: body.querySelector('#mk-broadcast-audience').value.trim(),
            message: body.querySelector('#mk-broadcast-message').value.trim()
          });
          refreshPage();
        }
      });
    });

    el.querySelectorAll('.mk-send-broadcast').forEach((button) => button.addEventListener('click', async () => {
      await sendBroadcast(button.dataset.id);
      refreshPage();
    }));

    el.querySelector('#mk-new-notification')?.addEventListener('click', () => {
      openModal('Push notification', `
        <div class="form-grid">
          <div class="form-group"><label class="form-label">Title</label><input id="mk-notif-title" class="form-input" placeholder="Counselor follow-up due"></div>
          <div class="form-group"><label class="form-label">Channel</label><select id="mk-notif-channel" class="form-select"><option value="push">Push</option><option value="email">Email</option><option value="sms">SMS</option></select></div>
          <div class="form-group form-full"><label class="form-label">Message</label><textarea id="mk-notif-message" class="form-textarea" rows="4"></textarea></div>
        </div>
      `, {
        submitLabel: 'Create notification',
        onSubmit: async (body) => {
          await createNotification({
            title: body.querySelector('#mk-notif-title').value.trim(),
            channel: body.querySelector('#mk-notif-channel').value,
            message: body.querySelector('#mk-notif-message').value.trim()
          });
          refreshPage();
        }
      });
    });

    el.querySelectorAll('.mk-mark-read').forEach((button) => button.addEventListener('click', async () => {
      await updateNotification(button.dataset.id, { status: 'read' });
      refreshPage();
    }));

    el.querySelector('#mk-new-inbox')?.addEventListener('click', () => {
      openModal('Student inbox item', `
        <div class="form-grid">
          <div class="form-group"><label class="form-label">Student</label><input id="mk-inbox-student" class="form-input" placeholder="Student name"></div>
          <div class="form-group"><label class="form-label">Channel</label><select id="mk-inbox-channel" class="form-select"><option value="email">Email</option><option value="sms">SMS</option><option value="whatsapp">WhatsApp</option></select></div>
          <div class="form-group form-full"><label class="form-label">Subject</label><input id="mk-inbox-subject" class="form-input" placeholder="Question from student"></div>
          <div class="form-group form-full"><label class="form-label">Message</label><textarea id="mk-inbox-message" class="form-textarea" rows="4"></textarea></div>
        </div>
      `, {
        submitLabel: 'Add inbox item',
        onSubmit: async (body) => {
          await createStudentInboxMessage({
            student_name: body.querySelector('#mk-inbox-student').value.trim(),
            channel: body.querySelector('#mk-inbox-channel').value,
            subject: body.querySelector('#mk-inbox-subject').value.trim(),
            message: body.querySelector('#mk-inbox-message').value.trim()
          });
          refreshPage();
        }
      });
    });

    el.querySelectorAll('.mk-resolve-inbox').forEach((button) => button.addEventListener('click', async () => {
      await updateStudentInboxMessage(button.dataset.id, { status: 'closed' });
      refreshPage();
    }));

    el.querySelectorAll('.view-payload').forEach(btn => {
      btn.onclick = () => {
        const reason = btn.dataset.reason;
        openModal('Inbound Webhook Payload', `
          ${reason ? `<p class="portal-muted" style="margin-bottom:10px;">${escapeHtml(reason)}</p>` : ''}
          <div class="webhook-payload-display" style="padding:1rem;border-radius:8px;font-family:monospace;font-size:12px;overflow-x:auto;white-space:pre-wrap;">
            ${escapeHtml(btn.dataset.payload || '{}')}
          </div>
        `, { width: '500px', showFooter: false });
      };
    });

    el.querySelectorAll('.mk-thread-item').forEach(item => item.addEventListener('click', () => {
      selectedChatId = item.dataset.id;
      refreshPage();
    }));

    const scrollChat = () => {
      const box = el.querySelector('#mk-chat-messages');
      if (box) box.scrollTop = box.scrollHeight;
    };
    scrollChat();

    const sendMsg = async () => {
      const btn = el.querySelector('#mk-send-chat');
      const textEl = el.querySelector('#mk-chat-text');
      const text = textEl.value.trim();
      if (!text || !btn) return;
      
      btn.disabled = true;
      btn.textContent = 'Sending...';
      try {
        await sendChatMessage(btn.dataset.id, { text, sender: 'counselor' });
        textEl.value = '';
        refreshPage();
      } catch (err) {
        alert('Failed to send: ' + err.message);
        btn.disabled = false;
        btn.textContent = 'Send message';
      }
    };

    el.querySelector('#mk-send-chat')?.addEventListener('click', sendMsg);
    el.querySelector('#mk-chat-text')?.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        sendMsg();
      }
    });

    el.querySelector('#mk-new-call')?.addEventListener('click', () => {
      // ... existing call modal logic ...
    });

    el.querySelector('#mk-gen-widget')?.addEventListener('click', () => {
      openModal('Website Widget Script', `
        <div class="form-group">
          <label class="form-label">Embed this code in your website's &lt;head&gt;:</label>
          <textarea class="form-input" rows="6" readonly style="font-family:monospace;font-size:12px;">
&lt;script src="${window.location.origin}/widgets/rbmi-v1.js"&gt;&lt;/script&gt;
&lt;script&gt;
  RBMI.init({
    collegeId: "rbmi-bareilly",
    theme: "light",
    ashaChat: true,
    leadCapture: true
  });
&lt;/script&gt;
          </textarea>
          <p class="portal-muted" style="margin-top:8px;">This will enable the "Apply Now" popup and Asha AI assistant on your main website.</p>
        </div>
      `, { showFooter: false });
    });

    el.querySelector('#mk-gen-qr')?.addEventListener('click', () => {
      const qrBox = el.querySelector('#qr-preview');
      qrBox.innerHTML = `
        <div class="mk-qr-box" style="padding:1rem;border-radius:8px;display:inline-block;margin-bottom:1rem;">
          <img src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(window.location.origin + '/register.html?source=QR_Poster')}" alt="RBMI QR">
        </div>
        <p style="font-size:14px;font-weight:700;color:var(--color-primary);">QR for Bareilly Campus Poster</p>
        <button class="btn btn-secondary btn-sm" style="margin-top:8px;" onclick="window.print()">Download PNG</button>
      `;
    });
  } catch (error) {
    el.innerHTML = `
      <div class="error-state">
        <h3>Failed to load marketing workspace</h3>
        <p>${escapeHtml(error.message)}</p>
        <button class="btn btn-primary" onclick="location.reload()">Retry</button>
      </div>
    `;
  }
}
