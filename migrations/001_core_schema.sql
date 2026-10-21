-- ============================================================
-- MIGRATION 001: Core Schema for Multi-Tenant WhatsApp CRM
-- Run in: Supabase Dashboard > SQL Editor
-- SAFE: Additive only. No data dropped or overwritten.
-- ============================================================

create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- 1. businesses: ensure all required columns exist
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

-- 2. business_members (multi-tenant auth)
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

-- 3. team_invites
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

-- 4. wa_messages: add missing columns
alter table wa_messages
  add column if not exists read_at       timestamptz,
  add column if not exists agent_id      uuid references auth.users(id),
  add column if not exists is_manual_reply boolean default false,
  add column if not exists created_at    timestamptz default now();

-- Unique index to prevent duplicates (n8n already handles this via ON CONFLICT)
create unique index if not exists wa_messages_wa_message_id_direction_idx
  on wa_messages (wa_message_id, direction)
  where wa_message_id is not null;

-- 5. conversations: add missing columns
alter table conversations
  add column if not exists assigned_agent_id uuid references auth.users(id),
  add column if not exists unread_count     int default 0,
  add column if not exists tags             text[] default array[]::text[],
  add column if not exists created_at       timestamptz default now();

create unique index if not exists conversations_session_id_idx
  on conversations (session_id)
  where session_id is not null;

-- 6. leads: add missing columns
alter table leads
  add column if not exists assigned_agent_id uuid references auth.users(id),
  add column if not exists follow_up_date    date,
  add column if not exists notes             text,
  add column if not exists budget            text,
  add column if not exists location          text,
  add column if not exists source_session_id text,
  add column if not exists created_at        timestamptz default now();

create unique index if not exists leads_biz_phone_idx
  on leads (business_id, customer_phone)
  where business_id is not null and customer_phone is not null;

-- 7. appointment_requests: add missing columns
alter table appointment_requests
  add column if not exists assigned_staff_id uuid references auth.users(id),
  add column if not exists appointment_type  text,
  add column if not exists timezone          text default 'Asia/Kolkata',
  add column if not exists confirmed_at      timestamptz,
  add column if not exists notes             text,
  add column if not exists created_at        timestamptz default now(),
  add column if not exists updated_at        timestamptz default now();

-- 8. escalations: add missing columns
alter table escalations
  add column if not exists created_at  timestamptz default now(),
  add column if not exists resolved_at timestamptz,
  add column if not exists resolved_by uuid references auth.users(id);

-- 9. internal_notes
create table if not exists internal_notes (
  id          uuid primary key default gen_random_uuid(),
  business_id text not null,
  session_id  text,
  author_id   uuid not null references auth.users(id),
  body        text not null,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- 10. audit_log
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

-- 11. Indexes
create index if not exists idx_wa_messages_session_id     on wa_messages (session_id);
create index if not exists idx_wa_messages_business_id    on wa_messages (business_id);
create index if not exists idx_wa_messages_customer_phone on wa_messages (customer_phone);
create index if not exists idx_wa_messages_created_at     on wa_messages (created_at desc);
create index if not exists idx_conversations_session_id   on conversations (session_id);
create index if not exists idx_conversations_business_id  on conversations (business_id);
create index if not exists idx_conversations_status       on conversations (status);
create index if not exists idx_leads_business_id          on leads (business_id);
create index if not exists idx_leads_status               on leads (status);
create index if not exists idx_business_members_user      on business_members (user_id);
create index if not exists idx_business_members_business  on business_members (business_id);
create index if not exists idx_audit_log_business         on audit_log (business_id, created_at desc);

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

-- 13. Enable RLS
alter table businesses              enable row level security;
alter table business_members        enable row level security;
alter table wa_messages             enable row level security;
alter table conversations           enable row level security;
alter table leads                   enable row level security;
alter table appointment_requests    enable row level security;
alter table escalations             enable row level security;
alter table response_style_profiles enable row level security;
alter table internal_notes          enable row level security;
alter table audit_log               enable row level security;
alter table team_invites            enable row level security;

-- 14. RLS Policies
do $$ begin
  -- businesses
  drop policy if exists "businesses_select" on businesses;
  create policy "businesses_select" on businesses for select
    using (id::text = any(array(select get_my_business_ids())) or is_platform_admin());
  drop policy if exists "businesses_update" on businesses;
  create policy "businesses_update" on businesses for update
    using (id::text = any(array(select get_my_business_ids())) or is_platform_admin());

  -- business_members
  drop policy if exists "bm_select" on business_members;
  create policy "bm_select" on business_members for select
    using (user_id = auth.uid() or business_id = any(array(select get_my_business_ids())) or is_platform_admin());
  drop policy if exists "bm_insert" on business_members;
  create policy "bm_insert" on business_members for insert
    with check (business_id = any(array(select get_my_business_ids())) or is_platform_admin());
  drop policy if exists "bm_delete" on business_members;
  create policy "bm_delete" on business_members for delete
    using (business_id = any(array(select get_my_business_ids())) or is_platform_admin());

  -- wa_messages
  drop policy if exists "wam_select" on wa_messages;
  create policy "wam_select" on wa_messages for select
    using (business_id = any(array(select get_my_business_ids())) or is_platform_admin());
  drop policy if exists "wam_insert" on wa_messages;
  create policy "wam_insert" on wa_messages for insert
    with check (business_id = any(array(select get_my_business_ids())) or is_platform_admin());

  -- conversations
  drop policy if exists "conv_select" on conversations;
  create policy "conv_select" on conversations for select
    using (business_id = any(array(select get_my_business_ids())) or is_platform_admin());
  drop policy if exists "conv_update" on conversations;
  create policy "conv_update" on conversations for update
    using (business_id = any(array(select get_my_business_ids())) or is_platform_admin());

  -- leads, appointments, escalations, style_profiles, notes, audit, invites
  drop policy if exists "leads_all" on leads;
  create policy "leads_all" on leads for all
    using (business_id = any(array(select get_my_business_ids())) or is_platform_admin());
  drop policy if exists "appt_all" on appointment_requests;
  create policy "appt_all" on appointment_requests for all
    using (business_id = any(array(select get_my_business_ids())) or is_platform_admin());
  drop policy if exists "esc_all" on escalations;
  create policy "esc_all" on escalations for all
    using (business_id = any(array(select get_my_business_ids())) or is_platform_admin());
  drop policy if exists "style_all" on response_style_profiles;
  create policy "style_all" on response_style_profiles for all
    using (business_id = any(array(select get_my_business_ids())) or is_platform_admin());
  drop policy if exists "notes_all" on internal_notes;
  create policy "notes_all" on internal_notes for all
    using (business_id = any(array(select get_my_business_ids())) or is_platform_admin());
  drop policy if exists "audit_select" on audit_log;
  create policy "audit_select" on audit_log for select
    using (business_id = any(array(select get_my_business_ids())) or is_platform_admin());
  drop policy if exists "invites_all" on team_invites;
  create policy "invites_all" on team_invites for all
    using (business_id = any(array(select get_my_business_ids())) or is_platform_admin());
end $$;

-- 15. Updated_at triggers
create or replace function touch_updated_at()
returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end $$;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_businesses_upd') then
    create trigger trg_businesses_upd before update on businesses for each row execute function touch_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_leads_upd') then
    create trigger trg_leads_upd before update on leads for each row execute function touch_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_appt_upd') then
    create trigger trg_appt_upd before update on appointment_requests for each row execute function touch_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_members_upd') then
    create trigger trg_members_upd before update on business_members for each row execute function touch_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_notes_upd') then
    create trigger trg_notes_upd before update on internal_notes for each row execute function touch_updated_at();
  end if;
end $$;

-- 16. Realtime subscriptions for inbox
do $$ begin
  alter publication supabase_realtime add table wa_messages;
exception when others then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table conversations;
exception when others then null;
end $$;

-- 17. Ensure permissions for service_role and authenticated
grant usage on schema public to postgres, anon, authenticated, service_role;
grant all on all tables in schema public to postgres, anon, authenticated, service_role;
grant all on all sequences in schema public to postgres, anon, authenticated, service_role;
grant all on all routines in schema public to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant all on routines to postgres, anon, authenticated, service_role;

-- 18. Automatically link your account as platform_admin
insert into business_members (business_id, user_id, role)
select b.id, u.id, 'platform_admin'
from businesses b
cross join auth.users u
where u.email = 'sanskarsharma0310@gmail.com'
on conflict (business_id, user_id) do update set role = 'platform_admin';

-- MIGRATION 001 COMPLETE

