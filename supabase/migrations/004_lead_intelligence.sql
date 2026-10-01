-- Lead source intelligence for Meritto-style admission operations
alter table leads add column if not exists lead_score integer default 20;
alter table leads add column if not exists lead_strength text default 'nurture';
alter table leads add column if not exists verification_status text default 'needs_review';
alter table leads add column if not exists source_attribution jsonb default '{}'::jsonb;
alter table leads add column if not exists raw_source_payload jsonb default null;
