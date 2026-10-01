import { openModal } from './modal.js';
import { createLead, fetchCounselors, fetchCourses, fetchLeads, updatePortalProfile, fetchNotificationsList, getUnreadCount, markNotificationRead, markAllNotificationsRead, getUserLanguage, setUserLanguage } from '../lib/api.js';
import { debounce, getAvatarColor } from './utils.js';

function roleLabel(role) {
  if (role === 'admin') return 'Admin';
  if (role === 'student') return 'Student';
  return 'Counselor';
}

export function renderHeader(user = null) {
  const header = document.getElementById('top-header');
  if (!header) return;

  const role = user?.role || 'admin';
  const canCreateLead = role !== 'student';

  header.innerHTML = `
    <div class="header-left">
      <button class="header-menu-toggle" id="menu-toggle" title="Toggle sidebar"><i data-lucide="menu" style="width:18px;height:18px;"></i></button>
      <div class="header-search-wrap">
        <i data-lucide="search" class="header-search-icon"></i>
        <input type="text" placeholder="Search leads, applications, students..." class="header-search-input" id="global-search" />
        <div id="search-results" class="search-results-overlay"></div>
      </div>
      <div class="header-breadcrumb" id="header-breadcrumb">
        <span>RBMI Hub</span>
        <span style="opacity:0.4;margin:0 4px;">/</span>
        <span id="breadcrumb-page">${role === 'student' ? 'My Application' : 'Dashboard'}</span>
      </div>
    </div>
    <div class="header-right">
      <button class="header-btn" id="btn-dark-mode" title="Toggle dark mode"><i data-lucide="moon" style="width:18px;height:18px;"></i></button>
      
      <div class="language-switcher" style="position: relative;">
        <button class="header-btn" id="btn-lang-switcher" title="Change Language" style="display: flex; align-items: center; gap: 4px; border: none; background: transparent; cursor: pointer;">
          <i data-lucide="globe" style="width:18px;height:18px;"></i>
          <span id="current-lang-code" style="font-size: 11px; font-weight: 700; text-transform: uppercase;">EN</span>
        </button>
        <div class="lang-dropdown" id="lang-dropdown" style="display: none; position: absolute; top: 100%; right: 0; margin-top: 8px; background: var(--color-bg-card); border: 1px solid var(--color-border); border-radius: 8px; width: 150px; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1); z-index: 1000; padding: 4px 0;">
          <a href="#" class="lang-option" data-lang="en" style="display: flex; align-items: center; padding: 8px 12px; font-size: 13px; color: var(--color-text); text-decoration: none; justify-content: space-between;">English <span>EN</span></a>
          <a href="#" class="lang-option" data-lang="hi" style="display: flex; align-items: center; padding: 8px 12px; font-size: 13px; color: var(--color-text); text-decoration: none; justify-content: space-between;">हिन्दी <span>HI</span></a>
          <a href="#" class="lang-option" data-lang="ur" style="display: flex; align-items: center; padding: 8px 12px; font-size: 13px; color: var(--color-text); text-decoration: none; justify-content: space-between;">اردो <span>UR</span></a>
          <a href="#" class="lang-option" data-lang="pa" style="display: flex; align-items: center; padding: 8px 12px; font-size: 13px; color: var(--color-text); text-decoration: none; justify-content: space-between;">ਪੰਜਾਬੀ <span>PA</span></a>
          <a href="#" class="lang-option" data-lang="bn" style="display: flex; align-items: center; padding: 8px 12px; font-size: 13px; color: var(--color-text); text-decoration: none; justify-content: space-between;">বাংলা <span>BN</span></a>
        </div>
      </div>

      <button class="header-btn" id="btn-notifications" title="Notifications" style="position: relative;">
        <i data-lucide="bell" style="width:18px;height:18px;"></i>
        <span class="notification-badge" id="notif-unread-badge" style="display: none; position: absolute; top: 2px; right: 2px; background: #ef4444; color: #fff; border-radius: 50%; width: 14px; height: 14px; font-size: 9px; font-weight: bold; align-items: center; justify-content: center;">0</span>
      </button>

      <div class="header-divider"></div>
      ${canCreateLead ? `
      <button class="btn btn-primary header-add-btn" id="btn-add-lead">
        <span style="font-size:16px;margin-right:4px;">+</span> ${role === 'admin' ? 'Add Lead' : 'New Lead'}
      </button>
      ` : `
      <button class="btn btn-primary header-add-btn" id="btn-portal-action">
        Request callback
      </button>
      `}
      <div class="header-user-chip">
        <div class="header-avatar">${user ? user.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() : 'AD'}</div>
        <span class="header-username">${user ? user.name.split(' ')[0] : 'Admin'}</span>
        <span class="header-role-badge ${role}">${roleLabel(role)}</span>
      </div>
    </div>
  `;

  const breadcrumbMap = {
    '/dashboard': 'Command Center',
    '/leads': 'Leads Manager',
    '/pipeline': 'Admission Pipeline',
    '/counselors': 'Counselors',
    '/courses': 'Programs',
    '/reports': 'Reports',
    '/settings': 'Settings',
    '/formdesk': 'FormDesk',
    '/calendar': 'Calendar',
    '/applications': 'Applications',
    '/marketing': 'Marketing',
    '/campaigns': 'Campaigns',
    '/queries': 'Help Desk',
    '/payments': 'Fee Desk',
    '/templates': 'Templates',
    '/ai-assistant': 'Asha AI',
    '/integrations': 'Integrations',
    '/access-control': 'Access Control',
    '/audit-log': 'Audit Log',
    '/portal': 'My Application',
    '/download': 'Mobile App',
    '/sqi': 'Student Quality Index',
    '/user-dashboard': 'Productivity Report',
    '/admission-tests': 'Admission Tests',
    '/scholarships': 'Scholarships',
    '/batches': 'Batch Management',
    '/lead-distribution': 'Lead Distribution',
    '/notifications': 'Notifications',
    '/form-builder': 'Form Builder',
    '/call-logs': 'Call Logs',
    '/student-inbox': 'Student Inbox'
  };

  function updateBreadcrumb() {
    const hash = window.location.hash.slice(1) || (role === 'student' ? '/portal' : '/dashboard');
    const el = document.getElementById('breadcrumb-page');
    if (el) el.textContent = breadcrumbMap[hash] || hash.slice(1);
  }

  updateBreadcrumb();
  window.addEventListener('hashchange', updateBreadcrumb);

  document.getElementById('menu-toggle')?.addEventListener('click', () => {
    document.getElementById('sidebar')?.classList.toggle('collapsed');
    document.getElementById('main-wrapper')?.classList.toggle('sidebar-collapsed');
  });

  const searchInput = document.getElementById('global-search');
  const searchResults = document.getElementById('search-results');

  if (searchInput && searchResults) {
    searchInput.addEventListener('input', debounce(async (e) => {
      const query = e.target.value.trim();
      if (query.length < 2) {
        searchResults.classList.remove('active');
        return;
      }

      try {
        const res = await fetchLeads({ search: query, limit: 5 });
        const leads = res.data || [];
        
        if (leads.length === 0) {
          searchResults.innerHTML = '<div style="padding:16px;text-align:center;color:var(--color-text-muted);font-size:13px;">No results found</div>';
        } else {
          searchResults.innerHTML = leads.map(l => `
            <div class="search-result-item" data-id="${l.id}">
              <div class="avatar-sm" style="background:${getAvatarColor(l.name)};width:30px;height:30px;font-size:10px;">
                ${l.name.split(' ').map(n => n[0]).join('')}
              </div>
              <div class="search-result-info">
                <div class="search-result-name">${l.name}</div>
                <div class="search-result-meta">${l.course_name} • ${l.stage}</div>
              </div>
            </div>
          `).join('');
        }
        searchResults.classList.add('active');

        searchResults.querySelectorAll('.search-result-item').forEach(item => {
          item.addEventListener('click', () => {
            const id = item.dataset.id;
            // For demo, we'll just redirect to leads page or show a toast
            window.location.hash = '/leads';
            searchResults.classList.remove('active');
            searchInput.value = '';
          });
        });
      } catch (err) {
        console.error('Search error:', err);
      }
    }, 300));

    document.addEventListener('click', (e) => {
      if (!searchInput.contains(e.target) && !searchResults.contains(e.target)) {
        searchResults.classList.remove('active');
      }
    });
  }

  // ---- Dark Mode Toggle (no CSS transitions — instant switch) ----
  const darkBtn = document.getElementById('btn-dark-mode');
  if (darkBtn) {
    const updateDarkIcon = () => {
      const isDark = document.documentElement.classList.contains('dark-mode');
      darkBtn.innerHTML = `<i data-lucide="${isDark ? 'sun' : 'moon'}" style="width:18px;height:18px;"></i>`;
      setTimeout(window.renderIcons, 0);
    };
    darkBtn.addEventListener('click', () => {
      // Suppress all CSS transitions momentarily to prevent
      // broken CSS-variable->value interpolation on <html> class toggle
      const root = document.documentElement;
      root.style.transition = 'none';
      root.classList.toggle('dark-mode');
      // Force reflow so the class change takes effect before un-suppressing
      void root.offsetHeight;
      root.style.transition = '';
      const isDark = root.classList.contains('dark-mode');
      localStorage.setItem('rbmi_dark_mode', isDark ? 'true' : 'false');
      updateDarkIcon();
    });
    updateDarkIcon();
  }

  // ---- Notifications Handling ----
  async function updateUnreadBadge() {
    try {
      const res = await getUnreadCount();
      const badge = document.getElementById('notif-unread-badge');
      if (badge) {
        if (res && res.count > 0) {
          badge.textContent = res.count;
          badge.style.display = 'flex';
        } else {
          badge.style.display = 'none';
        }
      }
    } catch (err) {
      console.error('Failed to update unread badge:', err);
    }
  }

  // Update badge immediately
  updateUnreadBadge();

  document.getElementById('btn-notifications')?.addEventListener('click', async () => {
    try {
      const notifications = await fetchNotificationsList();
      const content = `
        <div style="display:flex;flex-direction:column;gap:12px;max-height:400px;overflow-y:auto;padding-right:4px;" id="modal-notif-list">
          ${notifications.length === 0 ? `
            <div style="text-align:center;padding:24px;color:var(--color-text-muted);">
              <i data-lucide="bell-off" style="width:32px;height:32px;margin-bottom:8px;opacity:0.5;display:inline-block;"></i>
              <p>No notifications yet</p>
            </div>
          ` : notifications.map(n => `
            <div class="notif-item-row" data-id="${n.id}" style="display:flex;gap:12px;padding:10px;border-radius:6px;background:${n.read ? 'transparent' : 'var(--color-bg-page)'};border:1px solid ${n.read ? 'transparent' : 'var(--color-border)'};align-items:flex-start;position:relative;">
              <span class="notif-dot ${n.read ? '' : 'new'}" style="width:8px;height:8px;border-radius:50%;background:#ef4444;margin-top:6px;flex-shrink:0;visibility:${n.read ? 'hidden' : 'visible'};"></span>
              <div style="flex-grow:1;">
                <div style="font-weight:600;font-size:13px;color:var(--color-text);">${n.title}</div>
                <div style="font-size:12px;color:var(--color-text-muted);margin-top:2px;">${n.message}</div>
                <div style="font-size:10px;color:var(--color-text-muted);margin-top:6px;opacity:0.8;">${new Date(n.created_at).toLocaleString()}</div>
              </div>
              ${!n.read ? `<button class="btn-mark-read-item" data-id="${n.id}" style="background:transparent;border:none;color:var(--color-primary);font-size:11px;cursor:pointer;flex-shrink:0;padding:2px 4px;font-weight:600;">Mark read</button>` : ''}
            </div>
          `).join('')}
        </div>
      `;

      openModal('Notifications', content, {
        submitLabel: 'Mark All Read',
        width: '440px',
        onSubmit: async () => {
          try {
            await markAllNotificationsRead();
            await updateUnreadBadge();
            return true;
          } catch (err) {
            console.error('Failed to mark all read:', err);
          }
        }
      });

      // Hook up individual mark read buttons
      setTimeout(() => {
        document.querySelectorAll('.btn-mark-read-item').forEach(btn => {
          btn.addEventListener('click', async (e) => {
            e.preventDefault();
            const notifId = btn.dataset.id;
            try {
              await markNotificationRead(notifId);
              const row = btn.closest('.notif-item-row');
              if (row) {
                row.style.background = 'transparent';
                row.style.borderColor = 'transparent';
                const dot = row.querySelector('.notif-dot');
                if (dot) dot.style.visibility = 'hidden';
              }
              btn.remove();
              await updateUnreadBadge();
            } catch (err) {
              console.error('Failed to mark item read:', err);
            }
          });
        });
        window.renderIcons?.();
      }, 50);

    } catch (err) {
      console.error('Failed to load notifications:', err);
    }
  });

  // ---- Language Switcher Handling ----
  const langBtn = document.getElementById('btn-lang-switcher');
  const langDropdown = document.getElementById('lang-dropdown');
  const currentLangCode = document.getElementById('current-lang-code');

  if (langBtn && langDropdown && currentLangCode) {
    langBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      langDropdown.style.display = langDropdown.style.display === 'none' ? 'block' : 'none';
    });

    document.addEventListener('click', () => {
      if (langDropdown) langDropdown.style.display = 'none';
    });

    langDropdown.querySelectorAll('.lang-option').forEach(opt => {
      opt.addEventListener('click', async (e) => {
        e.preventDefault();
        const code = opt.dataset.lang;
        currentLangCode.textContent = code;
        try {
          await setUserLanguage({ language: code });
          window.dispatchEvent(new CustomEvent('rbmi:language-changed', { detail: code }));
        } catch (err) {
          console.error('Failed to set language:', err);
        }
      });
    });

    // Load initial user language preference
    getUserLanguage().then(res => {
      if (res && res.language) {
        currentLangCode.textContent = res.language;
      }
    }).catch(err => console.error(err));
  }

  document.getElementById('btn-portal-action')?.addEventListener('click', async () => {
    if (role === 'student') {
      const btn = document.getElementById('btn-portal-action');
      const oldText = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Requesting...';
      try {
        await updatePortalProfile({ next_step: 'Callback requested via portal header' });
        alert('Callback requested! A counselor will call you shortly.');
        window.dispatchEvent(new CustomEvent('rbmi:refresh'));
      } catch (e) {
        alert('Failed to request callback: ' + e.message);
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.textContent = oldText;
        }
      }
    } else {
      window.location.hash = '/portal';
      window.dispatchEvent(new CustomEvent('rbmi:refresh'));
    }
  });

  document.getElementById('btn-add-lead')?.addEventListener('click', async () => {
    let counselors = [];
    let courses = [];
    try {
      [counselors, courses] = await Promise.all([fetchCounselors(), fetchCourses()]);
    } catch (e) {
      // Keep modal usable even if lookups fail.
    }

    const sources = ['Website', 'Walk-in', 'Referral', 'Social Media', 'Education Fair', 'Google Ads', 'Phone Inquiry', 'JustDial', 'Shiksha', 'CollegeDekho'];
    const content = `
      <div class="form-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
        <div class="form-group"><label class="form-label">First Name *</label><input type="text" id="nl-fname" class="form-input" placeholder="First name" required /></div>
        <div class="form-group"><label class="form-label">Last Name</label><input type="text" id="nl-lname" class="form-input" placeholder="Last name" /></div>
        <div class="form-group"><label class="form-label">Phone *</label><input type="tel" id="nl-phone" class="form-input" placeholder="+91 XXXXX XXXXX" required /></div>
        <div class="form-group"><label class="form-label">Email</label><input type="email" id="nl-email" class="form-input" placeholder="email@example.com" /></div>
        <div class="form-group"><label class="form-label">City</label><input type="text" id="nl-city" class="form-input" placeholder="Bareilly, Lucknow..." /></div>
        <div class="form-group"><label class="form-label">Source</label><select id="nl-source" class="form-input">${sources.map(s => `<option value="${s}">${s}</option>`).join('')}</select></div>
        <div class="form-group"><label class="form-label">Course of Interest</label><select id="nl-course" class="form-input"><option value="">-- Select Course --</option>${courses.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}</select></div>
        <div class="form-group"><label class="form-label">Assign Counselor</label><select id="nl-counselor" class="form-input"><option value="">-- Unassigned --</option>${counselors.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}</select></div>
        <div class="form-group"><label class="form-label">Priority</label><select id="nl-priority" class="form-input"><option value="medium">Medium</option><option value="high">High</option><option value="low">Low</option></select></div>
        <div class="form-group" style="grid-column:1/-1;"><label class="form-label">Notes</label><textarea id="nl-notes" class="form-input" rows="2" placeholder="Any additional notes..."></textarea></div>
      </div>
      <div id="nl-error" style="color:#dc2626;font-size:13px;margin-top:8px;display:none;"></div>
    `;

    openModal('Add New Lead', content, {
      submitLabel: 'Create Lead',
      width: '640px',
      onSubmit: async (body) => {
        const fname = body.querySelector('#nl-fname').value.trim();
        const phone = body.querySelector('#nl-phone').value.trim();
        const errEl = body.querySelector('#nl-error');
        if (!fname || !phone) {
          errEl.textContent = 'First name and phone are required.';
          errEl.style.display = 'block';
          return false;
        }
        try {
          await createLead({
            first_name: fname,
            last_name: body.querySelector('#nl-lname').value.trim(),
            phone,
            email: body.querySelector('#nl-email').value.trim(),
            city: body.querySelector('#nl-city').value.trim(),
            source: body.querySelector('#nl-source').value,
            course_id: body.querySelector('#nl-course').value || null,
            counselor_id: body.querySelector('#nl-counselor').value || null,
            priority: body.querySelector('#nl-priority').value,
            notes: body.querySelector('#nl-notes').value.trim()
          });
          window.dispatchEvent(new CustomEvent('rbmi:refresh'));
        } catch (err) {
          errEl.textContent = err.message;
          errEl.style.display = 'block';
          return false;
        }
      }
    });
  });
}
