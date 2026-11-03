-- A returned physical unit keeps its barcode and can be dispatched again.
alter table public.dispatch_items add column if not exists returned_at timestamptz;
alter table public.dispatch_items drop constraint if exists dispatch_items_production_unit_id_key;
create unique index if not exists dispatch_items_outstanding_unit_key
  on public.dispatch_items(production_unit_id) where returned_at is null;

create table public.customer_returns (
  id bigint generated always as identity primary key,
  dispatch_item_id bigint not null unique references public.dispatch_items(id),
  adjustment_id bigint unique references public.customer_account_adjustments(id),
  amount numeric(14,2) not null check(amount >= 0),
  reason text not null check(reason in ('No entró en el freezer','Pedido incorrecto','Otro')),
  comment text not null default '' check(char_length(comment) <= 2000),
  created_by uuid not null references public.profiles(id),
  received_by text not null,
  created_at timestamptz not null default now(),
  check(reason <> 'Otro' or length(btrim(comment)) > 0)
);
alter table public.customer_returns enable row level security;
revoke all on public.customer_returns from anon, authenticated;
grant select, insert on public.customer_returns to authenticated;
grant usage, select on sequence public.customer_returns_id_seq to authenticated;
create policy customer_returns_admin_read on public.customer_returns for select to authenticated using(public.is_admin());
create policy customer_returns_admin_insert on public.customer_returns for insert to authenticated with check(public.is_admin() and created_by=auth.uid());

create or replace function public.register_customer_return(p_dispatch_id bigint, p_code text, p_reason text, p_comment text default '')
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  item public.dispatch_items%rowtype;
  shipment public.dispatches%rowtype;
  unit public.production_units%rowtype;
  receipt public.customer_returns%rowtype;
  actor_name text;
  adjustment bigint;
  note_number text;
begin
  if auth.uid() is null or not coalesce(public.is_admin(),false) then raise exception 'Solo Administración puede confirmar devoluciones y créditos.'; end if;
  if p_reason is null or p_reason not in ('No entró en el freezer','Pedido incorrecto','Otro') then raise exception 'Elegí el motivo de la devolución.'; end if;
  p_comment := btrim(coalesce(p_comment,''));
  if char_length(p_comment)>2000 or (p_reason='Otro' and p_comment='') then raise exception 'Completá el comentario de Otro (hasta 2000 caracteres).'; end if;
  select * into shipment from public.dispatches where id=p_dispatch_id for share;
  if not found or shipment.status='anulado' then raise exception 'El remito no está disponible para devoluciones.'; end if;
  select * into unit from public.production_units where upper(unique_code)=upper(btrim(p_code)) for update;
  if not found then raise exception 'No encontramos ese código de unidad.'; end if;
  select * into item from public.dispatch_items where dispatch_id=p_dispatch_id and production_unit_id=unit.id for update;
  if not found then raise exception 'La unidad no pertenece a este remito.'; end if;
  if item.returned_at is not null or exists(select 1 from public.customer_returns where dispatch_item_id=item.id) then raise exception 'Esta unidad ya fue devuelta en este remito.'; end if;
  if unit.status <> 'despachado' then raise exception 'La unidad ya no está despachada; actualizá el remito.'; end if;
  select coalesce(nullif(display_name,''),email) into actor_name from public.profiles where id=auth.uid() and active;
  if actor_name is null then raise exception 'Usuario inactivo.'; end if;
  insert into public.customer_returns(dispatch_item_id,amount,reason,comment,created_by,received_by)
  values(item.id,item.line_total,p_reason,p_comment,auth.uid(),actor_name) returning * into receipt;
  note_number := 'NC-D-' || lpad(receipt.id::text,6,'0');
  if item.line_total > 0 then
    insert into public.customer_account_adjustments(client_id,movement_date,movement_type,concept,signed_amount,notes,created_by)
    values(shipment.client_id,(now() at time zone 'America/Argentina/Buenos_Aires')::date,'ajuste',
      note_number || ' · Devolución ' || shipment.remittance_number || ' · #' || unit.unique_code,
      -item.line_total,p_reason || case when p_comment<>'' then ' · ' || p_comment else '' end,auth.uid()) returning id into adjustment;
    -- The insert policy permits only the current administrator; this update uses a narrow policy below.
    update public.customer_returns set adjustment_id=adjustment where id=receipt.id;
  end if;
  update public.dispatch_items set returned_at=receipt.created_at where id=item.id;
  update public.production_units set status='stock',dispatched_at=null where id=unit.id;
  return jsonb_build_object('id',receipt.id,'creditNoteNumber',note_number,'amount',item.line_total,'uniqueCode',unit.unique_code,'createdAt',receipt.created_at);
end $$;
revoke all on function public.register_customer_return(bigint,text,text,text) from public,anon;
grant execute on function public.register_customer_return(bigint,text,text,text) to authenticated;
grant update(adjustment_id) on public.customer_returns to authenticated;
create policy customer_returns_link_adjustment on public.customer_returns for update to authenticated
using(public.is_admin() and created_by=auth.uid() and adjustment_id is null)
with check(public.is_admin() and created_by=auth.uid());

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
    if old.status <> 'stock' or exists (select 1 from public.dispatch_items where production_unit_id = old.id and returned_at is null) then
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
