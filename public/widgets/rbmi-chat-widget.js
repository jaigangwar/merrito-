// ===== RBMI Live Chat Widget v1.0 =====
// Embed on any website: <script src="https://yourdomain.com/widgets/rbmi-chat-widget.js"></script>
(function () {
  'use strict';

  var API_BASE = window.RBMI_API_URL || '/api/chat';
  var COLLEGE_NAME = window.RBMI_COLLEGE_NAME || 'RBMI';
  var WIDGET_COLOR = window.RBMI_WIDGET_COLOR || '#6366f1';
  var WIDGET_POSITION = window.RBMI_WIDGET_POSITION || 'right'; // 'right' | 'left'

  // Prevent double init
  if (document.getElementById('rbmi-chat-widget-root')) return;

  // Session storage key
  var SESSION_KEY = 'rbmi_chat_session_id';

  // Create styles
  var style = document.createElement('style');
  style.textContent = `
    #rbmi-chat-widget-root {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      --primary: ${WIDGET_COLOR};
    }
    #rbmi-chat-widget-root * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    .rbmi-chat-fab {
      position: fixed;
      bottom: 24px;
      ${WIDGET_POSITION === 'right' ? 'right: 24px;' : 'left: 24px;'}
      z-index: 999999;
      width: 60px;
      height: 60px;
      border-radius: 50%;
      background: var(--primary);
      border: none;
      cursor: pointer;
      box-shadow: 0 8px 32px rgba(99, 102, 241, 0.35);
      display: flex;
      align-items: center;
      justify-content: center;
      transition: transform 0.2s ease, box-shadow 0.2s ease;
      animation: rbmi-fab-appear 0.4s ease-out;
    }
    .rbmi-chat-fab:hover {
      transform: scale(1.08);
      box-shadow: 0 12px 40px rgba(99, 102, 241, 0.45);
    }
    .rbmi-chat-fab svg {
      width: 28px;
      height: 28px;
      color: #fff;
    }
    .rbmi-chat-fab .rbmi-notif-dot {
      position: absolute;
      top: 2px;
      right: 2px;
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background: #ef4444;
      border: 2px solid #fff;
      display: none;
    }
    .rbmi-chat-fab .rbmi-notif-dot.active {
      display: block;
    }

    @keyframes rbmi-fab-appear {
      from { opacity: 0; transform: scale(0); }
      to { opacity: 1; transform: scale(1); }
    }
    @keyframes rbmi-slide-up {
      from { opacity: 0; transform: translateY(20px) scale(0.95); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }

    .rbmi-chat-panel {
      position: fixed;
      bottom: 96px;
      ${WIDGET_POSITION === 'right' ? 'right: 24px;' : 'left: 24px;'}
      z-index: 999998;
      width: 380px;
      height: 560px;
      max-height: calc(100vh - 140px);
      background: #fff;
      border-radius: 16px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
      display: flex;
      flex-direction: column;
      animation: rbmi-slide-up 0.3s ease-out;
      overflow: hidden;
      transform-origin: bottom ${WIDGET_POSITION === 'right' ? 'right' : 'left'};
    }
    .rbmi-chat-panel.closed {
      display: none;
    }

    .rbmi-chat-header {
      background: var(--primary);
      color: #fff;
      padding: 18px 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .rbmi-chat-header-info {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .rbmi-chat-avatar {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: rgba(255,255,255,0.2);
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 16px;
    }
    .rbmi-chat-header-text h3 {
      font-size: 14px;
      font-weight: 700;
      margin: 0;
    }
    .rbmi-chat-header-text p {
      font-size: 11px;
      opacity: 0.8;
      margin: 2px 0 0;
    }
    .rbmi-chat-close {
      background: rgba(255,255,255,0.15);
      border: none;
      color: #fff;
      width: 32px;
      height: 32px;
      border-radius: 8px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.15s;
    }
    .rbmi-chat-close:hover {
      background: rgba(255,255,255,0.25);
    }

    .rbmi-chat-messages {
      flex: 1;
      padding: 16px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 10px;
      background: #f8fafc;
    }
    .rbmi-msg {
      max-width: 82%;
      padding: 10px 14px;
      border-radius: 12px;
      font-size: 13px;
      line-height: 1.5;
      animation: rbmi-slide-up 0.2s ease-out;
    }
    .rbmi-msg.bot {
      align-self: flex-start;
      background: #eef2ff;
      color: #1e1b4b;
      border-bottom-left-radius: 4px;
    }
    .rbmi-msg.user {
      align-self: flex-end;
      background: var(--primary);
      color: #fff;
      border-bottom-right-radius: 4px;
    }
    .rbmi-msg.system {
      align-self: center;
      background: transparent;
      color: #94a3b8;
      font-size: 11px;
      padding: 4px 8px;
    }
    .rbmi-msg-time {
      font-size: 9px;
      opacity: 0.6;
      margin-top: 4px;
      text-align: right;
    }

    .rbmi-chat-suggestions {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      padding: 8px 16px;
      background: #fff;
      border-top: 1px solid #e2e8f0;
    }
    .rbmi-chat-suggestions button {
      border: 1px solid #e2e8f0;
      padding: 6px 12px;
      border-radius: 20px;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      background: #fff;
      color: #374151;
      transition: all 0.15s;
    }
    .rbmi-chat-suggestions button:hover {
      border-color: var(--primary);
      color: var(--primary);
      background: #f5f3ff;
    }

    .rbmi-chat-input-area {
      display: flex;
      gap: 8px;
      padding: 12px 16px;
      background: #fff;
      border-top: 1px solid #e2e8f0;
    }
    .rbmi-chat-input {
      flex: 1;
      border: 1.5px solid #e2e8f0;
      border-radius: 10px;
      padding: 10px 14px;
      font-size: 13px;
      font-family: inherit;
      outline: none;
      transition: border-color 0.15s;
    }
    .rbmi-chat-input:focus {
      border-color: var(--primary);
    }
    .rbmi-chat-send {
      background: var(--primary);
      border: none;
      color: #fff;
      width: 40px;
      height: 40px;
      border-radius: 10px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.15s, transform 0.1s;
      flex-shrink: 0;
    }
    .rbmi-chat-send:hover {
      background: #4f46e5;
    }
    .rbmi-chat-send:active {
      transform: scale(0.95);
    }
    .rbmi-chat-send:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .rbmi-chat-send svg {
      width: 18px;
      height: 18px;
    }

    .rbmi-chat-footer {
      text-align: center;
      padding: 8px;
      font-size: 9px;
      color: #94a3b8;
      background: #f8fafc;
      border-top: 1px solid #e2e8f0;
    }

    @media (max-width: 480px) {
      .rbmi-chat-panel {
        width: calc(100vw - 32px);
        right: 16px !important;
        left: 16px !important;
        bottom: 88px;
        max-height: calc(100vh - 110px);
      }
    }
  `;
  document.head.appendChild(style);

  // Create widget container
  var root = document.createElement('div');
  root.id = 'rbmi-chat-widget-root';
  document.body.appendChild(root);

  // Icons (inline SVGs to avoid external deps)
  var ICONS = {
    chat: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
    close: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    send: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>',
    minimize: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>'
  };

  var SUGGESTIONS = [
    'What courses do you offer?',
    'What are the fees?',
    'How to apply?',
    'Documents required'
  ];

  var sessionId = sessionStorage.getItem(SESSION_KEY);
  var messages = [];
  var isOpen = false;

  function escapeHtml(str) {
    return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function formatTime(dateStr) {
    var d = new Date(dateStr);
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }

  function renderMessages() {
    var container = root.querySelector('.rbmi-chat-messages');
    if (!container) return;
    container.innerHTML = messages.map(function (m) {
      var cls = m.sender === 'visitor' ? 'user' : m.sender === 'system' ? 'system' : 'bot';
      return '<div class="rbmi-msg ' + cls + '">' +
        escapeHtml(m.text) +
        '<div class="rbmi-msg-time">' + formatTime(m.created_at) + '</div>' +
        '</div>';
    }).join('');
    container.scrollTop = container.scrollHeight;
  }

  function sendMessage(text) {
    if (!text || !text.trim()) return;
    messages.push({ sender: 'visitor', text: text.trim(), created_at: new Date().toISOString() });
    renderMessages();

    // Send to server
    var endpoint = sessionId
      ? API_BASE + '/sessions/' + encodeURIComponent(sessionId) + '/messages'
      : null;

    if (endpoint) {
      fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.trim(), sender: 'visitor' })
      }).then(function (r) { return r.json(); }).catch(function () {});
    }

    // Simulate bot response
    var input = root.querySelector('.rbmi-chat-input');
    if (input) input.disabled = true;
    var sendBtn = root.querySelector('.rbmi-chat-send');
    if (sendBtn) sendBtn.disabled = true;

    setTimeout(function () {
      var botReply = getBotReply(text);
      messages.push({ sender: 'bot', text: botReply, created_at: new Date().toISOString() });
      renderMessages();
      if (input) input.disabled = false;
      if (sendBtn) sendBtn.disabled = false;
      if (input) input.focus();
    }, 800);
  }

  function getBotReply(text) {
    var q = text.toLowerCase();
    if (q.includes('course') || q.includes('program')) {
      return 'We offer MBA, BBA, BCA, B.Com, and many more programs. Which course interests you? Visit our website for the full list.';
    }
    if (q.includes('fee') || q.includes('cost') || q.includes('price')) {
      return 'Our fees vary by program — MBA starts at ₹3.5L/yr, BBA at ₹1.8L/yr. Check our website for complete fee details!';
    }
    if (q.includes('apply') || q.includes('admission') || q.includes('how to')) {
      return 'You can apply online through our portal! Visit rbmi.edu.in/apply or click "Apply Now" on our website. Need help with the process?';
    }
    if (q.includes('document') || q.includes('required')) {
      return 'You'll need: Class 10 & 12 marksheets, ID proof, entrance scorecard, and passport photo. Our team will guide you through the upload process.';
    }
    if (q.includes('hello') || q.includes('hi') || q.includes('hey')) {
      return 'Hello! Welcome to ' + COLLEGE_NAME + '! How can we assist you with admissions today?';
    }
    if (q.includes('call') || q.includes('contact') || q.includes('phone')) {
      return 'You can call us at +91 581 250 0000 or request a callback through this chat. Our counselors are available Mon-Sat, 9 AM to 6 PM.';
    }
    if (q.includes('scholarship')) {
      return 'We offer merit-based and need-based scholarships. Our team can check your eligibility — just share your academic details!';
    }
    if (q.includes('campus') || q.includes('visit')) {
      return 'We have campuses in Bareilly and Greater Noida. You can schedule a campus visit through our website. We\'d love to show you around!';
    }
    return 'Thank you for reaching out! A counselor will get back to you shortly. Meanwhile, you can check our website for course details or ask me anything else!';
  }

  function createOrGetSession() {
    if (sessionId) return Promise.resolve(sessionId);

    var pageUrl = window.location.href;
    return fetch(API_BASE + '/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ page_url: pageUrl, source: 'live_chat_widget' })
    }).then(function (r) { return r.json(); }).then(function (data) {
      sessionId = data.id;
      sessionStorage.setItem(SESSION_KEY, sessionId);
      messages = data.messages || [];
      renderMessages();
      return sessionId;
    }).catch(function () {
      // Offline mode — just use local messages
      messages.push({
        sender: 'bot',
        text: 'Welcome to ' + COLLEGE_NAME + '! How can we help you today?',
        created_at: new Date().toISOString()
      });
      renderMessages();
      return null;
    });
  }

  function togglePanel() {
    isOpen = !isOpen;
    var panel = root.querySelector('.rbmi-chat-panel');
    var fab = root.querySelector('.rbmi-chat-fab');
    if (panel) {
      panel.classList.toggle('closed', !isOpen);
    }
    if (fab) {
      var icon = fab.querySelector('.rbmi-fab-icon');
      if (icon) {
        icon.innerHTML = isOpen ? ICONS.minimize : ICONS.chat;
      }
    }
    if (isOpen) {
      if (!sessionId) {
        createOrGetSession();
      }
      var input = root.querySelector('.rbmi-chat-input');
      if (input) setTimeout(function () { input.focus(); }, 300);
    }
  }

  function buildWidget() {
    root.innerHTML = `
      <!-- FAB Button -->
      <button class="rbmi-chat-fab" id="rbmi-chat-fab">
        <span class="rbmi-notif-dot" id="rbmi-chat-dot"></span>
        <span class="rbmi-fab-icon">${ICONS.chat}</span>
      </button>

      <!-- Chat Panel -->
      <div class="rbmi-chat-panel closed" id="rbmi-chat-panel">
        <div class="rbmi-chat-header">
          <div class="rbmi-chat-header-info">
            <div class="rbmi-chat-avatar">${COLLEGE_NAME.charAt(0)}</div>
            <div class="rbmi-chat-header-text">
              <h3>${COLLEGE_NAME} Admissions</h3>
              <p>We typically reply within 5 minutes</p>
            </div>
          </div>
          <button class="rbmi-chat-close" id="rbmi-chat-close">${ICONS.close}</button>
        </div>

        <div class="rbmi-chat-messages" id="rbmi-chat-messages">
          <div class="rbmi-msg bot">
            Welcome to ${COLLEGE_NAME}! How can we help you with admissions today?
            <div class="rbmi-msg-time">${formatTime(new Date().toISOString())}</div>
          </div>
        </div>

        <div class="rbmi-chat-suggestions" id="rbmi-chat-suggestions">
          ${SUGGESTIONS.map(function (s) { return '<button>' + escapeHtml(s) + '</button>'; }).join('')}
        </div>

        <div class="rbmi-chat-input-area">
          <input type="text" class="rbmi-chat-input" id="rbmi-chat-input" placeholder="Type your message..." />
          <button class="rbmi-chat-send" id="rbmi-chat-send">${ICONS.send}</button>
        </div>

        <div class="rbmi-chat-footer">
          Powered by RBMI Admission Hub
        </div>
      </div>
    `;

    // Bind events
    document.getElementById('rbmi-chat-fab').addEventListener('click', togglePanel);
    document.getElementById('rbmi-chat-close').addEventListener('click', function () {
      document.getElementById('rbmi-chat-panel').classList.add('closed');
      var icon = root.querySelector('.rbmi-fab-icon');
      if (icon) icon.innerHTML = ICONS.chat;
      isOpen = false;
    });

    var input = document.getElementById('rbmi-chat-input');
    var sendBtn = document.getElementById('rbmi-chat-send');

    function handleSend() {
      var text = input.value.trim();
      if (!text) return;
      input.value = '';
      sendMessage(text);
    }

    sendBtn.addEventListener('click', handleSend);
    input.addEventListener('keypress', function (e) {
      if (e.key === 'Enter') handleSend();
    });

    // Suggestion buttons
    document.querySelectorAll('.rbmi-chat-suggestions button').forEach(function (btn) {
      btn.addEventListener('click', function () {
        input.value = this.textContent;
        handleSend();
      });
    });

    // Try to restore session
    createOrGetSession();
  }

  // Auto-init
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', buildWidget);
  } else {
    buildWidget();
  }
})();
