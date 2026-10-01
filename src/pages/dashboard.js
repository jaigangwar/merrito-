// ===== DASHBOARD PAGE — API-connected =====
import { fetchDashboardStats, fetchActivities, fetchTasks, updateTask } from '../lib/api.js';
import { createLineChart, createDoughnutChart, createBarChart } from '../components/charts.js';
import { getAvatarColor } from '../components/utils.js';

let dashboardDataCache = null;
let dashboardDataCacheTime = 0;
const DASHBOARD_CACHE_MS = 12000;

const STAGE_META = [
  { id: 'enquiry', label: 'Enquiry', color: '#8b5cf6' },
  { id: 'counseling_scheduled', label: 'Counseling Scheduled', color: '#3b82f6' },
  { id: 'counseling_done', label: 'Counseling Done', color: '#06b6d4' },
  { id: 'application_submitted', label: 'Application Submitted', color: '#f59e0b' },
  { id: 'documents_verified', label: 'Documents Verified', color: '#f97316' },
  { id: 'admitted', label: 'Admitted', color: '#10b981' },
  { id: 'enrolled', label: 'Enrolled', color: '#059669' }
];

function renderSkeleton() {
  return `
    <div class="dashboard-page">
      <div class="page-header">
        <div>
          <h1 class="page-title">Dashboard</h1>
          <p class="page-subtitle">Loading your admissions overview...</p>
        </div>
      </div>
      <div class="kpi-grid">
        ${Array(4).fill('<div class="kpi-card skeleton-card"><div class="skeleton-block"></div></div>').join('')}
      </div>
      <div class="charts-row">
        <div class="chart-card chart-card-wide skeleton-card"><div class="skeleton-block" style="height:260px;"></div></div>
        <div class="chart-card skeleton-card"><div class="skeleton-block" style="height:260px;"></div></div>
      </div>
    </div>
  `;
}

function taskTone(task) {
  if (task.status === 'completed') return 'ok';
  if (new Date(task.due_date) < new Date()) return 'bad';
  return 'warn';
}

export async function renderDashboard(container) {
  container.innerHTML = renderSkeleton();

  const user = JSON.parse(sessionStorage.getItem('rbmi_user') || '{}');

  try {
    const now = Date.now();
    let stats;
    let activities;
    let tasks;
    if (dashboardDataCache && now - dashboardDataCacheTime < DASHBOARD_CACHE_MS) {
      stats = dashboardDataCache.stats;
      activities = dashboardDataCache.activities;
      tasks = dashboardDataCache.tasks;
    } else {
      stats = await fetchDashboardStats();
      const [activitiesResult, tasksResult] = await Promise.allSettled([
        fetchActivities(7),
        fetchTasks({ status: 'pending' })
      ]);
      activities = activitiesResult.status === 'fulfilled' ? activitiesResult.value : [];
      tasks = tasksResult.status === 'fulfilled' ? tasksResult.value : [];
      dashboardDataCache = { stats, activities, tasks };
      dashboardDataCacheTime = now;
    }

    const activityIcons = {
      lead_added: 'user-plus', stage_change: 'arrow-right-circle', counseling: 'message-circle',
      application: 'file-text', enrollment: 'check-circle', document: 'file-check', note: 'edit-3'
    };
    const pendingTasks = [...(tasks || [])].sort((a, b) => new Date(a.due_date) - new Date(b.due_date)).slice(0, 8);
    const overdueCount = pendingTasks.filter(task => new Date(task.due_date) < new Date()).length;
    const counselorStats = Array.isArray(stats.counselorStats) ? stats.counselorStats : [];

    container.innerHTML = `
      <div class="dashboard-page">
        <div class="page-header">
          <div>
            <h1 class="page-title">Dashboard</h1>
            <p class="page-subtitle">Welcome back! Here's your admissions overview.</p>
          </div>
          <div class="header-actions">
            ${user.role === 'admin' ? `
              <select id="dashboard-counselor-select" class="form-input" style="font-size:13px;padding:6px 12px;width:200px;margin-right:12px;border-radius:8px;">
                <option value="">All Counselors</option>
                ${counselorStats.map(c => `<option value="${c.id}">${c.name || c.email}</option>`).join('')}
              </select>
            ` : ''}
            <div class="date-badge">
              <i data-lucide="calendar"></i>
              <span>${new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
            </div>
          </div>
        </div>

        <!-- KPI Cards -->
        <div class="kpi-grid">
          <div class="kpi-card animate-fade-in stagger-1" id="kpi-total-leads">
            <div class="kpi-icon" style="background: var(--color-primary-light); color: var(--color-primary);">
              <i data-lucide="users"></i>
            </div>
            <div class="kpi-content">
              <span class="kpi-value">${stats.totalLeads}</span>
              <span class="kpi-label">Total Leads</span>
            </div>
            <div class="kpi-trend trend-up"><i data-lucide="trending-up"></i><span>+12.5%</span></div>
          </div>
          <div class="kpi-card animate-fade-in stagger-2" id="kpi-active-apps">
            <div class="kpi-icon" style="background: var(--color-info-light); color: var(--color-info);">
              <i data-lucide="file-text"></i>
            </div>
            <div class="kpi-content">
              <span class="kpi-value">${stats.activeApplications}</span>
              <span class="kpi-label">Active Applications</span>
            </div>
            <div class="kpi-trend trend-up"><i data-lucide="trending-up"></i><span>+8.3%</span></div>
          </div>
          <div class="kpi-card animate-fade-in stagger-3" id="kpi-admissions">
            <div class="kpi-icon" style="background: var(--color-success-light); color: var(--color-success);">
              <i data-lucide="user-check"></i>
            </div>
            <div class="kpi-content">
              <span class="kpi-value">${stats.admissions}</span>
              <span class="kpi-label">Admissions</span>
            </div>
            <div class="kpi-trend trend-up"><i data-lucide="trending-up"></i><span>+18.2%</span></div>
          </div>
          <div class="kpi-card animate-fade-in stagger-4" id="kpi-conversion">
            <div class="kpi-icon" style="background: var(--color-warning-light); color: var(--color-warning);">
              <i data-lucide="target"></i>
            </div>
            <div class="kpi-content">
              <span class="kpi-value">${stats.conversionRate}%</span>
              <span class="kpi-label">Conversion Rate</span>
            </div>
            <div class="kpi-trend trend-up"><i data-lucide="trending-up"></i><span>+4.1%</span></div>
          </div>
        </div>

        <!-- Charts Row -->
        <div class="charts-row">
          <div class="chart-card chart-card-wide animate-fade-in stagger-3">
            <div class="chart-header">
              <h3 class="chart-title">Lead Trends</h3>
              <span class="chart-subtitle">Last 6 months</span>
            </div>
            <div class="chart-body"><canvas id="chart-lead-trends"></canvas></div>
          </div>
          <div class="chart-card animate-fade-in stagger-4">
            <div class="chart-header">
              <h3 class="chart-title">Lead Funnel</h3>
              <span class="chart-subtitle">Conversion journey</span>
            </div>
            <div class="chart-body chart-body-doughnut"><canvas id="chart-funnel"></canvas></div>
          </div>
        </div>

        <!-- Pipeline + Activity -->
        <div class="charts-row">
          <div class="chart-card chart-card-wide animate-fade-in stagger-5">
            <div class="chart-header">
              <h3 class="chart-title">Pipeline Overview</h3>
              <span class="chart-subtitle">Stage-wise distribution</span>
            </div>
            <div class="chart-body"><canvas id="chart-pipeline"></canvas></div>
          </div>
          <div class="chart-card animate-fade-in stagger-6">
            <div class="chart-header">
              <h3 class="chart-title">Recent Activity</h3>
              <span class="chart-subtitle">Latest updates</span>
            </div>
            <div class="activity-feed">
              ${activities.map(a => {
                const icon = activityIcons[a.type] || 'activity';
                const timeAgo = getTimeAgo(a.created_at);
                return `
                <div class="activity-item">
                  <div class="activity-icon-wrap"><i data-lucide="${icon}"></i></div>
                  <div class="activity-content">
                    <p class="activity-msg">${a.message}</p>
                    <span class="activity-time">${timeAgo}</span>
                  </div>
                </div>`;
              }).join('')}
            </div>
          </div>
        </div>

        <!-- Follow-up Control -->
        <div class="chart-card animate-fade-in">
          <div class="chart-header">
            <div>
              <h3 class="chart-title">Follow-up Control</h3>
              <span class="chart-subtitle">${overdueCount} overdue, ${pendingTasks.length} pending</span>
            </div>
          </div>
          <div class="task-control-list">
            ${pendingTasks.length ? pendingTasks.map(task => `
              <div class="task-control-item">
                <div>
                  <strong>${task.title}</strong>
                  <small>${task.lead_name || 'Lead'} - due ${new Date(task.due_date).toLocaleString('en-IN')}</small>
                </div>
                <div class="task-control-actions">
                  <span class="ops-badge ${taskTone(task)}">${new Date(task.due_date) < new Date() ? 'overdue' : task.type || 'follow-up'}</span>
                  <button class="btn btn-secondary btn-sm dashboard-task-done" data-id="${task.id}">Done</button>
                </div>
              </div>
            `).join('') : '<div class="ops-empty">No pending follow-ups</div>'}
          </div>
        </div>

        <!-- Top Counselors -->
        <div class="chart-card animate-fade-in">
          <div class="chart-header">
            <h3 class="chart-title">Top Performing Counselors</h3>
            <span class="chart-subtitle">By conversion rate</span>
          </div>
          <div class="counselor-table-wrap">
            <table class="data-table">
              <thead>
                <tr><th>Counselor</th><th>Department</th><th>Leads Assigned</th><th>Conversions</th><th>Conv. Rate</th><th>Rating</th></tr>
              </thead>
              <tbody id="leaderboard-tbody">
                ${counselorStats.sort((a, b) => {
                  const rateA = a.leads_assigned > 0 ? a.conversions / a.leads_assigned : 0;
                  const rateB = b.leads_assigned > 0 ? b.conversions / b.leads_assigned : 0;
                  return rateB - rateA;
                }).map(c => {
                  const rate = c.leads_assigned > 0 ? ((c.conversions / c.leads_assigned) * 100).toFixed(1) : '0.0';
                  const counselorName = c.name || c.email || 'Counselor';
                  const initials = counselorName.split(' ').map(n => n[0]).join('');
                  return `
                  <tr>
                    <td>
                      <div class="table-user">
                        <div class="avatar-sm" style="background:${getAvatarColor(counselorName)}">${initials}</div>
                        <div><div class="table-user-name">${counselorName}</div><div class="table-user-sub">${c.role || 'Counselor'}</div></div>
                      </div>
                    </td>
                    <td>${c.department || 'Admissions'}</td>
                    <td><span class="number-cell">${c.leads_assigned}</span></td>
                    <td><span class="number-cell">${c.conversions}</span></td>
                    <td>
                      <div class="rate-bar">
                        <div class="progress-bar"><div class="rate-fill" style="width:${rate}%;background:var(--color-primary);"></div></div>
                        <span>${rate}%</span>
                      </div>
                    </td>
                    <td><div class="rating-badge"><i data-lucide="star" style="width:14px;height:14px;fill:#f59e0b;color:#f59e0b;"></i> ${c.rating}</div></td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    window.renderIcons();

    // Done button event handler
    container.querySelectorAll('.dashboard-task-done').forEach(btn => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        await updateTask(btn.dataset.id, { status: 'completed' });
        dashboardDataCache = null;
        renderDashboard(container);
      });
    });

    // Setup filter event handler for Admin
    const cSelector = container.querySelector('#dashboard-counselor-select');
    if (cSelector) {
      cSelector.addEventListener('change', async () => {
        const cId = cSelector.value;
        try {
          const filteredStats = await fetchDashboardStats(cId);
          updateDashboardUI(filteredStats);
        } catch (e) {
          console.error('Failed to filter dashboard stats:', e);
        }
      });
    }

    // Function to update stats and charts on selection change
    function updateDashboardUI(statsData) {
      container.querySelector('#kpi-total-leads .kpi-value').textContent = statsData.totalLeads;
      container.querySelector('#kpi-active-apps .kpi-value').textContent = statsData.activeApplications;
      container.querySelector('#kpi-admissions .kpi-value').textContent = statsData.admissions;
      container.querySelector('#kpi-conversion .kpi-value').textContent = statsData.conversionRate + '%';

      renderCharts(statsData);
    }

    // Render charts helper
    function renderCharts(statsData) {
      createLineChart('chart-lead-trends', statsData.monthly.labels, [
        { label: 'Enquiries', data: statsData.monthly.enquiries, color: '#6366f1', bgColor: 'rgba(99,102,241,0.08)', fill: true },
        { label: 'Admissions', data: statsData.monthly.admissions, color: '#10b981', bgColor: 'rgba(16,185,129,0.08)', fill: true },
        { label: 'Enrollments', data: statsData.monthly.enrollments, color: '#f59e0b', bgColor: 'rgba(245,158,11,0.08)', fill: true }
      ]);

      const stageLabels = STAGE_META.map(s => s.label);
      const stageValues = STAGE_META.map(s => statsData.stageDistribution[s.id] || 0);
      const stageColors = STAGE_META.map(s => s.color);
      
      createDoughnutChart('chart-funnel', stageLabels, stageValues, stageColors);

      createBarChart('chart-pipeline', stageLabels, stageValues, stageColors, {
        indexAxis: 'x',
        plugins: { legend: { display: false } }
      });
    }

    // Initial render charts
    setTimeout(() => renderCharts(stats), 100);

  } catch (err) {
    container.innerHTML = `
      <div class="dashboard-page">
        <div class="page-header"><div><h1 class="page-title">Dashboard</h1></div></div>
        <div class="error-state">
          <i data-lucide="alert-triangle" style="width:48px;height:48px;color:var(--color-danger);"></i>
          <h3>Failed to load dashboard</h3>
          <p>${err.message}</p>
          <p style="color:var(--color-text-muted);margin-top:0.5rem;">Make sure the API server is running: <code>npm run server</code></p>
          <button class="btn btn-primary" onclick="location.reload()" style="margin-top:1rem;">Retry</button>
        </div>
      </div>
    `;
    window.renderIcons();
  }
}

function getTimeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr${hrs > 1 ? 's' : ''} ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days > 1 ? 's' : ''} ago`;
}
