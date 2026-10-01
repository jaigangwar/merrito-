import {
  fetchLeadDistributionRules,
  createLeadDistributionRule,
  updateLeadDistributionRule,
  deleteLeadDistributionRule,
  testLeadDistribution,
  fetchCounselors
} from '../lib/api.js';
import { openModal } from '../components/modal.js';

export async function renderLeadDistribution(el) {
  el.innerHTML = `
    <div class="admissions-container">
      <div class="page-header-row">
        <div>
          <span class="eyebrow">Marketing & Leads</span>
          <h1 class="page-header-title">Lead Distribution Rules</h1>
          <p class="page-header-subtitle">Route incoming admissions leads dynamically to counselors using custom rule matching algorithms.</p>
        </div>
        <div style="display:flex;gap:12px;">
          <button class="btn btn-secondary" id="btn-test-rule">
            <i data-lucide="zap" style="width:16px;height:16px;margin-right:6px;"></i> Test Router
          </button>
          <button class="btn btn-primary" id="btn-create-rule">
            <i data-lucide="plus" style="width:16px;height:16px;margin-right:6px;"></i> Create Rule
          </button>
        </div>
      </div>

      <div class="admissions-stats-grid" id="ld-stats-grid">
        <!-- Stats -->
      </div>

      <div class="admissions-split-layout">
        <div class="admissions-card">
          <div class="admissions-card-header">
            <h3 class="admissions-card-title">Distribution Rules Routing</h3>
          </div>
          <div class="admissions-card-body" style="padding: var(--spacing-xl); display: flex; flex-direction: column; gap: var(--spacing-lg);" id="rules-list-container">
            <div style="text-align:center;padding:24px;color:var(--color-text-muted);">Loading distribution rules...</div>
          </div>
        </div>

        <div class="admissions-card">
          <div class="admissions-card-header">
            <h3 class="admissions-card-title">Routing Simulation</h3>
          </div>
          <div class="admissions-card-body" id="simulation-body">
            <div style="text-align:center;padding:32px;color:var(--color-text-muted);">
              <i data-lucide="git-merge" style="width:36px;height:36px;margin-bottom:8px;opacity:0.5;display:inline-block;"></i>
              <p>Simulate lead routing by running a test case. Click "Test Router" above to see rule matching in action.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  // Fetch initial rules
  await refreshRulesPage();

  // Create Distribution Rule Button Event
  document.getElementById('btn-create-rule')?.addEventListener('click', async () => {
    let counselors = [];
    try {
      counselors = await fetchCounselors();
    } catch (e) {
      console.error(e);
    }

    const content = `
      <div class="form-grid" style="display:grid;grid-template-columns:1fr;gap:16px;">
        <div class="form-group">
          <label class="form-label">Rule Name *</label>
          <input type="text" id="rule-name" class="form-input" placeholder="e.g. Bareilly Region MBA Route" required />
        </div>
        <div class="form-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
          <div class="form-group">
            <label class="form-label">Distribution Method *</label>
            <select id="rule-criteria" class="form-input">
              <option value="round_robin">Round Robin</option>
              <option value="least_loaded">Least Loaded Counselor</option>
              <option value="by_course">By Course Choice</option>
              <option value="by_source">By Lead Source</option>
              <option value="specific_counselor">Specific Counselor</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Matching Criteria Value *</label>
            <input type="text" id="rule-criteria-val" class="form-input" placeholder="e.g. Bareilly (for City) or MBA (for Course) or Website" required />
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Primary Counselor Allocation (Optional)</label>
          <select id="rule-counselor" class="form-input">
            <option value="">-- Let criteria auto-allocate --</option>
            ${counselors.map(c => `<option value="${c.id}" data-name="${c.name}">${c.name}</option>`).join('')}
          </select>
        </div>
      </div>
      <div id="rule-error" style="color:#dc2626;font-size:13px;margin-top:8px;display:none;"></div>
    `;

    openModal('Create Routing Rule', content, {
      submitLabel: 'Create Rule',
      width: '540px',
      onSubmit: async (body) => {
        const name = body.querySelector('#rule-name').value.trim();
        const criteria = body.querySelector('#rule-criteria').value;
        const val = body.querySelector('#rule-criteria-val').value.trim();
        const counselorSelect = body.querySelector('#rule-counselor');
        const counselorId = counselorSelect.value;
        const counselorName = counselorSelect.options[counselorSelect.selectedIndex]?.dataset.name || '';

        const errEl = body.querySelector('#rule-error');
        if (!name || !val) {
          errEl.textContent = 'Rule name and criteria values are required.';
          errEl.style.display = 'block';
          return false;
        }

        const conditions = {};
        if (criteria === 'by_course') {
          conditions.course_id = val;
        } else if (criteria === 'by_source') {
          conditions.source = val;
        } else {
          conditions.city = val;
        }

        try {
          await createLeadDistributionRule({
            name,
            assignment_type: criteria,
            criteria, // local mock fallback
            is_active: true,
            active: true, // local mock fallback
            counselor_id: counselorId || null,
            conditions
          });
          await refreshRulesPage();
          return true;
        } catch (err) {
          errEl.textContent = err.message;
          errEl.style.display = 'block';
          return false;
        }
      }
    });
  });

  // Test Router Event
  document.getElementById('btn-test-rule')?.addEventListener('click', async () => {
    let rules = [];
    try {
      rules = await fetchLeadDistributionRules();
    } catch (e) {
      console.error(e);
    }

    const content = `
      <div class="form-grid" style="display:grid;grid-template-columns:1fr;gap:16px;">
        <p style="font-size:13px;color:var(--color-text-secondary);">Input simulated lead values to test which active routing rule is triggered.</p>
        <div class="form-group">
          <label class="form-label">Rule to Test *</label>
          <select id="sim-rule-id" class="form-input" required>
            <option value="">-- Select Rule --</option>
            ${rules.map(r => `<option value="${r.id}">${r.name}</option>`).join('')}
          </select>
        </div>
        <div class="form-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
          <div class="form-group">
            <label class="form-label">Simulated Course</label>
            <input type="text" id="sim-course" class="form-input" placeholder="e.g. MBA" />
          </div>
          <div class="form-group">
            <label class="form-label">Simulated City</label>
            <input type="text" id="sim-city" class="form-input" placeholder="e.g. Bareilly" />
          </div>
        </div>
        <div class="form-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
          <div class="form-group">
            <label class="form-label">Simulated Source</label>
            <input type="text" id="sim-source" class="form-input" placeholder="e.g. Website" />
          </div>
          <div class="form-group">
            <label class="form-label">Simulated Student Name</label>
            <input type="text" id="sim-name" class="form-input" placeholder="e.g. Rohan Sharma" value="Test Student" />
          </div>
        </div>
      </div>
    `;

    openModal('Simulate Lead Distribution Router', content, {
      submitLabel: 'Simulate Route',
      width: '500px',
      onSubmit: async (body) => {
        const rule_id = body.querySelector('#sim-rule-id').value;
        const course = body.querySelector('#sim-course').value.trim();
        const city = body.querySelector('#sim-city').value.trim();
        const source = body.querySelector('#sim-source').value.trim();
        const student = body.querySelector('#sim-name').value.trim();

        if (!rule_id) {
          alert('Please select a rule to test.');
          return false;
        }

        try {
          const res = await testLeadDistribution({
            rule_id,
            test_lead: {
              city,
              course_id: course,
              source
            },
            // Fallback fields:
            course,
            city,
            source,
            student_name: student,
            rule_name: rules.find(r => r.id === rule_id)?.name
          });
          renderSimulationResult(res, { course, city, source, student });
          return true;
        } catch (err) {
          alert('Simulation failed: ' + err.message);
          return false;
        }
      }
    });
  });

  async function refreshRulesPage() {
    try {
      const rules = await fetchLeadDistributionRules();

      // Render Stats
      const statsGrid = document.getElementById('ld-stats-grid');
      if (statsGrid) {
        const activeCount = rules.filter(r => r.active).length;
        statsGrid.innerHTML = `
          <div class="admissions-stat-card">
            <div class="stat-icon-wrap"><i data-lucide="git-merge" style="width:24px;height:24px;"></i></div>
            <div class="stat-details">
              <span class="stat-val">${rules.length}</span>
              <span class="stat-lbl">Total Routing Rules</span>
            </div>
          </div>
          <div class="admissions-stat-card">
            <div class="stat-icon-wrap" style="background:#dcfce7;color:#15803d;"><i data-lucide="check-circle" style="width:24px;height:24px;"></i></div>
            <div class="stat-details">
              <span class="stat-val">${activeCount}</span>
              <span class="stat-lbl">Active Rules</span>
            </div>
          </div>
          <div class="admissions-stat-card">
            <div class="stat-icon-wrap" style="background:#e0f2fe;color:#0369a1;"><i data-lucide="zap" style="width:24px;height:24px;"></i></div>
            <div class="stat-details">
              <span class="stat-val">Router Active</span>
              <span class="stat-lbl">System Router Status</span>
            </div>
          </div>
        `;
      }

      // Render Rules list
      const listContainer = document.getElementById('rules-list-container');
      if (listContainer) {
        if (rules.length === 0) {
          listContainer.innerHTML = `<div style="text-align:center;padding:24px;color:var(--color-text-muted);">No distribution rules created yet.</div>`;
        } else {
          listContainer.innerHTML = rules.map(r => {
            const matchVal = r.conditions?.matching_value || r.conditions?.city || r.conditions?.source || 'All';
            const criteriaLabel = r.criteria === 'round_robin' || r.assignment_type === 'round_robin' ? 'Round Robin' : r.criteria === 'least_loaded' || r.assignment_type === 'least_loaded' ? 'Least Loaded' : `Method: ${r.assignment_type || r.criteria}`;
            const isActive = r.is_active !== false && r.active !== false;

            return `
              <div class="rule-item-row">
                <div class="rule-info">
                  <div class="rule-name-lbl">${r.name}</div>
                  <div class="rule-meta-lbl">Matching: <strong>${matchVal}</strong> • Method: <strong>${criteriaLabel}</strong></div>
                </div>
                <div class="rule-actions-wrap">
                  <label class="switch-control">
                    <input type="checkbox" class="toggle-rule-status" data-id="${r.id}" ${isActive ? 'checked' : ''} />
                    <span class="switch-slider"></span>
                  </label>
                  <button class="btn btn-secondary btn-sm btn-delete-rule" data-id="${r.id}" style="padding:4px 8px;border-color:#fca5a5;color:#dc2626;">
                    <i data-lucide="trash-2" style="width:14px;height:14px;"></i>
                  </button>
                </div>
              </div>
            `;
          }).join('');

          // Bind Toggle active switches
          listContainer.querySelectorAll('.toggle-rule-status').forEach(toggle => {
            toggle.addEventListener('change', async () => {
              const ruleId = toggle.dataset.id;
              const active = toggle.checked;
              try {
                await updateLeadDistributionRule(ruleId, { is_active: active, active });
                await refreshRulesPage();
              } catch (err) {
                alert('Failed to update status: ' + err.message);
                toggle.checked = !active; // revert
              }
            });
          });

          // Bind Delete Buttons
          listContainer.querySelectorAll('.btn-delete-rule').forEach(btn => {
            btn.addEventListener('click', async () => {
              if (confirm('Are you sure you want to delete this routing rule?')) {
                const ruleId = btn.dataset.id;
                try {
                  await deleteLeadDistributionRule(ruleId);
                  await refreshRulesPage();
                } catch (err) {
                  alert('Delete failed: ' + err.message);
                }
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

  function renderSimulationResult(res, lead) {
    const simBody = document.getElementById('simulation-body');
    if (!simBody) return;

    const matched = res.matches !== false;
    const counselorName = typeof res.assigned_counselor === 'object' && res.assigned_counselor 
      ? res.assigned_counselor.name 
      : (res.assigned_counselor || 'None Assigned');
    const ruleName = res.rule_matched || res.rule_name || 'N/A';
    const timestamp = res.timestamp ? new Date(res.timestamp).toLocaleTimeString() : new Date().toLocaleTimeString();

    simBody.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:16px;">
        ${matched ? `
          <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:var(--radius-lg);padding:16px;color:#166534;animation:fadeIn 0.3s;">
            <h4 style="margin:0 0 6px 0;display:flex;align-items:center;gap:6px;">
              <i data-lucide="check-circle" style="width:18px;height:18px;"></i> Lead Routed Successfully
            </h4>
            <p style="font-size:13px;margin:0;">The incoming lead matched router configurations and was distributed to an advisor.</p>
          </div>
        ` : `
          <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:var(--radius-lg);padding:16px;color:#991b1b;animation:fadeIn 0.3s;">
            <h4 style="margin:0 0 6px 0;display:flex;align-items:center;gap:6px;">
              <i data-lucide="x-circle" style="width:18px;height:18px;"></i> Lead Routing Failed / No Match
            </h4>
            <p style="font-size:13px;margin:0;">The incoming lead did not match the selected rule's conditions. Counselor assignment was not triggered.</p>
          </div>
        `}

        <div class="admissions-card" style="box-shadow:none;">
          <div class="admissions-card-body" style="padding:14px;display:flex;flex-direction:column;gap:10px;">
            <h5 style="margin:0;font-size:13px;color:var(--color-text-secondary);border-bottom:1px solid var(--color-border);padding-bottom:6px;">SIMULATED LEAD DETAILS</h5>
            <div class="detail-row"><span class="detail-label">Name:</span><span class="detail-value">${lead.student || 'N/A'}</span></div>
            <div class="detail-row"><span class="detail-label">Course:</span><span class="detail-value">${lead.course || 'N/A'}</span></div>
            <div class="detail-row"><span class="detail-label">City:</span><span class="detail-value">${lead.city || 'N/A'}</span></div>
            <div class="detail-row"><span class="detail-label">Source:</span><span class="detail-value">${lead.source || 'N/A'}</span></div>
          </div>
        </div>

        <div class="admissions-card" style="box-shadow:none;border-color:var(--color-primary-light);">
          <div class="admissions-card-body" style="padding:14px;display:flex;flex-direction:column;gap:10px;background:var(--color-bg-page);">
            <h5 style="margin:0;font-size:13px;color:var(--color-primary);border-bottom:1px dashed var(--color-primary-light);padding-bottom:6px;">ROUTING RESOLUTION</h5>
            <div class="detail-row"><span class="detail-label">Assigned Counselor:</span><strong class="detail-value" style="color:var(--color-primary);">${counselorName}</strong></div>
            <div class="detail-row"><span class="detail-label">Tested Rule:</span><span class="detail-value">${ruleName}</span></div>
            <div class="detail-row"><span class="detail-label">Matched Conditions?</span><strong class="detail-value" style="color:${matched ? '#166534' : '#991b1b'};">${matched ? 'YES' : 'NO'}</strong></div>
            <div class="detail-row"><span class="detail-label">Timestamp:</span><span class="detail-value">${timestamp}</span></div>
          </div>
        </div>
      </div>
    `;
    window.renderIcons?.();
  }
}
