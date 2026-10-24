begin;

set local lock_timeout = '5s';

alter table public.leads drop constraint if exists leads_status_check;
alter table public.leads add constraint leads_status_check
  check (status in ('new','contacted','interested','qualified','appointment','follow_up_required','converted','won','lost','closed'));

commit;
