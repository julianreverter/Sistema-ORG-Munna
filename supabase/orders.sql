-- Customer ordering uses scoped access links, independent of staff accounts.
begin;
create schema if not exists munna_orders;
revoke all on schema munna_orders from public;
grant usage on schema munna_orders to anon, authenticated;

create table munna_orders.access (
  client_id bigint primary key references public.clients(id),
  token_hash bytea not null unique,
  created_at timestamptz not null default now()
);
create table munna_orders.orders (
  id uuid primary key,
  number bigint generated always as identity unique,
  client_id bigint not null references public.clients(id),
  state text not null default 'pendiente' check (state in ('pendiente','cancelado')),
  revision integer not null default 1,
  note text not null default '' check (length(note) <= 500),
  requested_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on munna_orders.orders(client_id, created_at);
create table munna_orders.items (
  order_id uuid not null references munna_orders.orders(id),
  product_id bigint not null references public.products(id),
  quantity integer not null check (quantity between 1 and 10000),
  primary key(order_id, product_id)
);
create table munna_orders.deliveries (
  order_id uuid not null,
  product_id bigint not null,
  dispatch_item_id bigint not null references public.dispatch_items(id),
  quantity integer not null check(quantity > 0),
  primary key(order_id, product_id, dispatch_item_id),
  foreign key(order_id, product_id) references munna_orders.items(order_id, product_id)
);
create index on munna_orders.deliveries(dispatch_item_id);
alter table munna_orders.access enable row level security;
alter table munna_orders.orders enable row level security;
alter table munna_orders.items enable row level security;
alter table munna_orders.deliveries enable row level security;
revoke all on all tables in schema munna_orders from public, anon, authenticated;

create function munna_orders.staff_role() returns text
language sql stable security definer set search_path = '' as $$
  select role::text from public.profiles where id = auth.uid() and active;
$$;
create function munna_orders.customer(p_token text) returns bigint
language sql stable security definer set search_path = '' as $$
  select a.client_id from munna_orders.access a join public.clients c on c.id=a.client_id
  where c.active and a.token_hash = extensions.digest(p_token, 'sha256');
$$;
create function munna_orders.package_count(p_presentation text, p_units integer) returns integer
language sql immutable set search_path = '' as $$
  select case
    when lower(trim(p_presentation)) ~ '^caja\s*x\s*[0-9]+$'
      then floor(coalesce(p_units,0)::numeric / nullif(substring(p_presentation from '[0-9]+')::integer,0))::integer
    when lower(trim(p_presentation)) in ('balde chico','balde grande','vasqueta') then 1
    else 0 end;
$$;
create view munna_orders.fulfilled as
  select d.order_id,d.product_id,sum(d.quantity)::integer quantity
  from munna_orders.deliveries d
  join public.dispatch_items i on i.id=d.dispatch_item_id and i.returned_at is null
  join public.dispatches r on r.id=i.dispatch_id and r.status <> 'anulado'
  join munna_orders.orders o on o.id=d.order_id and o.client_id=r.client_id
  group by d.order_id,d.product_id;

create function munna_orders.workspace(p_token text) returns jsonb
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
      from public.products where active and munna_orders.package_count(presentation,10000)>0),'[]'::jsonb),
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

create function munna_orders.save(p_token text,p_id uuid,p_items jsonb,p_revision integer,p_cancel boolean,p_note text,p_date date)
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

create function munna_orders.allocate_dispatch() returns trigger
language plpgsql security definer set search_path = '' as $$
declare customer_id bigint; dispatched_at timestamptz; product bigint; available integer; item record; allocated integer;
begin
  select d.client_id,d.created_at into customer_id,dispatched_at from public.dispatches d where d.id=new.dispatch_id and d.status<>'anulado';
  if customer_id is null or new.returned_at is not null then return new; end if;
  perform pg_advisory_xact_lock(customer_id);
  select u.product_id,munna_orders.package_count(p.presentation,new.units) into product,available
    from public.production_units u join public.products p on p.id=u.product_id where u.id=new.production_unit_id;
  for item in
    select i.order_id,greatest(i.quantity-coalesce(f.quantity,0),0) remaining
    from munna_orders.items i join munna_orders.orders o on o.id=i.order_id
    left join munna_orders.fulfilled f using(order_id,product_id)
    where o.client_id=customer_id and o.state='pendiente' and i.product_id=product and o.created_at<=dispatched_at
    order by o.created_at,o.number
  loop
    exit when available<=0;
    allocated := least(available,item.remaining);
    if allocated>0 then
      insert into munna_orders.deliveries(order_id,product_id,dispatch_item_id,quantity) values(item.order_id,product,new.id,allocated);
      update munna_orders.orders set revision=revision+1,updated_at=now() where id=item.order_id;
      available := available-allocated;
    end if;
  end loop;
  return new;
end;
$$;
create trigger allocate_customer_order after insert on public.dispatch_items for each row execute function munna_orders.allocate_dispatch();

create function munna_orders.manage_access(p_client bigint,p_revoke boolean) returns text
language plpgsql security definer set search_path = '' as $$
declare token text;
begin
  if munna_orders.staff_role() is distinct from 'administracion' then raise exception 'Solo administración puede habilitar accesos'; end if;
  if p_revoke then delete from munna_orders.access where client_id=p_client; return null; end if;
  if not exists(select 1 from public.clients where id=p_client and active) then raise exception 'El cliente no está activo'; end if;
  token := encode(extensions.gen_random_bytes(32),'hex');
  insert into munna_orders.access(client_id,token_hash) values(p_client,extensions.digest(token,'sha256'))
    on conflict(client_id) do update set token_hash=excluded.token_hash,created_at=now();
  return token;
end;
$$;

create function public.orders_workspace(p_token text default null) returns jsonb language sql security invoker set search_path='' as $$
  select munna_orders.workspace(p_token);
$$;
create function public.orders_save(p_id uuid,p_items jsonb,p_token text default null,p_revision integer default null,p_cancel boolean default false,p_note text default '',p_date date default null)
returns void language sql security invoker set search_path='' as $$
  select munna_orders.save(p_token,p_id,p_items,p_revision,p_cancel,p_note,p_date);
$$;
create function public.orders_manage_access(p_client bigint,p_revoke boolean default false) returns text
language sql security invoker set search_path='' as $$ select munna_orders.manage_access(p_client,p_revoke); $$;
revoke all on all functions in schema munna_orders from public,anon,authenticated;
revoke all on function public.orders_workspace(text),public.orders_save(uuid,jsonb,text,integer,boolean,text,date),public.orders_manage_access(bigint,boolean) from public,anon,authenticated;
grant execute on function munna_orders.workspace(text),munna_orders.save(text,uuid,jsonb,integer,boolean,text,date) to anon,authenticated;
grant execute on function munna_orders.manage_access(bigint,boolean) to authenticated;
grant execute on function public.orders_workspace(text),public.orders_save(uuid,jsonb,text,integer,boolean,text,date) to anon,authenticated;
grant execute on function public.orders_manage_access(bigint,boolean) to authenticated;
commit;
