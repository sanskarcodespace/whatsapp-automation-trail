begin;
set local lock_timeout = '5s';

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
    and user_id = p_actor_id and role in ('platform_admin','owner','manager')) then
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
    then array['name','phone_number_id','waba_id','timezone','owner_phone','is_active']
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
    if business_row.id is null or actor_role is null or actor_role not in ('platform_admin','owner','manager') then
      raise exception 'Owner or manager access required';
    end if;
  end if;
  if p_action in ('create','update') then
    if (p_action = 'create' or p_payload ? 'name') and (length(btrim(coalesce(p_payload->>'name',''))) = 0 or length(p_payload->>'name') > 160) then
      raise exception 'Business name is required (maximum 160 characters)';
    end if;
    if (p_action = 'create' or p_payload ? 'phone_number_id') and coalesce(p_payload->>'phone_number_id','') !~ '^[0-9]{6,30}$' then
      raise exception 'Enter the Meta phone number ID, not the customer-facing number';
    end if;
    if (p_action = 'create' or p_payload ? 'waba_id') and coalesce(p_payload->>'waba_id','') !~ '^[0-9]{6,30}$' then
      raise exception 'A valid WhatsApp Business Account ID is required';
    end if;
    if p_payload ? 'owner_phone' and p_payload->>'owner_phone' <> '' and (p_payload->>'owner_phone') !~ '^[1-9][0-9]{6,14}$' then
      raise exception 'Owner alert number must include country code, digits only';
    end if;
    if p_payload ? 'timezone' and not exists (select 1 from pg_timezone_names where name = p_payload->>'timezone') then
      raise exception 'Choose a valid IANA timezone';
    end if;
    if p_action = 'create' then
      insert into public.businesses(name, phone_number_id, waba_id, timezone, is_active, connection_status, settings)
        values (btrim(p_payload->>'name'), p_payload->>'phone_number_id', p_payload->>'waba_id',
          coalesce(p_payload->>'timezone','Asia/Kolkata'), false, 'pending',
          jsonb_build_object('owner_phone', coalesce(p_payload->>'owner_phone',''), 'catalog', jsonb_build_object('projects', '[]'::jsonb)))
        returning * into business_row;
      insert into public.business_members(business_id, user_id, role, invited_by, accepted_at)
        values (business_row.id::text, p_actor_id, 'platform_admin', p_actor_id, clock_timestamp());
    else
      if ((p_payload ? 'phone_number_id' and p_payload->>'phone_number_id' is distinct from business_row.phone_number_id)
        or (p_payload ? 'waba_id' and p_payload->>'waba_id' is distinct from business_row.waba_id)) then
        if actor_role <> 'platform_admin' or business_row.is_active or business_row.connection_status = 'connected'
          or exists (select 1 from public.wa_messages where business_id::text = p_business_id::text)
          or exists (select 1 from public.conversations where business_id::text = p_business_id::text) then
          raise exception 'WhatsApp identity can only be corrected by the operator on an unused, paused client';
        end if;
      end if;
      if coalesce((p_payload->>'is_active')::boolean, false) and not business_row.is_active and business_row.connection_status is distinct from 'connected' then
        raise exception 'Verify the WhatsApp connection before enabling automation';
      end if;
      update public.businesses set name = coalesce(btrim(p_payload->>'name'), name), timezone = coalesce(p_payload->>'timezone', timezone),
        phone_number_id = coalesce(p_payload->>'phone_number_id', phone_number_id), waba_id = coalesce(p_payload->>'waba_id', waba_id),
        settings = coalesce(settings, '{}') || case when p_payload ? 'owner_phone' then jsonb_build_object('owner_phone', p_payload->>'owner_phone') else '{}'::jsonb end,
        is_active = coalesce((p_payload->>'is_active')::boolean, is_active), updated_at = clock_timestamp()
        where id = p_business_id returning * into business_row;
    end if;
    result := jsonb_build_object('id', business_row.id, 'name', business_row.name, 'phone_number_id', business_row.phone_number_id,
      'waba_id', business_row.waba_id, 'timezone', business_row.timezone, 'is_active', business_row.is_active,
      'connection_status', business_row.connection_status, 'supported_languages', business_row.supported_languages, 'created_at', business_row.created_at);
  else
    if actor_role not in ('platform_admin','owner') then raise exception 'Owner access required to manage members'; end if;
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
    if previous_role = 'owner' and (p_action = 'remove_member' or p_payload->>'role' <> 'owner') and
      not exists (select 1 from public.business_members where business_id::text = p_business_id::text and role = 'owner' and user_id <> target_user) then
      raise exception 'Assign another owner before removing or demoting the last owner';
    end if;
    if p_action = 'remove_member' then
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

create or replace function public.crm_record_connection_check(
  p_actor_id uuid, p_business_id uuid, p_phone_number_id text, p_waba_id text
) returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform 1 from public.businesses where id = p_business_id for update;
  if not exists (select 1 from public.business_members where business_id::text = p_business_id::text
    and user_id = p_actor_id and role in ('platform_admin','owner','manager')) then
    raise exception 'Owner or manager access required';
  end if;
  update public.businesses set connection_status = 'connected', updated_at = clock_timestamp()
    where id = p_business_id and phone_number_id = p_phone_number_id and waba_id = p_waba_id;
  if not found then raise exception 'Client connection changed during verification'; end if;
  insert into public.audit_log(business_id, actor_id, action, target_type, target_id)
    values (p_business_id::text, p_actor_id, 'crm.connection.verified', 'business', p_business_id::text);
  return true;
end;
$$;

revoke all on function public.crm_record_connection_check(uuid,uuid,text,text) from public, anon, authenticated;
grant execute on function public.crm_record_connection_check(uuid,uuid,text,text) to service_role;
revoke all on function public.crm_save_ai_settings(uuid,uuid,jsonb,text,jsonb), public.crm_manage_client(uuid,text,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.crm_save_ai_settings(uuid,uuid,jsonb,text,jsonb), public.crm_manage_client(uuid,text,uuid,jsonb) to service_role;

update public.businesses set settings = coalesce(settings, '{}') || jsonb_build_object('catalog', '{"name":"Amolik Group","profile":"Real estate developer in Faridabad, Delhi NCR since 2015; 10+ years of excellence, 5M+ sq. ft. developed, 8+ signature projects, 1500+ families served.","head_office":"14/3, Main Mathura Road, Near Mewla Maharajpur Metro Station, Faridabad 121003","sales_office":"Plaza 81, near DPS School, Sector 81, Faridabad 121002","phone":"+91 98107 600 32","email":"info@amolik.com","hours":"Mon–Sat 10:00 AM – 6:00 PM","projects":[{"id":"heights","name":"Amolik Heights","aliases":["Amolik Heights","Heights"],"category":"residential","location":"Sector 88, Faridabad","status":"Completed / handed over","configurations":[{"bhk":1,"price":"₹46.10L–₹49.20L"},{"bhk":2,"price":"₹62.78L–₹63.42L"},{"bhk":3,"price":"₹70L"}],"amenities":["Gated society","24/7 security","Power backup","Lifts","Clubhouse"],"description":"Completed residential apartments. Unit-level availability requires verification."},{"id":"park","name":"Amolik Park","aliases":["Amolik Park"],"category":"residential","location":"Sector 88, Faridabad","status":"Ongoing / under construction","configurations":[{"bhk":1,"price":"approximately ₹30L–₹33.86L"},{"bhk":3,"price":"approximately ₹65L"}],"amenities":[],"description":"Under-construction residential apartments."},{"id":"sankalp","name":"Amolik Sankalp","aliases":["Amolik Sankalp","Sankalp"],"category":"residential","location":"Sector 85, Faridabad","status":"Completed","configurations":[{"bhk":1,"price":"₹40L–₹42.59L"},{"bhk":3,"price":"₹80.29L"}],"amenities":[],"description":"Residential apartments near BPTP bridge."},{"id":"residency","name":"Amolik Residency","aliases":["Amolik Residency","Residency"],"category":"residential","location":"Sector 86, Faridabad","status":"Completed","configurations":[{"bhk":3,"price":"from ₹1.50 Cr"}],"amenities":[],"description":"Luxury 3 BHK independent floors."},{"id":"aarvista","name":"Aarvista","aliases":["Aarvista"],"category":"senior_living","location":"Sector 86, Faridabad","status":"Ongoing","configurations":[],"amenities":[],"description":"Dedicated senior living and retirement community."},{"id":"neoliv","name":"Neoliv Golf One","aliases":["Neoliv Golf One","Golf One","Neoliv"],"category":"plots","location":"Sectors 98 and 99A, Faridabad","status":"Ongoing","configurations":[],"amenities":[],"description":"Luxury golf-themed plotted community."},{"id":"concordia","name":"Amolik Concordia Living","aliases":["Amolik Concordia Living","Concordia Living"],"category":"plots","location":"Sector 97, Faridabad","status":"Ongoing","configurations":[],"price":"from approximately ₹69.97L","amenities":[],"description":"Plots from 538 to 3039+ sq. ft."},{"id":"concordia_extension","name":"Concordia Living-I & Extension","aliases":["Concordia Living-I","Concordia Living I","Concordia Living-1","Concordia Living Extension","Concordia Extension"],"category":"plots","location":"Sector 97, Faridabad","status":"Ongoing","configurations":[],"amenities":[],"description":"Premium plotted development, including the extension."},{"id":"blossom","name":"Amolik Blossom Woods","aliases":["Amolik Blossom Woods","Blossom Woods"],"category":"plots","location":"Sector 97, Faridabad","status":"Ongoing","configurations":[],"amenities":[],"description":"Nature-inspired plotted community."},{"id":"aster","name":"Amolik Aster Woods","aliases":["Amolik Aster Woods","Aster Woods"],"category":"plots","location":"Sector 98, Faridabad","status":"Completed","configurations":[],"amenities":[],"description":"Premium plotted development."},{"id":"107th_avenue","name":"107th Avenue","aliases":["107th Avenue","107 Avenue"],"category":"plots","location":"Sector 107, Faridabad","status":"Ongoing","configurations":[],"amenities":[],"description":"Plotted development."},{"id":"upcoming_plotted","name":"Upcoming Plotted","aliases":["Upcoming Plotted","109A/110A","109A","110A"],"category":"plots","location":"Sectors 109A/110A, 98 and 109, Faridabad","status":"Upcoming","configurations":[],"amenities":[],"description":"25-acre township in Sectors 109A/110A; upcoming plotted developments in Sectors 98 and 109."},{"id":"plaza81","name":"Amolik Plaza 81","aliases":["Amolik Plaza 81","Plaza 81"],"category":"commercial","location":"Sector 81, Faridabad","status":"Ongoing","configurations":[],"amenities":[],"description":"Commercial SCO development."},{"id":"vibrant82","name":"Amolik Vibrant 82","aliases":["Amolik Vibrant 82","Vibrant 82"],"category":"commercial","location":"Sector 82, Faridabad","status":"Completed","configurations":[],"amenities":[],"description":"Commercial SCO development."},{"id":"plaza88","name":"Amolik Plaza 88","aliases":["Amolik Plaza 88","Plaza 88"],"category":"commercial","location":"Sector 88, Faridabad","status":"Ongoing","configurations":[],"amenities":[],"description":"Commercial SCO development."},{"id":"city_life","name":"City Life Mall","aliases":["City Life Mall","City Life"],"category":"commercial","location":"Sector 85, Faridabad","status":"Completed","configurations":[],"amenities":[],"description":"Shopping and lifestyle mall."}]}'::jsonb), updated_at = clock_timestamp()
where id::text = 'ad98f305-9a29-4bf9-9aa5-38782eeb16fb' and phone_number_id = '1383698251495317'
  and settings->>'catalog_key' = 'amolik' and not coalesce(settings, '{}') ? 'catalog';

create or replace function public.workflow_context(
  p_business_id text, p_session_id text, p_message_ids text[] default '{}'
) returns jsonb language sql security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'business', (select jsonb_object_agg(entry.key, case when entry.key = 'settings' then
      (select coalesce(jsonb_object_agg(setting.key, setting.value), '{}') from jsonb_each(coalesce(business_row.settings, '{}')) setting
        where setting.key in ('catalog','owner_phone','ai_tone','services','products','prices','faqs','opening_hours','contact_details','booking_system','handoff_message','handoff_message_hi','greeting_en','greeting_hi'))
      else entry.value end)
      from public.businesses business_row cross join lateral jsonb_each(to_jsonb(business_row)) entry
      where business_row.id::text = p_business_id and entry.key in ('id','name','phone_number_id','settings','system_prompt','timezone','supported_languages','ai_tone','services','products','prices','faqs','opening_hours','contact_details','booking_system','handoff_message')),
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

commit;
