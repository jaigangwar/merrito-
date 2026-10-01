// ===== STUDENT INBOX PAGE =====
import {
  fetchStudentInbox, createStudentInboxMessage, updateStudentInboxMessage,
  fetchChatThreads, initiateChat, sendChatMessage
} from '../lib/api.js';
import { openModal } from '../components/modal.js';
import { getAvatarColor, formatDate } from '../components/utils.js';

function escapeHtml(v = '') {
  return String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));
}

function priorityBadge(p) {
  const map = { high: ['#fee2e2', '#dc2626'], medium: ['#fef3c7', '#b45309'], low: ['#dcfce7', '#15803d'] };
  const [bg, color] = map[p] || ['#f1f5f9', '#64748b'];
  return `<span style="padding:2px 8px;border-radius:20px;font-size:11px;font-weight:700;background:${bg};color:${color};">${p || 'medium'}</span>`;
}

function statusBadge(s) {
  const isOpen = s === 'open';
  return `<span style="padding:2px 8px;border-radius:20px;font-size:11px;font-weight:700;background:${isOpen ? '#dbeafe' : '#f1f5f9'};color:${isOpen ? '#1d4ed8' : '#64748b'};">${s || 'open'}</span>`;
}

function channelIcon(ch) {
  const icons = { email: 'mail', whatsapp: 'message-square', sms: 'message-circle', call: 'phone', push: 'bell' };
  return icons[ch] || 'inbox';
}

function getCurrentUser() {
  try { return JSON.parse(sessionStorage.getItem('rbmi_user') || 'null'); } catch { return null; }
}

export async function renderStudentInbox(container) {
  const user = getCurrentUser();
  const isStudent = user?.role === 'student';

  container.innerHTML = `
    <div class="inbox-shell">
      <div class="page-header">
        <div>
          <h1 class="page-title">${isStudent ? 'My Messages' : 'Student Inbox'}</h1>
          <p class="page-subtitle">${isStudent ? 'Messages and updates from your admissions counselor.' : 'Incoming student messages and communication queue.'}</p>
        </div>
        <div class="header-actions">
          ${!isStudent ? `<button class="btn btn-primary" id="btn-new-inbox"><i data-lucide="plus" style="width:16px;height:16px;"></i> New Message</button>` : ''}
        </div>
      </div>

      <!-- Tabs -->
      <div class="inbox-tab-wrap">
        <button class="inbox-tab active" data-tab="inbox">
          <i data-lucide="inbox" style="width:14px;height:14px;margin-right:6px;"></i>Inbox
        </button>
        <button class="inbox-tab" data-tab="chat">
          <i data-lucide="message-square" style="width:14px;height:14px;margin-right:6px;"></i>Live Chat
        </button>
      </div>

      <!-- Inbox pane -->
      <div id="pane-inbox">
        <!-- Filters (admin/counselor only) -->
        ${!isStudent ? `
        <div class="chart-card inbox-filters">
          <input type="text" id="inbox-search" class="form-input" placeholder="Search student or message..." style="max-width:240px;" />
          <select id="inbox-filter-status" class="form-input" style="max-width:140px;">
            <option value="">All statuses</option>
            <option value="open">Open</option>
            <option value="resolved">Resolved</option>
          </select>
          <select id="inbox-filter-priority" class="form-input" style="max-width:140px;">
            <option value="">All priorities</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>` : ''}

        <div id="inbox-list">
          <div style="padding:40px;text-align:center;"><div class="spinner" style="margin:0 auto;"></div></div>
        </div>
      </div>

      <!-- Chat pane -->
      <div id="pane-chat" style="display:none;">
        <div id="chat-area">
          <div style="padding:40px;text-align:center;"><div class="spinner" style="margin:0 auto;"></div></div>
        </div>
      </div>
    </div>
  `;

  window.renderIcons?.();

  // Tab switching
  container.querySelectorAll('.inbox-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.inbox-tab').forEach(b => {
        b.classList.remove('active');
      });
      btn.classList.add('active');

      const tab = btn.dataset.tab;
      container.querySelector('#pane-inbox').style.display = tab === 'inbox' ? 'block' : 'none';
      container.querySelector('#pane-chat').style.display = tab === 'chat' ? 'block' : 'none';

      if (tab === 'chat') loadChat();
    });
  });

  // ─── INBOX ────────────────────────────────────────────────────────────────
  let allMessages = [];

  async function loadInbox() {
    const list = container.querySelector('#inbox-list');
    list.innerHTML = `<div style="padding:40px;text-align:center;"><div class="spinner" style="margin:0 auto;"></div></div>`;
    try {
      allMessages = await fetchStudentInbox();
      renderInboxList();
    } catch (err) {
      list.innerHTML = `<div style="padding:32px;text-align:center;color:#dc2626;">Failed to load inbox: ${escapeHtml(err.message)}</div>`;
    }
  }

  function getFilteredMessages() {
    const search = container.querySelector('#inbox-search')?.value.toLowerCase() || '';
    const status = container.querySelector('#inbox-filter-status')?.value || '';
    const priority = container.querySelector('#inbox-filter-priority')?.value || '';
    return allMessages.filter(m => {
      const matchSearch = !search || (m.student_name || '').toLowerCase().includes(search) || (m.message || '').toLowerCase().includes(search) || (m.subject || '').toLowerCase().includes(search);
      const matchStatus = !status || m.status === status;
      const matchPriority = !priority || m.priority === priority;
      return matchSearch && matchStatus && matchPriority;
    });
  }

  function renderInboxList() {
    const list = container.querySelector('#inbox-list');
    const filtered = getFilteredMessages();

    if (!filtered.length) {
      list.innerHTML = `
        <div class="chart-card" style="padding:48px;text-align:center;color:#64748b;">
          <i data-lucide="inbox" style="width:40px;height:40px;opacity:0.25;margin-bottom:12px;"></i>
          <p style="font-size:15px;">No messages found.</p>
          ${!isStudent ? `<button class="btn btn-primary" style="margin-top:12px;" id="btn-new-inbox-empty">Send first message</button>` : ''}
        </div>`;
      window.renderIcons?.();
      container.querySelector('#btn-new-inbox-empty')?.addEventListener('click', openNewMessageModal);
      return;
    }

    list.innerHTML = `
      <div class="chart-card" style="overflow:hidden;">
        ${filtered.map(msg => {
          const initials = (msg.student_name || 'S').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
          return `
          <div class="inbox-item-row" data-id="${msg.id}">
            <div class="inbox-avatar-text" style="background:${getAvatarColor(msg.student_name || '')};">${initials}</div>
            <div style="flex:1;min-width:0;">
              <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:4px;">
                <div style="display:flex;align-items:center;gap:8px;">
                  <span style="font-weight:700;font-size:14px;">${escapeHtml(msg.student_name)}</span>
                  <i data-lucide="${channelIcon(msg.channel)}" style="width:13px;height:13px;color:#94a3b8;"></i>
                  ${priorityBadge(msg.priority)}
                  ${statusBadge(msg.status)}
                </div>
                <span style="font-size:11px;color:#94a3b8;white-space:nowrap;">${formatDate(msg.created_at)}</span>
              </div>
              <div style="font-size:13px;font-weight:600;color:#334155;margin-bottom:2px;">${escapeHtml(msg.subject || 'No subject')}</div>
              <div style="font-size:13px;color:#64748b;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(msg.message)}</div>
            </div>
            ${!isStudent && msg.status === 'open' ? `
            <button class="btn-resolve btn-resolve-inline" data-id="${msg.id}">
              Resolve
            </button>` : ''}
          </div>`;
        }).join('')}
      </div>
    `;
    window.renderIcons?.();

    // Click to expand
    list.querySelectorAll('.inbox-item-row').forEach(item => {
      item.addEventListener('click', (e) => {
        if (e.target.closest('.btn-resolve')) return;
        const msg = allMessages.find(m => m.id === item.dataset.id);
        if (msg) openMessageModal(msg);
      });
    });

    // Resolve buttons
    list.querySelectorAll('.btn-resolve').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        btn.disabled = true;
        btn.textContent = 'Resolving...';
        try {
          await updateStudentInboxMessage(btn.dataset.id, { status: 'resolved' });
          await loadInbox();
        } catch (err) {
          alert('Failed: ' + err.message);
          btn.disabled = false;
          btn.textContent = 'Resolve';
        }
      });
    });
  }

  function openMessageModal(msg) {
    openModal(`Message — ${msg.student_name}`, `
      <div style="display:flex;flex-direction:column;gap:16px;">
        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          ${priorityBadge(msg.priority)} ${statusBadge(msg.status)}
          <span style="font-size:12px;color:#94a3b8;">${formatDate(msg.created_at)}</span>
        </div>
        <div class="inbox-msg-block">
          <div style="font-size:12px;font-weight:700;color:#94a3b8;text-transform:uppercase;margin-bottom:6px;">Subject</div>
          <div style="font-size:14px;font-weight:600;">${escapeHtml(msg.subject)}</div>
        </div>
        <div class="inbox-msg-block">
          <div style="font-size:12px;font-weight:700;color:#94a3b8;text-transform:uppercase;margin-bottom:6px;">Message</div>
          <div style="font-size:14px;line-height:1.7;">${escapeHtml(msg.message)}</div>
        </div>
        ${!isStudent ? `
        <div>
          <label class="form-label">Reply / Response</label>
          <textarea id="msg-reply" class="form-input" rows="3" placeholder="Type your reply to the student...">${escapeHtml(msg.response || '')}</textarea>
        </div>
        <div>
          <label class="form-label">Update Status</label>
          <select id="msg-status" class="form-input">
            <option value="open" ${msg.status === 'open' ? 'selected' : ''}>Open</option>
            <option value="resolved" ${msg.status === 'resolved' ? 'selected' : ''}>Resolved</option>
          </select>
        </div>` : ''}
      </div>
    `, {
      submitLabel: isStudent ? 'Close' : 'Save Reply',
      onSubmit: async (body) => {
        if (!isStudent) {
          const reply = body.querySelector('#msg-reply')?.value?.trim();
          const status = body.querySelector('#msg-status')?.value || 'open';
          await updateStudentInboxMessage(msg.id, { response: reply, status });
          await loadInbox();
        }
      }
    });
  }

  function openNewMessageModal() {
    openModal('New Message to Student', `
      <div class="form-grid">
        <div class="form-group">
          <label class="form-label">Student Name *</label>
          <input id="nm-student" class="form-input" placeholder="Student name" />
        </div>
        <div class="form-group">
          <label class="form-label">Channel</label>
          <select id="nm-channel" class="form-input">
            <option value="email">Email</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="sms">SMS</option>
          </select>
        </div>
        <div class="form-group form-full">
          <label class="form-label">Subject *</label>
          <input id="nm-subject" class="form-input" placeholder="e.g. Document reminder" />
        </div>
        <div class="form-group form-full">
          <label class="form-label">Message *</label>
          <textarea id="nm-message" class="form-input" rows="4" placeholder="Write your message..."></textarea>
        </div>
        <div class="form-group">
          <label class="form-label">Priority</label>
          <select id="nm-priority" class="form-input">
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="low">Low</option>
          </select>
        </div>
      </div>
    `, {
      submitLabel: 'Send Message',
      onSubmit: async (body) => {
        const student = body.querySelector('#nm-student')?.value?.trim();
        const subject = body.querySelector('#nm-subject')?.value?.trim();
        const message = body.querySelector('#nm-message')?.value?.trim();
        if (!student || !subject || !message) {
          alert('Student name, subject, and message are required.');
          return false;
        }
        await createStudentInboxMessage({
          student_name: student,
          channel: body.querySelector('#nm-channel')?.value || 'email',
          subject,
          message,
          priority: body.querySelector('#nm-priority')?.value || 'medium',
          status: 'open'
        });
        await loadInbox();
      }
    });
  }

  // Filter events
  container.querySelector('#inbox-search')?.addEventListener('input', renderInboxList);
  container.querySelector('#inbox-filter-status')?.addEventListener('change', renderInboxList);
  container.querySelector('#inbox-filter-priority')?.addEventListener('change', renderInboxList);
  container.querySelector('#btn-new-inbox')?.addEventListener('click', openNewMessageModal);

  // ─── LIVE CHAT ────────────────────────────────────────────────────────────
  let chatThreads = [];
  let activeChatId = null;

  async function loadChat() {
    const area = container.querySelector('#chat-area');
    area.innerHTML = `<div style="padding:40px;text-align:center;"><div class="spinner" style="margin:0 auto;"></div></div>`;
    try {
      chatThreads = await fetchChatThreads();
      if (isStudent && chatThreads.length === 0) {
        // Auto-create thread for student
        const thread = await initiateChat();
        chatThreads = [thread];
      }
      if (chatThreads.length > 0 && !activeChatId) activeChatId = chatThreads[0].id;
      renderChat();
    } catch (err) {
      area.innerHTML = `<div style="padding:32px;text-align:center;color:#dc2626;">Failed to load chat: ${escapeHtml(err.message)}</div>`;
    }
  }

  function renderChat() {
    const area = container.querySelector('#chat-area');
    const activeThread = chatThreads.find(t => t.id === activeChatId) || chatThreads[0];

    if (!chatThreads.length) {
      area.innerHTML = `<div class="chart-card" style="padding:48px;text-align:center;color:#64748b;">
        <i data-lucide="message-square" style="width:40px;height:40px;opacity:0.25;margin-bottom:12px;"></i>
        <p>No chat threads yet.</p>
      </div>`;
      window.renderIcons?.();
      return;
    }

    area.innerHTML = `
      <div class="chat-layout">
        <!-- Thread list -->
        <div class="chart-card chat-thread-list">
          <div style="padding:14px 16px;border-bottom:1px solid var(--color-border-light);font-size:12px;font-weight:700;color:var(--color-text-muted);text-transform:uppercase;">Conversations</div>
          ${chatThreads.map(t => {
            const lastMsg = t.messages?.[t.messages.length - 1];
            const initials = (t.student_name || 'S').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
            return `
            <div class="chat-thread-item ${t.id === activeChatId ? 'active' : ''}" data-id="${t.id}">
              <div class="chat-thread-avatar" style="background:${getAvatarColor(t.student_name || '')};">${initials}</div>
              <div style="min-width:0;">
                <div style="font-weight:600;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(t.student_name)}</div>
                <div style="font-size:11px;color:#94a3b8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(lastMsg?.text || 'No messages')}</div>
              </div>
            </div>`;
          }).join('')}
        </div>

        <!-- Chat window -->
        <div class="chart-card chat-window">
          ${activeThread ? `
          <div class="chat-header">
            <div class="chat-thread-avatar" style="background:${getAvatarColor(activeThread.student_name || '')};">${(activeThread.student_name || 'S').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}</div>
            <div>
              <div style="font-weight:700;font-size:14px;">${escapeHtml(activeThread.student_name)}</div>
              <div style="font-size:12px;color:#64748b;">${escapeHtml(activeThread.counselor_name)} · ${activeThread.status}</div>
            </div>
          </div>
          <div id="chat-messages" class="chat-messages">
            ${(activeThread.messages || []).map(msg => {
              const isMe = (isStudent && msg.sender === 'student') || (!isStudent && msg.sender === 'counselor');
              return `
              <div style="display:flex;justify-content:${isMe ? 'flex-end' : 'flex-start'};">
                <div class="${isMe ? 'chat-bubble-me' : 'chat-bubble-them'}">
                  <div style="font-size:13px;line-height:1.5;">${escapeHtml(msg.text)}</div>
                  <div class="chat-time">${new Date(msg.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</div>
                </div>
              </div>`;
            }).join('')}
            ${!activeThread.messages?.length ? `<div style="text-align:center;color:var(--color-text-muted);font-size:13px;margin-top:40px;">No messages yet. Start the conversation!</div>` : ''}
          </div>
          <div class="chat-input-area">
            <textarea id="chat-input" class="form-input" rows="2" placeholder="Type a message... (Enter to send)" style="flex:1;resize:none;"></textarea>
            <button id="btn-send-chat" class="btn btn-primary" style="flex-shrink:0;">
              <i data-lucide="send" style="width:16px;height:16px;"></i>
            </button>
          </div>` : '<div style="padding:40px;text-align:center;color:#94a3b8;">Select a conversation</div>'}
        </div>
      </div>
    `;

    window.renderIcons?.();

    // Scroll to bottom
    const msgs = area.querySelector('#chat-messages');
    if (msgs) msgs.scrollTop = msgs.scrollHeight;

    // Thread selection
    area.querySelectorAll('.chat-thread-item').forEach(item => {
      item.addEventListener('click', () => {
        activeChatId = item.dataset.id;
        renderChat();
      });
    });

    // Send message
    const sendBtn = area.querySelector('#btn-send-chat');
    const chatInput = area.querySelector('#chat-input');

    async function sendMsg() {
      const text = chatInput?.value?.trim();
      if (!text || !activeChatId) return;
      chatInput.value = '';
      chatInput.disabled = true;
      sendBtn.disabled = true;
      try {
        const updated = await sendChatMessage(activeChatId, { text });
        const idx = chatThreads.findIndex(t => t.id === activeChatId);
        if (idx !== -1) chatThreads[idx] = updated;
        renderChat();
      } catch (err) {
        alert('Failed to send: ' + err.message);
        chatInput.disabled = false;
        sendBtn.disabled = false;
      }
    }

    sendBtn?.addEventListener('click', sendMsg);
    chatInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); }
    });
  }

  await loadInbox();
}
