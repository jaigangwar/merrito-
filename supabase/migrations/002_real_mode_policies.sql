-- RBMI Admission Hub — production-oriented Supabase policies
-- Run after 001_schema.sql when REAL_DATA_MODE=true.

create or replace function public.current_profile_role()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select role from public.profiles where id::text = auth.uid()::text limit 1
$$;

create or replace function public.current_counselor_id()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select counselor_id from public.profiles where id::text = auth.uid()::text limit 1
$$;

-- Enable RLS for all core tables
alter table public.profiles enable row level security;
alter table public.leads enable row level security;
alter table public.counselors enable row level security;
alter table public.courses enable row level security;
alter table public.activities enable row level security;
alter table public.tasks enable row level security;
alter table public.applications enable row level security;
alter table public.queries enable row level security;
alter table public.payments enable row level security;
alter table public.portal_profiles enable row level security;
alter table public.institute_settings enable row level security;
alter table public.form_templates enable row level security;
alter table public.campaigns enable row level security;

drop policy if exists "Anyone can read profiles" on profiles;
drop policy if exists "Service role can manage profiles" on profiles;
drop policy if exists "Anyone can read leads" on leads;
drop policy if exists "Service role can manage leads" on leads;
drop policy if exists "Anyone can read counselors" on counselors;
drop policy if exists "Service role can manage counselors" on counselors;
drop policy if exists "Anyone can read courses" on courses;
drop policy if exists "Service role can manage courses" on courses;
drop policy if exists "Anyone can read activities" on activities;
drop policy if exists "Service role can manage activities" on activities;
drop policy if exists "Anyone can read tasks" on tasks;
drop policy if exists "Service role can manage tasks" on tasks;
drop policy if exists "Anyone can read applications" on applications;
drop policy if exists "Service role can manage applications" on applications;
drop policy if exists "Anyone can read queries" on queries;
drop policy if exists "Service role can manage queries" on queries;
drop policy if exists "Anyone can read payments" on payments;
drop policy if exists "Service role can manage payments" on payments;
drop policy if exists "Anyone can read portal profiles" on portal_profiles;
drop policy if exists "Service role can manage portal profiles" on portal_profiles;
drop policy if exists "Anyone can read settings" on institute_settings;
drop policy if exists "Service role can manage settings" on institute_settings;
drop policy if exists "Anyone can read form templates" on form_templates;
drop policy if exists "Service role can manage form templates" on form_templates;
drop policy if exists "Anyone can read campaigns" on campaigns;
drop policy if exists "Service role can manage campaigns" on campaigns;

create policy "Profiles read scoped"
  on profiles for select using (id::text = auth.uid()::text or public.current_profile_role() = 'admin');

create policy "Leads read scoped"
  on leads for select using (
    public.current_profile_role() = 'admin'
    or counselor_id = public.current_counselor_id()
  );

create policy "Counselors read authenticated"
  on counselors for select to authenticated using (true);

create policy "Courses read authenticated"
  on courses for select to authenticated using (true);

create policy "Activities read admin"
  on activities for select using (public.current_profile_role() = 'admin');

create policy "Tasks read scoped"
  on tasks for select using (
    public.current_profile_role() = 'admin'
    or lead_id in (select id from leads where counselor_id = public.current_counselor_id())
  );

create policy "Applications read scoped"
  on applications for select using (
    public.current_profile_role() = 'admin'
    or user_id::text = auth.uid()::text
  );

create policy "Queries read scoped"
  on queries for select using (
    public.current_profile_role() = 'admin'
    or user_id::text = auth.uid()::text
  );

create policy "Payments read scoped"
  on payments for select using (
    public.current_profile_role() = 'admin'
    or user_id::text = auth.uid()::text
  );

create policy "Portal profiles read scoped"
  on portal_profiles for select using (
    public.current_profile_role() = 'admin'
    or user_id::text = auth.uid()::text
  );

create policy "Settings read authenticated"
  on institute_settings for select to authenticated using (true);

create policy "Form templates read authenticated"
  on form_templates for select to authenticated using (true);

create policy "Campaigns read admin"
  on campaigns for select using (public.current_profile_role() = 'admin');
