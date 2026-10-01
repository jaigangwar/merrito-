import { API_BASE } from '../lib/api.js';
import { getSupabase } from '../lib/supabase.js';

// ─── Shared background / 3D scaffolding ──────────────────────────────────────
function buildBackground() {
  return `
    <!-- Cursor glow -->
    <div class="lp-cursor-glow" id="lp-cursor-glow"></div>

    <!-- Animated background -->
    <div class="lp-bg-canvas">
      <div class="lp-grid"></div>
      <div class="lp-orb lp-orb-1"></div>
      <div class="lp-orb lp-orb-2"></div>
      <div class="lp-orb lp-orb-3"></div>
    </div>

    <!-- Floating particles -->
    <div class="lp-particles" id="lp-particles"></div>
  `;
}

function buildLeftPanel(title, subtitle, stats) {
  return `
    <div class="lp-left">
      <div class="lp-brand">
        <div class="lp-logo-wrap">
          <div class="lp-logo-ring"></div>
          <div class="lp-logo-inner">
            <img src="/logo.png" alt="RBMI Logo" />
          </div>
        </div>
        <div>
          <div class="lp-brand-name">RBMI Admission Hub</div>
          <div class="lp-brand-sub">Admissions, applications and student journeys</div>
        </div>
      </div>

      <div class="lp-hero">
        <h1>${title}</h1>
        <p>${subtitle}</p>
        <div class="lp-stats">
          ${stats.map(s => `
            <div class="lp-stat">
              <span class="ls-n">${s.n}</span>
              <span class="ls-l">${s.l}</span>
            </div>
          `).join('')}
        </div>
      </div>

      <div class="lp-branches">
        <div class="lp-branch">
          <div class="lp-branch-icon">📍</div>
          <div><strong>Bareilly Campus</strong><small>Pilibhit Bypass Road, Bareilly, UP</small></div>
        </div>
        <div class="lp-branch">
          <div class="lp-branch-icon">📍</div>
          <div><strong>Greater Noida Campus</strong><small>Knowledge Park, Greater Noida, UP</small></div>
        </div>
      </div>
    </div>
  `;
}

// ─── 3D effects initialiser ───────────────────────────────────────────────────
function init3DEffects() {
  const root = document.getElementById('login-root');

  // ── Mouse-tracking cursor glow ──
  const glow = document.getElementById('lp-cursor-glow');
  if (glow && root) {
    root.addEventListener('mousemove', (e) => {
      glow.style.left = e.clientX + 'px';
      glow.style.top  = e.clientY + 'px';
    }, { passive: true });
  }

  // ── Floating particles ──
  const container = document.getElementById('lp-particles');
  if (container) {
    for (let i = 0; i < 30; i++) {
      const p = document.createElement('div');
      p.className = 'lp-particle';
      const size     = Math.random() * 3 + 1;
      const left     = Math.random() * 100;
      const duration = Math.random() * 14 + 8;
      const delay    = -(Math.random() * 20);
      const colors   = [
        'rgba(129,140,248,0.7)',
        'rgba(99,102,241,0.6)',
        'rgba(79,70,229,0.65)',
        'rgba(255,255,255,0.3)'
      ];
      const color = colors[Math.floor(Math.random() * colors.length)];
      p.style.cssText = `
        left:${left}%;
        width:${size}px;
        height:${size}px;
        background:${color};
        animation-duration:${duration}s;
        animation-delay:${delay}s;
      `;
      container.appendChild(p);
    }
  }

  // ── 3D card tilt (DISABLED BY REQUEST) ──
  // const wrap = document.querySelector('.lp-card-3d-wrap');
  // const card = document.querySelector('.lp-card-3d');
  // if (wrap && card) {
  //   wrap.addEventListener('mousemove', (e) => {
  //     const rect = wrap.getBoundingClientRect();
  //     const x = (e.clientX - rect.left) / rect.width  - 0.5;
  //     const y = (e.clientY - rect.top)  / rect.height - 0.5;
  //     card.style.transform = `rotateX(${-y * 12}deg) rotateY(${x * 12}deg) translateZ(10px)`;
  //   }, { passive: true });
  //   wrap.addEventListener('mouseleave', () => {
  //     card.style.transform = 'rotateX(0deg) rotateY(0deg) translateZ(0)';
  //   });
  // }

  // ── Radial hover glow on demo buttons ──
  document.querySelectorAll('.lp-demo').forEach(btn => {
    btn.addEventListener('mousemove', (e) => {
      const r = btn.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width  * 100).toFixed(1);
      const y = ((e.clientY - r.top)  / r.height * 100).toFixed(1);
      btn.style.background = `radial-gradient(circle at ${x}% ${y}%, rgba(99,102,241,0.22), rgba(255,255,255,0.05) 70%)`;
    }, { passive: true });
    btn.addEventListener('mouseleave', () => { btn.style.background = ''; });
  });

  // ── Input focus glow ──
  document.querySelectorAll('.lp-input').forEach(input => {
    input.addEventListener('focus', () => {
      input.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.22), 0 0 24px rgba(99,102,241,0.12)';
    });
    input.addEventListener('blur', () => { input.style.boxShadow = ''; });
  });
}

// ─── LOGIN ────────────────────────────────────────────────────────────────────
export function showLogin({ onSuccess, onSignupClick }) {
  const root = document.getElementById('login-root');
  const showDemoLogin = import.meta.env.VITE_SHOW_DEMO_LOGIN !== 'false';
  root.classList.add('show');

  root.innerHTML = `
    ${buildBackground()}
    <div class="lp">
      ${buildLeftPanel(
        'Admissions<br/>That Move',
        'Run leads, applications, fee checkpoints and student communication from one focused enrollment workspace.',
        [
          { n: '2',    l: 'Campuses' },
          { n: '500+', l: 'Leads/Year' },
          { n: '95%',  l: 'Follow-up Rate' }
        ]
      )}

      <div class="lp-right">
        <div class="lp-card-3d-wrap">
          <div class="lp-card-3d">
            <div class="lp-card">

              <div class="lp-card-logo">
                <div class="lp-card-logo-img">
                  <img src="/logo.png" alt="RBMI Logo" />
                </div>
                <div class="lp-card-logo-text">
                  <strong>RBMI Admission Hub</strong>
                  <span>Admin, counselor and student panels</span>
                </div>
              </div>

              <h2 class="lp-title">Sign in to your account</h2>
              <div id="lerr" class="lp-err"></div>

              <button id="lgoogle" class="lp-btn lp-btn-google">
                <img src="https://upload.wikimedia.org/wikipedia/commons/c/c1/Google_%22G%22_logo.svg" style="width:18px;height:18px;"/>
                Sign in with Google
              </button>

              <div class="lp-div"><span>Or with email</span></div>

              <form id="lform" class="lp-form">
                <div class="lp-group">
                  <label>Campus</label>
                  <select id="lbranch" class="lp-input">
                    <option value="bareilly">📍 Bareilly Campus</option>
                    <option value="greater_noida">📍 Greater Noida Campus</option>
                  </select>
                </div>
                <div class="lp-group">
                  <label>Email</label>
                  <input type="email" id="lemail" class="lp-input" placeholder="admin@rbmi.edu.in" required />
                </div>
                <div class="lp-group">
                  <div style="display:flex; justify-content:space-between; align-items:center;">
                    <label>Password</label>
                    <a href="#" id="lforgot" style="font-size:12px; color:#a5b4fc; text-decoration:none;">Forgot password?</a>
                  </div>
                  <input type="password" id="lpass" class="lp-input" placeholder="Enter password" required />
                </div>
                <button type="submit" class="lp-btn" id="lbtn">Sign In</button>
              </form>

              <!-- Forgot Password Form (Hidden by default) -->
              <form id="lforgot-form" class="lp-form" style="display: none;">
                <p style="font-size:13px; color:#94a3b8; margin-bottom:15px; line-height:1.4;">Enter your email address and we'll send you a link to reset your password.</p>
                <div class="lp-group">
                  <label>Email</label>
                  <input type="email" id="lf-email" class="lp-input" placeholder="admin@rbmi.edu.in" required />
                </div>
                <button type="submit" class="lp-btn" id="lf-btn">Send Reset Link</button>
                <button type="button" class="lp-btn" id="lf-cancel" style="margin-top:10px; background:rgba(255,255,255,0.05); color:#cbd5e1;">Cancel</button>
              </form>

              ${showDemoLogin ? `
              <div class="lp-div"><span>Quick Demo</span></div>
              <div class="lp-demos">
                <button class="lp-demo" data-e="admin@rbmi.edu.in" data-p="admin123">
                  <span class="lp-badge admin">Admin</span>
                  <div><div class="lp-demo-name">Admin RBMI</div><div class="lp-demo-email">admin@rbmi.edu.in</div></div>
                </button>
                <button class="lp-demo" data-e="priya@rbmi.edu.in" data-p="counselor123">
                  <span class="lp-badge counselor">Counselor</span>
                  <div><div class="lp-demo-name">Neha Khan</div><div class="lp-demo-email">priya@rbmi.edu.in</div></div>
                </button>
                <button class="lp-demo" data-e="rajesh@rbmi.edu.in" data-p="counselor123">
                  <span class="lp-badge counselor">Counselor</span>
                  <div><div class="lp-demo-name">Rajesh Kumar</div><div class="lp-demo-email">rajesh@rbmi.edu.in</div></div>
                </button>
                <button class="lp-demo" data-e="student@demo.in" data-p="student123">
                  <span class="lp-badge student">Student</span>
                  <div><div class="lp-demo-name">krishna jaiswal</div><div class="lp-demo-email">student@demo.in</div></div>
                </button>
              </div>` : ''}

              <div class="lp-footer-link">
                <span>Student? </span><a href="#/signup" id="go-signup">Create your account</a>
              </div>

            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  setTimeout(() => {
    window.renderIcons?.();
    init3DEffects();
  }, 0);

  // Demo fill
  root.querySelectorAll('.lp-demo').forEach(b => {
    b.addEventListener('click', () => {
      document.getElementById('lemail').value = b.dataset.e;
      document.getElementById('lpass').value  = b.dataset.p;
    });
  });

  // Google login
  document.getElementById('lgoogle')?.addEventListener('click', () => {
    const branch = document.getElementById('lbranch').value;
    const supabase = getSupabase();
    if (supabase) {
      supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback?branch=${branch}`,
          queryParams: { access_type: 'offline', prompt: 'consent' }
        }
      });
    } else {
      const err = document.getElementById('lerr');
      err.textContent = 'Google login needs Supabase credentials.';
      err.style.display = 'block';
    }
  });

  // Email login
  document.getElementById('lform').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email  = document.getElementById('lemail').value.trim();
    const pass   = document.getElementById('lpass').value;
    const branch = document.getElementById('lbranch').value;
    const err    = document.getElementById('lerr');
    const btn    = document.getElementById('lbtn');
    err.style.display = 'none';
    btn.disabled = true;
    btn.textContent = 'Signing in...';
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: pass, branch })
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || 'Invalid credentials');
      onSuccess(payload, branch);
      root.classList.remove('show');
      root.innerHTML = '';
    } catch (ex) {
      err.textContent = '⚠ ' + ex.message;
      err.style.display = 'block';
      btn.disabled = false;
      btn.textContent = 'Sign In';
    }
  });

  document.getElementById('go-signup')?.addEventListener('click', (e) => {
    e.preventDefault();
    onSignupClick();
  });

  // Forgot Password Toggle
  const loginForm = document.getElementById('lform');
  const forgotForm = document.getElementById('lforgot-form');
  const errDiv = document.getElementById('lerr');

  document.getElementById('lforgot')?.addEventListener('click', (e) => {
    e.preventDefault();
    errDiv.style.display = 'none';
    loginForm.style.display = 'none';
    forgotForm.style.display = 'flex';
  });

  document.getElementById('lf-cancel')?.addEventListener('click', () => {
    errDiv.style.display = 'none';
    forgotForm.style.display = 'none';
    loginForm.style.display = 'flex';
  });

  // Forgot Password Submit
  forgotForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('lf-email').value.trim();
    const btn = document.getElementById('lf-btn');
    errDiv.style.display = 'none';
    btn.disabled = true;
    btn.textContent = 'Sending...';

    try {
      const supabase = getSupabase();
      if (!supabase) throw new Error('Supabase is not configured.');
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/#/reset-password`
      });
      if (error) throw error;
      
      errDiv.style.color = '#86efac'; // Green success message
      errDiv.textContent = 'Reset link sent! Please check your email.';
      errDiv.style.display = 'block';
      setTimeout(() => {
        errDiv.style.color = ''; // Reset color
        errDiv.style.display = 'none';
        forgotForm.style.display = 'none';
        loginForm.style.display = 'flex';
      }, 4000);
    } catch (ex) {
      errDiv.style.color = '#f87171'; // Red error
      errDiv.textContent = '⚠ ' + ex.message;
      errDiv.style.display = 'block';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Send Reset Link';
    }
  });
}

// ─── UPDATE PASSWORD ──────────────────────────────────────────────────────────
export function showUpdatePassword({ onSuccess, onCancel }) {
  const root = document.getElementById('login-root');
  root.classList.add('show');

  root.innerHTML = `
    ${buildBackground()}
    <div class="lp" style="justify-content: center;">
      <div class="lp-right" style="width: 100%; max-width: 420px; display:flex; justify-content:center;">
        <div class="lp-card">
          <div class="lp-card-logo">
            <div class="lp-card-logo-img"><img src="/logo.png" alt="RBMI Logo" /></div>
            <div class="lp-card-logo-text"><strong>RBMI Admission Hub</strong><span>Password Reset</span></div>
          </div>
          <h2 class="lp-title" style="margin-bottom:10px;">Set New Password</h2>
          <p style="font-size:13px; color:#94a3b8; margin-bottom:20px;">Please enter your new password below.</p>
          <div id="lerr" class="lp-err"></div>

          <form id="lupdate-form" class="lp-form">
            <div class="lp-group">
              <label>New Password</label>
              <input type="password" id="lu-pass" class="lp-input" placeholder="Enter new password" required minlength="6" />
            </div>
            <button type="submit" class="lp-btn" id="lu-btn">Update Password</button>
            <button type="button" class="lp-btn" id="lu-cancel" style="margin-top:10px; background:rgba(255,255,255,0.05); color:#cbd5e1;">Cancel</button>
          </form>
        </div>
      </div>
    </div>
  `;

  document.getElementById('lu-cancel')?.addEventListener('click', onCancel);

  document.getElementById('lupdate-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const pass = document.getElementById('lu-pass').value;
    const btn = document.getElementById('lu-btn');
    const errDiv = document.getElementById('lerr');
    errDiv.style.display = 'none';
    btn.disabled = true;
    btn.textContent = 'Updating...';

    try {
      const supabase = getSupabase();
      if (!supabase) throw new Error('Supabase not configured');
      const { data, error } = await supabase.auth.updateUser({ password: pass });
      if (error) throw error;
      
      errDiv.style.color = '#86efac';
      errDiv.textContent = 'Password updated successfully!';
      errDiv.style.display = 'block';
      setTimeout(() => {
        onSuccess(data.user);
      }, 1500);
    } catch (ex) {
      errDiv.style.color = '#f87171';
      errDiv.textContent = '⚠ ' + ex.message;
      errDiv.style.display = 'block';
      btn.disabled = false;
      btn.textContent = 'Update Password';
    }
  });
}


// ─── SIGNUP ───────────────────────────────────────────────────────────────────
export function showSignup({ onSuccess, onLoginClick }) {
  const root = document.getElementById('login-root');
  root.classList.add('show');

  root.innerHTML = `
    ${buildBackground()}
    <div class="lp">
      ${buildLeftPanel(
        'Start Your<br/>Journey',
        'Create your student account to track applications, documents, fees and communicate with your counselor.',
        [
          { n: '8+',   l: 'Programs' },
          { n: '2',    l: 'Campuses' },
          { n: '100%', l: 'Online Process' }
        ]
      )}

      <div class="lp-right">
        <div class="lp-card-3d-wrap">
          <div class="lp-card-3d">
            <div class="lp-card">

              <div class="lp-card-logo">
                <div class="lp-card-logo-img">
                  <img src="/logo.png" alt="RBMI Logo" />
                </div>
                <div class="lp-card-logo-text">
                  <strong>Student Registration</strong>
                  <span>Create your student account</span>
                </div>
              </div>

              <h2 class="lp-title">Create Account</h2>
              <div id="serr" class="lp-err"></div>

              <form id="sform" class="lp-form">
                <div class="lp-group">
                  <label>Full Name</label>
                  <input type="text" id="sname" class="lp-input" placeholder="Rahul Sharma" required />
                </div>
                <div class="lp-group">
                  <label>Email</label>
                  <input type="email" id="semail" class="lp-input" placeholder="rahul@gmail.com" required />
                </div>
                <div class="lp-group">
                  <label>Phone</label>
                  <input type="tel" id="sphone" class="lp-input" placeholder="+91 98765 43210" />
                </div>
                <div class="lp-group">
                  <label>Campus</label>
                  <select id="sbranch" class="lp-input">
                    <option value="bareilly">📍 Bareilly Campus</option>
                    <option value="greater_noida">📍 Greater Noida Campus</option>
                  </select>
                </div>
                <div class="lp-group">
                  <label>Password</label>
                  <input type="password" id="spass" class="lp-input" placeholder="Min 6 characters" required minlength="6" />
                </div>
                <div class="lp-group">
                  <label>Confirm Password</label>
                  <input type="password" id="spass2" class="lp-input" placeholder="Re-enter password" required />
                </div>
                <button type="submit" class="lp-btn" id="sbtn">Create Account</button>
              </form>

              <div class="lp-footer-link">
                <span>Already have an account? </span><a href="#/login" id="go-login">Sign in</a>
              </div>

            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  setTimeout(() => {
    window.renderIcons?.();
    init3DEffects();
  }, 0);

  document.getElementById('sform').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name   = document.getElementById('sname').value.trim();
    const email  = document.getElementById('semail').value.trim();
    const phone  = document.getElementById('sphone').value.trim();
    const branch = document.getElementById('sbranch').value;
    const pass   = document.getElementById('spass').value;
    const pass2  = document.getElementById('spass2').value;
    const err    = document.getElementById('serr');
    const btn    = document.getElementById('sbtn');
    err.style.display = 'none';

    if (pass !== pass2) {
      err.textContent = '⚠ Passwords do not match';
      err.style.display = 'block';
      return;
    }
    if (pass.length < 6) {
      err.textContent = '⚠ Password must be at least 6 characters';
      err.style.display = 'block';
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Creating account...';
    try {
      const res = await fetch(`${API_BASE}/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: pass, name, phone, branch })
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || 'Signup failed');
      onSuccess(payload, branch);
      root.classList.remove('show');
      root.innerHTML = '';
    } catch (ex) {
      err.textContent = '⚠ ' + ex.message;
      err.style.display = 'block';
      btn.disabled = false;
      btn.textContent = 'Create Account';
    }
  });

  document.getElementById('go-login')?.addEventListener('click', (e) => {
    e.preventDefault();
    onLoginClick();
  });
}
