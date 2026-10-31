begin;
set local lock_timeout = '5s';
alter table public.businesses add column if not exists industry text not null default 'general' check (industry in ('general','real_estate','gym','clinic','ecommerce','salon','education'));
alter table public.businesses add column if not exists access_status text not null default 'active' check (access_status in ('active','suspended'));
alter table public.businesses alter column phone_number_id drop not null;
update public.businesses set industry = 'real_estate' where industry = 'general' and settings->>'catalog_key' = 'amolik' and id::text = 'ad98f305-9a29-4bf9-9aa5-38782eeb16fb';
alter table public.businesses drop constraint if exists suspended_business_cannot_automate;
alter table public.businesses add constraint suspended_business_cannot_automate check (access_status <> 'suspended' or not is_active);
revoke update on public.businesses from authenticated;
revoke update (name, timezone, supported_languages) on public.businesses from authenticated;

create table if not exists public.client_invitations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id),
  email text not null check (email = lower(btrim(email))),
  role text not null check (role in ('owner','manager','agent')),
  status text not null default 'pending' check (status in ('pending','accepted','revoked')),
  invited_by uuid not null references auth.users(id),
  accepted_by uuid references auth.users(id),
  expires_at timestamptz not null default clock_timestamp() + interval '30 days',
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (business_id, email)
);
alter table public.client_invitations enable row level security;
revoke all on public.client_invitations from public, anon, authenticated;
grant all on public.client_invitations to service_role;

create or replace function public.get_my_business_ids()
returns setof text language sql stable security definer set search_path = public, pg_temp as $$
  select member.business_id::text from public.business_members member join public.businesses business on business.id::text = member.business_id::text
  where member.user_id = auth.uid() and (member.role = 'platform_admin' or business.access_status = 'active');
$$;

create or replace function public.crm_accept_client_invites(p_user_id uuid)
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare
  user_email text;
  invitation public.client_invitations;
  candidate record;
  accepted integer := 0;
begin
  select lower(email) into user_email from auth.users where id = p_user_id and email_confirmed_at is not null;
  if user_email is null then return 0; end if;
  for candidate in select business_id from public.client_invitations where email = user_email and status = 'pending' and expires_at > clock_timestamp() order by business_id loop
    perform 1 from public.businesses where id = candidate.business_id and access_status = 'active' for update;
    if not found then continue; end if;
    select * into invitation from public.client_invitations where business_id = candidate.business_id and email = user_email
      and status = 'pending' and expires_at > clock_timestamp() for update;
    if not found then continue; end if;
    if exists (select 1 from public.business_members where business_id::text = invitation.business_id::text and user_id = p_user_id and role = 'platform_admin') then continue; end if;
    insert into public.business_members(business_id,user_id,role,invited_by,accepted_at)
      values (invitation.business_id::text,p_user_id,invitation.role,invitation.invited_by,clock_timestamp())
      on conflict (business_id,user_id) do update set role = excluded.role, updated_at = clock_timestamp();
    update public.client_invitations set status = 'accepted', accepted_by = p_user_id, updated_at = clock_timestamp() where id = invitation.id;
    insert into public.audit_log(business_id,actor_id,action,target_type,target_id)
      values (invitation.business_id::text,p_user_id,'crm.invitation.accepted','invitation',invitation.id::text);
    accepted := accepted + 1;
  end loop;
  return accepted;
end;
$$;

create or replace function public.crm_set_client_invitation(p_actor_id uuid,p_business_id uuid,p_email text,p_role text default 'owner',p_revoke boolean default false)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  normalized_email text := lower(btrim(p_email));
  target_user uuid;
  invitation public.client_invitations;
begin
  perform 1 from public.businesses where id = p_business_id for update;
  if not found or not exists (select 1 from public.business_members where business_id::text = p_business_id::text and user_id = p_actor_id and role = 'platform_admin') then raise exception 'Platform operator access required'; end if;
  if normalized_email is null or length(normalized_email) > 254 or normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' or p_role is null or p_role not in ('owner','manager','agent') then raise exception 'Valid email and client role required'; end if;
  select id into target_user from auth.users where lower(email) = normalized_email and email_confirmed_at is not null;
  if target_user = p_actor_id or exists (select 1 from public.business_members where business_id::text = p_business_id::text and user_id = target_user and role = 'platform_admin') then raise exception 'Operator access cannot be changed here'; end if;
  if p_revoke then
    select * into invitation from public.client_invitations where business_id = p_business_id and email = normalized_email for update;
    update public.client_invitations set status = 'revoked', updated_at = clock_timestamp() where id = invitation.id;
    delete from public.business_members where business_id::text = p_business_id::text and role <> 'platform_admin' and user_id in (target_user,invitation.accepted_by);
  else
    insert into public.client_invitations(business_id,email,role,invited_by)
      values (p_business_id,normalized_email,p_role,p_actor_id)
      on conflict (business_id,email) do update set role = excluded.role,status = 'pending',invited_by = excluded.invited_by,accepted_by = null,expires_at = clock_timestamp() + interval '30 days',updated_at = clock_timestamp();
    if target_user is not null then perform public.crm_accept_client_invites(target_user); end if;
  end if;
  insert into public.audit_log(business_id,actor_id,action,target_type,target_id)
    values (p_business_id::text,p_actor_id,case when p_revoke then 'crm.invitation.revoked' else 'crm.invitation.approved' end,'client',p_business_id::text);
  return jsonb_build_object('email',normalized_email,'status',(select status from public.client_invitations where business_id = p_business_id and email = normalized_email));
end;
$$;

create or replace function public.crm_manage_client(
  p_actor_id uuid, p_action text, p_business_id uuid default null, p_payload jsonb default '{}'
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  business_row public.businesses;
  actor_role text;
  target_user uuid;
  previous_role text;
  result jsonb;
  allowed_fields text[];
begin
  if p_action not in ('create','update','upsert_member','remove_member') or p_action is null then
    raise exception 'Invalid client action';
  end if;
  allowed_fields := case when p_action in ('create','update')
    then array['name','phone_number_id','waba_id','timezone','owner_phone','is_active','industry','access_status','email']
    else array['email','role','user_id'] end;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' or octet_length(p_payload::text) > 20000
    or exists (select 1 from jsonb_each(p_payload) entry where not entry.key = any(allowed_fields)
      or (entry.key = 'is_active' and jsonb_typeof(entry.value) <> 'boolean')
      or (entry.key <> 'is_active' and jsonb_typeof(entry.value) <> 'string')) then
    raise exception 'Invalid client fields';
  end if;
  if p_action = 'create' then
    if not exists (select 1 from public.business_members where user_id = p_actor_id and role = 'platform_admin') then
      raise exception 'Platform operator access required';
    end if;
    if p_payload ? 'is_active' then raise exception 'New clients start paused'; end if;
  else
    select * into business_row from public.businesses where id = p_business_id for update;
    select role into actor_role from public.business_members where business_id::text = p_business_id::text and user_id = p_actor_id;
    if business_row.id is null or actor_role is null or actor_role <> 'platform_admin' then
      raise exception 'Platform operator access required';
    end if;
  end if;
  if p_action in ('create','update') then
    if (p_action = 'create' or p_payload ? 'name') and (length(btrim(coalesce(p_payload->>'name',''))) = 0 or length(p_payload->>'name') > 160) then
      raise exception 'Business name is required (maximum 160 characters)';
    end if;
    if (p_payload ? 'phone_number_id' and p_payload->>'phone_number_id' <> '') and coalesce(p_payload->>'phone_number_id','') !~ '^[0-9]{6,30}$' then
      raise exception 'Enter the Meta phone number ID, not the customer-facing number';
    end if;
    if (p_payload ? 'waba_id' and p_payload->>'waba_id' <> '') and coalesce(p_payload->>'waba_id','') !~ '^[0-9]{6,30}$' then
      raise exception 'A valid WhatsApp Business Account ID is required';
    end if;
    if p_payload ? 'owner_phone' and p_payload->>'owner_phone' <> '' and (p_payload->>'owner_phone') !~ '^[1-9][0-9]{6,14}$' then
      raise exception 'Owner alert number must include country code, digits only';
    end if;
    if p_payload ? 'timezone' and not exists (select 1 from pg_timezone_names where name = p_payload->>'timezone') then
      raise exception 'Choose a valid IANA timezone';
    end if;
    if p_payload ? 'industry' and p_payload->>'industry' not in ('general','real_estate','gym','clinic','ecommerce','salon','education') then raise exception 'Invalid business type'; end if;
    if p_payload ? 'access_status' and p_payload->>'access_status' not in ('active','suspended') then raise exception 'Invalid access status'; end if;
    if p_payload ? 'email' and p_action <> 'create' then raise exception 'Manage client access separately'; end if;
    if p_action = 'create' then
      insert into public.businesses(name, phone_number_id, waba_id, timezone, is_active, connection_status, industry, access_status, settings)
        values (btrim(p_payload->>'name'), nullif(p_payload->>'phone_number_id',''), nullif(p_payload->>'waba_id',''),
          coalesce(p_payload->>'timezone','Asia/Kolkata'), false, 'pending', coalesce(p_payload->>'industry','general'), coalesce(p_payload->>'access_status','active'),
          jsonb_build_object('owner_phone', coalesce(p_payload->>'owner_phone',''), 'catalog', jsonb_build_object('projects', '[]'::jsonb)))
        returning * into business_row;
      insert into public.business_members(business_id, user_id, role, invited_by, accepted_at)
        values (business_row.id::text, p_actor_id, 'platform_admin', p_actor_id, clock_timestamp());
      if nullif(btrim(p_payload->>'email'),'') is not null then
        perform public.crm_set_client_invitation(p_actor_id, business_row.id, p_payload->>'email', 'owner', false);
      end if;
    else
      if ((p_payload ? 'phone_number_id' and p_payload->>'phone_number_id' is distinct from business_row.phone_number_id)
        or (p_payload ? 'waba_id' and p_payload->>'waba_id' is distinct from business_row.waba_id)) then
        if actor_role <> 'platform_admin' or business_row.is_active or business_row.connection_status = 'connected'
          or exists (select 1 from public.wa_messages where business_id::text = p_business_id::text)
          or exists (select 1 from public.conversations where business_id::text = p_business_id::text) then
          raise exception 'WhatsApp identity can only be corrected by the operator on an unused, paused client';
        end if;
      end if;
      if coalesce((p_payload->>'is_active')::boolean, false) and coalesce(p_payload->>'access_status', business_row.access_status) = 'suspended' then raise exception 'Restore client access before enabling automation'; end if;
      if coalesce((p_payload->>'is_active')::boolean, false) and not business_row.is_active and business_row.connection_status is distinct from 'connected' then
        raise exception 'Verify the WhatsApp connection before enabling automation';
      end if;
      update public.businesses set name = coalesce(btrim(p_payload->>'name'), name), timezone = coalesce(p_payload->>'timezone', timezone),
        phone_number_id = coalesce(p_payload->>'phone_number_id', phone_number_id), waba_id = coalesce(p_payload->>'waba_id', waba_id),
        settings = coalesce(settings, '{}') || case when p_payload ? 'owner_phone' then jsonb_build_object('owner_phone', p_payload->>'owner_phone') else '{}'::jsonb end,
        industry = coalesce(p_payload->>'industry', industry), access_status = coalesce(p_payload->>'access_status', access_status),
        is_active = case when p_payload->>'access_status' = 'suspended' then false else coalesce((p_payload->>'is_active')::boolean, is_active) end, updated_at = clock_timestamp()
        where id = p_business_id returning * into business_row;
    end if;
    result := jsonb_build_object('id', business_row.id, 'name', business_row.name, 'phone_number_id', business_row.phone_number_id,
      'waba_id', business_row.waba_id, 'timezone', business_row.timezone, 'is_active', business_row.is_active,
      'industry', business_row.industry, 'access_status', business_row.access_status, 'connection_status', business_row.connection_status, 'supported_languages', business_row.supported_languages, 'created_at', business_row.created_at);
  else
    if actor_role <> 'platform_admin' then raise exception 'Platform operator access required'; end if;
    if p_action = 'upsert_member' then return public.crm_set_client_invitation(p_actor_id, p_business_id, p_payload->>'email', p_payload->>'role', false); end if;
    if p_action = 'upsert_member' then
      if coalesce(p_payload->>'role','') not in ('owner','manager','agent') then raise exception 'Choose owner, manager or agent'; end if;
      select id into target_user from auth.users where lower(email) = lower(btrim(p_payload->>'email')) and email_confirmed_at is not null;
      if target_user is null then raise exception 'Ask this person to sign up and verify their CRM email first'; end if;
    else
      target_user := (p_payload->>'user_id')::uuid;
      if target_user is null then raise exception 'Select a member'; end if;
    end if;
    select role into previous_role from public.business_members where business_id::text = p_business_id::text and user_id = target_user;
    if target_user = p_actor_id or previous_role = 'platform_admin' then raise exception 'You cannot change your own access or a platform operator'; end if;
    if p_action = 'remove_member' then
      update public.client_invitations set status = 'revoked', updated_at = clock_timestamp() where business_id = p_business_id and accepted_by = target_user;
      delete from public.business_members where business_id::text = p_business_id::text and user_id = target_user;
    else
      insert into public.business_members(business_id, user_id, role, invited_by, accepted_at)
        values (p_business_id::text, target_user, p_payload->>'role', p_actor_id, clock_timestamp())
        on conflict (business_id, user_id) do update set role = excluded.role, updated_at = clock_timestamp();
    end if;
    result := jsonb_build_object('user_id', target_user, 'role', p_payload->>'role');
  end if;
  insert into public.audit_log(business_id, actor_id, action, target_type, target_id, metadata)
    values (business_row.id::text, p_actor_id, 'crm.client.' || p_action, 'business', business_row.id::text,
      case when target_user is not null then result else jsonb_build_object('fields', (select jsonb_agg(field) from jsonb_object_keys(p_payload) field)) end);
  return result;
end;
$$;

create or replace function public.crm_save_ai_settings(
  p_actor_id uuid, p_business_id uuid, p_settings jsonb default '{}',
  p_system_prompt text default null, p_style jsonb default null
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  business_row public.businesses;
  setting_keys text[] := array['ai_tone','services','products','prices','faqs','opening_hours','contact_details','handoff_message','booking_system','greeting_en','greeting_hi','handoff_message_hi','owner_phone'];
begin
  select * into business_row from public.businesses where id = p_business_id for update;
  if not found or not exists (select 1 from public.business_members where business_id::text = p_business_id::text
    and user_id = p_actor_id and role in ('platform_admin','owner','manager')
    and (role = 'platform_admin' or business_row.access_status = 'active')) then
    raise exception 'Owner or manager access required';
  end if;
  if p_settings is null or jsonb_typeof(p_settings) <> 'object' or octet_length(p_settings::text) > 800000
    or exists (select 1 from jsonb_each(p_settings) entry where
      (entry.key <> 'catalog' and (not entry.key = any(setting_keys) or jsonb_typeof(entry.value) <> 'string' or length(entry.value #>> '{}') > 30000)))
    or (p_settings ? 'catalog' and (jsonb_typeof(p_settings->'catalog') <> 'object' or
      coalesce(jsonb_typeof(p_settings->'catalog'->'projects'), '') <> 'array'))
    or (p_settings ? 'owner_phone' and coalesce(p_settings->>'owner_phone', '') <> '' and (p_settings->>'owner_phone') !~ '^[1-9][0-9]{6,14}$')
    or length(p_system_prompt) > 30000 then
    raise exception 'Invalid AI settings';
  end if;
  if p_style is not null and (jsonb_typeof(p_style) <> 'object' or exists (
    select 1 from jsonb_each(p_style) entry where entry.key not in ('style_notes','example_customer','example_reply')
      or jsonb_typeof(entry.value) <> 'string' or length(entry.value #>> '{}') > 10000)) then
    raise exception 'Invalid response style';
  end if;
  update public.businesses set settings = coalesce(settings, '{}') || p_settings,
    system_prompt = coalesce(p_system_prompt, system_prompt),
    ai_tone = coalesce(p_settings->>'ai_tone', ai_tone), services = coalesce(p_settings->>'services', services),
    products = coalesce(p_settings->>'products', products), prices = coalesce(p_settings->>'prices', prices),
    faqs = coalesce(p_settings->>'faqs', faqs), opening_hours = coalesce(p_settings->>'opening_hours', opening_hours),
    contact_details = coalesce(p_settings->>'contact_details', contact_details),
    handoff_message = coalesce(p_settings->>'handoff_message', handoff_message),
    booking_system = coalesce(p_settings->>'booking_system', booking_system), updated_at = clock_timestamp()
    where id = p_business_id returning * into business_row;
  if p_style is not null then
    insert into public.response_style_profiles(business_id, approved, style_notes, example_customer, example_reply)
      values (p_business_id::text, true, coalesce(p_style->>'style_notes',''), coalesce(p_style->>'example_customer',''), coalesce(p_style->>'example_reply',''))
      on conflict (business_id) do update set approved = true, style_notes = excluded.style_notes,
        example_customer = excluded.example_customer, example_reply = excluded.example_reply, updated_at = clock_timestamp();
  end if;
  insert into public.audit_log(business_id, actor_id, action, target_type, target_id, metadata)
    values (p_business_id::text, p_actor_id, 'crm.ai_settings.updated', 'business', p_business_id::text,
      jsonb_build_object('fields', (select jsonb_agg(setting_key) from jsonb_object_keys(p_settings) setting_key),
        'prompt_changed', p_system_prompt is not null, 'style_changed', p_style is not null));
  return (select coalesce(jsonb_object_agg(entry.key, entry.value), '{}') from jsonb_each(business_row.settings) entry
    where entry.key = any(setting_keys || array['catalog']));
end;
$$;

create or replace function public.workflow_context(
  p_business_id text, p_session_id text, p_message_ids text[] default '{}'
) returns jsonb language sql security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'business', (select jsonb_object_agg(entry.key, case when entry.key = 'settings' then
      (select coalesce(jsonb_object_agg(setting.key, setting.value), '{}') from jsonb_each(coalesce(business_row.settings, '{}')) setting
        where setting.key in ('catalog','owner_phone','ai_tone','services','products','prices','faqs','opening_hours','contact_details','booking_system','handoff_message','handoff_message_hi','greeting_en','greeting_hi'))
      else entry.value end)
      from public.businesses business_row cross join lateral jsonb_each(to_jsonb(business_row)) entry
      where business_row.id::text = p_business_id and entry.key in ('id','name','industry','phone_number_id','settings','system_prompt','timezone','supported_languages','ai_tone','services','products','prices','faqs','opening_hours','contact_details','booking_system','handoff_message')),
    'style_profile', (select to_jsonb(style_row) from public.response_style_profiles style_row where business_id::text = p_business_id and approved = true),
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


revoke all on function public.crm_accept_client_invites(uuid), public.crm_set_client_invitation(uuid,uuid,text,text,boolean) from public,anon,authenticated;
grant execute on function public.crm_accept_client_invites(uuid), public.crm_set_client_invitation(uuid,uuid,text,text,boolean) to service_role;
commit;

