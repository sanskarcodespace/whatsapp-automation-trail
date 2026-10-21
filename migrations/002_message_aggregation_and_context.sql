-- ============================================================
-- MIGRATION 002: Reliable Message Aggregation, Quoted Reply Context,
--                and Lead Qualification Enhancements
-- ============================================================

-- 1. Ensure columns on wa_messages for quoted context
alter table wa_messages
  add column if not exists quoted_message_id text;

create index if not exists idx_wa_messages_wa_id on wa_messages(wa_message_id);
create index if not exists idx_wa_messages_msg_id on wa_messages(message_id);
create index if not exists idx_wa_messages_session_created on wa_messages(session_id, created_at desc);

-- 2. Enhanced lead qualification columns
alter table leads
  add column if not exists preferred_location text,
  add column if not exists preferred_bhk      text,
  add column if not exists property_type      text,
  add column if not exists timeline           text,
  add column if not exists possession_type    text; -- 'ready_to_move' or 'under_construction'

-- 3. Inbound message buffer for multi-message aggregation & debouncing
create table if not exists inbound_message_buffer (
  id                uuid primary key default gen_random_uuid(),
  business_id       text not null,
  customer_phone    text not null,
  session_id        text not null,
  message_id        text unique not null,
  quoted_message_id text,
  body              text not null,
  status            text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'dropped')),
  created_at        timestamptz default now(),
  processed_at      timestamptz
);

create index if not exists idx_inbound_buffer_session_status on inbound_message_buffer(session_id, status, created_at);

-- 4. RPC: Atomic Check & Lock for Inbound Batch
-- Checks if the quiet window (e.g. 3-5 seconds) has elapsed since the latest pending message.
-- If quiet window has elapsed, claims all pending messages atomically and returns them combined.
-- If newer messages arrived within the window, returns should_process = false so earlier executions exit gracefully.
create or replace function check_and_lock_inbound_batch(
  p_session_id text,
  p_quiet_seconds int default 3
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_latest_created timestamptz;
  v_count int;
  v_claimed_rows record;
  v_combined_text text := '';
  v_quoted_id text := null;
  v_message_ids text[] := array[]::text[];
  v_messages jsonb := '[]'::jsonb;
begin
  -- 1. Check pending messages for this session
  select max(created_at), count(*)
  into v_latest_created, v_count
  from inbound_message_buffer
  where session_id = p_session_id
    and status = 'pending';

  -- If no pending messages, nothing to process
  if v_count is null or v_count = 0 then
    return jsonb_build_object(
      'should_process', false,
      'reason', 'no_pending_messages',
      'message_count', 0
    );
  end if;

  -- 2. Check if quiet window has elapsed since the latest message
  if (now() - v_latest_created) < (p_quiet_seconds || ' seconds')::interval then
    return jsonb_build_object(
      'should_process', false,
      'reason', 'quiet_window_not_elapsed',
      'seconds_remaining', extract(epoch from ((v_latest_created + (p_quiet_seconds || ' seconds')::interval) - now())),
      'message_count', v_count
    );
  end if;

  -- 3. Atomic claim: update pending messages to 'processing'
  -- Use a temporary table or CTE to collect claimed rows
  for v_claimed_rows in
    update inbound_message_buffer
    set status = 'processing',
        processed_at = now()
    where session_id = p_session_id
      and status = 'pending'
    returning id, message_id, quoted_message_id, body, created_at
  loop
    v_message_ids := array_append(v_message_ids, v_claimed_rows.message_id);
    if v_combined_text = '' then
      v_combined_text := v_claimed_rows.body;
    else
      v_combined_text := v_combined_text || E'\n' || v_claimed_rows.body;
    end if;
    if v_claimed_rows.quoted_message_id is not null and v_claimed_rows.quoted_message_id != '' then
      v_quoted_id := v_claimed_rows.quoted_message_id;
    end if;
    v_messages := v_messages || jsonb_build_object(
      'id', v_claimed_rows.id,
      'message_id', v_claimed_rows.message_id,
      'quoted_message_id', v_claimed_rows.quoted_message_id,
      'body', v_claimed_rows.body,
      'created_at', v_claimed_rows.created_at
    );
  end loop;

  return jsonb_build_object(
    'should_process', true,
    'message_count', array_length(v_message_ids, 1),
    'combined_text', v_combined_text,
    'quoted_message_id', v_quoted_id,
    'message_ids', v_message_ids,
    'messages', v_messages
  );
end;
$$;

-- 5. RPC: Mark Inbound Batch Completed
create or replace function complete_inbound_batch(
  p_session_id text,
  p_message_ids text[]
)
returns void
language plpgsql
security definer
as $$
begin
  update inbound_message_buffer
  set status = 'completed',
      processed_at = now()
  where session_id = p_session_id
    and message_id = any(p_message_ids);
end;
$$;

-- 6. RPC: Resolve Quoted Context
-- Finds the earlier referenced message and any property metadata
create or replace function resolve_quoted_context(
  p_quoted_id text,
  p_session_id text
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_row record;
begin
  if p_quoted_id is null or p_quoted_id = '' then
    return null;
  end if;

  select id, direction, body, metadata, created_at
  into v_row
  from wa_messages
  where (wa_message_id = p_quoted_id or message_id = p_quoted_id)
  order by created_at desc
  limit 1;

  if v_row.id is null then
    return null;
  end if;

  return jsonb_build_object(
    'found', true,
    'direction', v_row.direction,
    'body', v_row.body,
    'metadata', v_row.metadata,
    'created_at', v_row.created_at
  );
end;
$$;

-- 7. Grant permissions
grant all on inbound_message_buffer to postgres, service_role, authenticated, anon;
grant execute on function check_and_lock_inbound_batch(text, int) to postgres, service_role, authenticated, anon;
grant execute on function complete_inbound_batch(text, text[]) to postgres, service_role, authenticated, anon;
grant execute on function resolve_quoted_context(text, text) to postgres, service_role, authenticated, anon;
