# RBMI Admission Hub Module Audit Matrix

Status key:
- **Working**: Route + controller present, no obvious demo-only shortcut in main flow
- **Partial**: Works but still has local fallback/manual behavior requiring environment setup or deeper integration
- **Mock/Demo Risk**: Contains explicit mock/demo logic or seeded fixtures

| Frontend Module (`src/pages`) | Backend Route/Controller | Status | Notes |
|---|---|---|---|
| `dashboard.js` | `/api/dashboard` → `dashboardController.js` | Partial | Relies on underlying modules that still support fallback storage |
| `leads.js` | `/api/leads` → `leadController.js` (+ `webhookController.js`) | Partial | Lead capture works; idempotency and strict validation added |
| `pipeline.js` | `/api/pipeline` → `pipelineController.js` | Partial | Depends on lead and counselor data consistency |
| `courses.js` | `/api/courses` → `courseController.js` | Partial | Works; still supports local fallback when Supabase unavailable |
| `counselors.js` | `/api/counselors` → `counselorController.js` | Partial | Works; still supports local fallback when Supabase unavailable |
| `settings.js` | `/api/settings`, `/api/users` | Partial | Works; user provisioning now env-controlled for seeding |
| `applications.js` | `/api/applications` → `applicationController.js`/`appStore.js` | Partial | Demo records removed from local admissions seed path |
| `queries.js` | `/api/queries` → `applicationController.js`/`appStore.js` | Partial | Demo records removed from local admissions seed path |
| `payments.js` | `/api/payments`, `/api/payment-gateway` | Partial | Mock payment shortcuts removed; now requires Razorpay env secrets |
| `studentPortal.js` | `/api/portal` → `portalController.js` | Partial | Portal demo fallback records removed; requires real user/profile data |
| `marketing.js` | `/api/marketing` → `marketingController.js` | Partial | Demo marketing fixtures removed; initializes empty collections |
| `callLogs.js` | `/api/marketing/call-logs` | Partial | No seeded sample logs now; depends on real calls/events |
| `studentInbox.js` | `/api/marketing/student-inbox` | Partial | No seeded sample inbox now |
| `chatSessions.js` | `/api/chat` → `chatController.js` | Partial | Supabase + local fallback path; requires real usage data |
| `dripCampaigns.js` | `/api/drip-campaigns` → `dripCampaignController.js` | Partial | Route exists; still has fallback branches |
| `reports.js` | `/api/reports` → `advancedReportController.js` | Partial | Data quality depends on upstream module completeness |
| `notifications.js` | `/api/notifications` → `notificationController.js` | Partial | Works with fallback path |
| `admissionTests.js` | `/api/admission-tests` → `admissionTestController.js` | Partial | Uses fallback store when Supabase unavailable |
| `scholarships.js` | `/api/scholarships` → `scholarshipController.js` | Partial | Uses fallback store when Supabase unavailable |
| `batches.js` | `/api/batches` → `batchController.js` | Partial | Uses fallback store when Supabase unavailable |
| `leadDistribution.js` | `/api/lead-distribution` → `leadDistributionController.js` | Partial | Local fallback behavior still present |
| `formBuilder.js` | `/api/forms` → `formBuilderController.js` | Partial | Local fallback behavior still present |
| `publicForm.js` | `/api/forms/public/*` and webhook ingestion | Partial | Depends on source/form integration setup |
| `platformSections.js` | Multiple (`/api/form-templates`, `/api/campaigns`, `/api/marketing`) | Partial | Displays integration status; no seeded demo entities after cleanup |
| `auditLog.js` | `/api/activities` → `activityController.js` | Partial | Data exists based on real activity writes |
| `userDashboard.js` | Composite APIs (`/api/dashboard`, `/api/leads`) | Partial | Derived from other module states |
| `login.js` | `/api/auth/*` → `authController.js`/`auth.js` | Partial | Demo login UI retained by request; startup user seed now explicit env-only |
| `studentQualityIndex.js` | `/api/leads`, `/api/ai/*` | Partial | Contains client-side fallback analytics when data sparse |
| `calendar.js` | Task/interview/calendar APIs | Partial | Depends on task/interview module completeness |

## Current top blockers for “fully working production mode”

1. Several controllers still permit local JSON fallback instead of hard-failing when Supabase is misconfigured.
2. Legacy route logic in `server/index.js` should be fully consolidated to controller-driven routes to avoid drift.
3. Some integrations (SMS/WhatsApp/Zoom/OCR) intentionally support mock responses when provider credentials are missing.
4. End-to-end acceptance and regression tests are minimal and need broader module-level coverage.
