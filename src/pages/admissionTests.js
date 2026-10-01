import {
  fetchAdmissionTests,
  createAdmissionTest,
  registerForTest,
  submitTestResult,
  fetchTestRegistrations,
  fetchMeritList,
  fetchCourses,
  fetchLeads
} from '../lib/api.js';
import { getCurrentUser } from '../lib/auth.js';
import { openModal } from '../components/modal.js';

export async function renderAdmissionTests(el) {
  const user = getCurrentUser();
  const role = user?.role || 'admin';
  const isStudent = role === 'student';

  // Resolve student's lead_id
  let leadId = null;
  if (isStudent && user?.email) {
    try {
      const leadsRes = await fetchLeads({ search: user.email, limit: 1 });
      if (leadsRes?.data?.[0]) {
        leadId = leadsRes.data[0].id;
      }
    } catch (err) {
      console.error('Failed to resolve student lead_id:', err);
    }
  }

  el.innerHTML = `
    <div class="admissions-container">
      <div class="page-header-row">
        <div>
          <span class="eyebrow">${isStudent ? 'Student Portal' : 'Admission Center'}</span>
          <h1 class="page-header-title">Admission Entrance Tests</h1>
          <p class="page-header-subtitle">Schedule, register, and evaluate entrance and scholarship tests.</p>
        </div>
        ${!isStudent ? `
          <button class="btn btn-primary" id="btn-create-test">
            <i data-lucide="plus" style="width:16px;height:16px;margin-right:6px;"></i> Create Test
          </button>
        ` : ''}
      </div>

      <div class="admissions-stats-grid" id="stats-grid">
        <!-- Dynamic Stats -->
      </div>

      <div class="admissions-split-layout">
        <div class="admissions-card">
          <div class="admissions-card-header">
            <h3 class="admissions-card-title">${isStudent ? 'Available Tests' : 'Scheduled Entrance Tests'}</h3>
          </div>
          <div class="admissions-card-body" style="padding: 0;">
            <div class="ops-table-wrap" style="margin: 0; border: none; border-radius: 0;">
              <table class="data-table" id="tests-table">
                <thead>
                  <tr>
                    <th>Test Name</th>
                    <th>Date</th>
                    <th>Duration</th>
                    <th>Venue</th>
                    <th>Total Marks</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody id="tests-list">
                  <tr><td colspan="6" style="text-align:center;padding:24px;">Loading tests...</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div class="admissions-card" id="details-card">
          <div class="admissions-card-header">
            <h3 class="admissions-card-title" id="details-title">${isStudent ? 'My Test Registrations' : 'Evaluation & Merit List'}</h3>
          </div>
          <div class="admissions-card-body" id="details-body">
            <div style="text-align:center;padding:32px;color:var(--color-text-muted);">
              <i data-lucide="award" style="width:36px;height:36px;margin-bottom:8px;opacity:0.5;display:inline-block;"></i>
              <p>Select a test from the table to view details, registrants, or results.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  // Fetch and display initial data
  await refreshPage();

  // Bind Event for Create Test
  if (!isStudent) {
    document.getElementById('btn-create-test')?.addEventListener('click', async () => {
      let courses = [];
      try {
        courses = await fetchCourses();
      } catch (e) {
        console.error(e);
      }

      const content = `
        <div class="form-grid" style="display:grid;grid-template-columns:1fr;gap:16px;">
          <div class="form-group">
            <label class="form-label">Test Name *</label>
            <input type="text" id="test-name" class="form-input" placeholder="e.g. MBA Entrance & Scholarship Test 2026" required />
          </div>
          <div class="form-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
            <div class="form-group">
              <label class="form-label">Course / Program *</label>
              <select id="test-course-id" class="form-input" required>
                <option value="">-- Select Course --</option>
                ${courses.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Test Date *</label>
              <input type="date" id="test-date" class="form-input" required />
            </div>
          </div>
          <div class="form-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
            <div class="form-group">
              <label class="form-label">Duration (Minutes) *</label>
              <input type="number" id="test-duration" class="form-input" placeholder="e.g. 120" required />
            </div>
            <div class="form-group">
              <label class="form-label">Venue *</label>
              <input type="text" id="test-venue" class="form-input" placeholder="e.g. Bareilly Campus, Block B" required />
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Total Marks *</label>
            <input type="number" id="test-total-marks" class="form-input" placeholder="e.g. 100" required />
          </div>
        </div>
        <div id="test-error" style="color:#dc2626;font-size:13px;margin-top:8px;display:none;"></div>
      `;

      openModal('Create New Admission Test', content, {
        submitLabel: 'Create Test',
        width: '540px',
        onSubmit: async (body) => {
          const name = body.querySelector('#test-name').value.trim();
          const course_id = body.querySelector('#test-course-id').value;
          const test_date = body.querySelector('#test-date').value;
          const duration_minutes = Number(body.querySelector('#test-duration').value);
          const venue = body.querySelector('#test-venue').value.trim();
          const total_marks = Number(body.querySelector('#test-total-marks').value);

          const errEl = body.querySelector('#test-error');
          if (!name || !course_id || !test_date || !duration_minutes || !venue || !total_marks) {
            errEl.textContent = 'All fields are required.';
            errEl.style.display = 'block';
            return false;
          }

          try {
            await createAdmissionTest({ name, course_id, test_date, duration_minutes, venue, total_marks });
            await refreshPage();
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

  async function refreshPage() {
    try {
      const tests = await fetchAdmissionTests();
      const registrations = await fetchTestRegistrations();

      // Render Stats
      const statsGrid = document.getElementById('stats-grid');
      if (statsGrid) {
        if (isStudent) {
          const registeredCount = registrations.length;
          const passedCount = registrations.filter(r => r.result_status === 'Pass').length;
          statsGrid.innerHTML = `
            <div class="admissions-stat-card">
              <div class="stat-icon-wrap"><i data-lucide="award" style="width:24px;height:24px;"></i></div>
              <div class="stat-details">
                <span class="stat-val">${tests.length}</span>
                <span class="stat-lbl">Entrance Tests</span>
              </div>
            </div>
            <div class="admissions-stat-card">
              <div class="stat-icon-wrap" style="background:#e0f2fe;color:#0369a1;"><i data-lucide="check-square" style="width:24px;height:24px;"></i></div>
              <div class="stat-details">
                <span class="stat-val">${registeredCount}</span>
                <span class="stat-lbl">Registered</span>
              </div>
            </div>
            <div class="admissions-stat-card">
              <div class="stat-icon-wrap" style="background:#dcfce7;color:#15803d;"><i data-lucide="file-check" style="width:24px;height:24px;"></i></div>
              <div class="stat-details">
                <span class="stat-val">${passedCount}</span>
                <span class="stat-lbl">Cleared Tests</span>
              </div>
            </div>
          `;
        } else {
          const totalRegs = registrations.length;
          const pendingEvaluations = registrations.filter(r => r.marks_obtained === undefined).length;
          statsGrid.innerHTML = `
            <div class="admissions-stat-card">
              <div class="stat-icon-wrap"><i data-lucide="award" style="width:24px;height:24px;"></i></div>
              <div class="stat-details">
                <span class="stat-val">${tests.length}</span>
                <span class="stat-lbl">Entrance Tests</span>
              </div>
            </div>
            <div class="admissions-stat-card">
              <div class="stat-icon-wrap" style="background:#e0f2fe;color:#0369a1;"><i data-lucide="users" style="width:24px;height:24px;"></i></div>
              <div class="stat-details">
                <span class="stat-val">${totalRegs}</span>
                <span class="stat-lbl">Total Registrations</span>
              </div>
            </div>
            <div class="admissions-stat-card">
              <div class="stat-icon-wrap" style="background:#fef3c7;color:#b45309;"><i data-lucide="alert-circle" style="width:24px;height:24px;"></i></div>
              <div class="stat-details">
                <span class="stat-val">${pendingEvaluations}</span>
                <span class="stat-lbl">Evaluation Pending</span>
              </div>
            </div>
          `;
        }
      }

      // Render Tests Table
      const testsList = document.getElementById('tests-list');
      if (testsList) {
        if (tests.length === 0) {
          testsList.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--color-text-muted);">No entrance tests scheduled yet.</td></tr>`;
        } else {
          testsList.innerHTML = tests.map(t => {
            const isRegistered = registrations.some(r => r.test_id === t.id && r.student_email === user.email);
            const userReg = registrations.find(r => r.test_id === t.id && r.student_email === user.email);
            
            let actionBtn = '';
            if (isStudent) {
              if (isRegistered) {
                actionBtn = `<span class="status-pill registered" style="padding: 4px 8px;"><i data-lucide="check" style="width:12px;height:12px;margin-right:4px;"></i> Registered</span>`;
              } else {
                actionBtn = `<button class="btn btn-secondary btn-sm btn-register-test" data-id="${t.id}" data-name="${t.name}">Register</button>`;
              }
            } else {
              actionBtn = `<button class="btn btn-secondary btn-sm btn-view-registrations" data-id="${t.id}" data-name="${t.name}">Manage / Evaluates</button>`;
            }

            return `
              <tr class="test-row-item" data-id="${t.id}">
                <td><strong>${t.name}</strong></td>
                <td>${t.date}</td>
                <td>${t.duration} mins</td>
                <td>${t.venue}</td>
                <td>${t.total_marks}</td>
                <td>${actionBtn}</td>
              </tr>
            `;
          }).join('');

          // Bind Register Button
          testsList.querySelectorAll('.btn-register-test').forEach(btn => {
            btn.addEventListener('click', async (e) => {
              e.stopPropagation();
              const test_id = btn.dataset.id;
              const test_name = btn.dataset.name;
              try {
                await registerForTest({
                  test_id,
                  lead_id: leadId || user?.id,
                  test_name,
                  student_name: user?.name,
                  student_email: user?.email
                });
                alert(`Successfully registered for ${test_name}!`);
                await refreshPage();
              } catch (err) {
                alert('Registration failed: ' + err.message);
              }
            });
          });

          // Bind View Registrations Button
          testsList.querySelectorAll('.btn-view-registrations').forEach(btn => {
            btn.addEventListener('click', async (e) => {
              e.stopPropagation();
              const testId = btn.dataset.id;
              const testName = btn.dataset.name;
              await viewTestEvaluation(testId, testName, registrations);
            });
          });

          // Bind row click for details
          testsList.querySelectorAll('.test-row-item').forEach(row => {
            row.addEventListener('click', async () => {
              const testId = row.dataset.id;
              const testItem = tests.find(t => t.id === testId);
              if (isStudent) {
                const userReg = registrations.find(r => r.test_id === testId && r.student_email === user.email);
                renderStudentTestDetail(testItem, userReg);
              } else {
                await viewTestEvaluation(testId, testItem.name, registrations);
              }
            });
          });
        }
      }

      // Default load student details
      if (isStudent) {
        renderStudentPortalRegistrations(registrations);
      }

      window.renderIcons?.();
    } catch (err) {
      console.error(err);
    }
  }

  function renderStudentPortalRegistrations(registrations) {
    const body = document.getElementById('details-body');
    const title = document.getElementById('details-title');
    if (!body || !title) return;

    title.textContent = 'My Test Status';
    if (registrations.length === 0) {
      body.innerHTML = `
        <div style="text-align:center;padding:24px;color:var(--color-text-muted);">
          <p>You haven't registered for any admission tests yet.</p>
        </div>
      `;
    } else {
      body.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:12px;">
          ${registrations.map(r => `
            <div style="border:1px solid var(--color-border);border-radius:var(--radius-md);padding:14px;background:var(--color-bg-card);">
              <div style="display:flex;justify-content:between;align-items:center;">
                <strong style="font-size:14px;">${r.test_name}</strong>
                <span class="status-pill ${r.result_status === 'Pass' ? 'approved' : r.result_status === 'Fail' ? 'rejected' : 'registered'}">
                  ${r.result_status || 'Registered'}
                </span>
              </div>
              <div style="font-size:12px;color:var(--color-text-muted);margin-top:6px;">
                Registered on: ${new Date(r.registered_at).toLocaleDateString()}
              </div>
              ${r.marks_obtained !== undefined ? `
                <div style="display:flex;justify-content:between;margin-top:10px;padding-top:10px;border-top:1px dashed var(--color-border);font-size:13px;">
                  <span>Score Obtained:</span>
                  <strong>${r.marks_obtained} Marks</strong>
                </div>
              ` : `
                <div style="font-size:12px;color:var(--color-warning);margin-top:8px;font-style:italic;">
                  Evaluation pending. Result will be displayed here soon.
                </div>
              `}
            </div>
          `).join('')}
        </div>
      `;
    }
  }

  function renderStudentTestDetail(test, reg) {
    const body = document.getElementById('details-body');
    const title = document.getElementById('details-title');
    if (!body || !title) return;

    title.textContent = 'Test Information';
    body.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:16px;">
        <div>
          <h2 style="font-size:16px;margin:0 0 4px 0;">${test.name}</h2>
          <span style="font-size:12px;color:var(--color-text-muted);">Test ID: ${test.id}</span>
        </div>
        <div class="admissions-card" style="border-radius:var(--radius-md);box-shadow:none;">
          <div class="admissions-card-body" style="padding:14px;display:flex;flex-direction:column;gap:10px;">
            <div class="detail-row">
              <span class="detail-label">Scheduled Date:</span>
              <span class="detail-value">${test.date}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Duration:</span>
              <span class="detail-value">${test.duration} Minutes</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Venue:</span>
              <span class="detail-value">${test.venue}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Total Marks:</span>
              <span class="detail-value">${test.total_marks} Marks</span>
            </div>
          </div>
        </div>
        ${reg ? `
          <div style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:var(--radius-md);padding:14px;color:#065f46;font-size:13px;">
            <strong>You are registered for this test.</strong><br/>
            Please reach the venue 15 minutes before schedule. Carry your entrance admit card.
          </div>
        ` : `
          <button class="btn btn-primary btn-register-test" style="width:100%;justify-content:center;" data-id="${test.id}" data-name="${test.name}">
            Register for Test
          </button>
        `}
      </div>
    `;

    body.querySelector('.btn-register-test')?.addEventListener('click', async () => {
      try {
        await registerForTest({
          test_id: test.id,
          lead_id: leadId || user?.id,
          test_name: test.name,
          student_name: user?.name,
          student_email: user?.email
        });
        alert(`Successfully registered for ${test.name}!`);
        await refreshPage();
      } catch (err) {
        alert('Registration failed: ' + err.message);
      }
    });
    window.renderIcons?.();
  }

  async function viewTestEvaluation(testId, testName, allRegs) {
    const body = document.getElementById('details-body');
    const title = document.getElementById('details-title');
    if (!body || !title) return;

    title.textContent = 'Evaluation - ' + testName;
    const testRegs = allRegs.filter(r => r.test_id === testId);

    let meritList = [];
    try {
      meritList = await fetchMeritList(testId);
    } catch (e) {
      console.error(e);
    }

    body.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:16px;">
        <div style="display:flex;justify-content:between;align-items:center;">
          <h4 style="margin:0;font-size:14px;">Registrants (${testRegs.length})</h4>
          <button class="btn btn-secondary btn-sm" id="btn-merit-list" style="padding:4px 8px;font-size:11px;">
            <i data-lucide="award" style="width:12px;height:12px;margin-right:4px;"></i> View Merit List
          </button>
        </div>
        <div style="max-height:350px;overflow-y:auto;display:flex;flex-direction:column;gap:10px;" id="eval-regs-list">
          ${testRegs.length === 0 ? `
            <p style="text-align:center;color:var(--color-text-muted);padding:16px;">No registrations for this test yet.</p>
          ` : testRegs.map(r => `
            <div style="border:1px solid var(--color-border);border-radius:var(--radius-md);padding:10px;background:var(--color-bg-card);display:flex;justify-content:between;align-items:center;">
              <div>
                <strong style="font-size:13px;display:block;">${r.student_name}</strong>
                <span style="font-size:11px;color:var(--color-text-muted);">${r.student_email}</span>
              </div>
              <div style="text-align:right;">
                ${r.marks_obtained !== undefined && r.marks_obtained !== null ? `
                  <span style="font-size:12px;font-weight:700;color:var(--color-primary);margin-right:8px;">${r.marks_obtained} Marks</span>
                  <span class="status-pill ${r.result_status === 'Pass' || r.result === 'pass' ? 'approved' : 'rejected'}">${r.result_status || r.result || 'Pass'}</span>
                ` : `
                  <button class="btn btn-secondary btn-sm btn-submit-score" data-regid="${r.id}" data-testid="${testId}" data-email="${r.student_email}" data-name="${r.student_name}" style="padding:4px 8px;font-size:11px;">
                    Submit Score
                  </button>
                `}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    // Bind Merit List Button
    document.getElementById('btn-merit-list')?.addEventListener('click', () => {
      const meritContent = `
        <div style="display:flex;flex-direction:column;gap:12px;max-height:450px;overflow-y:auto;">
          ${meritList.length === 0 ? `
            <p style="text-align:center;color:var(--color-text-muted);padding:24px;">No evaluated scores available to generate merit list.</p>
          ` : `
            <table class="data-table">
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Student Name</th>
                  <th>Email</th>
                  <th>Marks Obtained</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                ${meritList.map((m, idx) => `
                  <tr>
                    <td><strong>#${idx + 1}</strong></td>
                    <td><strong>${m.student_name}</strong></td>
                    <td>${m.student_email}</td>
                    <td><strong style="color:var(--color-primary);">${m.marks_obtained}</strong></td>
                    <td><span class="status-pill approved">Pass</span></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          `}
        </div>
      `;

      openModal('Merit List — ' + testName, meritContent, {
        submitLabel: 'Export PDF',
        width: '560px',
        onSubmit: () => {
          alert('Merit list export triggered!');
          return true;
        }
      });
    });

    // Bind Submit Score Button
    body.querySelectorAll('.btn-submit-score').forEach(btn => {
      btn.addEventListener('click', () => {
        const studentName = btn.dataset.name;
        const studentEmail = btn.dataset.email;
        const testId = btn.dataset.testid;
        const regId = btn.dataset.regid;

        const scoreContent = `
          <div style="display:flex;flex-direction:column;gap:14px;">
            <p>Enter entrance exam score details for <strong>${studentName}</strong> (${studentEmail}).</p>
            <div class="form-group">
              <label class="form-label">Marks Obtained *</label>
              <input type="number" id="eval-marks" class="form-input" placeholder="e.g. 78" required />
            </div>
            <div class="form-group">
              <label class="form-label">Result Status</label>
              <select id="eval-status" class="form-input">
                <option value="Pass">Pass</option>
                <option value="Fail">Fail</option>
              </select>
            </div>
          </div>
          <div id="eval-error" style="color:#dc2626;font-size:13px;margin-top:8px;display:none;"></div>
        `;

        openModal('Submit Test Score', scoreContent, {
          submitLabel: 'Save Score',
          width: '400px',
          onSubmit: async (scoreBody) => {
            const marks = scoreBody.querySelector('#eval-marks').value;
            const status = scoreBody.querySelector('#eval-status').value;
            const errEl = scoreBody.querySelector('#eval-error');

            if (!marks) {
              errEl.textContent = 'Please enter marks obtained.';
              errEl.style.display = 'block';
              return false;
            }

            try {
              await submitTestResult({
                registration_id: regId,
                marks_obtained: Number(marks),
                status: status,
                result_status: status,
                test_id: testId,
                student_email: studentEmail
              });
              alert('Score updated successfully!');
              await refreshPage();
              // Reload evaluation panel
              const updatedRegs = await fetchTestRegistrations();
              await viewTestEvaluation(testId, testName, updatedRegs);
              return true;
            } catch (err) {
              errEl.textContent = err.message;
              errEl.style.display = 'block';
              return false;
            }
          }
        });
      });
    });

    window.renderIcons?.();
  }
}
