// ===== RBMI Admission Hub =====
import './styles/index.css';
import './styles/sidebar.css';
import './styles/components.css';
import './styles/darkmode.css';
import './styles/dashboard.css';
import './styles/leads.css';
import './styles/pipeline.css';
import './styles/counselors.css';
import './styles/courses.css';
import './styles/reports.css';
import './styles/marketing.css';
import './styles/login.css';
import './styles/sqi.css';
import './styles/userDashboard.css';
import './styles/admissions.css';
import './styles/callLogs.css';
import './styles/studentInbox.css';
import { registerRoute, initRouter } from './router.js';
import { renderSidebar } from './components/sidebar.js';
import { renderHeader } from './components/header.js';
import { renderDashboard } from './pages/dashboard.js';
import { renderLeads } from './pages/leads.js';
import { renderPipeline } from './pages/pipeline.js';
import { renderCounselors } from './pages/counselors.js';
import { renderCourses } from './pages/courses.js';
import { renderReports } from './pages/reports.js';
import { renderSettings } from './pages/settings.js';
import { renderApplications } from './pages/applications.js';
import { renderQueries } from './pages/queries.js';
import { renderPayments } from './pages/payments.js';
import { renderStudentPortal } from './pages/studentPortal.js';
import { renderMarketing } from './pages/marketing.js';
import { renderAccessControl, renderAiAssistant, renderCalendar, renderCampaigns, renderFormDesk, renderIntegrations, renderMobileApp, renderTemplates } from './pages/platformSections.js';
import { renderAuditLog } from './pages/auditLog.js';
import { renderStudentQualityIndex } from './pages/studentQualityIndex.js';
import { renderUserDashboard } from './pages/userDashboard.js';
import { formBuilderPage } from './pages/formBuilder.js';
import { publicFormPage } from './pages/publicForm.js';
import { renderAdmissionTests } from './pages/admissionTests.js';
import { renderScholarships } from './pages/scholarships.js';
import { renderBatches } from './pages/batches.js';
import { renderLeadDistribution } from './pages/leadDistribution.js';
import { renderNotifications } from './pages/notifications.js';
import { renderCallLogs } from './pages/callLogs.js';
import { renderStudentInbox } from './pages/studentInbox.js';
import { renderChatSessions } from './pages/chatSessions.js';
import { renderDripCampaigns } from './pages/dripCampaigns.js';
import { getCurrentUser } from './lib/auth.js';
import { API_BASE } from './lib/api.js';
import { showLogin, showSignup, showUpdatePassword } from './pages/login.js';
import { createIcons } from './lib/icons.js';
import { getSupabase } from './lib/supabase.js';

// ---- Dark Mode Initialization ----
function initDarkMode() {
  const saved = localStorage.getItem('rbmi_dark_mode');
  if (saved === 'true') {
    document.documentElement.classList.add('dark-mode');
  } else if (saved === null && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    document.documentElement.classList.add('dark-mode');
    localStorage.setItem('rbmi_dark_mode', 'true');
  }
}
initDarkMode();

window.renderIcons = () => createIcons(document);

const routes = [
  ['/dashboard', renderDashboard],
  ['/leads', renderLeads],
  ['/pipeline', renderPipeline],
  ['/counselors', renderCounselors],
  ['/courses', renderCourses],
  ['/reports', renderReports],
  ['/settings', renderSettings],
  ['/portal', renderStudentPortal],
  ['/formdesk', renderFormDesk],
  ['/calendar', renderCalendar],
  ['/applications', renderApplications],
  ['/marketing', renderMarketing],
  ['/campaigns', renderCampaigns],
  ['/queries', renderQueries],
  ['/payments', renderPayments],
  ['/templates', renderTemplates],
  ['/access-control', renderAccessControl],
  ['/download', renderMobileApp],
  ['/ai-assistant', renderAiAssistant],
  ['/integrations', renderIntegrations],
  ['/audit-log', renderAuditLog],
  ['/sqi', renderStudentQualityIndex],
  ['/user-dashboard', renderUserDashboard],
  ['/form-builder', formBuilderPage],
  ['/form/:id', publicFormPage],
  ['/admission-tests', renderAdmissionTests],
  ['/scholarships', renderScholarships],
  ['/batches', renderBatches],
  ['/lead-distribution', renderLeadDistribution],
  ['/notifications', renderNotifications],
  ['/call-logs', renderCallLogs],
  ['/student-inbox', renderStudentInbox],
  ['/chat-sessions', renderChatSessions],
  ['/drip-campaigns', renderDripCampaigns]
];
routes.forEach(([path, fn]) => registerRoute(path, fn));

function hideBoot(cb) {
  const el = document.getElementById('boot');
  if (!el) {
    cb();
    return;
  }
  setTimeout(() => {
    el.style.opacity = '0';
    setTimeout(() => {
      el.remove();
      cb();
    }, 500);
  }, 600);
}

function startApp(user) {
  if (user?.role === 'student' && (!window.location.hash || window.location.hash === '#/dashboard')) {
    window.location.hash = '/portal';
  }
  document.getElementById('app').classList.add('show');
  renderSidebar(user);
  renderHeader(user);
  window.renderIcons();
  initRouter();
}

function saveSession(payload, branch) {
  sessionStorage.setItem('rbmi_v', '5');
  sessionStorage.setItem('rbmi_user', JSON.stringify({ ...payload.user, branch: payload.user.branch || branch }));
  sessionStorage.setItem('rbmi_token', payload.token);
}

async function handleAuthCallback() {
  const hashParams = new URLSearchParams(window.location.hash.slice(1));
  const searchParams = new URLSearchParams(window.location.search);

  // Check for OAuth error responses from provider or Supabase
  const authError = searchParams.get('error_description') || searchParams.get('error') || hashParams.get('error_description') || hashParams.get('error');
  if (authError) {
    console.error('Auth callback received error:', authError);
    sessionStorage.setItem('rbmi_auth_error', authError);
    return false;
  }

  const hasToken = hashParams.has('access_token') || searchParams.has('code');
  if (!hasToken) return false;

  try {
    const supabase = getSupabase();
    if (supabase) {
      // Google OAuth uses the PKCE `code` flow on hosted deployments. Make
      // the exchange explicit before reading the session; otherwise a new
      // Google user can arrive at the callback with no client session yet.
      const oauthCode = searchParams.get('code');
      if (oauthCode) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(oauthCode);
        if (exchangeError) throw exchangeError;
      }

      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;

      if (data?.session?.access_token) {
        const urlParams = new URLSearchParams(window.location.search);
        const branch = urlParams.get('branch') || localStorage.getItem('rbmi_selected_branch') || 'bareilly';

        const res = await fetch(`${API_BASE}/auth/supabase`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ access_token: data.session.access_token })
        });
        const responseText = await res.text();
        let payload;
        try {
          payload = JSON.parse(responseText);
        } catch {
          payload = { error: responseText || `Authentication request failed (${res.status})` };
        }
        if (!res.ok) throw new Error(payload.error || 'Authentication failed');

        saveSession(payload, branch);
        
        // Check for password recovery
        const initialHashParams = new URLSearchParams(window.location.hash.slice(1));
        if (initialHashParams.get('type') === 'recovery' || window.location.hash.includes('reset-password')) {
          window.location.href = `${window.location.origin}/#/reset-password`;
          return true;
        }

        // Clean redirection to root with hash
        const targetHash = payload.user.role === 'student' ? '#/portal' : '#/dashboard';
        window.location.href = `${window.location.origin}/${targetHash}`;
        return true;
      }
    }
  } catch (err) {
    console.error('Auth callback error:', err);
    sessionStorage.setItem('rbmi_auth_error', err.message || 'Authentication failed');
  }
  return false;
}

function handleLoginSuccess(payload, branch) {
  saveSession(payload, branch);
  startApp({ ...payload.user, branch: payload.user.branch || branch });
}

function showSignupPage() {
  showSignup({ onSuccess: handleLoginSuccess, onLoginClick: showLoginPage });
}

function showLoginPage() {
  showLogin({ onSuccess: handleLoginSuccess, onSignupClick: showSignupPage });
}

function showUpdatePasswordPage() {
  showUpdatePassword({
    onSuccess: () => {
      window.location.href = window.location.origin;
    },
    onCancel: () => {
      window.location.href = window.location.origin;
    }
  });
}

setTimeout(() => {
  hideBoot(async () => {
    const hash = window.location.hash.slice(1);
    const hashParams = new URLSearchParams(hash);
    const searchParams = new URLSearchParams(window.location.search);
    const user = getCurrentUser();

    // Check if we are on the /auth/callback route without any tokens (e.g. reload or back button)
    const hasAuthParams = searchParams.has('code') || searchParams.has('error') || hashParams.has('access_token');
    if (window.location.pathname.endsWith('/auth/callback') && !hasAuthParams) {
      console.log('Landing on callback without params, redirecting...');
      const targetHash = user ? (user.role === 'student' ? '#/portal' : '#/dashboard') : '';
      window.location.href = `${window.location.origin}/${targetHash}`;
      return;
    }

    if (hasAuthParams) {
      const success = await handleAuthCallback();
      if (!success) {
        console.warn('Auth callback failed. Redirecting to root...');
        window.location.href = window.location.origin;
      }
      return;
    }

    if (user) {
      if (window.location.hash === '#/reset-password') {
        showUpdatePasswordPage();
      } else {
        startApp(user);
      }
    } else if (window.location.hash === '#/signup') {
      showSignupPage();
    } else if (window.location.hash === '#/reset-password') {
      // If not logged in but trying to reset, they shouldn't be here, send to login
      showLoginPage();
    } else {
      showLoginPage();
    }
  });
}, 1800);
