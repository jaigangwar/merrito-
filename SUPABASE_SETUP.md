# Supabase Production Database Setup Guide

Follow these steps to connect your RBMI CRM to a real Supabase instance.

---

## 🛠️ Step 1: Create your Supabase Project

1. Go to [Supabase](https://supabase.com) and sign in.
2. Click **New Project** and select your organization.
3. Configure:
   - **Name:** `RBMI Admission Hub`
   - **Database Password:** (Create a strong password and save it)
   - **Region:** Choose the region closest to you (e.g., Mumbai / AWS ap-south-1).
4. Click **Create new project** and wait for provisioning to complete.

---

## 💾 Step 2: Initialize Database Schema (SQL Editor)

Navigate to the **SQL Editor** tab in your Supabase dashboard and run the migrations in order:

### 1️⃣ Run Schema SQL
Open [001_schema.sql](file:///f:/RBMI%20Admission%20Hub/merrito-/supabase/migrations/001_schema.sql), copy its entire contents, paste it into a new SQL query tab in Supabase, and click **Run**.
This creates all core CRM tables:
* `profiles` (linked to Supabase auth users)
* `leads`
* `counselors`
* `courses`
* `activities`
* `tasks`
* `applications`
* `queries`
* `payments`
* `portal_profiles`
* `institute_settings`
* `form_templates`
* `campaigns`

### 2️⃣ Run RLS & Scoped Policies SQL
Open [002_real_mode_policies.sql](file:///f:/RBMI%20Admission%20Hub/merrito-/supabase/migrations/002_real_mode_policies.sql), copy its contents, run it in a new SQL query window.
This configures secure **Row Level Security (RLS)** rules:
* Counselors can only read leads assigned to them.
* Students can only read their own profile, applications, queries, and payments.
* Admins can read all data.

### 3️⃣ Run Lead Intelligence Alterations SQL
Open [004_lead_intelligence.sql](file:///f:/RBMI%20Admission%20Hub/merrito-/supabase/migrations/004_lead_intelligence.sql), copy its contents, and run it.
This adds support columns for **lead scoring, strength levels, verification status, and campaign source payloads**.

### 4️⃣ Setup Seed-Safe User Trigger
Open [003_fix_auth_trigger_for_seed.sql](file:///f:/RBMI%20Admission%20Hub/merrito-/supabase/migrations/003_fix_auth_trigger_for_seed.sql) and run it.
* This updates the default signup trigger to upsert profiles gracefully and leaves it disconnected during initial console-based seeding.

### 5️⃣ Run Workflows and Letter Templates SQL
Open [005_workflows_and_letters.sql](file:///f:/RBMI%20Admission%20Hub/merrito-/supabase/migrations/005_workflows_and_letters.sql), copy its contents, and run it in the SQL Editor.
* This creates the tables `letter_templates`, `offer_letters`, and `workflow_rules` (with visual `flow_data` column) and sets up RLS policies.

---


## 🔑 Step 3: Configure Environment Variables

Open your local project `.env` file and replace the placeholder Supabase settings:

```env
# Supabase Integration (Active)
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_ANON_KEY=your-actual-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-actual-service-role-key

VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-actual-anon-key

# Turn on Real Data Database Mode
REAL_DATA_MODE=true
USE_DEMO_DATA=false
SEED_DEMO_USERS=false
VITE_SHOW_DEMO_LOGIN=false
```

> [!IMPORTANT]
> You can find `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` inside your Supabase dashboard under **Project Settings** -> **API**.
> Make sure `SUPABASE_SERVICE_ROLE_KEY` is set in the server `.env` to bypass RLS policies for backend admin queries.

---

## 👥 Step 4: Seed Real Users

Seeding populates initial credentials directly into your Supabase Auth database:

1. Open [real-users.local.json](file:///f:/RBMI%20Admission%20Hub/merrito-/scripts/real-users.local.json) and modify it with the real names, emails, and passwords you want to set for Admin, Counselors, and Students.
2. In your terminal, run:
   ```bash
   npm run seed:users
   ```
3. Verify in your Supabase Dashboard that the users are visible in the **Authentication** module and the corresponding profiles are populated in your **profiles** table.

---

## ⚡ Step 5: Enable Auth Signup Trigger for Self-Registration

Once seeding is complete, run the following SQL command in your Supabase SQL editor to re-enable automated profile creation for student signups:

```sql
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```

Your production database setup is now complete! Turn on your server (`npm start`) to run the CRM on real Supabase data.
