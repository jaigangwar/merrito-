import {
  fetchScholarships,
  createScholarship,
  applyForScholarship,
  reviewScholarshipApplication,
  fetchScholarshipApplications,
  fetchLeads
} from '../lib/api.js';
import { getCurrentUser } from '../lib/auth.js';
import { openModal } from '../components/modal.js';

export async function renderScholarships(el) {
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
          <h1 class="page-header-title">Scholarships & Financial Aid</h1>
          <p class="page-header-subtitle">Browse, apply, and manage scholarship programs for meritorious and deserving candidates.</p>
        </div>
        ${!isStudent ? `
          <button class="btn btn-primary" id="btn-create-scholarship">
            <i data-lucide="plus" style="width:16px;height:16px;margin-right:6px;"></i> Create Scholarship
          </button>
        ` : ''}
      </div>

      <div class="admissions-stats-grid" id="sch-stats-grid">
        <!-- Dynamic Stats -->
      </div>

      <div>
        <h2 style="font-size: 18px; font-weight: 700; margin-bottom: 16px;">
          ${isStudent ? 'Available Scholarship Programs' : 'Scholarship Schemes'}
        </h2>
        <div class="scholarship-cards-grid" id="scholarships-grid-container">
          <div style="grid-column: 1/-1; text-align: center; padding: 24px; color: var(--color-text-muted);">
            Loading scholarship schemes...
          </div>
        </div>
      </div>

      <div class="admissions-card" style="margin-top: var(--spacing-lg);">
        <div class="admissions-card-header">
          <h3 class="admissions-card-title">${isStudent ? 'My Scholarship Applications' : 'Scholarship Applications Panel'}</h3>
        </div>
        <div class="admissions-card-body" style="padding: 0;">
          <div class="ops-table-wrap" style="margin: 0; border: none; border-radius: 0;">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Applicant Name</th>
                  <th>Email</th>
                  <th>Scholarship Scheme</th>
                  <th>Applied On</th>
                  <th>Remarks / Evaluation</th>
                  <th>Status</th>
                  ${!isStudent ? '<th>Actions</th>' : ''}
                </tr>
              </thead>
              <tbody id="sch-applications-list">
                <tr><td colspan="${!isStudent ? '7' : '6'}" style="text-align:center;padding:24px;">Loading applications...</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  `;

  // Fetch initial data
  await refreshScholarshipsPage();

  // Create Scholarship Button Event
  if (!isStudent) {
    document.getElementById('btn-create-scholarship')?.addEventListener('click', () => {
      const content = `
        <div class="form-grid" style="display:grid;grid-template-columns:1fr;gap:16px;">
          <div class="form-group">
            <label class="form-label">Scholarship Name *</label>
            <input type="text" id="sch-name" class="form-input" placeholder="e.g. Merit-cum-Means Scholarship" required />
          </div>
          <div class="form-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
            <div class="form-group">
              <label class="form-label">Scheme Type *</label>
              <select id="sch-type" class="form-input">
                <option value="Merit-Based">Merit-Based</option>
                <option value="Need-Based">Need-Based</option>
                <option value="Special Category">Special Category</option>
                <option value="Sports / Cultural">Sports / Cultural Excellence</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Waiver / Award Amount *</label>
              <input type="text" id="sch-amount" class="form-input" placeholder="e.g. 50% Tuition Fee waiver" required />
            </div>
          </div>
          <div class="form-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
            <div class="form-group">
              <label class="form-label">Eligibility Criteria *</label>
              <input type="text" id="sch-eligibility" class="form-input" placeholder="e.g. >= 85% in 10+2 marks" required />
            </div>
            <div class="form-group">
              <label class="form-label">Deadline Date *</label>
              <input type="date" id="sch-deadline" class="form-input" required />
            </div>
          </div>
        </div>
        <div id="sch-error" style="color:#dc2626;font-size:13px;margin-top:8px;display:none;"></div>
      `;

      openModal('Create New Scholarship Scheme', content, {
        submitLabel: 'Create Scheme',
        width: '540px',
        onSubmit: async (body) => {
          const name = body.querySelector('#sch-name').value.trim();
          const type = body.querySelector('#sch-type').value;
          const amount = body.querySelector('#sch-amount').value.trim();
          const eligibility = body.querySelector('#sch-eligibility').value.trim();
          const deadline = body.querySelector('#sch-deadline').value;

          const errEl = body.querySelector('#sch-error');
          if (!name || !amount || !eligibility || !deadline) {
            errEl.textContent = 'All fields are required.';
            errEl.style.display = 'block';
            return false;
          }

          try {
            await createScholarship({
              name,
              type,
              amount,
              eligibility,
              eligibility_criteria: eligibility,
              deadline
            });
            await refreshScholarshipsPage();
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

  async function refreshScholarshipsPage() {
    try {
      const scholarships = await fetchScholarships();
      const applications = await fetchScholarshipApplications();

      // Render Stats
      const statsGrid = document.getElementById('sch-stats-grid');
      if (statsGrid) {
        if (isStudent) {
          const appliedCount = applications.length;
          const approvedCount = applications.filter(a => a.status === 'Approved').length;
          statsGrid.innerHTML = `
            <div class="admissions-stat-card">
              <div class="stat-icon-wrap"><i data-lucide="graduation-cap" style="width:24px;height:24px;"></i></div>
              <div class="stat-details">
                <span class="stat-val">${scholarships.length}</span>
                <span class="stat-lbl">Active Schemes</span>
              </div>
            </div>
            <div class="admissions-stat-card">
              <div class="stat-icon-wrap" style="background:#e0f2fe;color:#0369a1;"><i data-lucide="file-text" style="width:24px;height:24px;"></i></div>
              <div class="stat-details">
                <span class="stat-val">${appliedCount}</span>
                <span class="stat-lbl">Applied</span>
              </div>
            </div>
            <div class="admissions-stat-card">
              <div class="stat-icon-wrap" style="background:#dcfce7;color:#15803d;"><i data-lucide="check-circle" style="width:24px;height:24px;"></i></div>
              <div class="stat-details">
                <span class="stat-val">${approvedCount}</span>
                <span class="stat-lbl">Approved Aid</span>
              </div>
            </div>
          `;
        } else {
          const totalApps = applications.length;
          const pendingReview = applications.filter(a => a.status === 'Pending').length;
          statsGrid.innerHTML = `
            <div class="admissions-stat-card">
              <div class="stat-icon-wrap"><i data-lucide="graduation-cap" style="width:24px;height:24px;"></i></div>
              <div class="stat-details">
                <span class="stat-val">${scholarships.length}</span>
                <span class="stat-lbl">Active Schemes</span>
              </div>
            </div>
            <div class="admissions-stat-card">
              <div class="stat-icon-wrap" style="background:#e0f2fe;color:#0369a1;"><i data-lucide="users" style="width:24px;height:24px;"></i></div>
              <div class="stat-details">
                <span class="stat-val">${totalApps}</span>
                <span class="stat-lbl">Applications</span>
              </div>
            </div>
            <div class="admissions-stat-card">
              <div class="stat-icon-wrap" style="background:#fef3c7;color:#b45309;"><i data-lucide="alert-circle" style="width:24px;height:24px;"></i></div>
              <div class="stat-details">
                <span class="stat-val">${pendingReview}</span>
                <span class="stat-lbl">Pending Review</span>
              </div>
            </div>
          `;
        }
      }

      // Render Scholarships List/Cards
      const gridContainer = document.getElementById('scholarships-grid-container');
      if (gridContainer) {
        if (scholarships.length === 0) {
          gridContainer.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:24px;color:var(--color-text-muted);">No scholarship schemes available at this moment.</div>`;
        } else {
          gridContainer.innerHTML = scholarships.map(s => {
            const badgeClass = s.type.includes('Merit') ? 'merit' : s.type.includes('Special') ? 'special' : 'sports';
            const isApplied = applications.some(a => a.scholarship_id === s.id && a.student_email === user.email);

            return `
              <div class="scholarship-card">
                <span class="scholarship-badge ${badgeClass}">${s.type}</span>
                <h4 class="scholarship-title">${s.name}</h4>
                <div class="scholarship-amount">${s.amount}</div>
                <div class="scholarship-details">
                  <div class="detail-row">
                    <span class="detail-label">Eligibility:</span>
                    <span class="detail-value">${s.eligibility}</span>
                  </div>
                  <div class="detail-row">
                    <span class="detail-label">Deadline:</span>
                    <span class="detail-value">${s.deadline}</span>
                  </div>
                </div>
                ${isStudent ? `
                  ${isApplied ? `
                    <button class="btn btn-secondary" disabled style="width:100%;justify-content:center;">Applied</button>
                  ` : `
                    <button class="btn btn-primary btn-apply-scholarship" data-id="${s.id}" data-name="${s.name}" style="width:100%;justify-content:center;">
                      Apply Scheme
                    </button>
                  `}
                ` : ''}
              </div>
            `;
          }).join('');

          // Bind Apply Button
          gridContainer.querySelectorAll('.btn-apply-scholarship').forEach(btn => {
            btn.addEventListener('click', async () => {
              const scholarship_id = btn.dataset.id;
              const scholarship_name = btn.dataset.name;

              try {
                await applyForScholarship({
                  scholarship_id,
                  lead_id: leadId || user?.id,
                  scholarship_name,
                  student_name: user?.name,
                  student_email: user?.email
                });
                alert(`Successfully applied for ${scholarship_name}!`);
                await refreshScholarshipsPage();
              } catch (err) {
                alert('Application failed: ' + err.message);
              }
            });
          });
        }
      }

      // Render Applications Table
      const applicationsList = document.getElementById('sch-applications-list');
      if (applicationsList) {
        if (applications.length === 0) {
          applicationsList.innerHTML = `<tr><td colspan="${!isStudent ? '7' : '6'}" style="text-align:center;padding:24px;color:var(--color-text-muted);">No scholarship applications yet.</td></tr>`;
        } else {
          applicationsList.innerHTML = applications.map(a => {
            const date = new Date(a.applied_at).toLocaleDateString();
            const remarks = a.remarks || 'No remarks provided';
            const statusClass = a.status === 'Approved' ? 'approved' : a.status === 'Rejected' ? 'rejected' : 'pending';

            return `
              <tr>
                <td><strong>${a.student_name}</strong></td>
                <td>${a.student_email}</td>
                <td><strong>${a.scholarship_name}</strong></td>
                <td>${date}</td>
                <td><small style="color:var(--color-text-secondary);">${remarks}</small></td>
                <td><span class="status-pill ${statusClass}">${a.status}</span></td>
                ${!isStudent ? `
                  <td>
                    ${a.status === 'Pending' ? `
                      <button class="btn btn-secondary btn-sm btn-review-app" data-id="${a.id}" data-name="${a.student_name}" data-scheme="${a.scholarship_name}">
                        Review
                      </button>
                    ` : `
                      <span style="font-size:11px;color:var(--color-text-muted);font-style:italic;">Evaluated</span>
                    `}
                  </td>
                ` : ''}
              </tr>
            `;
          }).join('');

          // Bind Review Button
          applicationsList.querySelectorAll('.btn-review-app').forEach(btn => {
            btn.addEventListener('click', () => {
              const appId = btn.dataset.id;
              const studentName = btn.dataset.name;
              const schemeName = btn.dataset.scheme;

              const reviewContent = `
                <div style="display:flex;flex-direction:column;gap:14px;">
                  <p>Reviewing scholarship application for <strong>${studentName}</strong> under the <strong>${schemeName}</strong> scheme.</p>
                  <div class="form-group">
                    <label class="form-label">Review Status</label>
                    <select id="rev-status" class="form-input">
                      <option value="Approved">Approve Scholarship</option>
                      <option value="Rejected">Reject Scholarship</option>
                    </select>
                  </div>
                  <div class="form-group">
                    <label class="form-label">Remarks / Evaluation Notes *</label>
                    <textarea id="rev-remarks" class="form-input" rows="3" placeholder="Enter reason for approval or rejection..."></textarea>
                  </div>
                </div>
                <div id="rev-error" style="color:#dc2626;font-size:13px;margin-top:8px;display:none;"></div>
              `;

              openModal('Evaluate Scholarship Application', reviewContent, {
                submitLabel: 'Save Evaluation',
                width: '440px',
                onSubmit: async (reviewBody) => {
                  const status = reviewBody.querySelector('#rev-status').value;
                  const remarks = reviewBody.querySelector('#rev-remarks').value.trim();
                  const errEl = reviewBody.querySelector('#rev-error');

                  if (!remarks) {
                    errEl.textContent = 'Please enter remarks explaining your decision.';
                    errEl.style.display = 'block';
                    return false;
                  }

                  try {
                    await reviewScholarshipApplication({
                      application_id: appId,
                      id: appId,
                      status,
                      remarks
                    });
                    alert('Scholarship application evaluated successfully!');
                    await refreshScholarshipsPage();
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
        }
      }

      window.renderIcons?.();
    } catch (err) {
      console.error(err);
    }
  }
}
