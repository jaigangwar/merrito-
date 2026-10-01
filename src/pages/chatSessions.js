// ===== CHAT SESSIONS PAGE — Live Chat Widget Management =====
import { openModal } from '../components/modal.js';
import { getToken } from '../lib/auth.js';
import { API_BASE, request } from '../lib/api.js';

function escapeHtml(v) {
  return String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function fmtDate(v) {
  if (!v) return '';
  return new Date(v).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

let selectedSessionId = null;
let pollingTimer = null;

// Use shared request() from api.js with /chat prefix
async function chatFetch(path, opts = {}) {
  return request(`/chat${path}`, opts);
}

export async function renderChatSessions(el) {
  el.innerHTML = `<div class="table-loading"><div class="spinner"></div><span>Loading chat sessions...</span></div>`;

  // Clear any previous polling interval when navigating to this page
  if (pollingTimer) clearInterval(pollingTimer);

  try {
    const [sessions] = await Promise.all([
      chatFetch('/sessions')
    ]);

    if (!selectedSessionId && sessions.length > 0) {
      selectedSessionId = sessions[0].id;
    }

    const activeSession = sessions.find(s => s.id === selectedSessionId) || sessions[0];

    el.innerHTML = `
      <style>
        .chat-sessions-shell { display: flex; gap: 20px; height: calc(100vh - 140px); }
        .chat-sessions-list { width: 300px; min-width: 300px; display: flex; flex-direction: column; gap: 8px; overflow-y: auto; padding-right: 8px; }
        .chat-session-card { padding: 14px 16px; border-radius: 10px; border: 1px solid var(--color-border); background: var(--color-bg-card); cursor: pointer; transition: all 0.2s; }
        .chat-session-card:hover { border-color: var(--color-primary-light); }
        .chat-session-card.active { border-color: var(--color-primary); background: var(--color-bg-page); }
        .chat-session-card .cs-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
        .chat-session-card .cs-name { font-weight: 700; font-size: 14px; color: var(--color-text); }
        .chat-session-card .cs-badge { font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 20px; text-transform: uppercase; }
        .chat-session-card .cs-badge.open { background: #dcfce7; color: #166534; }
        .chat-session-card .cs-badge.assigned { background: #dbeafe; color: #1e40af; }
        .chat-session-card .cs-badge.closed { background: #f1f5f9; color: #64748b; }
        .chat-session-card .cs-meta { font-size: 11px; color: var(--color-text-muted); margin-top: 4px; }
        .chat-session-card .cs-preview { font-size: 12px; color: var(--color-text-secondary); margin-top: 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .chat-session-card .cs-unread { background: #ef4444; color: #fff; border-radius: 50%; width: 20px; height: 20px; font-size: 10px; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }

        .chat-main-panel { flex: 1; display: flex; flex-direction: column; background: var(--color-bg-card); border-radius: 12px; border: 1px solid var(--color-border); overflow: hidden; }
        .chat-main-header { padding: 16px 20px; border-bottom: 1px solid var(--color-border); display: flex; justify-content: space-between; align-items: center; }
        .chat-main-header h3 { font-size: 16px; font-weight: 700; }
        .chat-main-header .cs-info { font-size: 12px; color: var(--color-text-muted); }

        .chat-main-messages { flex: 1; padding: 20px; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; background: #f8fafc; }
        .dark-mode .chat-main-messages { background: #0f172a; }
        .chat-bubble { max-width: 75%; padding: 12px 16px; border-radius: 14px; font-size: 13px; line-height: 1.5; }
        .chat-bubble.visitor { align-self: flex-start; background: #eef2ff; color: #1e1b4b; border-bottom-left-radius: 4px; }
        .chat-bubble.counselor { align-self: flex-end; background: #6366f1; color: #fff; border-bottom-right-radius: 4px; }
        .chat-bubble.system { align-self: center; background: transparent; color: #94a3b8; font-size: 11px; padding: 4px 8px; }
        .dark-mode .chat-bubble.visitor { background: #1e293b; color: #e2e8f0; }
        .chat-bubble .cb-time { font-size: 9px; opacity: 0.6; margin-top: 6px; }

        .chat-main-compose { padding: 16px 20px; border-top: 1px solid var(--color-border); display: flex; gap: 10px; align-items: flex-end; }
        .chat-main-compose textarea { flex: 1; border: 1.5px solid var(--color-border); border-radius: 10px; padding: 10px 14px; font-size: 13px; font-family: inherit; resize: none; background: var(--color-bg-page); color: var(--color-text); }
        .chat-main-compose textarea:focus { border-color: var(--color-primary); outline: none; }

        .chat-empty { display: flex; align-items: center; justify-content: center; height: 100%; color: var(--color-text-muted); flex-direction: column; gap: 12px; }
        .chat-empty svg { width: 48px; height: 48px; opacity: 0.3; }
      </style>

      <div style="margin-bottom: 16px;">
        <span class="eyebrow">Live Chat</span>
        <h1 style="margin: 4px 0 0;">Website Visitor Chat</h1>
        <p style="color: var(--color-text-muted); font-size: 13px; margin-top: 4px;">Respond to website visitors in real-time from the embeddable chat widget.</p>
      </div>

      <div class="chat-sessions-shell">
        <!-- Sessions List -->
        <div class="chat-sessions-list">
          <div style="display:flex;gap:8px;margin-bottom:12px;">
            <select id="cs-filter-status" class="form-input" style="flex:1;padding:8px;font-size:12px;">
              <option value="">All Status</option>
              <option value="open">Open</option>
              <option value="assigned">Assigned</option>
              <option value="closed">Closed</option>
            </select>
            <button class="btn btn-secondary btn-sm" id="cs-refresh">↻</button>
          </div>

          ${sessions.length === 0 ? `
            <div class="chat-empty">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              <p>No chat sessions yet</p>
              <p style="font-size:11px;">Embed the widget on your website to start receiving live chats.</p>
            </div>
          ` : sessions.map(s => {
            const msgCount = (s.messages || []).length;
            const lastMsg = msgCount > 0 ? s.messages[msgCount - 1] : null;
            return `
              <div class="chat-session-card ${s.id === selectedSessionId ? 'active' : ''}" data-id="${s.id}">
                <div class="cs-header">
                  <span class="cs-name">${escapeHtml(s.visitor_name)}</span>
                  <span class="cs-badge ${s.status}">${s.status}</span>
                </div>
                <div class="cs-meta">
                  ${s.visitor_email ? escapeHtml(s.visitor_email) : ''}
                  ${s.visitor_phone ? ' · ' + escapeHtml(s.visitor_phone) : ''}
                  · ${msgCount} messages
                </div>
                <div class="cs-preview">
                  ${lastMsg ? escapeHtml(lastMsg.text) : 'No messages yet'}
                </div>
                <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;">
                  <span style="font-size:10px;color:var(--color-text-muted);">${fmtDate(s.created_at)}</span>
                  ${(s.unread_count || 0) > 0 ? `<span class="cs-unread">${s.unread_count}</span>` : ''}
                </div>
              </div>
            `;
          }).join('')}

          <!-- Widget Embed Info -->
          <div style="margin-top:16px;padding:14px;border-radius:10px;background:var(--color-bg-page);border:1px dashed var(--color-border);font-size:12px;">
            <strong style="display:block;margin-bottom:6px;">📦 Embed Widget</strong>
            <p style="color:var(--color-text-muted);margin-bottom:8px;">Add to your website:</p>
            <code style="display:block;padding:8px;background:var(--color-bg-card);border-radius:6px;font-size:10px;word-break:break-all;">
              &lt;script src="${window.location.origin}/widgets/rbmi-chat-widget.js"&gt;&lt;/script&gt;
            </code>
          </div>
        </div>

        <!-- Chat Main Panel -->
        ${activeSession ? `
          <div class="chat-main-panel">
            <div class="chat-main-header">
              <div>
                <h3>${escapeHtml(activeSession.visitor_name)}</h3>
                <span class="cs-info">
                  ${activeSession.visitor_email ? escapeHtml(activeSession.visitor_email) + ' · ' : ''}
                  ${activeSession.visitor_phone ? escapeHtml(activeSession.visitor_phone) + ' · ' : ''}
                  ${fmtDate(activeSession.created_at)}
                  ${activeSession.page_url ? `<br/>Page: ${escapeHtml(activeSession.page_url)}` : ''}
                </span>
              </div>
              <div style="display:flex;gap:8px;">
                ${activeSession.status !== 'closed' ? `
                  <button class="btn btn-secondary btn-sm" id="cs-assign-btn">${activeSession.assigned_to ? 'Reassign' : 'Take'}</button>
                  <button class="btn btn-secondary btn-sm" id="cs-close-btn">Close</button>
                ` : ''}
              </div>
            </div>

            <div class="chat-main-messages" id="cs-messages-container">
              ${(activeSession.messages || []).map(m => `
                <div class="chat-bubble ${m.sender}">
                  ${escapeHtml(m.text)}
                  <div class="cb-time">${fmtDate(m.created_at)}</div>
                </div>
              `).join('')}
              ${(!activeSession.messages || activeSession.messages.length === 0) ? `
                <div class="chat-empty">
                  <p>No messages in this session</p>
                </div>
              ` : ''}
            </div>

            <div class="chat-main-compose">
              <textarea id="cs-reply-input" rows="2" placeholder="Type your reply and press Enter..." ${activeSession.status === 'closed' ? 'disabled' : ''}></textarea>
              <button class="btn btn-primary" id="cs-send-btn" ${activeSession.status === 'closed' ? 'disabled' : ''}>
                Send
              </button>
            </div>
          </div>
        ` : `
          <div class="chat-main-panel">
            <div class="chat-empty">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              <p>Select a chat session to view messages</p>
            </div>
          </div>
        `}
      </div>
    `;

    // Mark active session as read
    if (selectedSessionId) {
      chatFetch(`/sessions/${selectedSessionId}/read`, { method: 'PATCH' }).catch(() => {});
    }

    // Session selection
    el.querySelectorAll('.chat-session-card').forEach(card => {
      card.addEventListener('click', () => {
        selectedSessionId = card.dataset.id;
        renderChatSessions(el);
      });
    });

    // Filter
    el.querySelector('#cs-filter-status')?.addEventListener('change', renderChatSessions.bind(null, el));
    el.querySelector('#cs-refresh')?.addEventListener('click', renderChatSessions.bind(null, el));

    // Assign
    el.querySelector('#cs-assign-btn')?.addEventListener('click', async () => {
      try {
        await chatFetch(`/sessions/${selectedSessionId}/assign`, {
          method: 'PATCH',
          body: JSON.stringify({ counselor_id: 'assigned' })
        });
        renderChatSessions(el);
      } catch (err) {
        alert('Failed to assign: ' + err.message);
      }
    });

    // Close
    el.querySelector('#cs-close-btn')?.addEventListener('click', async () => {
      if (!confirm('Close this chat session?')) return;
      try {
        await chatFetch(`/sessions/${selectedSessionId}/close`, { method: 'PATCH' });
        renderChatSessions(el);
      } catch (err) {
        alert('Failed to close: ' + err.message);
      }
    });

    // Send reply
    async function sendReply() {
      const input = el.querySelector('#cs-reply-input');
      const text = input.value.trim();
      if (!text || !selectedSessionId) return;

      try {
        await chatFetch(`/sessions/${selectedSessionId}/messages`, {
          method: 'POST',
          body: JSON.stringify({ text, sender: 'counselor' })
        });
        input.value = '';
        renderChatSessions(el);
      } catch (err) {
        alert('Failed to send: ' + err.message);
      }
    }

    el.querySelector('#cs-send-btn')?.addEventListener('click', sendReply);
    el.querySelector('#cs-reply-input')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendReply();
      }
    });

    // Scroll to bottom
    const container = el.querySelector('#cs-messages-container');
    if (container) container.scrollTop = container.scrollHeight;

    // Start polling for new messages
    pollingTimer = setInterval(async () => {
      try {
        const refresh = await chatFetch('/sessions');
        const current = refresh.find(s => s.id === selectedSessionId);
        if (current) {
          const oldCount = (activeSession?.messages || []).length;
          const newCount = (current.messages || []).length;
          if (newCount > oldCount) {
            renderChatSessions(el);
          }
        }
      } catch { /* ignore polling errors */ }
    }, 5000);

    window.renderIcons?.();
  } catch (error) {
    el.innerHTML = `
      <div class="error-state">
        <h3>Failed to load chat sessions</h3>
        <p>${escapeHtml(error.message)}</p>
        <button class="btn btn-primary" onclick="location.reload()">Retry</button>
      </div>
    `;
  }
}
