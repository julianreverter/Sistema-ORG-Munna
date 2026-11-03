create or replace function public.next_production_barcode() returns text
language plpgsql volatile security invoker set search_path='' as $$
declare code text;
begin
  loop
    code := nextval('public.production_barcode_seq')::text;
    code := lpad(code,greatest(6,length(code)),'0');
    if not exists(select 1 from public.production_units where unique_code=code) then return code; end if;
  end loop;
end $$;
