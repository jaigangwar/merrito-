// ===== REPORTS & ANALYTICS PAGE — API-connected =====
import { fetchDashboardStats, fetchCounselors, exportLeadsCSV, generateReport, scheduleReport } from '../lib/api.js';
import { createLineChart, createBarChart, createDoughnutChart, createHorizontalBarChart } from '../components/charts.js';
import { openModal } from '../components/modal.js';

const STAGE_META = [
  { id: 'enquiry', label: 'Enquiry', color: '#8b5cf6' },
  { id: 'counseling_scheduled', label: 'Counseling Scheduled', color: '#3b82f6' },
  { id: 'counseling_done', label: 'Counseling Done', color: '#06b6d4' },
  { id: 'application_submitted', label: 'Application Submitted', color: '#f59e0b' },
  { id: 'documents_verified', label: 'Documents Verified', color: '#f97316' },
  { id: 'admitted', label: 'Admitted', color: '#10b981' },
  { id: 'enrolled', label: 'Enrolled', color: '#059669' }
];

export async function renderReports(container) {
  container.innerHTML = `<div class="reports-page"><div class="page-header"><div><h1 class="page-title">Reports & Analytics</h1><p class="page-subtitle">Loading reports...</p></div></div></div>`;

  try {
    const [stats, counselors] = await Promise.all([fetchDashboardStats(), fetchCounselors()]);

    const stageCounts = stats.stageDistribution;
    const maxStage = Math.max(...STAGE_META.map(s => stageCounts[s.id] || 0), 1);
    const priorityCounts = stats.priorityDistribution || { high: 0, medium: 0, low: 0 };

    container.innerHTML = `
      <div class="reports-page" style="display:flex;flex-direction:column;gap:24px;">
        <div class="page-header">
          <div><h1 class="page-title">Reports & Analytics</h1><p class="page-subtitle">Deep dive into your admissions data, performance metrics, and automated scheduling.</p></div>
          <div class="header-actions" style="display:flex;gap:12px;">
            <button class="btn btn-secondary" id="btn-custom-report"><i data-lucide="file-text" style="width:16px;height:16px;"></i> Generate Custom Report</button>
            <button class="btn btn-primary" id="export-btn"><i data-lucide="download" style="width:16px;height:16px;"></i> Export Lead CSV</button>
          </div>
        </div>

        <!-- Conversion Funnel -->
        <div class="chart-card animate-fade-in">
          <div class="chart-header"><h3 class="chart-title">Conversion Funnel</h3><span class="chart-subtitle">Lead progression through admission stages</span></div>
          <div class="funnel-container" style="display:flex;flex-direction:column;gap:10px;padding:20px;">
            ${STAGE_META.map((s, i) => {
              const count = stageCounts[s.id] || 0;
              const width = Math.max(25, (count / maxStage) * 100);
              const prevCount = i > 0 ? (stageCounts[STAGE_META[i-1].id] || 0) : 0;
              const dropoff = i > 0 && prevCount > 0 ? ((prevCount - count) / prevCount * 100).toFixed(1) : null;
              return `
              <div class="funnel-row" style="display:flex;align-items:center;gap:16px;">
                <div class="funnel-label" style="width:180px;font-size:13px;font-weight:600;"><span class="funnel-stage-name">${s.label}</span></div>
                <div class="funnel-bar-wrap" style="flex-grow:1;background:var(--color-bg-page);border-radius:4px;overflow:hidden;height:24px;position:relative;">
                  <div class="funnel-bar" style="width:${width}%;background:${s.color};height:100%;display:flex;align-items:center;padding-left:10px;color:#fff;font-weight:700;font-size:11px;">${count}</div>
                </div>
                ${dropoff !== null && Number(dropoff) > 0 ? `<span class="funnel-dropoff" style="width:80px;font-size:11px;color:#dc2626;font-weight:600;">↓ ${dropoff}% drop</span>` : '<span class="funnel-dropoff" style="width:80px;"></span>'}
              </div>`;
            }).join('')}
          </div>
        </div>

        <!-- Charts Grid -->
        <div class="charts-row" style="display:grid;grid-template-columns:1fr 1fr;gap:24px;">
          <div class="chart-card animate-fade-in">
            <div class="chart-header"><h3 class="chart-title">Monthly Admission Trends</h3><span class="chart-subtitle">Enquiries vs Admissions vs Enrollments</span></div>
            <div class="chart-body" style="height:280px;padding:16px;"><canvas id="chart-monthly-trends"></canvas></div>
          </div>
          <div class="chart-card animate-fade-in">
            <div class="chart-header"><h3 class="chart-title">Source-wise Lead Distribution</h3><span class="chart-subtitle">Where leads are coming from</span></div>
            <div class="chart-body" style="height:280px;padding:16px;"><canvas id="chart-source-bars"></canvas></div>
          </div>
        </div>

        <div class="charts-row" style="display:grid;grid-template-columns:1fr 1fr;gap:24px;">
          <div class="chart-card animate-fade-in">
            <div class="chart-header"><h3 class="chart-title">Counselor Performance</h3><span class="chart-subtitle">Conversion rate by counselor</span></div>
            <div class="chart-body" style="height:280px;padding:16px;"><canvas id="chart-counselor-conv"></canvas></div>
          </div>
          <div class="chart-card animate-fade-in">
            <div class="chart-header"><h3 class="chart-title">Lead Priority Distribution</h3><span class="chart-subtitle">High / Medium / Low</span></div>
            <div class="chart-body chart-body-doughnut" style="height:280px;padding:16px;"><canvas id="chart-priority-dist"></canvas></div>
          </div>
        </div>

        <!-- Key Metrics -->
        <div class="chart-card animate-fade-in">
          <div class="chart-header"><h3 class="chart-title">Key Performance Metrics</h3><span class="chart-subtitle">Summary statistics</span></div>
          <div class="metrics-grid" style="display:grid;grid-template-columns:repeat(auto-fit, minmax(200px, 1fr));gap:16px;padding:20px;">
            ${[
              { label: 'Total Enquiries', value: stats.totalLeads, icon: 'inbox', color: 'var(--color-primary)' },
              { label: 'Active Applications', value: stats.activeApplications, icon: 'file-text', color: '#f59e0b' },
              { label: 'Admissions', value: stats.admissions, icon: 'user-check', color: 'var(--color-success)' },
              { label: 'Conversion Rate', value: stats.conversionRate + '%', icon: 'target', color: '#8b5cf6' },
              { label: 'Counselors Active', value: counselors.length, icon: 'headset', color: 'var(--color-info)' },
              { label: 'Avg. Response Time', value: '2.4 hrs', icon: 'clock', color: '#f97316' }
            ].map(m => `
              <div class="metric-card" style="background:var(--color-bg-card);border:1px solid var(--color-border);border-radius:10px;padding:16px;display:flex;align-items:center;gap:12px;">
                <div class="metric-icon" style="color:${m.color};background:${m.color}15;width:40px;height:40px;border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0;"><i data-lucide="${m.icon}" style="width:20px;height:20px;"></i></div>
                <div><div class="metric-value" style="font-size:18px;font-weight:800;color:var(--color-text);">${m.value}</div><div class="metric-label" style="font-size:11px;color:var(--color-text-muted);">${m.label}</div></div>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Scheduled Automation & Subscriptions -->
        <div class="chart-card animate-fade-in" style="margin-top: 12px;">
          <div class="chart-header" style="display:flex;justify-content:space-between;align-items:center;">
            <div>
              <h3 class="chart-title">Scheduled Automation & Subscriptions</h3>
              <span class="chart-subtitle">Subscribe to automated email reports (Daily / Weekly / Monthly)</span>
            </div>
            <button class="btn btn-secondary btn-sm" id="btn-schedule-report">
              <i data-lucide="alarm-clock" style="width:14px;height:14px;margin-right:6px;"></i> Schedule Report
            </button>
          </div>
          <div class="chart-body" style="padding:20px;">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;" id="schedules-container">
              <div style="border:1px dashed var(--color-border);border-radius:8px;padding:16px;display:flex;align-items:center;gap:12px;background:var(--color-bg-page);">
                <i data-lucide="check-circle" style="color:var(--color-success);width:20px;height:20px;flex-shrink:0;"></i>
                <div>
                  <strong style="font-size:13px;color:var(--color-text);">Weekly Funnel Conversion Audit</strong>
                  <div style="font-size:11px;color:var(--color-text-muted);margin-top:2px;">Sent every Monday to: <strong>dean@rbmi.in</strong></div>
                </div>
              </div>
              <div style="border:1px dashed var(--color-border);border-radius:8px;padding:16px;display:flex;align-items:center;gap:12px;background:var(--color-bg-page);">
                <i data-lucide="check-circle" style="color:var(--color-success);width:20px;height:20px;flex-shrink:0;"></i>
                <div>
                  <strong style="font-size:13px;color:var(--color-text);">Monthly Marketing ROI Report</strong>
                  <div style="font-size:11px;color:var(--color-text-muted);margin-top:2px;">Sent 1st of month to: <strong>admissions@rbmi.in</strong></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    window.renderIcons();

    document.getElementById('export-btn')?.addEventListener('click', () => exportLeadsCSV());

    // Generate Custom Report Button click
    document.getElementById('btn-custom-report')?.addEventListener('click', () => {
      const content = `
        <div class="form-grid" style="display:grid;grid-template-columns:1fr;gap:16px;">
          <p style="font-size:13px;color:var(--color-text-secondary);">Select report type to query the active database and generate an immediate audit preview.</p>
          <div class="form-group">
            <label class="form-label">Report Type</label>
            <select id="rep-type" class="form-input">
              <option value="funnel">Funnel Conversion Audit</option>
              <option value="source">Source Effectiveness Index</option>
              <option value="counselor">Counselor Conversion Performance</option>
              <option value="revenue">Revenue & Fees Ledger Summary</option>
              <option value="cohort">Cohort Enrollment Spread</option>
              <option value="quality">Student Lead Quality Index</option>
            </select>
          </div>
        </div>
      `;

      openModal('Generate Analytics Audit', content, {
        submitLabel: 'Run Audit',
        width: '440px',
        onSubmit: async (body) => {
          const type = body.querySelector('#rep-type').value;
          try {
            const res = await generateReport({ report_type: type });
            showReportPreviewModal(res);
            return true;
          } catch (e) {
            alert('Failed to generate report: ' + e.message);
            return false;
          }
        }
      });
    });

    // Schedule Report Button click
    document.getElementById('btn-schedule-report')?.addEventListener('click', () => {
      const content = `
        <div class="form-grid" style="display:grid;grid-template-columns:1fr;gap:14px;">
          <div class="form-group">
            <label class="form-label">Report Type *</label>
            <select id="sch-rep-type" class="form-input">
              <option value="Funnel Conversion">Funnel Conversion Audit</option>
              <option value="Source Effectiveness">Source Effectiveness Index</option>
              <option value="Counselor Performance">Counselor Performance Audit</option>
              <option value="Revenue Ledger">Revenue & Fees Collection</option>
              <option value="Cohort Distribution">Cohort Enrollment Spread</option>
              <option value="Lead Quality">Student Lead Quality Index</option>
            </select>
          </div>
          <div class="form-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
            <div class="form-group">
              <label class="form-label">Frequency *</label>
              <select id="sch-freq" class="form-input">
                <option value="Daily">Daily Summary</option>
                <option value="Weekly">Weekly Monday Digest</option>
                <option value="Monthly">Monthly 1st Day Audit</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Delivery Format</label>
              <select id="sch-format" class="form-input">
                <option value="PDF">PDF Report Document</option>
                <option value="CSV">CSV Data Spreadsheet</option>
              </select>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Email Recipient *</label>
            <input type="email" id="sch-email" class="form-input" placeholder="e.g. director@rbmi.in" required />
          </div>
        </div>
        <div id="sch-rep-error" style="color:#dc2626;font-size:13px;margin-top:8px;display:none;"></div>
      `;

      openModal('Schedule Automated Email Report', content, {
        submitLabel: 'Create Schedule',
        width: '500px',
        onSubmit: async (body) => {
          const type = body.querySelector('#sch-rep-type').value;
          const frequency = body.querySelector('#sch-freq').value;
          const format = body.querySelector('#sch-format').value;
          const email = body.querySelector('#sch-email').value.trim();

          const errEl = body.querySelector('#sch-rep-error');
          if (!email) {
            errEl.textContent = 'Please enter a recipient email address.';
            errEl.style.display = 'block';
            return false;
          }

          try {
            const newSchedule = await scheduleReport({ report_type: type, frequency, format, email });
            appendScheduleToUI(newSchedule);
            alert(`Report schedule created successfully! Automated emails will be dispatched.`);
            return true;
          } catch (err) {
            errEl.textContent = err.message;
            errEl.style.display = 'block';
            return false;
          }
        }
      });
    });

    // Render Charts
    setTimeout(() => {
      createLineChart('chart-monthly-trends', stats.monthly.labels, [
        { label: 'Enquiries', data: stats.monthly.enquiries, color: '#6366f1', fill: false },
        { label: 'Admissions', data: stats.monthly.admissions, color: '#10b981', fill: false },
        { label: 'Enrollments', data: stats.monthly.enrollments, color: '#f59e0b', fill: false }
      ]);

      const srcLabels = Object.keys(stats.sourceDistribution);
      const srcValues = Object.values(stats.sourceDistribution);
      const srcColors = ['#6366f1', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];
      createBarChart('chart-source-bars', srcLabels, srcValues, srcColors);

      createHorizontalBarChart(
        'chart-counselor-conv',
        counselors.map(c => c.name.split(' ')[0]),
        counselors.map(c => c.leads_assigned > 0 ? ((c.conversions / c.leads_assigned) * 100).toFixed(1) : 0),
        counselors.map((_, i) => ['#6366f1', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'][i % 6])
      );

      createDoughnutChart('chart-priority-dist', ['High', 'Medium', 'Low'],
        [priorityCounts.high, priorityCounts.medium, priorityCounts.low],
        ['#ef4444', '#f59e0b', '#10b981']
      );
    }, 100);

  } catch (err) {
    container.innerHTML = `<div class="reports-page"><div class="error-state"><p>Failed to load reports: ${err.message}</p><button class="btn btn-primary" onclick="location.reload()">Retry</button></div></div>`;
  }
}

function showReportPreviewModal(res) {
  const content = `
    <div style="display:flex;flex-direction:column;gap:14px;max-height:450px;overflow-y:auto;">
      <div style="background:var(--color-bg-page);border-radius:8px;padding:12px;border:1px solid var(--color-border);font-size:12px;color:var(--color-text-secondary);">
        Report Type: <strong>${escapeHtml(res.report_type).toUpperCase()}</strong><br/>
        Generated: <strong>${new Date(res.generated_at).toLocaleString()}</strong>
      </div>
      <table class="data-table">
        <thead>
          <tr>
            <th>Metric Category</th>
            <th>Sample Count</th>
            <th>Value Metric</th>
          </tr>
        </thead>
        <tbody>
          ${res.data.map(d => `
            <tr>
              <td><strong>${escapeHtml(d.label)}</strong></td>
              <td>${d.count} Leads</td>
              <td><strong style="color:var(--color-primary);">INR ${d.revenue.toLocaleString()}</strong></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;

  openModal('Report Preview Audit', content, {
    submitLabel: 'Download PDF Copy',
    width: '560px',
    onSubmit: () => {
      alert('Downloading report PDF document...');
      return true;
    }
  });
}

function appendScheduleToUI(item) {
  const container = document.getElementById('schedules-container');
  if (!container) return;

  const html = `
    <div style="border:1px dashed var(--color-primary-light);border-radius:8px;padding:16px;display:flex;align-items:center;gap:12px;background:var(--color-bg-page);animation:fadeIn 0.3s;">
      <i data-lucide="alarm-clock" style="color:var(--color-primary);width:20px;height:20px;flex-shrink:0;"></i>
      <div>
        <strong style="font-size:13px;color:var(--color-text);">${item.report_type} Digest (${item.format})</strong>
        <div style="font-size:11px;color:var(--color-text-muted);margin-top:2px;">Sent ${item.frequency} to: <strong>${item.email}</strong></div>
      </div>
    </div>
  `;
  container.insertAdjacentHTML('beforeend', html);
  window.renderIcons?.();
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
