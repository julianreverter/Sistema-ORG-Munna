-- Preserve the production record and audit every stock removal in the same update.
alter table public.production_units
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references public.profiles(id),
  add column if not exists deleted_by_name text,
  add column if not exists deletion_reason text,
  add column if not exists deletion_comment text;

create or replace function public.audit_stock_removal()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare actor_name text;
begin
  if tg_op = 'DELETE' then
    raise exception 'La producción se conserva. Usá la baja de stock con motivo.';
  end if;
  if tg_op = 'UPDATE' and old.status = 'baja' then
    raise exception 'Una unidad eliminada no puede modificarse ni despacharse.';
  end if;
  if new.status = 'baja' then
    if tg_op <> 'UPDATE' then raise exception 'Primero debe registrarse la producción.'; end if;
    if old.status <> 'stock' or exists (select 1 from public.dispatch_items where production_unit_id = old.id) then
      raise exception 'Solo se pueden eliminar unidades en stock que no tengan despacho.';
    end if;
    if auth.uid() is null or public.current_role() is null then raise exception 'Usuario no autorizado.'; end if;
    if new.deletion_reason is null or new.deletion_reason not in ('Error en etiquetado', 'Error en pesaje', 'Mal formulado (a desperdicio)', 'Otro') then
      raise exception 'Elegí un motivo de eliminación válido.';
    end if;
    new.deletion_comment := btrim(coalesce(new.deletion_comment, ''));
    if char_length(new.deletion_comment) > 2000 or (new.deletion_reason = 'Otro' and new.deletion_comment = '') then
      raise exception 'Completá el comentario de Otro (hasta 2000 caracteres).';
    end if;
    select coalesce(nullif(display_name, ''), email) into actor_name from public.profiles where id = auth.uid() and active;
    if actor_name is null then raise exception 'Usuario inactivo.'; end if;
    new.deleted_at := clock_timestamp();
    new.deleted_by := auth.uid();
    new.deleted_by_name := actor_name;
  elsif new.deleted_at is not null or new.deleted_by is not null or new.deleted_by_name is not null or new.deletion_reason is not null or new.deletion_comment is not null then
    raise exception 'Los datos de baja solo se guardan al eliminar una unidad.';
  end if;
  return new;
end $$;
revoke all on function public.audit_stock_removal() from public, anon, authenticated;
drop trigger if exists audit_stock_removal on public.production_units;
create trigger audit_stock_removal before insert or update or delete on public.production_units
for each row execute function public.audit_stock_removal();

-- Serialize dispatch item creation against removal of the same production unit.
create or replace function public.guard_stock_dispatch()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare unit_status public.stock_status;
begin
  select status into unit_status from public.production_units where id = new.production_unit_id for update;
  if unit_status is distinct from 'stock'::public.stock_status then
    raise exception 'La unidad ya no está disponible en stock.';
  end if;
  return new;
end $$;
revoke all on function public.guard_stock_dispatch() from public, anon, authenticated;
drop trigger if exists guard_stock_dispatch on public.dispatch_items;
create trigger guard_stock_dispatch before insert on public.dispatch_items
for each row execute function public.guard_stock_dispatch();
