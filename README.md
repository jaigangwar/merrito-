# RBMI CRM — Admission Management System

**Rakshpal Bahadur Management Institute**  
📍 Bareilly Campus | 📍 Greater Noida Campus

A complete CRM for managing student admissions, counselors, leads, and pipeline — with automated lead capture from multiple sources.

---

## Quick Start

```bash
npm install
npm start          # Starts both API server (port 3001) and frontend (port 3000)
```

Or run separately:
```bash
npm run server     # API server only — http://localhost:3001
npm run dev        # Frontend only — http://localhost:3000
```

---

For real Supabase database/auth setup, see [SUPABASE_SETUP.md](./SUPABASE_SETUP.md).

## Login Credentials

| Role | Email | Password | Campus |
|------|-------|----------|--------|
| Admin | admin@rbmi.edu.in | admin123 | Bareilly |
| Counselor | priya@rbmi.edu.in | counselor123 | Bareilly |
| Counselor | rajesh@rbmi.edu.in | counselor123 | Bareilly |

---

## How Leads Come In

Leads are captured automatically via the **webhook endpoint** from:

1. **Website Forms** — Your RBMI website contact/inquiry forms
2. **JustDial** — Configure JustDial lead delivery to webhook URL
3. **Shiksha.com** — Set up Shiksha lead forwarding
4. **CollegeDekho** — Configure CollegeDekho lead delivery
5. **Google Ads Lead Forms** — Use n8n/Zapier to forward
6. **Facebook Lead Ads** — Connect via n8n automation
7. **Manual Entry** — Counselors/admins can add leads via "Add Lead" button

### Webhook URL
```
POST http://localhost:3001/api/webhook/lead
Content-Type: application/json
X-Webhook-Secret: your-secret-if-WEBHOOK_SECRET-is-set

{
  "name": "Rahul Sharma",
  "phone": "+91 9876543210",
  "email": "rahul@example.com",
  "course": "MBA",
  "source": "Website",
  "city": "Bareilly"
}
```

Set `WEBHOOK_SECRET` in `.env` to require the `X-Webhook-Secret` header on public lead webhooks. Login, signup, and webhook endpoints also include basic rate limiting.

---

## Features (Like Meritto) - 95% Complete

### Admin Panel
✅ Full dashboard with KPIs, charts, and activity feed  
✅ Leads Manager — add, edit, delete, filter, search, export CSV  
✅ **Bulk Import** — Import leads from CSV with validation and duplicate detection  
✅ **Saved Filters** — Save and share custom search filters  
✅ Pipeline (Kanban) — drag-and-drop stage management  
✅ Counselors — full CRUD (add/edit/delete counselors)  
✅ Courses — full CRUD (add/edit/delete courses)  
✅ **Interview Scheduling** — Schedule, manage, and track interviews with availability slots  
✅ **Admission Tests** — Create tests, register students, submit results, generate merit lists  
✅ **Scholarships** — Create scholarships, manage applications, review & approve  
✅ **Batch Management** — Create batches, assign students, manage sections  
✅ **Advanced Reports** — Conversion funnel, source effectiveness, revenue forecast, cohort analysis  
✅ **Notifications** — Push notifications, unread count, broadcast to users  
✅ Reports & Analytics — funnel, trends, source distribution  
✅ Settings — institute profile, user management, webhook config  
✅ Branch selector — Bareilly / Greater Noida  
✅ Export leads to CSV  
✅ Bulk operations  

### Counselor Panel
✅ Dashboard (own leads only)  
✅ My Leads — view and update their assigned leads  
✅ Pipeline — their leads only  
✅ Courses — view only  
✅ Branch-specific data  

### Lead Automation
✅ Webhook endpoint for external integrations  
✅ Auto-match course by name  
✅ Source tracking (Website, JustDial, Shiksha, etc.)  
✅ Activity logging  
✅ Stage change tracking  

### Payment Integration
✅ **Payment Gateway** — Mock Razorpay integration for online payments  
✅ Payment order creation and verification  
✅ Payment status tracking  
✅ Webhook support for payment events

### New Enterprise Features ⭐
✅ **Admission Test Management** — Complete test lifecycle from creation to merit list  
✅ **Scholarship Management** — Full scholarship workflow with applications & approvals  
✅ **Batch & Section Management** — Organize students into batches and sections  
✅ **Advanced Reporting** — 6 types of custom reports with scheduling  
✅ **Notification System** — Real-time push notifications with priority levels  

---

## Courses (Bareilly Campus)

- MBA (Master of Business Administration) — ₹3,50,000/yr
- BBA (Bachelor of Business Administration) — ₹1,80,000/yr
- BCA (Bachelor of Computer Applications) — ₹1,60,000/yr
- MCA (Master of Computer Applications) — ₹2,00,000/yr
- B.Com (Bachelor of Commerce) — ₹1,20,000/yr
- M.Com (Master of Commerce) — ₹1,50,000/yr
- PGDM (Post Graduate Diploma in Management) — ₹4,00,000/yr

---

## Tech Stack
- **Frontend**: Vite + Vanilla JS, Chart.js, Lucide Icons
- **Backend**: Express.js (Node.js)
- **Database**: Local JSON file (or Supabase PostgreSQL)
- **Auth**: JWT-based token authentication with branch support

---

## API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | /api/auth/login | None | Login |
| GET | /api/leads | Required | List leads |
| POST | /api/leads | Required | Create lead |
| PUT | /api/leads/:id | Required | Update lead |
| DELETE | /api/leads/:id | Admin | Delete lead |
| GET | /api/leads/export/csv | Required | Export CSV |
| POST | /api/import/leads | Admin | Bulk import leads from CSV |
| GET | /api/import/template | Required | Download CSV template |
| POST | /api/import/validate | Admin | Validate CSV before import |
| GET | /api/interviews | Required | List interviews |
| POST | /api/interviews | Required | Schedule interview |
| PUT | /api/interviews/:id | Required | Update interview |
| DELETE | /api/interviews/:id | Admin | Delete interview |
| GET | /api/interviews/slots | Required | Get available time slots |
| POST | /api/payment-gateway/order | Required | Create payment order |
| POST | /api/payment-gateway/verify | Required | Verify payment |
| GET | /api/payment-gateway/status/:order_id | Required | Get payment status |
| GET | /api/saved-filters | Required | Get saved filters |
| POST | /api/saved-filters | Required | Create saved filter |
| PUT | /api/saved-filters/:id | Required | Update saved filter |
| DELETE | /api/saved-filters/:id | Required | Delete saved filter |
| GET | /api/admission-tests | Required | List admission tests |
| POST | /api/admission-tests | Admin | Create admission test |
| POST | /api/admission-tests/register | Required | Register for test |
| POST | /api/admission-tests/result | Admin | Submit test result |
| GET | /api/admission-tests/:test_id/merit-list | Required | Generate merit list |
| GET | /api/scholarships | Required | List scholarships |
| POST | /api/scholarships | Admin | Create scholarship |
| POST | /api/scholarships/apply | Required | Apply for scholarship |
| POST | /api/scholarships/review | Admin | Review scholarship application |
| GET | /api/scholarships/applications | Required | Get scholarship applications |
| GET | /api/batches | Required | List batches |
| POST | /api/batches | Admin | Create batch |
| POST | /api/batches/assign | Admin | Assign student to batch |
| GET | /api/batches/students | Required | Get batch students |
| POST | /api/reports/generate | Required | Generate custom report |
| POST | /api/reports/schedule | Admin | Schedule report |
| GET | /api/notifications | Required | Get notifications |
| POST | /api/notifications | Admin | Create notification |
| POST | /api/notifications/broadcast | Admin | Broadcast notification |
| PUT | /api/notifications/:id/read | Required | Mark as read |
| POST | /api/webhook/lead | None | Capture lead (automation) |
| GET | /api/counselors | Required | List counselors |
| POST | /api/counselors | Admin | Add counselor |
| PUT | /api/counselors/:id | Admin | Update counselor |
| DELETE | /api/counselors/:id | Admin | Delete counselor |
| GET | /api/courses | Required | List courses |
| POST | /api/courses | Admin | Add course |
| GET | /api/dashboard/stats | Required | Dashboard data |
| GET | /api/pipeline | Required | Pipeline data |
| GET | /api/settings | Required | Get settings |
| PUT | /api/settings | Admin | Save settings |
