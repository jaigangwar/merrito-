# RBMI Admission Hub Deployment Readiness Checklist

## 1) Environment and Secrets
- [ ] `JWT_SECRET` is set to a strong random value.
- [ ] `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` are set.
- [ ] `WEBHOOK_SECRET` is configured for public lead capture.
- [ ] `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` are set.
- [ ] `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, sender numbers are set (if SMS/WhatsApp enabled).
- [ ] `GMAIL_USER`, `GMAIL_APP_PASSWORD` (or equivalent SMTP credentials) are set.
- [ ] `LLM_API_KEY` and model/base URL are set if AI features are enabled.

## 2) Demo vs Real Data Controls
- [ ] `REAL_DATA_MODE=true`
- [ ] `USE_DEMO_DATA=false`
- [ ] `SEED_DEMO_USERS=false` in production
- [ ] If demo login is required in non-production, set `SEED_DEMO_USERS=true` and provide `SEED_USERS_JSON`

## 3) Database and Schema
- [ ] Supabase migrations `001` to `005` are applied.
- [ ] RLS policies are enabled and validated for admin/counselor/student roles.
- [ ] Initial real counselors/courses are loaded through admin UI or migration scripts.

## 4) Integrations
- [ ] Lead providers (website, JustDial, Shiksha, CollegeDekho, FB/Google intermediaries) are pointed to `/api/webhook/lead`.
- [ ] Payment callback/webhook URLs are configured with signature validation enabled.
- [ ] Communication providers are tested end-to-end with sandbox/production credentials.

## 5) Operational Hardening
- [ ] Health endpoint `/api/health` monitored by uptime checks.
- [ ] Webhook retries and duplicate deliveries verified (idempotency behavior).
- [ ] Error logs and audit activities reviewed for failed integrations.

## 6) Verification Before Go-Live
- [ ] `npm run test` passes.
- [ ] `npm run build` passes.
- [ ] Module walkthrough completed for Leads → Counseling → Application → Payment → Admission.
