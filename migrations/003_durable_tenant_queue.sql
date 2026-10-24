begin;

set local lock_timeout = '5s';

alter table public.businesses
  add column if not exists waba_id text,
  add column if not exists whatsapp_access_token_enc text,
  add column if not exists connection_status text default 'pending',
  add column if not exists timezone text default 'Asia/Kolkata',
  add column if not exists supported_languages text[] default array['en'],
  add column if not exists services text,
  add column if not exists products text,
  add column if not exists prices text,
  add column if not exists faqs text,
  add column if not exists opening_hours text,
  add column if not exists contact_details text,
  add column if not exists ai_tone text,
  add column if not exists booking_system text,
  add column if not exists handoff_message text;

update public.businesses set
  services = coalesce(services, settings->>'services'),
  products = coalesce(products, settings->>'products'),
  prices = coalesce(prices, settings->>'prices'),
  faqs = coalesce(faqs, settings->>'faqs'),
  opening_hours = coalesce(opening_hours, settings->>'opening_hours'),
  contact_details = coalesce(contact_details, settings->>'contact_details'),
  ai_tone = coalesce(ai_tone, settings->>'ai_tone'),
  booking_system = coalesce(booking_system, settings->>'booking_system'),
  handoff_message = coalesce(handoff_message, settings->>'handoff_message');

alter table public.wa_messages
  add column if not exists business_id text,
  add column if not exists quoted_message_id text;
update public.wa_messages message_row set business_id = business_row.id::text
from public.businesses business_row
where message_row.phone_number_id = business_row.phone_number_id
  and nullif(message_row.business_id, '') is null;
update public.wa_messages set session_id = phone_number_id || ':' || customer_phone
where session_id is null and phone_number_id is not null and customer_phone is not null;

alter table public.leads
  add column if not exists preferred_location text,
  add column if not exists preferred_bhk text,
  add column if not exists property_type text,
  add column if not exists timeline text,
  add column if not exists possession_type text;
alter table public.leads drop constraint if exists leads_status_check;
alter table public.leads add constraint leads_status_check
  check (status in ('new','contacted','interested','qualified','appointment','follow_up_required','converted','won','lost','closed'));
alter table public.conversations drop constraint if exists conversations_status_check;
alter table public.conversations add constraint conversations_status_check
  check (status in ('open','waiting','closed','bot','human','active','archived'));

create table if not exists public.inbound_message_buffer (
  id uuid primary key default gen_random_uuid(),
  business_id text not null,
  customer_phone text not null,
  session_id text not null,
  message_id text not null,
  quoted_message_id text,
  body text not null,
  status text not null default 'pending' check (status in ('pending','processing','completed','dropped')),
  created_at timestamptz not null default clock_timestamp(),
  processed_at timestamptz
);

alter table public.inbound_message_buffer
  add column if not exists phone_number_id text,
  add column if not exists customer_name text,
  add column if not exists message_timestamp timestamptz,
  add column if not exists metadata jsonb not null default '{}',
  add column if not exists batch_id uuid;

do $$
declare
  constraint_row record;
  index_row record;
begin
  for constraint_row in
    select constraint_info.conrelid::regclass as table_name, constraint_info.conname
    from pg_constraint constraint_info
    join pg_attribute column_info on column_info.attrelid = constraint_info.conrelid
      and column_info.attnum = constraint_info.conkey[1]
    where constraint_info.conrelid in ('public.wa_messages'::regclass, 'public.inbound_message_buffer'::regclass)
      and constraint_info.contype = 'u' and cardinality(constraint_info.conkey) = 1
      and column_info.attname in ('message_id', 'wa_message_id')
  loop
    execute format('alter table %s drop constraint %I', constraint_row.table_name, constraint_row.conname);
  end loop;
  for index_row in
    select index_info.indexrelid::regclass as index_name
    from pg_index index_info
    join pg_attribute column_info on column_info.attrelid = index_info.indrelid
      and column_info.attnum = index_info.indkey[0]
    where index_info.indrelid in ('public.wa_messages'::regclass, 'public.inbound_message_buffer'::regclass)
      and index_info.indisunique and not index_info.indisprimary and index_info.indnkeyatts = 1
      and column_info.attname in ('message_id', 'wa_message_id')
  loop
    execute format('drop index %s', index_row.index_name);
  end loop;
end $$;

create unique index if not exists inbound_buffer_business_message_unique
  on public.inbound_message_buffer (business_id, message_id);
create unique index if not exists wa_messages_business_message_unique
  on public.wa_messages (business_id, message_id);
create unique index if not exists wa_messages_business_wa_message_unique
  on public.wa_messages (business_id, wa_message_id);
create index if not exists wa_messages_business_session_created
  on public.wa_messages (business_id, session_id, created_at desc);
create index if not exists inbound_buffer_business_session_status
  on public.inbound_message_buffer (business_id, session_id, status, created_at);

create table if not exists public.inbound_batches (
  id uuid primary key default gen_random_uuid(),
  business_id text not null,
  session_id text not null,
  status text not null default 'processing' check (status in ('processing', 'completed', 'needs_reconciliation')),
  claim_token uuid not null default gen_random_uuid(),
  lease_expires_at timestamptz not null,
  saved_result jsonb,
  delivery_state jsonb not null default '{}',
  attempts integer not null default 1,
  last_error text,
  created_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz
);
create unique index if not exists inbound_batches_one_active_session
  on public.inbound_batches (business_id, session_id) where status in ('processing', 'needs_reconciliation');
create index if not exists inbound_batches_expired on public.inbound_batches (lease_expires_at)
  where status = 'processing';

update public.inbound_message_buffer set status = 'pending', processed_at = null
where status = 'processing' and batch_id is null;

alter table public.conversations add column if not exists handoff_batch_id uuid;

create or replace function public.bind_message_tenant()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare
  resolved_business_id text;
begin
  select id::text into resolved_business_id from public.businesses where phone_number_id = new.phone_number_id;
  if resolved_business_id is null or (new.business_id is not null and new.business_id <> resolved_business_id) then
    raise exception 'Message phone does not belong to the supplied business';
  end if;
  new.business_id := resolved_business_id;
  new.session_id := coalesce(new.session_id, new.phone_number_id || ':' || new.customer_phone);
  return new;
end;
$$;
drop trigger if exists bind_message_tenant on public.wa_messages;
create trigger bind_message_tenant before insert or update of business_id, phone_number_id
  on public.wa_messages for each row execute function public.bind_message_tenant();

create table if not exists public.workflow_errors (
  id uuid primary key default gen_random_uuid(),
  business_id text,
  session_id text,
  batch_id uuid,
  error_code text,
  error_message text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default clock_timestamp()
);
alter table public.workflow_errors
  add column if not exists business_id text,
  add column if not exists session_id text,
  add column if not exists batch_id uuid,
  add column if not exists error_code text,
  add column if not exists error_message text,
  add column if not exists metadata jsonb default '{}',
  add column if not exists created_at timestamptz default clock_timestamp();

create or replace function public.reset_manual_handoff_origin()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if new.handoff_batch_id is not distinct from old.handoff_batch_id then
    new.handoff_batch_id := null;
  end if;
  return new;
end;
$$;
drop trigger if exists reset_manual_handoff_origin on public.conversations;
create trigger reset_manual_handoff_origin before update of human_takeover
  on public.conversations for each row execute function public.reset_manual_handoff_origin();

create or replace function public.ingest_inbound_message(
  p_business_id text, p_phone_number_id text, p_customer_phone text,
  p_message_id text, p_body text, p_customer_name text default '',
  p_quoted_message_id text default null, p_message_timestamp timestamptz default null,
  p_metadata jsonb default '{}'
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  session_key text;
  inserted_id uuid;
  resolved_business_id public.businesses.id%type;
  expired_window boolean;
  conversation_row public.conversations;
begin
  if nullif(btrim(p_message_id), '') is null or nullif(btrim(p_body), '') is null
    or p_customer_phone is null or p_customer_phone !~ '^[0-9]+$' then
    raise exception 'Invalid inbound message';
  end if;
  select id into resolved_business_id from public.businesses
    where phone_number_id = p_phone_number_id and is_active = true;
  if (select count(*) from public.businesses where phone_number_id = p_phone_number_id) <> 1
    or resolved_business_id is null then
    insert into public.unknown_messages (phone_number_id, sender_phone, message_id, message_text, reason, raw_payload)
    select p_phone_number_id, p_customer_phone, p_message_id, p_body,
      'Unknown, inactive or ambiguous business phone', coalesce(p_metadata, '{}')
    where not exists (select 1 from public.unknown_messages
      where phone_number_id = p_phone_number_id and message_id = p_message_id);
    return jsonb_build_object('accepted', false, 'stored', true, 'reason', 'unknown_or_inactive_business');
  end if;
  if p_business_id is not null and p_business_id <> resolved_business_id::text then
    raise exception 'Unknown, inactive or ambiguous business phone';
  end if;
  p_business_id := resolved_business_id::text;
  expired_window := coalesce(p_message_timestamp < clock_timestamp() - interval '24 hours', false)
    or coalesce((p_metadata->>'reply_window_expired')::boolean, false);
  session_key := p_phone_number_id || ':' || p_customer_phone;
  perform pg_advisory_xact_lock(hashtextextended(p_business_id || chr(31) || session_key, 0));
  if exists (select 1 from public.conversations where session_id = session_key and business_id::text is distinct from p_business_id) then
    raise exception 'Conversation belongs to another business';
  end if;
  if exists (select 1 from public.wa_messages where business_id::text = p_business_id
    and (message_id = p_message_id or wa_message_id = p_message_id)) then
    return jsonb_build_object('accepted', false, 'stored', false, 'duplicate', true,
      'business_id', p_business_id, 'session_id', session_key);
  end if;
  insert into public.inbound_message_buffer
    (business_id, phone_number_id, customer_phone, customer_name, session_id,
      message_id, quoted_message_id, body, message_timestamp, metadata, created_at, status)
  values (p_business_id, p_phone_number_id, p_customer_phone, p_customer_name, session_key,
    p_message_id, nullif(p_quoted_message_id, ''), p_body,
    coalesce(p_message_timestamp, clock_timestamp()), coalesce(p_metadata, '{}'), clock_timestamp(),
    case when expired_window then 'dropped' else 'pending' end)
  on conflict (business_id, message_id) do nothing returning id into inserted_id;
  if inserted_id is not null then
    insert into public.wa_messages
      (business_id, phone_number_id, customer_phone, customer_name, session_id,
        wa_message_id, message_id, quoted_message_id, direction, body, message_timestamp, status, metadata)
    values (p_business_id, p_phone_number_id, p_customer_phone, p_customer_name, session_key,
      p_message_id, p_message_id, nullif(p_quoted_message_id, ''), 'inbound', p_body,
      coalesce(p_message_timestamp, clock_timestamp()), 'received',
      coalesce(p_metadata, '{}') || jsonb_build_object('quoted_message_id', nullif(p_quoted_message_id, '')))
    on conflict (business_id, message_id) do nothing;
    select * into conversation_row from public.conversations where business_id::text = p_business_id
      and customer_phone = p_customer_phone for update;
    if not found then
      insert into public.conversations (business_id, session_id, phone_number_id, customer_phone, customer_name,
        human_takeover, status, last_inbound_at, last_message_at, last_message, unread_count, updated_at)
      values (resolved_business_id, session_key, p_phone_number_id, p_customer_phone, p_customer_name, false, 'bot',
        coalesce(p_message_timestamp, clock_timestamp()), coalesce(p_message_timestamp, clock_timestamp()), left(p_body, 500), 1, clock_timestamp());
    else
      update public.conversations set session_id = session_key, phone_number_id = p_phone_number_id,
        last_inbound_at = greatest(last_inbound_at, coalesce(p_message_timestamp, clock_timestamp())),
        last_message_at = greatest(last_message_at, coalesce(p_message_timestamp, clock_timestamp())), last_message = left(p_body, 500),
        unread_count = coalesce(unread_count, 0) + 1, updated_at = clock_timestamp()
      where id = conversation_row.id and business_id::text = p_business_id;
    end if;
  end if;
  return jsonb_build_object('accepted', inserted_id is not null and not expired_window,
    'stored', inserted_id is not null, 'duplicate', inserted_id is null,
    'reason', case when expired_window then 'reply_window_expired' else null end,
    'business_id', p_business_id, 'session_id', session_key);
end;
$$;

create or replace function public.claim_inbound_batch(
  p_business_id text, p_session_id text, p_quiet_seconds integer default 2,
  p_lease_seconds integer default 300
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  batch_row public.inbound_batches;
  latest_received timestamptz;
  messages_json jsonb;
  quiet_seconds integer := greatest(1, least(coalesce(p_quiet_seconds, 2), 3));
  lease_seconds integer := greatest(30, least(coalesce(p_lease_seconds, 300), 900));
begin
  perform pg_advisory_xact_lock(hashtextextended(p_business_id || chr(31) || p_session_id, 0));
  select * into batch_row from public.inbound_batches
    where business_id::text = p_business_id and session_id = p_session_id
      and status in ('processing', 'needs_reconciliation') for update;
  if found then
    if batch_row.status = 'needs_reconciliation' then
      return jsonb_build_object('should_process', false, 'reason', 'needs_reconciliation', 'batch_id', batch_row.id);
    end if;
    if batch_row.lease_expires_at > clock_timestamp() then
      return jsonb_build_object('should_process', false, 'reason', 'session_busy',
        'retry_after_seconds', greatest(1, ceil(extract(epoch from batch_row.lease_expires_at - clock_timestamp()))));
    end if;
    if exists (select 1 from jsonb_each(batch_row.delivery_state) delivery where delivery.value->>'status' = 'sending') then
      update public.inbound_batches set status = 'needs_reconciliation',
        last_error = 'Delivery started but acknowledgement was not durably recorded' where id = batch_row.id;
      insert into public.workflow_errors (business_id, session_id, batch_id, error_code, error_message, metadata)
        values (p_business_id, p_session_id, batch_row.id, 'ambiguous_delivery',
          'Reconcile provider delivery before retrying this batch', batch_row.delivery_state);
      return jsonb_build_object('should_process', false, 'reason', 'needs_reconciliation', 'batch_id', batch_row.id);
    end if;
    update public.inbound_batches set claim_token = gen_random_uuid(),
      lease_expires_at = clock_timestamp() + make_interval(secs => lease_seconds), attempts = attempts + 1
      where id = batch_row.id returning * into batch_row;
  else
    select max(created_at) into latest_received from public.inbound_message_buffer
      where business_id::text = p_business_id and session_id = p_session_id and status = 'pending';
    if latest_received is null then
      return jsonb_build_object('should_process', false, 'reason', 'no_pending_messages');
    end if;
    if latest_received + make_interval(secs => quiet_seconds) > clock_timestamp() then
      return jsonb_build_object('should_process', false, 'reason', 'quiet_window_not_elapsed',
        'retry_after_seconds', greatest(1, ceil(extract(epoch from latest_received
          + make_interval(secs => quiet_seconds) - clock_timestamp()))));
    end if;
    insert into public.inbound_batches (business_id, session_id, lease_expires_at)
      values (p_business_id, p_session_id, clock_timestamp() + make_interval(secs => lease_seconds))
      returning * into batch_row;
    update public.inbound_message_buffer set status = 'processing', batch_id = batch_row.id,
      processed_at = clock_timestamp()
      where business_id::text = p_business_id and session_id = p_session_id and status = 'pending';
  end if;
  select jsonb_agg(to_jsonb(message_row) order by message_row.created_at, message_row.id)
    into messages_json from public.inbound_message_buffer message_row
    where business_id::text = p_business_id and session_id = p_session_id and batch_id = batch_row.id;
  return jsonb_build_object('should_process', true, 'batch_id', batch_row.id,
    'claim_token', batch_row.claim_token, 'business_id', p_business_id, 'session_id', p_session_id,
    'saved_result', batch_row.saved_result, 'delivery_state', batch_row.delivery_state,
    'message_count', jsonb_array_length(messages_json), 'messages', messages_json,
    'phone_number_id', messages_json->0->>'phone_number_id',
    'customer_phone', messages_json->0->>'customer_phone',
    'customer_name', messages_json->-1->>'customer_name',
    'message_id', messages_json->-1->>'message_id',
    'message_timestamp', messages_json->-1->>'message_timestamp',
    'message_ids', (select jsonb_agg(message->'message_id') from jsonb_array_elements(messages_json) message),
    'combined_text', (select string_agg(message->>'body', E'\n') from jsonb_array_elements(messages_json) message),
    'quoted_message_id', (select message->>'quoted_message_id' from jsonb_array_elements(messages_json)
      with ordinality as message_list(message, position) where nullif(message->>'quoted_message_id', '') is not null
      order by position desc limit 1));
end;
$$;

create or replace function public.list_ready_inbound_sessions(p_limit integer default 100)
returns jsonb language sql security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(to_jsonb(ready_session)), '[]') from (
    select business_id, session_id from (
      select pending.business_id, pending.session_id, min(pending.created_at) as first_received
      from public.inbound_message_buffer pending
      where pending.status = 'pending' and not exists (select 1 from public.inbound_batches active_batch
        where active_batch.business_id = pending.business_id and active_batch.session_id = pending.session_id
          and active_batch.status in ('processing', 'needs_reconciliation'))
      group by pending.business_id, pending.session_id
      having max(pending.created_at) <= clock_timestamp() - interval '2 seconds'
      union all
      select business_id, session_id, created_at from public.inbound_batches
        where status = 'processing' and lease_expires_at <= clock_timestamp()
    ) candidates order by first_received limit greatest(1, least(coalesce(p_limit, 100), 500))
  ) ready_session;
$$;

create or replace function public.workflow_context(
  p_business_id text, p_session_id text, p_message_ids text[] default '{}'
) returns jsonb language sql security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'business', (select to_jsonb(business_row) - array['whatsapp_access_token_enc', 'access_token', 'api_key'] from public.businesses business_row where id::text = p_business_id),
    'lead', (select to_jsonb(lead_row) from public.leads lead_row where business_id::text = p_business_id
      and customer_phone = split_part(p_session_id, ':', 2) order by created_at desc limit 1),
    'conversation', (select to_jsonb(conversation_row) from public.conversations conversation_row
      where business_id::text = p_business_id and session_id = p_session_id limit 1),
    'history', coalesce((select jsonb_agg(to_jsonb(history_row) order by created_at, id) from (
      select * from public.wa_messages where business_id::text = p_business_id and session_id = p_session_id
        and coalesce(status, '') <> 'failed'
        and not (coalesce(message_id, wa_message_id, '') = any(coalesce(p_message_ids, '{}')))
        and created_at < coalesce((select min(incoming.created_at) from public.inbound_message_buffer incoming
          where incoming.business_id::text = p_business_id and incoming.session_id = p_session_id
            and incoming.message_id = any(coalesce(p_message_ids, '{}'))), clock_timestamp())
      order by created_at desc, id desc limit 20) history_row), '[]'),
    'quoted_messages', coalesce((select jsonb_agg(to_jsonb(quoted_row) order by created_at, id)
      from public.wa_messages quoted_row where business_id::text = p_business_id and session_id = p_session_id
      and exists (select 1 from public.inbound_message_buffer incoming where incoming.business_id::text = p_business_id
        and incoming.session_id = p_session_id and incoming.message_id = any(coalesce(p_message_ids, '{}'))
        and incoming.quoted_message_id in (quoted_row.message_id, quoted_row.wa_message_id))), '[]'));
$$;

create or replace function public.renew_inbound_batch(
  p_business_id text, p_batch_id uuid, p_claim_token uuid, p_lease_seconds integer default 300
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  batch_row public.inbound_batches;
  conversation_row public.conversations;
  reply_window_open boolean;
begin
  update public.inbound_batches set lease_expires_at = clock_timestamp()
    + make_interval(secs => greatest(30, least(coalesce(p_lease_seconds, 300), 900)))
    where business_id::text = p_business_id and id = p_batch_id and claim_token = p_claim_token
      and status = 'processing' and lease_expires_at > clock_timestamp() returning * into batch_row;
  if not found then
    return jsonb_build_object('renewed', false, 'can_send', false, 'reason', 'stale_claim');
  end if;
  select * into conversation_row from public.conversations where business_id::text = p_business_id
    and session_id = batch_row.session_id limit 1;
  select coalesce(max(message_timestamp) > clock_timestamp() - interval '24 hours', false)
    into reply_window_open from public.inbound_message_buffer where business_id::text = p_business_id
      and session_id = batch_row.session_id;
  return jsonb_build_object('renewed', true, 'delivery_state', batch_row.delivery_state,
    'reply_window_open', reply_window_open,
    'can_send', reply_window_open and exists (select 1 from public.businesses where id::text = p_business_id and is_active)
      and (not coalesce(conversation_row.human_takeover, false)
      or coalesce(conversation_row.handoff_batch_id = p_batch_id, false)),
    'allow_handoff_acknowledgement', coalesce(conversation_row.human_takeover, false)
      and conversation_row.handoff_batch_id = p_batch_id);
end;
$$;

create or replace function public.persist_batch_result(
  p_business_id text, p_batch_id uuid, p_claim_token uuid, p_result jsonb
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  batch_row public.inbound_batches;
  lead_data jsonb := coalesce(p_result->'lead_payload', '{}');
  message_row public.inbound_message_buffer;
  lead_row public.leads;
  conversation_row public.conversations;
  wants_handoff boolean := coalesce((p_result->>'handoff')::boolean, false)
    or coalesce((p_result->>'appointment_requested')::boolean, false);
begin
  select session_id into batch_row.session_id from public.inbound_batches
    where business_id::text = p_business_id and id = p_batch_id;
  perform pg_advisory_xact_lock(hashtextextended(p_business_id || chr(31) || batch_row.session_id, 0));
  select * into batch_row from public.inbound_batches where business_id::text = p_business_id
    and id = p_batch_id and claim_token = p_claim_token and status = 'processing'
    and lease_expires_at > clock_timestamp() for update;
  if not found then raise exception 'Stale batch claim'; end if;
  if batch_row.saved_result is not null then
    return jsonb_build_object('saved', true, 'already_saved', true, 'saved_result', batch_row.saved_result);
  end if;
  if p_result is null or jsonb_typeof(p_result) <> 'object' then raise exception 'Invalid batch result'; end if;
  select * into message_row from public.inbound_message_buffer where business_id::text = p_business_id
    and batch_id = p_batch_id order by created_at desc, id desc limit 1;
  select * into lead_row from public.leads where business_id::text = p_business_id
    and customer_phone = message_row.customer_phone order by created_at desc limit 1 for update;
  if not found then
    insert into public.leads (business_id, customer_phone, customer_name, source_session_id)
      values ((select id from public.businesses where id::text = p_business_id), message_row.customer_phone, message_row.customer_name, batch_row.session_id)
      returning * into lead_row;
  end if;
  update public.leads set
    customer_name = coalesce(nullif(lead_data->>'customer_name', ''), customer_name),
    interested_service = coalesce(nullif(lead_data->>'interested_service', ''), interested_service),
    requirements = coalesce(nullif(lead_data->>'requirements', ''), requirements),
    preferred_appointment_time = coalesce(nullif(lead_data->>'preferred_appointment_time', ''), preferred_appointment_time),
    preferred_bhk = coalesce(nullif(lead_data->>'preferred_bhk', ''), preferred_bhk),
    preferred_location = coalesce(nullif(lead_data->>'preferred_location', ''), nullif(lead_data->>'location', ''), preferred_location),
    property_type = coalesce(nullif(lead_data->>'property_type', ''), property_type),
    timeline = coalesce(nullif(lead_data->>'timeline', ''), timeline),
    possession_type = coalesce(nullif(lead_data->>'possession_type', ''), possession_type),
    budget = coalesce(nullif(lead_data->>'budget', ''), budget),
    location = coalesce(nullif(lead_data->>'location', ''), location),
    last_intent = coalesce(nullif(lead_data->>'last_intent', ''), last_intent),
    status = coalesce(nullif(lead_data->>'status', ''), status),
    source_session_id = batch_row.session_id, last_message_at = clock_timestamp(), updated_at = clock_timestamp()
    where id = lead_row.id and business_id::text = p_business_id;
  select * into conversation_row from public.conversations where business_id::text = p_business_id
    and session_id = batch_row.session_id for update;
  if not found then
    insert into public.conversations (business_id, session_id, phone_number_id, customer_phone,
      customer_name, human_takeover, status, last_inbound_at, last_message_at, updated_at)
    values ((select id from public.businesses where id::text = p_business_id), batch_row.session_id, message_row.phone_number_id, message_row.customer_phone,
      message_row.customer_name, false, 'bot', message_row.message_timestamp, message_row.message_timestamp, clock_timestamp())
    returning * into conversation_row;
  end if;
  if wants_handoff and not coalesce(conversation_row.human_takeover, false) then
    update public.conversations set human_takeover = true, handoff_batch_id = p_batch_id, status = 'human',
      last_inbound_at = greatest(last_inbound_at, message_row.message_timestamp), updated_at = clock_timestamp()
      where business_id::text = p_business_id and session_id = batch_row.session_id;
  else
    update public.conversations set last_inbound_at = greatest(last_inbound_at, message_row.message_timestamp),
      updated_at = clock_timestamp() where business_id::text = p_business_id and session_id = batch_row.session_id;
  end if;
  if coalesce((p_result->>'appointment_requested')::boolean, false) then
    insert into public.appointment_requests (business_id, customer_phone, customer_name, service,
      requested_time, status, source_message_id, appointment_type)
    values (p_business_id, message_row.customer_phone, coalesce(lead_data->>'customer_name', message_row.customer_name),
      lead_data->>'interested_service', lead_data->>'preferred_appointment_time',
      'pending_human_confirmation', message_row.message_id, 'site_visit');
  end if;
  if wants_handoff then
    insert into public.escalations (business_id, session_id, customer_phone, reason, source_message_id, status)
    values (p_business_id, batch_row.session_id, message_row.customer_phone,
      coalesce(nullif(p_result->>'handoff_reason', ''), 'Customer requested consultant assistance'),
      message_row.message_id, 'open');
  end if;
  update public.inbound_batches set saved_result = p_result where id = p_batch_id;
  return jsonb_build_object('saved', true, 'already_saved', false, 'saved_result', p_result);
end;
$$;

create or replace function public.begin_batch_delivery(
  p_business_id text, p_batch_id uuid, p_claim_token uuid, p_part text
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  batch_row public.inbound_batches;
  permission jsonb;
begin
  if p_part not in ('reply_1', 'reply_2', 'owner') then raise exception 'Invalid delivery part'; end if;
  select * into batch_row from public.inbound_batches where business_id::text = p_business_id
    and id = p_batch_id and claim_token = p_claim_token and status = 'processing'
    and lease_expires_at > clock_timestamp() for update;
  if not found then return jsonb_build_object('allowed', false, 'reason', 'stale_claim'); end if;
  if batch_row.saved_result is null then raise exception 'Save result before delivery'; end if;
  permission := public.renew_inbound_batch(p_business_id, p_batch_id, p_claim_token);
  if p_part <> 'owner' and not coalesce((permission->>'can_send')::boolean, false) then
    return jsonb_build_object('allowed', false, 'reason', 'customer_send_suppressed');
  end if;
  if batch_row.delivery_state ? p_part then
    return jsonb_build_object('allowed', batch_row.delivery_state->p_part->>'status' = 'sending',
      'reason', batch_row.delivery_state->p_part->>'status', 'already_reserved', true);
  end if;
  update public.inbound_batches set delivery_state = delivery_state || jsonb_build_object(p_part,
    jsonb_build_object('status', 'sending', 'started_at', clock_timestamp())) where id = p_batch_id;
  return jsonb_build_object('allowed', true);
end;
$$;

create or replace function public.record_batch_delivery(
  p_business_id text, p_batch_id uuid, p_claim_token uuid, p_part text,
  p_message_id text, p_body text, p_metadata jsonb default '{}'
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  batch_row public.inbound_batches;
  message_row public.inbound_message_buffer;
begin
  select * into batch_row from public.inbound_batches where business_id::text = p_business_id
    and id = p_batch_id and claim_token = p_claim_token and status = 'processing'
    and lease_expires_at > clock_timestamp() for update;
  if not found then raise exception 'Stale batch claim'; end if;
  if p_part not in ('reply_1', 'reply_2', 'owner') or nullif(p_message_id, '') is null then
    raise exception 'Invalid delivery checkpoint';
  end if;
  if batch_row.delivery_state->p_part->>'status' = 'sent' then return batch_row.delivery_state; end if;
  if batch_row.delivery_state->p_part->>'status' is distinct from 'sending' then
    raise exception 'Begin delivery before recording acknowledgement';
  end if;
  if p_part <> 'owner' then
    select * into message_row from public.inbound_message_buffer where business_id::text = p_business_id
      and batch_id = p_batch_id order by created_at desc, id desc limit 1;
    insert into public.wa_messages (business_id, session_id, phone_number_id, customer_phone, customer_name,
      wa_message_id, message_id, direction, status, body, message_timestamp, metadata)
    values (p_business_id, batch_row.session_id, message_row.phone_number_id, message_row.customer_phone,
      message_row.customer_name, p_message_id, p_message_id, 'outbound', 'sent', p_body, clock_timestamp(),
      coalesce(p_metadata, '{}') || jsonb_build_object('batch_id', p_batch_id, 'part', p_part))
    on conflict (business_id, message_id) do nothing;
    update public.conversations set last_message = left(p_body, 500), last_message_at = clock_timestamp(),
      updated_at = clock_timestamp() where business_id::text = p_business_id and session_id = batch_row.session_id;
  end if;
  update public.inbound_batches set delivery_state = delivery_state || jsonb_build_object(p_part,
    jsonb_build_object('status', 'sent', 'message_id', p_message_id, 'sent_at', clock_timestamp()))
    where id = p_batch_id returning delivery_state into batch_row.delivery_state;
  return batch_row.delivery_state;
end;
$$;

create or replace function public.finish_inbound_batch(p_business_id text, p_batch_id uuid, p_claim_token uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  batch_row public.inbound_batches;
  pending_count integer;
begin
  select * into batch_row from public.inbound_batches where business_id::text = p_business_id
    and id = p_batch_id and claim_token = p_claim_token and status = 'processing'
    and lease_expires_at > clock_timestamp() for update;
  if not found then raise exception 'Stale batch claim'; end if;
  if exists (select 1 from jsonb_each(batch_row.delivery_state) delivery where delivery.value->>'status' = 'sending') then
    raise exception 'Cannot finish batch with ambiguous delivery';
  end if;
  update public.inbound_message_buffer set status = 'completed', processed_at = clock_timestamp()
    where business_id::text = p_business_id and batch_id = p_batch_id;
  update public.inbound_batches set status = 'completed', completed_at = clock_timestamp() where id = p_batch_id;
  select count(*) into pending_count from public.inbound_message_buffer
    where business_id::text = p_business_id and session_id = batch_row.session_id and status = 'pending';
  return jsonb_build_object('completed', true, 'pending_count', pending_count);
end;
$$;

create or replace function public.retry_inbound_batch(
  p_business_id text, p_batch_id uuid, p_claim_token uuid, p_error text, p_retry_seconds integer default 30
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  batch_row public.inbound_batches;
begin
  select * into batch_row from public.inbound_batches where business_id::text = p_business_id and id = p_batch_id
    and claim_token = p_claim_token and status = 'processing' and lease_expires_at > clock_timestamp() for update;
  if not found then raise exception 'Stale batch claim'; end if;
  if exists (select 1 from jsonb_each(batch_row.delivery_state) delivery where delivery.value->>'status' = 'sending') then
    update public.inbound_batches set status = 'needs_reconciliation', last_error = left(p_error, 4000)
      where id = p_batch_id;
    insert into public.workflow_errors (business_id, session_id, batch_id, error_code, error_message, metadata)
      values (p_business_id, batch_row.session_id, p_batch_id, 'ambiguous_delivery', left(p_error, 4000), batch_row.delivery_state);
    return jsonb_build_object('released', false, 'reason', 'needs_reconciliation');
  end if;
  update public.inbound_batches set lease_expires_at = clock_timestamp()
    + make_interval(secs => greatest(1, least(coalesce(p_retry_seconds, 30), 3600))),
    claim_token = gen_random_uuid(), last_error = left(p_error, 4000)
    where business_id::text = p_business_id and id = p_batch_id and claim_token = p_claim_token
      and status = 'processing' and lease_expires_at > clock_timestamp();
  if not found then raise exception 'Stale batch claim'; end if;
  return jsonb_build_object('released', true);
end;
$$;

create or replace function public.get_my_business_ids()
returns setof text language sql security definer stable set search_path = public, pg_temp as $$
  select business_id::text from public.business_members where user_id = auth.uid();
$$;
create or replace function public.is_platform_admin()
returns boolean language sql security definer stable set search_path = public, pg_temp as $$
  select exists (select 1 from public.business_members where user_id = auth.uid() and role = 'platform_admin');
$$;

do $$
declare
  table_name text;
  policy_row record;
  function_row record;
begin
  for table_name in select tablename from pg_tables where schemaname = 'public' and tablename in (
    'businesses','business_members','conversations','wa_messages','leads','appointment_requests',
    'escalations','response_style_profiles','internal_notes','team_invites','audit_log','workflow_errors',
    'inbound_message_buffer','inbound_batches','message_logs','unknown_messages'
  ) loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on public.%I from public, anon, authenticated', table_name);
    execute format('grant all on public.%I to service_role', table_name);
    for policy_row in select policyname from pg_policies where schemaname = 'public' and tablename = table_name loop
      execute format('drop policy %I on public.%I', policy_row.policyname, table_name);
    end loop;
    if table_name in ('inbound_message_buffer', 'inbound_batches', 'workflow_errors', 'unknown_messages') then continue; end if;
    execute format('grant select on public.%I to authenticated', table_name);
    if table_name = 'businesses' then
      execute 'revoke select on public.businesses from authenticated';
      execute 'grant select (id, name, phone_number_id, waba_id, connection_status, is_active, timezone, supported_languages, created_at, updated_at) on public.businesses to authenticated';
      execute 'create policy tenant_read on public.businesses for select to authenticated using (id::text in (select public.get_my_business_ids()))';
      execute 'grant update (name, timezone, supported_languages) on public.businesses to authenticated';
      execute 'create policy tenant_update on public.businesses for update to authenticated using (id::text in (select business_id::text from public.business_members where user_id = auth.uid() and role in (''owner'',''manager'',''platform_admin''))) with check (id::text in (select public.get_my_business_ids()))';
    elsif table_name = 'business_members' then
      execute 'create policy tenant_read on public.business_members for select to authenticated using (business_id::text in (select public.get_my_business_ids()))';
    else
      execute format('create policy tenant_read on public.%I for select to authenticated using (business_id::text in (select public.get_my_business_ids()))', table_name);
      if table_name in ('leads', 'appointment_requests') then
        execute format('grant update on public.%I to authenticated', table_name);
        execute format('create policy tenant_update on public.%I for update to authenticated using (business_id::text in (select public.get_my_business_ids())) with check (business_id::text in (select public.get_my_business_ids()))', table_name);
      elsif table_name = 'conversations' then
        execute 'grant update (unread_count) on public.conversations to authenticated';
        execute 'create policy tenant_update on public.conversations for update to authenticated using (business_id::text in (select public.get_my_business_ids())) with check (business_id::text in (select public.get_my_business_ids()))';
      elsif table_name = 'internal_notes' then
        execute 'grant insert on public.internal_notes to authenticated';
        execute 'create policy tenant_insert on public.internal_notes for insert to authenticated with check (business_id::text in (select public.get_my_business_ids()) and author_id = auth.uid())';
      end if;
    end if;
  end loop;
  for function_row in select routine.oid::regprocedure as signature from pg_proc routine
    join pg_namespace namespace on namespace.oid = routine.pronamespace
    where namespace.nspname = 'public' and routine.proname in (
      'bind_message_tenant','reset_manual_handoff_origin','ingest_inbound_message','claim_inbound_batch','list_ready_inbound_sessions',
      'workflow_context','renew_inbound_batch','persist_batch_result','begin_batch_delivery',
      'record_batch_delivery','finish_inbound_batch','retry_inbound_batch','get_my_business_ids','is_platform_admin'
    )
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', function_row.signature);
    execute format('grant execute on function %s to service_role', function_row.signature);
  end loop;
  for function_row in select routine.oid::regprocedure as signature from pg_proc routine
    join pg_namespace namespace on namespace.oid = routine.pronamespace
    where namespace.nspname = 'public' and routine.proname in (
      'check_and_lock_inbound_batch','complete_inbound_batch','resolve_quoted_context'
    )
  loop
    execute format('revoke execute on function %s from public, anon, authenticated, service_role', function_row.signature);
  end loop;
end $$;

grant execute on function public.get_my_business_ids(), public.is_platform_admin() to authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public;

commit;
