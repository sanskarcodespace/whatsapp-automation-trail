begin;

do $$
begin
  if (select count(*) from public.businesses
    where id::text = 'ad98f305-9a29-4bf9-9aa5-38782eeb16fb'
      and phone_number_id = '1383698251495317' and name = 'Amolik Group') <> 1 then
    raise exception 'Expected verified Amolik tenant was not found; no configuration changed';
  end if;
end $$;

update public.businesses
set settings = coalesce(settings, '{}') || jsonb_build_object(
    'catalog_key', 'amolik', 'owner_phone', '917250307422'),
  updated_at = clock_timestamp()
where id::text = 'ad98f305-9a29-4bf9-9aa5-38782eeb16fb'
  and phone_number_id = '1383698251495317' and name = 'Amolik Group';

commit;
