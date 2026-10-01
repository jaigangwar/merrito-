// ===== ROUTER =====
import { getCurrentUser } from './lib/auth.js';

const routes = {};
let currentRoute = null;

const ROUTE_PERMISSIONS = {
  admin: ['*'],
  counselor: [
    '/dashboard', '/leads', '/pipeline', '/applications', '/courses',
    '/calendar', '/queries', '/marketing', '/ai-assistant', '/download',
    '/user-dashboard', '/sqi', '/admission-tests', '/scholarships',
    '/batches', '/notifications', '/lead-distribution', '/call-logs', 
    '/student-inbox', '/chat-sessions', '/drip-campaigns'
  ],
  student: [
    '/portal', '/applications', '/courses', '/queries', '/payments',
    '/ai-assistant', '/download', '/admission-tests', '/scholarships',
    '/notifications', '/student-inbox'
  ]
};

export function registerRoute(path, handler) {
  routes[path] = handler;
}

export function navigateTo(path) {
  window.location.hash = path;
}

export function getCurrentRoute() {
  return currentRoute;
}

function runLucide() {
  if (window.renderIcons) window.renderIcons();
}

function checkAccess(user, path) {
  if (!user) return false;
  const role = user.role || 'admin';
  const allowed = ROUTE_PERMISSIONS[role] || [];
  if (allowed.includes('*')) return true;
  return allowed.includes(path);
}

let routerInitialized = false;

export function initRouter() {
  if (routerInitialized) {
    // Just trigger a route handle for the new state
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    return;
  }

  function handleRoute() {
    const user = getCurrentUser();
    let hash = window.location.hash.slice(1) || '';
    
    // Default routes based on role
    if (!hash) {
      hash = user?.role === 'student' ? '/portal' : '/dashboard';
    }

    // Permission Check
    if (user && !checkAccess(user, hash)) {
      console.warn(`Access denied to ${hash} for role ${user.role}. Redirecting...`);
      const redirect = user.role === 'student' ? '/portal' : '/dashboard';
      if (hash !== redirect) {
        window.location.hash = redirect;
        return;
      }
    }

    currentRoute = hash;
    const el = document.getElementById('page-content');
    if (!el) return;

    let handler = routes[hash];
    
    // Dynamic route matching (e.g. /form/:id)
    if (!handler) {
      for (const [routePath, routeHandler] of Object.entries(routes)) {
        if (routePath.includes('/:')) {
          const regexPath = routePath.replace(/:[^\s/]+/g, '([\\w-]+)');
          const regex = new RegExp(`^${regexPath}$`);
          if (hash.match(regex)) {
            handler = routeHandler;
            break;
          }
        }
      }
    }

    if (!handler) {
      el.innerHTML = `<div style="text-align:center;padding:4rem;"><h2>404</h2><p style="color:var(--color-text-muted);margin-top:8px;">Page not found</p><button class="btn btn-primary" style="margin-top:16px;" onclick="window.location.hash='/dashboard'">Back to Safety</button></div>`;
      runLucide();
      return;
    }

    el.style.opacity = '0.7'; // Subtle transition
    Promise.resolve(handler(el)).then(() => {
      el.style.opacity = '1';
      runLucide();
      setTimeout(runLucide, 150);
    }).catch(err => {
      console.error('Route handler error:', err);
      el.style.opacity = '1';
      el.innerHTML = `<div class="error-state"><h3>Something went wrong</h3><p>${err.message}</p><button class="btn btn-primary" onclick="location.reload()">Reload Application</button></div>`;
      runLucide();
    });
  }

  window.addEventListener('hashchange', handleRoute);
  handleRoute();
  window.addEventListener('rbmi:refresh', handleRoute);
  routerInitialized = true;
}
