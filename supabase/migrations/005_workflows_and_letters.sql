-- Database migration for visual workflows and letter templates in RBMI Admissions CRM

-- Create letter_templates table if not exists
create table if not exists public.letter_templates (
  id text primary key,
  name text not null,
  content text,
  variables jsonb default '[]'::jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()),
  updated_at timestamp with time zone default timezone('utc'::text, now())
);

-- Create offer_letters table if not exists
create table if not exists public.offer_letters (
  id text primary key,
  application_id text not null,
  template_id text not null,
  content text,
  status text default 'generated',
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- Create workflow_rules table if not exists
create table if not exists public.workflow_rules (
  id text primary key,
  name text not null,
  trigger text not null,
  condition text,
  action text,
  template_id text,
  active boolean default true,
  flow_data jsonb default null,
  created_at timestamp with time zone default timezone('utc'::text, now()),
  updated_at timestamp with time zone default timezone('utc'::text, now())
);

-- Enable RLS
alter table public.letter_templates enable row level security;
alter table public.offer_letters enable row level security;
alter table public.workflow_rules enable row level security;

-- Policies for letter_templates
drop policy if exists "Allow all access to letter_templates for authenticated users" on public.letter_templates;
create policy "Allow all access to letter_templates for authenticated users"
  on public.letter_templates for all
  to authenticated
  using (true)
  with check (true);

-- Policies for offer_letters
drop policy if exists "Allow all access to offer_letters for authenticated users" on public.offer_letters;
create policy "Allow all access to offer_letters for authenticated users"
  on public.offer_letters for all
  to authenticated
  using (true)
  with check (true);

-- Policies for workflow_rules
drop policy if exists "Allow all access to workflow_rules for authenticated users" on public.workflow_rules;
create policy "Allow all access to workflow_rules for authenticated users"
  on public.workflow_rules for all
  to authenticated
  using (true)
  with check (true);

-- Seed default template
insert into public.letter_templates (id, name, content, variables, created_at, updated_at)
values (
  'lt-demo-001',
  'Standard MBA Offer Letter',
  '<h1>Offer of Admission</h1><p>Dear {{name}},</p><p>We are pleased to offer you admission to the <strong>{{course}}</strong> program at RBMI Bareilly for the academic year 2025-26.</p><p>Please complete your fee payment by {{due_date}} to confirm your seat.</p>',
  '["name", "course", "due_date"]'::jsonb,
  now(),
  now()
) on conflict (id) do nothing;

-- Seed default workflow rule
insert into public.workflow_rules (id, name, trigger, condition, action, template_id, active, flow_data, created_at, updated_at)
values (
  'wf-demo-001',
  'Send Offer Letter on Approval',
  'application_status_changed',
  'status === "approved"',
  'send_offer_letter',
  'lt-demo-001',
  true,
  null,
  now(),
  now()
) on conflict (id) do nothing;
