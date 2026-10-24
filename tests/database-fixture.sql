create extension if not exists pgcrypto;
create role anon;
create role authenticated;
create role service_role bypassrls;
create role postgres superuser;
create schema auth;
create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz default now());
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
grant usage on schema auth to authenticated, service_role;
grant execute on function auth.uid() to authenticated, service_role;
create table businesses (
  id uuid primary key default gen_random_uuid(), name text not null,
  phone_number_id text not null unique, settings jsonb not null default '{}',
  is_active boolean not null default true, system_prompt text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table wa_messages (
  id uuid primary key default gen_random_uuid(), wa_message_id text unique,
  message_id text not null unique, direction text not null default 'inbound', session_id text,
  phone_number_id text not null, customer_phone text not null, customer_name text,
  body text, message_timestamp timestamptz, status text not null default 'received',
  metadata jsonb not null default '{}', created_at timestamptz default now()
);
create table conversations (
  id uuid primary key default gen_random_uuid(), session_id text unique,
  business_id uuid not null references businesses(id), phone_number_id text,
  customer_phone text not null, customer_name text, human_takeover boolean not null default false,
  status text not null default 'open' check (status in ('open', 'waiting', 'closed')),
  last_message text, last_inbound_at timestamptz, last_message_at timestamptz,
  unread_count integer default 0, tags text[] default '{}',
  updated_at timestamptz default now(), created_at timestamptz default now(),
  unique (business_id, customer_phone)
);
create table leads (
  id uuid primary key default gen_random_uuid(), business_id uuid not null references businesses(id),
  customer_phone text not null, customer_name text, interested_service text, requirements text,
  preferred_appointment_time text, last_intent text, last_message_at timestamptz,
  budget text, location text, source_session_id text,
  status text not null default 'new' check (status in ('new', 'contacted', 'qualified', 'converted', 'lost')),
  updated_at timestamptz default now(), created_at timestamptz default now(),
  unique (business_id, customer_phone)
);
create table business_members (
  id uuid primary key default gen_random_uuid(), business_id text not null,
  user_id uuid not null references auth.users(id),
  role text not null default 'agent' check (role in ('platform_admin', 'owner', 'manager', 'agent')),
  invited_by uuid references auth.users(id), accepted_at timestamptz,
  created_at timestamptz default now(), updated_at timestamptz default now(),
  unique (business_id, user_id)
);
create table team_invites (
  id uuid primary key default gen_random_uuid(), business_id text not null, email text not null,
  role text not null default 'agent', token text unique not null default encode(gen_random_bytes(32), 'hex'),
  invited_by uuid references auth.users(id), accepted_at timestamptz,
  expires_at timestamptz default now() + interval '7 days', created_at timestamptz default now()
);
create table appointment_requests (
  id uuid primary key default gen_random_uuid(), business_id text, customer_phone text,
  customer_name text, service text, requested_time text, status text default 'pending_human_confirmation',
  source_message_id text, assigned_staff_id uuid references auth.users(id), appointment_type text,
  timezone text default 'Asia/Kolkata', confirmed_at timestamptz, notes text,
  created_at timestamptz default now(), updated_at timestamptz default now()
);
create table escalations (
  id uuid primary key default gen_random_uuid(), business_id text, session_id text, customer_phone text,
  reason text, source_message_id text, status text default 'open', created_at timestamptz default now(),
  resolved_at timestamptz, resolved_by uuid references auth.users(id)
);
create table response_style_profiles (
  id uuid primary key default gen_random_uuid(), business_id text unique not null,
  approved boolean default true, style_notes text, example_customer text, example_reply text,
  created_at timestamptz default now(), updated_at timestamptz default now()
);
create table internal_notes (
  id uuid primary key default gen_random_uuid(), business_id text not null, session_id text,
  author_id uuid not null references auth.users(id), body text not null,
  created_at timestamptz default now(), updated_at timestamptz default now()
);
create table audit_log (
  id uuid primary key default gen_random_uuid(), business_id text, actor_id uuid references auth.users(id),
  action text not null, target_type text, target_id text, metadata jsonb default '{}', created_at timestamptz default now()
);
create table message_logs (
  id uuid primary key default gen_random_uuid(), business_id uuid references businesses(id),
  conversation_id uuid references conversations(id), message_id text, direction text, sender_phone text,
  recipient_phone text, message_type text, message_text text, raw_payload jsonb, status text,
  created_at timestamptz default now()
);
create table unknown_messages (
  id uuid primary key default gen_random_uuid(), phone_number_id text, sender_phone text,
  message_id text, message_text text, reason text, raw_payload jsonb, received_at timestamptz default now()
);
create function public.get_my_business_ids() returns setof text language sql security definer as $$
  select business_id from public.business_members where user_id = auth.uid();
$$;
create function public.is_platform_admin() returns boolean language sql security definer as $$
  select exists (select 1 from public.business_members where user_id = auth.uid() and role = 'platform_admin');
$$;
create function public.check_and_lock_inbound_batch(text, integer default 3)
returns jsonb language sql security definer as $$ select '{}'::jsonb; $$;
create function public.complete_inbound_batch(text, text[])
returns void language plpgsql security definer as $$ begin end; $$;
create function public.resolve_quoted_context(text, text)
returns jsonb language sql security definer as $$ select '{}'::jsonb; $$;
