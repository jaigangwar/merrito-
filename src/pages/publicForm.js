import { getAPI } from '../lib/api.js';

export async function publicFormPage() {
  const formId = new URL(window.location.href).pathname.split('/').pop();
  const container = document.getElementById('page-content');

  try {
    const form = await getAPI(`/forms/${formId}`);

    container.innerHTML = `
      <div class="public-form-container">
        <div class="public-form-card">
          <div class="form-header">
            <h2>${form.name}</h2>
            ${form.description ? `<p>${form.description}</p>` : ''}
          </div>

          <form id="leadCaptureForm" class="lead-capture-form">
            ${form.fields.map((field, idx) => {
              const required = field.required ? 'required' : '';
              const requiredMark = field.required ? '<span class="required">*</span>' : '';

              if (field.type === 'textarea') {
                return `
                  <div class="form-group">
                    <label>${field.label} ${requiredMark}</label>
                    <textarea
                      name="${field.name}"
                      placeholder="${field.label}"
                      ${required}></textarea>
                  </div>
                `;
              } else if (field.type === 'select') {
                return `
                  <div class="form-group">
                    <label>${field.label} ${requiredMark}</label>
                    <select name="${field.name}" ${required}>
                      <option value="">Select ${field.label}</option>
                      <option value="yes">Yes</option>
                      <option value="no">No</option>
                    </select>
                  </div>
                `;
              } else {
                return `
                  <div class="form-group">
                    <label>${field.label} ${requiredMark}</label>
                    <input
                      type="${field.type}"
                      name="${field.name}"
                      placeholder="${field.label}"
                      ${required}>
                  </div>
                `;
              }
            }).join('')}

            <button type="submit" class="btn btn-primary btn-block">Submit</button>
          </form>

          <div id="successMessage" class="hidden alert alert-success">
            <h3>✅ Thank You!</h3>
            <p>We've received your inquiry. Our team will contact you soon.</p>
          </div>

          <div id="errorMessage" class="hidden alert alert-danger">
            <!-- Error message will appear here -->
          </div>
        </div>
      </div>

      <style>
        .public-form-container {
          min-height: 100vh;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }

        .public-form-card {
          background: white;
          border-radius: 12px;
          box-shadow: 0 20px 60px rgba(0,0,0,0.3);
          padding: 40px;
          max-width: 500px;
          width: 100%;
        }

        .form-header {
          margin-bottom: 30px;
          text-align: center;
        }

        .form-header h2 {
          margin: 0 0 10px 0;
          color: #333;
          font-size: 28px;
        }

        .form-header p {
          color: #666;
          margin: 0;
        }

        .form-group {
          margin-bottom: 20px;
        }

        .form-group label {
          display: block;
          margin-bottom: 8px;
          color: #333;
          font-weight: 500;
          font-size: 14px;
        }

        .required {
          color: #e74c3c;
        }

        .form-group input,
        .form-group textarea,
        .form-group select {
          width: 100%;
          padding: 12px;
          border: 1px solid #ddd;
          border-radius: 6px;
          font-size: 14px;
          font-family: inherit;
          transition: border-color 0.3s;
        }

        .form-group input:focus,
        .form-group textarea:focus,
        .form-group select:focus {
          outline: none;
          border-color: #667eea;
          box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
        }

        .form-group textarea {
          resize: vertical;
          min-height: 100px;
        }

        .btn-block {
          width: 100%;
          margin-top: 10px;
        }

        .alert {
          padding: 20px;
          border-radius: 6px;
          margin-bottom: 20px;
          text-align: center;
        }

        .alert-success {
          background: #d4edda;
          color: #155724;
          border: 1px solid #c3e6cb;
        }

        .alert-danger {
          background: #f8d7da;
          color: #721c24;
          border: 1px solid #f5c6cb;
        }

        .hidden {
          display: none !important;
        }

        @media (max-width: 600px) {
          .public-form-card {
            padding: 25px;
          }

          .form-header h2 {
            font-size: 22px;
          }
        }
      </style>
    `;

    document.getElementById('leadCaptureForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();

      const formData = new FormData(document.getElementById('leadCaptureForm'));
      const data = Object.fromEntries(formData);

      try {
        const response = await fetch(`/api/forms/public/${formId}/submit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });

        const result = await response.json();

        if (response.ok) {
          document.getElementById('leadCaptureForm').classList.add('hidden');
          document.getElementById('successMessage').classList.remove('hidden');

          if (result.redirect_url) {
            setTimeout(() => {
              window.location.href = result.redirect_url;
            }, 3000);
          }
        } else {
          throw new Error(result.error);
        }
      } catch (e) {
        document.getElementById('errorMessage').classList.remove('hidden');
        document.getElementById('errorMessage').textContent = '❌ ' + e.message;
      }
    });
  } catch (e) {
    container.innerHTML = `<div class="error-page"><h2>Form not found</h2><p>${e.message}</p></div>`;
  }
}
