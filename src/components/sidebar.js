// ===== SIDEBAR COMPONENT - RBMI Admission Hub =====
import { navigateTo } from '../router.js';
import { logout } from '../lib/auth.js';

// Items that have sub-nav are marked with `children`
const adminNavItems = [
  { route: '/dashboard', icon: 'layout-dashboard', label: 'Dashboard', children: [
    { route: '/dashboard', label: 'Admin Dashboard' },
    { route: '/user-dashboard', label: 'User Dashboard' },
    { route: '/sqi', label: 'Student Quality Index' }
  ]},
  { route: '/leads', icon: 'users', label: 'Leads Manager' },
  { route: '/pipeline', icon: 'git-branch', label: 'Admission Pipeline' },
  { route: '/counselors', icon: 'headphones', label: 'Counselors' },
  { route: '/call-logs', icon: 'phone', label: 'Call Logs' },
  { route: '/chat-sessions', icon: 'message-circle', label: 'Live Chat' },
  { route: '/courses', icon: 'book-open', label: 'Programs' },
  { route: '/reports', icon: 'bar-chart-3', label: 'Reports' },
  { route: '/formdesk', icon: 'file-text', label: 'FormDesk' },
  { route: '/calendar', icon: 'calendar', label: 'Calendar Pro' },
  { route: '/applications', icon: 'file-input', label: 'Applications' },
  { route: '/payments', icon: 'indian-rupee', label: 'Payments' },
  { route: '/admission-tests', icon: 'award', label: 'Admission Tests' },
  { route: '/scholarships', icon: 'graduation-cap', label: 'Scholarships' },
  { route: '/batches', icon: 'users', label: 'Batches' },
  { route: '/lead-distribution', icon: 'git-merge', label: 'Lead Distribution' },
  { route: '/notifications', icon: 'bell', label: 'Notifications' },
  { route: '/student-inbox', icon: 'inbox', label: 'Student Inbox' },
  { route: '/queries', icon: 'help-circle', label: 'Queries' },
  { route: '/marketing', icon: 'megaphone', label: 'Marketing' },
  { route: '/drip-campaigns', icon: 'layers', label: 'Drip Campaigns' },
  { route: '/campaigns', icon: 'target', label: 'Campaigns' },
  { route: '/templates', icon: 'layout-template', label: 'Templates' },
  { route: '/ai-assistant', icon: 'sparkles', label: 'Asha AI' },
  { route: '/integrations', icon: 'puzzle', label: 'Integrations' },
  { route: '/access-control', icon: 'shield-check', label: 'Access Control' },
  { route: '/audit-log', icon: 'scroll-text', label: 'Audit Log' },
  { route: '/download', icon: 'smartphone', label: 'Download App' },
  { route: '/settings', icon: 'settings', label: 'Settings' }
];

const counselorNavItems = [
  { route: '/dashboard', icon: 'layout-dashboard', label: 'My Desk', children: [
    { route: '/dashboard', label: 'Admin Dashboard' },
    { route: '/user-dashboard', label: 'Counselor Dashboard' },
    { route: '/sqi', label: 'Student Quality Index' }
  ]},
  { route: '/leads', icon: 'users', label: 'My Leads' },
  { route: '/pipeline', icon: 'git-branch', label: 'Pipeline' },
  { route: '/applications', icon: 'file-input', label: 'Applications' },
  { route: '/courses', icon: 'book-open', label: 'Programs' },
  { route: '/calendar', icon: 'calendar', label: 'Calendar' },
  { route: '/call-logs', icon: 'phone', label: 'Call Logs' },
  { route: '/chat-sessions', icon: 'message-circle', label: 'Live Chat' },
  { route: '/admission-tests', icon: 'award', label: 'Admission Tests' },
  { route: '/scholarships', icon: 'graduation-cap', label: 'Scholarships' },
  { route: '/batches', icon: 'users', label: 'Batches' },
  { route: '/lead-distribution', icon: 'git-merge', label: 'Lead Distribution' },
  { route: '/notifications', icon: 'bell', label: 'Notifications' },
  { route: '/student-inbox', icon: 'inbox', label: 'Student Inbox' },
  { route: '/queries', icon: 'help-circle', label: 'Queries' },
  { route: '/marketing', icon: 'megaphone', label: 'Engagement' },
  { route: '/drip-campaigns', icon: 'layers', label: 'Drip Campaigns' },
  { route: '/ai-assistant', icon: 'sparkles', label: 'Asha AI' },
  { route: '/download', icon: 'smartphone', label: 'Mobile App' }
];

const studentNavItems = [
  { route: '/portal', icon: 'home', label: 'My Application' },
  { route: '/applications', icon: 'file-input', label: 'Applications' },
  { route: '/admission-tests', icon: 'award', label: 'Admission Tests' },
  { route: '/scholarships', icon: 'graduation-cap', label: 'Scholarships' },
  { route: '/notifications', icon: 'bell', label: 'Notifications' },
  { route: '/student-inbox', icon: 'inbox', label: 'My Messages' },
  { route: '/courses', icon: 'book-open', label: 'Explore Programs' },
  { route: '/queries', icon: 'help-circle', label: 'Help Desk' },
  { route: '/payments', icon: 'indian-rupee', label: 'Fee Desk' },
  { route: '/ai-assistant', icon: 'sparkles', label: 'Asha AI' },
  { route: '/download', icon: 'smartphone', label: 'Mobile App' }
];

function roleLabel(role) {
  if (role === 'admin') return 'Administrator';
  if (role === 'student') return 'Student Portal';
  return 'Counselor';
}

function renderNavItem(item, currentHash) {
  if (item.children) {
    const childRoutes = item.children.map(c => c.route);
    const isExpanded = childRoutes.includes(currentHash);
    const isParentActive = childRoutes.includes(currentHash);
    return `
      <div class="nav-group ${isExpanded ? 'expanded' : ''}">
        <a class="nav-item nav-group-toggle ${isParentActive ? 'active' : ''}" data-group-toggle>
          <i data-lucide="${item.icon}" style="width:20px;height:20px;flex-shrink:0;"></i>
          <span>${item.label}</span>
          <i data-lucide="chevron-down" class="nav-chevron" style="width:16px;height:16px;margin-left:auto;flex-shrink:0;"></i>
        </a>
        <div class="sub-nav">
          ${item.children.map(child => `
            <a class="nav-item sub-nav-item ${currentHash === child.route ? 'active' : ''}" data-route="${child.route}" href="#${child.route}">
              <span>${child.label}</span>
            </a>
          `).join('')}
        </div>
      </div>
    `;
  }
  return `
    <a class="nav-item ${currentHash === item.route ? 'active' : ''}" data-route="${item.route}" href="#${item.route}">
      <i data-lucide="${item.icon}" style="width:20px;height:20px;flex-shrink:0;"></i>
      <span>${item.label}</span>
    </a>
  `;
}

export function renderSidebar(user = null) {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;

  const role = user?.role || 'admin';
  const navItems = role === 'student' ? studentNavItems : role === 'admin' ? adminNavItems : counselorNavItems;

  let initials = 'AD';
  if (user && user.name) {
    initials = user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  }

  const branchLabel = user?.branch === 'greater_noida' ? 'Greater Noida' : 'Bareilly';
  const currentHash = window.location.hash.slice(1) || (role === 'student' ? '/portal' : '/dashboard');

  sidebar.innerHTML = `
    <div class="sidebar-logo">
      <div class="logo-icon">
        <img src="/logo.png" alt="RBMI Logo" style="width:64px;height:64px;object-fit:contain;border-radius:50%;background:transparent;transform:scale(1.06);" onerror="this.onerror=null;this.style.display='none';this.parentNode.innerHTML='<div style=\\'width:60px;height:60px;border-radius:50%;background:linear-gradient(135deg,#14b8a6,#2563eb);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:900;font-size:18px;\\'>RBMI</div>';" />
      </div>
      <div class="logo-text">
        <span class="logo-name">RBMI Hub</span>
        ${role === 'admin' ? `
          <select id="campus-switcher" class="campus-select">
            <option value="bareilly" ${user?.branch === 'bareilly' ? 'selected' : ''}>Bareilly Campus</option>
            <option value="greater_noida" ${user?.branch === 'greater_noida' ? 'selected' : ''}>Greater Noida</option>
          </select>
        ` : `
          <span class="logo-sub">${branchLabel} - ${roleLabel(role)}</span>
        `}
      </div>
    </div>

    <div class="sidebar-search">
      <div class="sidebar-search-box">
        <i data-lucide="search" style="width:16px;height:16px;color:#94a3b8;flex-shrink:0;"></i>
        <input type="text" id="sidebar-search-input" placeholder="Search menu..." />
      </div>
    </div>

    <nav class="sidebar-nav" id="sidebar-nav">
      ${navItems.map(item => renderNavItem(item, currentHash)).join('')}
    </nav>

    <div class="sidebar-footer">
      <div class="sidebar-user">
        <div class="user-avatar-sm">${initials}</div>
        <div class="user-info">
          <span class="user-name">${user ? user.name : 'Admin'}</span>
          <span class="user-role">${roleLabel(role)}</span>
        </div>
        <button class="user-menu-btn" id="logout-btn" title="Logout"><i data-lucide="log-out" style="width:18px;height:18px;"></i></button>
      </div>
    </div>
  `;

  function setActive() {
    const hash = window.location.hash.slice(1) || (role === 'student' ? '/portal' : '/dashboard');
    sidebar.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    // Activate direct nav items
    const match = sidebar.querySelector(`.nav-item[data-route="${hash}"]`);
    if (match) match.classList.add('active');
    // Activate parent group toggle if child is active
    sidebar.querySelectorAll('.nav-group').forEach(group => {
      const hasActive = group.querySelector(`.sub-nav-item[data-route="${hash}"]`);
      if (hasActive) {
        group.classList.add('expanded');
        group.querySelector('.nav-group-toggle')?.classList.add('active');
      }
    });
  }

  setActive();
  if (!window.sidebarListenerAdded) {
    window.addEventListener('hashchange', setActive);
    window.sidebarListenerAdded = true;
  }

  // Click handlers for nav items (not group toggles)
  sidebar.querySelectorAll('.nav-item[data-route]').forEach(item => {
    item.addEventListener('click', (event) => {
      event.preventDefault();
      navigateTo(item.dataset.route);
    });
  });

  // Group toggle handlers
  sidebar.querySelectorAll('[data-group-toggle]').forEach(toggle => {
    toggle.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const group = toggle.closest('.nav-group');
      if (group) {
        group.classList.toggle('expanded');
      }
    });
  });

  document.getElementById('sidebar-search-input')?.addEventListener('input', (event) => {
    const q = event.target.value.toLowerCase();
    sidebar.querySelectorAll('.nav-item:not(.nav-group-toggle)').forEach(item => {
      const label = item.textContent.toLowerCase();
      item.style.display = label.includes(q) ? '' : 'none';
    });
    // Also show/hide groups
    sidebar.querySelectorAll('.nav-group').forEach(group => {
      const label = group.textContent.toLowerCase();
      group.style.display = label.includes(q) ? '' : 'none';
    });
  });

  document.getElementById('logout-btn')?.addEventListener('click', () => {
    logout();
  });

  document.getElementById('campus-switcher')?.addEventListener('change', (e) => {
    const branch = e.target.value;
    const currentUser = JSON.parse(sessionStorage.getItem('rbmi_user') || '{}');
    sessionStorage.setItem('rbmi_user', JSON.stringify({ ...currentUser, branch }));
    window.location.reload();
  });

  if (window.renderIcons) {
    window.renderIcons();
  }
}
