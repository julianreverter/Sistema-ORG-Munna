begin;
create table munna_orders.client_products (
 client_id bigint not null references public.clients(id),
 product_id bigint not null references public.products(id),
 primary key(client_id,product_id)
);
alter table munna_orders.client_products enable row level security;
revoke all on munna_orders.client_products from public,anon,authenticated;
-- Preserve existing enabled customers' catalog. New customers start empty.
insert into munna_orders.client_products select a.client_id,p.id from munna_orders.access a cross join public.products p where p.active and munna_orders.package_count(p.presentation,10000)>0;
create or replace function munna_orders.workspace(p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  customer_id bigint;
  staff text;
begin
  if p_token is not null then
    customer_id := munna_orders.customer(p_token);
    if customer_id is null then raise exception 'El acceso del cliente no está habilitado'; end if;
  else
    staff := munna_orders.staff_role();
    if staff is null then raise exception 'Acceso no autorizado'; end if;
  end if;
  return jsonb_build_object(
    'role', coalesce(staff,'cliente'),
    'clientName', (select name from public.clients where id=customer_id),
    'products', coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'presentation',presentation,'code',code) order by name,presentation)
      from public.products p where active and munna_orders.package_count(presentation,10000)>0 and (customer_id is null or exists(select 1 from munna_orders.client_products cp where cp.client_id=customer_id and cp.product_id=p.id))),'[]'::jsonb),
    'clients', case when staff='administracion' then coalesce((
      select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'enabled',a.client_id is not null) order by c.name)
      from public.clients c left join munna_orders.access a on a.client_id=c.id where c.active
    ),'[]'::jsonb) else '[]'::jsonb end,
    'orders', coalesce((select jsonb_agg(entry order by created_at desc) from (
      select o.created_at,jsonb_build_object('id',o.id,'number',o.number,'clientId',o.client_id,'client',c.name,
        'date',o.created_at,'revision',o.revision,'note',o.note,'requestedDate',o.requested_date,
        'state',case when o.state='cancelado' then 'cancelado'
          when not exists(select 1 from munna_orders.items i left join munna_orders.fulfilled f using(order_id,product_id)
            where i.order_id=o.id and i.quantity>coalesce(f.quantity,0)) then 'entregado'
          when exists(select 1 from munna_orders.fulfilled f where f.order_id=o.id) then 'parcial'
          else 'pendiente' end,
        'items',(select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'presentation',p.presentation,'quantity',i.quantity,
            'delivered',coalesce(f.quantity,0),'remaining',greatest(i.quantity-coalesce(f.quantity,0),0)) order by p.name,p.presentation)
          from munna_orders.items i join public.products p on p.id=i.product_id
          left join munna_orders.fulfilled f using(order_id,product_id) where i.order_id=o.id),
        'remittances',coalesce((select jsonb_agg(distinct r.remittance_number) from munna_orders.deliveries d
          join public.dispatch_items di on di.id=d.dispatch_item_id join public.dispatches r on r.id=di.dispatch_id
          where d.order_id=o.id),'[]'::jsonb)
      ) entry from munna_orders.orders o join public.clients c on c.id=o.client_id
      where staff is not null or o.client_id=customer_id
    ) records),'[]'::jsonb),
    'plan',case when staff is not null then coalesce((
      with demand as (
        select i.product_id,sum(greatest(i.quantity-coalesce(f.quantity,0),0)) requested
        from munna_orders.items i join munna_orders.orders o on o.id=i.order_id
        left join munna_orders.fulfilled f using(order_id,product_id)
        where o.state='pendiente' group by i.product_id
      ), stock as (
        select u.product_id,sum(munna_orders.package_count(p.presentation,u.units)) available
        from public.production_units u join public.products p on p.id=u.product_id
        where u.status='stock' and (u.expires_at is null or u.expires_at >= (now() at time zone 'America/Argentina/Buenos_Aires')::date)
          and not exists(select 1 from public.dispatch_items di join public.dispatches d on d.id=di.dispatch_id
            where di.production_unit_id=u.id and di.returned_at is null and d.status <> 'anulado')
        group by u.product_id
      )
      select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'presentation',p.presentation,
        'requested',d.requested,'available',coalesce(s.available,0),'toProduce',greatest(d.requested-coalesce(s.available,0),0))
        order by greatest(d.requested-coalesce(s.available,0),0) desc,p.name)
      from demand d join public.products p on p.id=d.product_id left join stock s on s.product_id=d.product_id where requested>0
    ),'[]'::jsonb) else '[]'::jsonb end
  );
end;
$$;
create or replace function munna_orders.save(p_token text,p_id uuid,p_items jsonb,p_revision integer,p_cancel boolean,p_note text,p_date date)
returns void language plpgsql security definer set search_path = '' as $$
declare customer_id bigint; staff text; existing munna_orders.orders; total integer;
begin
  if p_token is not null then
    customer_id := munna_orders.customer(p_token);
    if customer_id is null then raise exception 'El acceso del cliente no está habilitado'; end if;
    if p_revision is not null or p_cancel then raise exception 'La fábrica gestiona las correcciones y cancelaciones'; end if;
  else
    staff := munna_orders.staff_role();
    if staff is null or staff not in ('administracion','jefe_produccion') then raise exception 'Acceso no autorizado'; end if;
    if p_revision is null then raise exception 'Seleccioná el pedido a modificar'; end if;
  end if;
  if p_id is null then raise exception 'Falta el identificador del pedido'; end if;
  if customer_id is not null then
    perform pg_advisory_xact_lock(customer_id);
    select * into existing from munna_orders.orders where id=p_id;
    if found then
      if existing.client_id=customer_id then return; end if;
      raise exception 'Identificador de pedido inválido';
    end if;
    select count(*) into total from munna_orders.orders where client_id=customer_id and created_at>now()-interval '1 minute';
    if total>=10 then raise exception 'Esperá un minuto antes de enviar otro pedido'; end if;
    insert into munna_orders.orders(id,client_id,note,requested_date) values(p_id,customer_id,coalesce(p_note,''),p_date);
  else
    select client_id into customer_id from munna_orders.orders where id=p_id;
    if not found then raise exception 'El pedido no existe'; end if;
    perform pg_advisory_xact_lock(customer_id);
    select * into existing from munna_orders.orders where id=p_id for update;
    if existing.revision<>p_revision or existing.state<>'pendiente' then raise exception 'El pedido cambió. Actualizá la pantalla'; end if;
    if p_cancel then
      update munna_orders.orders set state='cancelado',revision=revision+1,updated_at=now() where id=p_id;
      return;
    end if;
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' then raise exception 'Ingresá los productos'; end if;
  if jsonb_array_length(p_items) not between 1 and 200 then raise exception 'Seleccioná entre 1 y 200 productos'; end if;
  if exists(select 1 from jsonb_array_elements(p_items) x
    where coalesce(x->>'quantity','') !~ '^[1-9][0-9]{0,4}$' or coalesce(x->>'id','') !~ '^[1-9][0-9]*$') then
    raise exception 'Las cantidades deben ser unidades enteras positivas'; end if;
  if p_token is not null and exists(select 1 from jsonb_to_recordset(p_items) x(id bigint) where not exists(select 1 from munna_orders.client_products cp where cp.client_id=customer_id and cp.product_id=x.id)) then raise exception 'El pedido contiene productos no habilitados para este cliente. Actualizá el catálogo'; end if;
  if exists(select 1 from jsonb_to_recordset(p_items) x(id bigint,quantity integer)
    left join public.products p on p.id=x.id where p.id is null or x.quantity>10000
      or munna_orders.package_count(p.presentation,10000)=0
      or (not p.active and not exists(select 1 from munna_orders.items i where i.order_id=p_id and i.product_id=p.id))) then
    raise exception 'Revisá los productos y las cantidades'; end if;
  if exists(select 1 from jsonb_to_recordset(p_items) x(id bigint) group by x.id having count(*)>1) then raise exception 'Hay productos repetidos'; end if;
  if exists(select 1 from munna_orders.fulfilled f left join jsonb_to_recordset(p_items) x(id bigint,quantity integer) on x.id=f.product_id
    where f.order_id=p_id and coalesce(x.quantity,0)<f.quantity) then raise exception 'La cantidad debe cubrir las unidades ya entregadas'; end if;
  -- Preserve rows with historical deliveries even if a returned product is removed.
  if exists(select 1 from munna_orders.deliveries d where d.order_id=p_id and not exists(
    select 1 from jsonb_to_recordset(p_items) x(id bigint) where x.id=d.product_id)) then
    raise exception 'Conservá los productos con remitos vinculados'; end if;
  delete from munna_orders.items i where i.order_id=p_id and not exists(select 1 from jsonb_to_recordset(p_items) x(id bigint) where x.id=i.product_id);
  insert into munna_orders.items(order_id,product_id,quantity)
    select p_id,x.id,x.quantity from jsonb_to_recordset(p_items) x(id bigint,quantity integer)
    on conflict(order_id,product_id) do update set quantity=excluded.quantity;
  if staff is not null then
    update munna_orders.orders set revision=revision+1,note=coalesce(p_note,''),requested_date=p_date,updated_at=now() where id=p_id;
  end if;
end;
$$;
create function munna_orders.catalog(p_client bigint,p_products jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if munna_orders.staff_role() is distinct from 'administracion' then raise exception 'Solo administración puede configurar el catálogo'; end if;
 if not exists(select 1 from public.clients where id=p_client and active) then raise exception 'Cliente no disponible'; end if;
 if p_products is not null then
  if jsonb_typeof(p_products) is distinct from 'array' then raise exception 'Catálogo inválido'; end if;
  if exists(select 1 from jsonb_array_elements_text(p_products) x where x !~ '^[1-9][0-9]*$') then raise exception 'Producto inválido'; end if;
  if exists(select 1 from jsonb_array_elements_text(p_products) x left join public.products p on p.id=x::bigint where p.id is null or not p.active or munna_orders.package_count(p.presentation,10000)=0) then raise exception 'Seleccioná productos activos disponibles para pedidos'; end if;
  perform pg_advisory_xact_lock(p_client);
  delete from munna_orders.client_products where client_id=p_client;
  insert into munna_orders.client_products select p_client,x::bigint from jsonb_array_elements_text(p_products) x group by x;
 end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'presentation',p.presentation,'active',p.active,'supported',munna_orders.package_count(p.presentation,10000)>0,'enabled',p.active and munna_orders.package_count(p.presentation,10000)>0 and cp.product_id is not null) order by p.name,p.presentation) from public.products p left join munna_orders.client_products cp on cp.product_id=p.id and cp.client_id=p_client),'[]'::jsonb);
end;
$$;
create function public.orders_catalog(p_client bigint,p_products jsonb default null) returns jsonb language sql security invoker set search_path='' as $$ select munna_orders.catalog(p_client,p_products); $$;
revoke all on function munna_orders.catalog(bigint,jsonb),public.orders_catalog(bigint,jsonb) from public,anon,authenticated;
grant execute on function munna_orders.catalog(bigint,jsonb),public.orders_catalog(bigint,jsonb) to authenticated;
commit;
