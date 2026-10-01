import {
  fetchBatches,
  createBatch,
  updateBatch,
  assignStudentToBatch,
  fetchBatchStudents,
  fetchCourses,
  fetchLeads
} from '../lib/api.js';
import { getCurrentUser } from '../lib/auth.js';
import { openModal } from '../components/modal.js';

export async function renderBatches(el) {
  const user = getCurrentUser();
  const role = user?.role || 'admin';
  const isStudent = role === 'student';

  el.innerHTML = `
    <div class="admissions-container">
      <div class="page-header-row">
        <div>
          <span class="eyebrow">Academic Center</span>
          <h1 class="page-header-title">Batches & Sections</h1>
          <p class="page-header-subtitle">Manage academic cohorts, course sections, student enrollments, and batch capacities.</p>
        </div>
        ${!isStudent ? `
          <div style="display:flex;gap:12px;">
            <button class="btn btn-secondary" id="btn-assign-student">
              <i data-lucide="user-plus" style="width:16px;height:16px;margin-right:6px;"></i> Assign Student
            </button>
            <button class="btn btn-primary" id="btn-create-batch">
              <i data-lucide="plus" style="width:16px;height:16px;margin-right:6px;"></i> Create Batch
            </button>
          </div>
        ` : ''}
      </div>

      <div class="admissions-stats-grid" id="batch-stats-grid">
        <!-- Dynamic Stats -->
      </div>

      <div class="admissions-split-layout">
        <div class="admissions-card">
          <div class="admissions-card-header">
            <h3 class="admissions-card-title">Academic Batches</h3>
          </div>
          <div class="admissions-card-body" style="padding: 0;">
            <div class="ops-table-wrap" style="margin: 0; border: none; border-radius: 0;">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Batch Name</th>
                    <th>Course</th>
                    <th>Section</th>
                    <th>Academic Year</th>
                    <th>Capacity / Filled</th>
                    <th>Utilization</th>
                  </tr>
                </thead>
                <tbody id="batches-list">
                  <tr><td colspan="6" style="text-align:center;padding:24px;">Loading batches...</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div class="admissions-card">
          <div class="admissions-card-header">
            <h3 class="admissions-card-title">Batch Student Directory</h3>
          </div>
          <div class="admissions-card-body" style="padding: 0;">
            <div class="ops-table-wrap" style="margin: 0; border: none; border-radius: 0; max-height: 400px; overflow-y: auto;">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Roll Number</th>
                    <th>Student Name</th>
                    <th>Assigned Batch</th>
                    <th>Course</th>
                  </tr>
                </thead>
                <tbody id="batch-students-list">
                  <tr><td colspan="4" style="text-align:center;padding:24px;">Loading students...</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  // Fetch initial data
  await refreshBatchesPage();

  // Create Batch Button Click Event
  if (!isStudent) {
    document.getElementById('btn-create-batch')?.addEventListener('click', async () => {
      let courses = [];
      try {
        courses = await fetchCourses();
      } catch (e) {
        console.error(e);
      }

      const content = `
        <div class="form-grid" style="display:grid;grid-template-columns:1fr;gap:16px;">
          <div class="form-group">
            <label class="form-label">Batch Name *</label>
            <input type="text" id="batch-name" class="form-input" placeholder="e.g. MBA Section A (2026)" required />
          </div>
          <div class="form-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
            <div class="form-group">
              <label class="form-label">Course / Program *</label>
              <select id="batch-course" class="form-input">
                <option value="">-- Select Course --</option>
                ${courses.map(c => `<option value="${c.id}" data-code="${c.code || c.name}">${c.name}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Section *</label>
              <input type="text" id="batch-section" class="form-input" placeholder="e.g. A" required />
            </div>
          </div>
          <div class="form-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
            <div class="form-group">
              <label class="form-label">Capacity (Max Students) *</label>
              <input type="number" id="batch-capacity" class="form-input" placeholder="e.g. 60" required />
            </div>
            <div class="form-group">
              <label class="form-label">Academic Year *</label>
              <input type="text" id="batch-year" class="form-input" placeholder="e.g. 2026-27" required />
            </div>
          </div>
        </div>
        <div id="batch-error" style="color:#dc2626;font-size:13px;margin-top:8px;display:none;"></div>
      `;

      openModal('Create Academic Batch', content, {
        submitLabel: 'Create Batch',
        width: '540px',
        onSubmit: async (body) => {
          const name = body.querySelector('#batch-name').value.trim();
          const courseSelect = body.querySelector('#batch-course');
          const course_id = courseSelect.value;
          const courseCode = courseSelect.options[courseSelect.selectedIndex]?.dataset.code || '';
          const section = body.querySelector('#batch-section').value.trim();
          const capacity = Number(body.querySelector('#batch-capacity').value);
          const academic_year = body.querySelector('#batch-year').value.trim();

          const errEl = body.querySelector('#batch-error');
          if (!name || !course_id || !section || !capacity || !academic_year) {
            errEl.textContent = 'All fields are required.';
            errEl.style.display = 'block';
            return false;
          }

          try {
            await createBatch({
              name,
              course_id,
              course: courseCode,
              sections: [section],
              section,
              max_students: capacity,
              capacity,
              academic_year
            });
            await refreshBatchesPage();
            return true;
          } catch (err) {
            errEl.textContent = err.message;
            errEl.style.display = 'block';
            return false;
          }
        }
      });
    });

    // Assign Student Button Click Event
    document.getElementById('btn-assign-student')?.addEventListener('click', async () => {
      let batches = [];
      let leads = [];
      try {
        batches = await fetchBatches();
        const leadsRes = await fetchLeads({ limit: 100 });
        leads = leadsRes?.data || [];
      } catch (e) {
        console.error(e);
      }

      const content = `
        <div class="form-grid" style="display:grid;grid-template-columns:1fr;gap:16px;">
          <div class="form-group">
            <label class="form-label">Student Name *</label>
            <select id="ast-lead-id" class="form-input" required>
              <option value="">-- Select Student Lead --</option>
              ${leads.map(l => `<option value="${l.id}" data-name="${l.first_name} ${l.last_name}" data-email="${l.email}">${l.first_name} ${l.last_name} (${l.email})</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Roll Number (Optional - Auto Generated if Empty)</label>
            <input type="text" id="ast-roll" class="form-input" placeholder="e.g. MBA-2026-042" />
          </div>
          <div class="form-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
            <div class="form-group">
              <label class="form-label">Batch *</label>
              <select id="ast-batch" class="form-input">
                <option value="">-- Select Batch --</option>
                ${batches.map(b => `<option value="${b.id}" data-name="${b.name}" data-course="${b.course}">${b.name}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Course Code</label>
              <input type="text" id="ast-course" class="form-input" placeholder="Auto-populated" disabled />
            </div>
          </div>
        </div>
        <div id="ast-error" style="color:#dc2626;font-size:13px;margin-top:8px;display:none;"></div>
      `;

      openModal('Assign Student to Batch', content, {
        submitLabel: 'Assign Student',
        width: '500px',
        onSubmit: async (body) => {
          const leadSelect = body.querySelector('#ast-lead-id');
          const lead_id = leadSelect.value;
          const name = leadSelect.options[leadSelect.selectedIndex]?.dataset.name || '';
          const email = leadSelect.options[leadSelect.selectedIndex]?.dataset.email || '';
          const roll = body.querySelector('#ast-roll').value.trim();
          const batchSelect = body.querySelector('#ast-batch');
          const batch_id = batchSelect.value;
          const batchName = batchSelect.options[batchSelect.selectedIndex]?.dataset.name || '';
          const course = body.querySelector('#ast-course').value;

          const errEl = body.querySelector('#ast-error');
          if (!lead_id || !batch_id) {
            errEl.textContent = 'Student and Batch are required.';
            errEl.style.display = 'block';
            return false;
          }

          try {
            await assignStudentToBatch({
              lead_id,
              batch_id,
              student_name: name,
              student_email: email,
              roll_number: roll,
              batch_name: batchName,
              course: course
            });
            await refreshBatchesPage();
            return true;
          } catch (err) {
            errEl.textContent = err.message;
            errEl.style.display = 'block';
            return false;
          }
        }
      });

      // Bind auto-populate course on batch select
      setTimeout(() => {
        const batchDropdown = document.getElementById('ast-batch');
        const courseInput = document.getElementById('ast-course');
        if (batchDropdown && courseInput) {
          batchDropdown.addEventListener('change', () => {
            const selectedOpt = batchDropdown.options[batchDropdown.selectedIndex];
            courseInput.value = selectedOpt?.dataset.course || '';
          });
        }
      }, 50);
    });
  }

  async function refreshBatchesPage() {
    try {
      const batches = await fetchBatches();
      const students = await fetchBatchStudents();

      // Calculate Utilization Stats
      let totalCapacity = 0;
      let totalFilled = 0;
      batches.forEach(b => {
        totalCapacity += Number(b.capacity || 0);
        totalFilled += Number(b.student_count || 0);
      });
      const utilizationRate = totalCapacity > 0 ? Math.round((totalFilled / totalCapacity) * 100) : 0;

      // Render Stats
      const statsGrid = document.getElementById('batch-stats-grid');
      if (statsGrid) {
        statsGrid.innerHTML = `
          <div class="admissions-stat-card">
            <div class="stat-icon-wrap"><i data-lucide="layers" style="width:24px;height:24px;"></i></div>
            <div class="stat-details">
              <span class="stat-val">${batches.length}</span>
              <span class="stat-lbl">Active Batches</span>
            </div>
          </div>
          <div class="admissions-stat-card">
            <div class="stat-icon-wrap" style="background:#e0f2fe;color:#0369a1;"><i data-lucide="users" style="width:24px;height:24px;"></i></div>
            <div class="stat-details">
              <span class="stat-val">${totalFilled} / ${totalCapacity}</span>
              <span class="stat-lbl">Capacity Occupancy</span>
            </div>
          </div>
          <div class="admissions-stat-card">
            <div class="stat-icon-wrap" style="background:#dcfce7;color:#15803d;"><i data-lucide="trending-up" style="width:24px;height:24px;"></i></div>
            <div class="stat-details">
              <span class="stat-val">${utilizationRate}%</span>
              <span class="stat-lbl">Utilization Rate</span>
            </div>
          </div>
        `;
      }

      // Render Batches Table
      const batchesList = document.getElementById('batches-list');
      if (batchesList) {
        if (batches.length === 0) {
          batchesList.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--color-text-muted);">No batches created yet.</td></tr>`;
        } else {
          batchesList.innerHTML = batches.map(b => {
            const filled = b.student_count || 0;
            const utilPercent = b.capacity > 0 ? Math.min(100, Math.round((filled / b.capacity) * 100)) : 0;
            let barColor = 'var(--color-primary)';
            if (utilPercent >= 90) barColor = '#dc2626'; // Overutilization warning
            else if (utilPercent <= 30) barColor = '#eab308'; // Underutilization warning

            return `
              <tr>
                <td><strong>${b.name}</strong></td>
                <td><span class="ops-badge info" style="font-size:11px;">${b.course}</span></td>
                <td>${b.section}</td>
                <td>${b.academic_year}</td>
                <td><strong>${filled} / ${b.capacity}</strong></td>
                <td style="min-width:140px;">
                  <div style="display:flex;align-items:center;gap:10px;">
                    <div style="flex-grow:1;background:var(--color-border);height:6px;border-radius:3px;overflow:hidden;">
                      <div style="background:${barColor};height:100%;width:${utilPercent}%;"></div>
                    </div>
                    <span style="font-size:12px;font-weight:700;">${utilPercent}%</span>
                  </div>
                </td>
              </tr>
            `;
          }).join('');
        }
      }

      // Render Students Table
      const studentsList = document.getElementById('batch-students-list');
      if (studentsList) {
        if (students.length === 0) {
          studentsList.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:24px;color:var(--color-text-muted);">No students assigned to batches yet.</td></tr>`;
        } else {
          studentsList.innerHTML = students.map(s => `
            <tr>
              <td><code>${s.roll_number}</code></td>
              <td><strong>${s.student_name}</strong></td>
              <td><span style="font-weight:600;color:var(--color-text);">${s.batch_name}</span></td>
              <td><span class="ops-badge info">${s.course}</span></td>
            </tr>
          `).join('');
        }
      }

      window.renderIcons?.();
    } catch (err) {
      console.error(err);
    }
  }
}
