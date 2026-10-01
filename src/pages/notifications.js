import {
  fetchNotificationsList,
  createNotificationItem,
  broadcastNotification,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotificationItem
} from '../lib/api.js';
import { getCurrentUser } from '../lib/auth.js';
import { openModal } from '../components/modal.js';

export async function renderNotifications(el) {
  const user = getCurrentUser();
  const role = user?.role || 'admin';
  const isStudent = role === 'student';

  el.innerHTML = `
    <div class="admissions-container">
      <div class="page-header-row">
        <div>
          <span class="eyebrow">${isStudent ? 'Student Center' : 'System Control'}</span>
          <h1 class="page-header-title">Notification Center</h1>
          <p class="page-header-subtitle">View notifications and broadcast announcements to students or counselors.</p>
        </div>
        <div style="display:flex;gap:12px;">
          <button class="btn btn-secondary" id="btn-mark-all-read-page">
            <i data-lucide="check" style="width:16px;height:16px;margin-right:6px;"></i> Mark All Read
          </button>
          ${!isStudent ? `
            <button class="btn btn-primary" id="btn-broadcast-announcement">
              <i data-lucide="megaphone" style="width:16px;height:16px;margin-right:6px;"></i> Broadcast Message
            </button>
          ` : ''}
        </div>
      </div>

      <div class="admissions-stats-grid" id="notif-stats-grid">
        <!-- Dynamic Stats -->
      </div>

      <div class="admissions-card">
        <div class="admissions-card-header" style="flex-wrap: wrap;">
          <h3 class="admissions-card-title">All System Messages</h3>
          <div style="display:flex;gap:12px;flex-wrap:wrap;">
            <select id="filter-notif-type" class="filter-select" style="padding:4px 8px;">
              <option value="">All Types</option>
              <option value="system">System</option>
              <option value="payment">Payment</option>
              <option value="broadcast">Broadcast</option>
            </select>
            <select id="filter-notif-priority" class="filter-select" style="padding:4px 8px;">
              <option value="">All Priorities</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
        </div>
        <div class="admissions-card-body" style="padding: 0;" id="notifications-list-container">
          <div style="text-align:center;padding:24px;color:var(--color-text-muted);">Loading system messages...</div>
        </div>
      </div>
    </div>
  `;

  // Fetch initial notifications
  await refreshNotificationsPage();

  // Mark all read button event
  document.getElementById('btn-mark-all-read-page')?.addEventListener('click', async () => {
    try {
      await markAllNotificationsRead();
      await refreshNotificationsPage();
      // Also refresh header badge
      window.dispatchEvent(new CustomEvent('rbmi:refresh-unread-badge'));
    } catch (err) {
      alert('Action failed: ' + err.message);
    }
  });

  // Broadcast announcement event (Admin/Counselor only)
  if (!isStudent) {
    document.getElementById('btn-broadcast-announcement')?.addEventListener('click', () => {
      const content = `
        <div class="form-grid" style="display:grid;grid-template-columns:1fr;gap:16px;">
          <div class="form-group">
            <label class="form-label">Announcement Title *</label>
            <input type="text" id="bc-title" class="form-input" placeholder="e.g. Server Maintenance or Fee Extension Deadline" required />
          </div>
          <div class="form-group">
            <label class="form-label">Broadcast Priority</label>
            <select id="bc-priority" class="form-input">
              <option value="medium">Medium</option>
              <option value="high">High (Urgent)</option>
              <option value="low">Low</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Message / Description *</label>
            <textarea id="bc-message" class="form-input" rows="4" placeholder="Enter announcement body text here..." required></textarea>
          </div>
        </div>
        <div id="bc-error" style="color:#dc2626;font-size:13px;margin-top:8px;display:none;"></div>
      `;

      openModal('Broadcast Announcement', content, {
        submitLabel: 'Broadcast Announcement',
        width: '500px',
        onSubmit: async (bcBody) => {
          const title = bcBody.querySelector('#bc-title').value.trim();
          const priority = bcBody.querySelector('#bc-priority').value;
          const message = bcBody.querySelector('#bc-message').value.trim();
          const errEl = bcBody.querySelector('#bc-error');

          if (!title || !message) {
            errEl.textContent = 'Announcement title and message are required.';
            errEl.style.display = 'block';
            return false;
          }

          try {
            await broadcastNotification({ title, priority, message });
            await refreshNotificationsPage();
            window.dispatchEvent(new CustomEvent('rbmi:refresh-unread-badge'));
            return true;
          } catch (err) {
            errEl.textContent = err.message;
            errEl.style.display = 'block';
            return false;
          }
        }
      });
    });
  }

  // Filter dropdown listeners
  document.getElementById('filter-notif-type')?.addEventListener('change', refreshNotificationsPage);
  document.getElementById('filter-notif-priority')?.addEventListener('change', refreshNotificationsPage);

  async function refreshNotificationsPage() {
    try {
      const allNotifications = await fetchNotificationsList();

      const typeFilter = document.getElementById('filter-notif-type')?.value;
      const priorityFilter = document.getElementById('filter-notif-priority')?.value;

      // Filter list
      let filtered = allNotifications;
      if (typeFilter) filtered = filtered.filter(n => n.type === typeFilter);
      if (priorityFilter) filtered = filtered.filter(n => n.priority === priorityFilter);

      // Render Stats
      const statsGrid = document.getElementById('notif-stats-grid');
      if (statsGrid) {
        const unread = allNotifications.filter(n => !n.read).length;
        const urgent = allNotifications.filter(n => n.priority === 'high' && !n.read).length;
        statsGrid.innerHTML = `
          <div class="admissions-stat-card">
            <div class="stat-icon-wrap"><i data-lucide="bell" style="width:24px;height:24px;"></i></div>
            <div class="stat-details">
              <span class="stat-val">${allNotifications.length}</span>
              <span class="stat-lbl">Total Received</span>
            </div>
          </div>
          <div class="admissions-stat-card">
            <div class="stat-icon-wrap" style="background:#fee2e2;color:#dc2626;"><i data-lucide="bell-off" style="width:24px;height:24px;"></i></div>
            <div class="stat-details">
              <span class="stat-val">${unread}</span>
              <span class="stat-lbl">Unread Messages</span>
            </div>
          </div>
          <div class="admissions-stat-card">
            <div class="stat-icon-wrap" style="background:#fef3c7;color:#b45309;"><i data-lucide="alert-triangle" style="width:24px;height:24px;"></i></div>
            <div class="stat-details">
              <span class="stat-val">${urgent}</span>
              <span class="stat-lbl">Urgent Unread</span>
            </div>
          </div>
        `;
      }

      // Render Notification List items
      const listContainer = document.getElementById('notifications-list-container');
      if (listContainer) {
        if (filtered.length === 0) {
          listContainer.innerHTML = `<div style="text-align:center;padding:32px;color:var(--color-text-muted);">No messages found matching filters.</div>`;
        } else {
          listContainer.innerHTML = filtered.map(n => {
            const date = new Date(n.created_at).toLocaleString();
            const priorityBadge = n.priority === 'high' ? `<span class="status-pill rejected" style="margin-left:8px;font-size:9px;">Urgent</span>` : '';
            
            return `
              <div class="notif-card-item ${n.read ? '' : 'unread'}" data-id="${n.id}">
                <span class="notif-card-badge" style="visibility:${n.read ? 'hidden' : 'visible'};"></span>
                <div class="notif-card-content">
                  <div class="notif-card-title-lbl">
                    ${n.title} ${priorityBadge}
                  </div>
                  <div class="notif-card-desc-lbl">${n.message}</div>
                  <div class="notif-card-time-lbl">${date} • Type: ${n.type}</div>
                </div>
                <div style="display:flex;gap:8px;align-items:center;">
                  ${!n.read ? `
                    <button class="btn btn-secondary btn-sm btn-mark-read-page" data-id="${n.id}" style="padding:4px 8px;font-size:11px;">
                      Mark read
                    </button>
                  ` : ''}
                  <button class="btn btn-secondary btn-sm btn-delete-notif-page" data-id="${n.id}" style="padding:4px 8px;border-color:#fca5a5;color:#dc2626;">
                    <i data-lucide="trash-2" style="width:14px;height:14px;"></i>
                  </button>
                </div>
              </div>
            `;
          }).join('');

          // Bind Mark Read Button
          listContainer.querySelectorAll('.btn-mark-read-page').forEach(btn => {
            btn.addEventListener('click', async () => {
              const notifId = btn.dataset.id;
              try {
                await markNotificationRead(notifId);
                await refreshNotificationsPage();
                window.dispatchEvent(new CustomEvent('rbmi:refresh-unread-badge'));
              } catch (err) {
                alert('Action failed: ' + err.message);
              }
            });
          });

          // Bind Delete Button
          listContainer.querySelectorAll('.btn-delete-notif-page').forEach(btn => {
            btn.addEventListener('click', async () => {
              const notifId = btn.dataset.id;
              try {
                await deleteNotificationItem(notifId);
                await refreshNotificationsPage();
                window.dispatchEvent(new CustomEvent('rbmi:refresh-unread-badge'));
              } catch (err) {
                alert('Delete failed: ' + err.message);
              }
            });
          });
        }
      }

      window.renderIcons?.();
    } catch (err) {
      console.error(err);
    }
  }
}
