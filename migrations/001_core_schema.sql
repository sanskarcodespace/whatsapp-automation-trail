-- ============================================================
-- MIGRATION 001: Core Schema for Multi-Tenant WhatsApp CRM
-- Run in: Supabase Dashboard > SQL Editor
-- SAFE: Creates missing tables, alters existing tables safely.
-- ============================================================

-- 1. Ensure permissions on existing public schema first
grant usage on schema public to postgres, anon, authenticated, service_role;
grant all on all tables in schema public to postgres, anon, authenticated, service_role;
grant all on all sequences in schema public to postgres, anon, authenticated, service_role;
grant all on all routines in schema public to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to postgres, anon, authenticated, service_role;

-- 2. businesses: ensure required columns exist
alter table businesses
  add column if not exists waba_id text,
  add column if not exists whatsapp_access_token_enc text,
  add column if not exists connection_status text default 'pending',
  add column if not exists is_active boolean default false,
  add column if not exists timezone text default 'Asia/Kolkata',
  add column if not exists supported_languages text[] default array['en'],
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now(),
  add column if not exists phone_number_id text;

-- 3. business_members (multi-tenant auth)
create table if not exists business_members (
  id           uuid primary key default gen_random_uuid(),
  business_id  text not null,
  user_id      uuid not null references auth.users(id) on delete cascade,
  role         text not null default 'agent'
    check (role in ('platform_admin','owner','manager','agent')),
  invited_by   uuid references auth.users(id),
  accepted_at  timestamptz,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now(),
  unique (business_id, user_id)
);

-- 4. team_invites
create table if not exists team_invites (
  id          uuid primary key default gen_random_uuid(),
  business_id text not null,
  email       text not null,
  role        text not null default 'agent'
    check (role in ('owner','manager','agent')),
  token       text unique not null default encode(gen_random_bytes(32),'hex'),
  invited_by  uuid references auth.users(id),
  accepted_at timestamptz,
  expires_at  timestamptz default (now() + interval '7 days'),
  created_at  timestamptz default now()
);

-- 5. wa_messages: ensure columns exist
alter table wa_messages
  add column if not exists read_at       timestamptz,
  add column if not exists agent_id      uuid references auth.users(id),
  add column if not exists is_manual_reply boolean default false,
  add column if not exists created_at    timestamptz default now();

-- 6. conversations: ensure columns exist
alter table conversations
  add column if not exists assigned_agent_id uuid references auth.users(id),
  add column if not exists unread_count     int default 0,
  add column if not exists tags             text[] default array[]::text[],
  add column if not exists created_at       timestamptz default now();

-- 7. leads: ensure columns exist
alter table leads
  add column if not exists assigned_agent_id uuid references auth.users(id),
  add column if not exists follow_up_date    date,
  add column if not exists notes             text,
  add column if not exists budget            text,
  add column if not exists location          text,
  add column if not exists source_session_id text,
  add column if not exists created_at        timestamptz default now();

-- 8. appointment_requests (CREATE if not exists)
create table if not exists appointment_requests (
  id                uuid primary key default gen_random_uuid(),
  business_id       text,
  customer_phone    text,
  customer_name     text,
  service           text,
  requested_time    text,
  status            text default 'pending_human_confirmation',
  source_message_id text,
  assigned_staff_id uuid references auth.users(id),
  appointment_type  text,
  timezone          text default 'Asia/Kolkata',
  confirmed_at      timestamptz,
  notes             text,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

-- 9. escalations (CREATE if not exists)
create table if not exists escalations (
  id                uuid primary key default gen_random_uuid(),
  business_id       text,
  session_id        text,
  customer_phone    text,
  reason            text,
  source_message_id text,
  status            text default 'open',
  created_at        timestamptz default now(),
  resolved_at       timestamptz,
  resolved_by       uuid references auth.users(id)
);

-- 10. response_style_profiles (CREATE if not exists)
create table if not exists response_style_profiles (
  id                uuid primary key default gen_random_uuid(),
  business_id       text unique not null,
  approved          boolean default true,
  style_notes       text,
  example_customer  text,
  example_reply     text,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

-- 11. internal_notes & audit_log (CREATE if not exists)
create table if not exists internal_notes (
  id          uuid primary key default gen_random_uuid(),
  business_id text not null,
  session_id  text,
  author_id   uuid not null references auth.users(id),
  body        text not null,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create table if not exists audit_log (
  id          uuid primary key default gen_random_uuid(),
  business_id text,
  actor_id    uuid references auth.users(id),
  action      text not null,
  target_type text,
  target_id   text,
  metadata    jsonb default '{}',
  created_at  timestamptz default now()
);

-- 12. Helper functions for RLS
create or replace function get_my_business_ids()
returns setof text language sql security definer stable as $$
  select business_id from business_members where user_id = auth.uid()
$$;

create or replace function is_platform_admin()
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from business_members
    where user_id = auth.uid() and role = 'platform_admin'
  )
$$;

-- 13. Ensure grants on all newly created tables
grant all on all tables in schema public to postgres, anon, authenticated, service_role;
grant all on all sequences in schema public to postgres, anon, authenticated, service_role;
grant all on all routines in schema public to postgres, anon, authenticated, service_role;

-- 14. Automatically link your user as platform_admin
insert into business_members (business_id, user_id, role)
select b.id, u.id, 'platform_admin'
from businesses b
cross join auth.users u
where u.email = 'sanskarsharma0310@gmail.com'
on conflict (business_id, user_id) do update set role = 'platform_admin';
