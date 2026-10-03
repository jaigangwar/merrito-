-- Ensure registration/webhook lead inserts have all columns used by the API.
-- Safe to run repeatedly in the Supabase SQL editor.

alter table public.leads add column if not exists lead_score integer default 20;
alter table public.leads add column if not exists lead_strength text default 'nurture';
alter table public.leads add column if not exists verification_status text default 'needs_review';
alter table public.leads add column if not exists source_attribution jsonb default '{}'::jsonb;
alter table public.leads add column if not exists raw_source_payload jsonb default null;
