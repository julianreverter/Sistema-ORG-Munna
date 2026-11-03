-- Freeze allocation while initializing the counter against all historical codes.
lock table public.production_units in share row exclusive mode;
create sequence public.production_barcode_seq as bigint;
select setval('public.production_barcode_seq',
  greatest(4529,coalesce((select max(unique_code::bigint) from public.production_units where unique_code ~ '^[0-9]{1,18}$'),0))+1,false);
grant usage on sequence public.production_barcode_seq to authenticated;
create function public.next_production_barcode() returns text
language sql volatile security invoker set search_path='' as $$
  select lpad(code,greatest(6,length(code)),'0') from (select nextval('public.production_barcode_seq')::text as code) allocated;
$$;
revoke all on function public.next_production_barcode() from public,anon;
grant execute on function public.next_production_barcode() to authenticated;
alter table public.production_units alter column unique_code set default public.next_production_barcode();
alter table public.production_units add column registration_id uuid;
create unique index production_units_registration_id_key on public.production_units(registration_id) where registration_id is not null;
