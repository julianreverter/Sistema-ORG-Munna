-- Run after supabase/orders.sql inside the same transaction, then ROLLBACK.
do $$
declare
  actor uuid; customer1 bigint; customer2 bigint; product bigint; unit1 bigint; unit2 bigint;
  dispatch bigint; dispatch_item bigint; token1 text; token2 text; replacement text;
  order1 uuid := gen_random_uuid(); order2 uuid := gen_random_uuid();
  payload jsonb; row_data jsonb; failed boolean; revision integer;
begin
  select id into strict actor from public.profiles where active and role='administracion' limit 1;
  perform set_config('request.jwt.claim.sub',actor::text,true);
  insert into public.clients(name,kind) values('ORDER TEST A '||order1,'Cliente') returning id into customer1;
  insert into public.clients(name,kind) values('ORDER TEST B '||order1,'Cliente') returning id into customer2;
  insert into public.products(code,name,family,presentation,container,unit_type)
    values('TEST-'||order1,'Test cajas','Postres','Caja x 20','Caja','unidad') returning id into product;
  token1 := public.orders_manage_access(customer1);
  token2 := public.orders_manage_access(customer2);
  assert token1<>token2 and length(token1)=64;
  assert not has_table_privilege('anon','munna_orders.orders','select');
  assert not has_table_privilege('authenticated','munna_orders.orders','select');
  assert not has_function_privilege('anon','public.orders_manage_access(bigint,boolean)','execute');

  perform public.orders_save(order1,jsonb_build_array(jsonb_build_object('id',product,'quantity',8)),token1);
  perform public.orders_save(order2,jsonb_build_array(jsonb_build_object('id',product,'quantity',6)),token2);
  -- Retrying an already committed request does not duplicate it.
  perform public.orders_save(order1,jsonb_build_array(jsonb_build_object('id',product,'quantity',8)),token1);
  assert (select count(*) from munna_orders.orders where id=order1)=1;
  payload := public.orders_workspace(token1);
  assert jsonb_array_length(payload->'orders')=1;
  assert payload->'orders'->0->>'id'=order1::text;
  assert jsonb_array_length(payload->'plan')=0;
  assert jsonb_array_length(payload->'clients')=0;
  failed := false;
  begin perform public.orders_workspace('invalid'); exception when others then failed:=true; end;
  assert failed;
  failed := false;
  begin perform public.orders_save(order1,'[]',token2,1,true); exception when others then failed:=true; end;
  assert failed;
  failed := false;
  begin perform public.orders_save(gen_random_uuid(),jsonb_build_array(jsonb_build_object('id',product,'quantity',1.5)),token1); exception when others then failed:=true; end;
  assert failed;
  perform set_config('request.jwt.claim.sub','',true);
  failed := false;
  begin perform public.orders_workspace(); exception when others then failed:=true; end;
  assert failed;
  perform set_config('request.jwt.claim.sub',actor::text,true);

  insert into public.production_units(unique_code,product_id,units,responsible_id,created_by,expires_at)
    values('TEST-STOCK-'||order1,product,200,actor,actor,current_date+10) returning id into unit1;
  payload := public.orders_workspace();
  select x into row_data from jsonb_array_elements(payload->'plan') x where (x->>'id')::bigint=product;
  assert (row_data->>'requested')::integer=14;
  assert (row_data->>'available')::integer=10;
  assert (row_data->>'toProduce')::integer=4;
  assert munna_orders.package_count('Caja x 20',10)=0;
  assert munna_orders.package_count('Vasqueta',null)=1;

  -- Ship 10 boxes to client A: their order consumes 8; B remains outstanding.
  insert into public.dispatches(remittance_number,client_id,created_by)
    values('TEST-REMIT-'||order1,customer1,actor) returning id into dispatch;
  insert into public.dispatch_items(dispatch_id,production_unit_id,units)
    values(dispatch,unit1,200) returning id into dispatch_item;
  payload := public.orders_workspace(token1);
  assert payload->'orders'->0->>'state'='entregado';
  assert (payload->'orders'->0->'items'->0->>'delivered')::integer=8;
  payload := public.orders_workspace(token2);
  assert payload->'orders'->0->>'state'='pendiente';
  select x into row_data from jsonb_array_elements(public.orders_workspace()->'plan') x where (x->>'id')::bigint=product;
  assert (row_data->>'available')::integer=0; -- excludes a dispatch even before stock status update
  assert (row_data->>'toProduce')::integer=6;

  -- Returned packages reopen the order and can be dispatched again.
  update public.dispatch_items set returned_at=now() where id=dispatch_item;
  assert public.orders_workspace(token1)->'orders'->0->>'state'='pendiente';
  assert (public.orders_workspace(token1)->'orders'->0->'items'->0->>'delivered')::integer=0;
  update public.dispatches set status='anulado' where id=dispatch;
  assert (public.orders_workspace(token1)->'orders'->0->'items'->0->>'delivered')::integer=0;

  -- Partial delivery, revision protection, and cancelling only the remaining demand.
  insert into public.production_units(unique_code,product_id,units,responsible_id,created_by)
    values('TEST-PARTIAL-'||order2,product,40,actor,actor) returning id into unit2;
  insert into public.dispatches(remittance_number,client_id,created_by)
    values('TEST-PARTIAL-'||order2,customer2,actor) returning id into dispatch;
  insert into public.dispatch_items(dispatch_id,production_unit_id,units) values(dispatch,unit2,40);
  assert public.orders_workspace(token2)->'orders'->0->>'state'='parcial';
  select o.revision into revision from munna_orders.orders o where id=order2;
  failed:=false;
  begin perform public.orders_save(order2,jsonb_build_array(jsonb_build_object('id',product,'quantity',1)),null,revision); exception when others then failed:=true; end;
  assert failed;
  perform public.orders_save(order2,jsonb_build_array(jsonb_build_object('id',product,'quantity',4)),null,revision);
  failed:=false;
  begin perform public.orders_save(order2,'[]',null,revision,true); exception when others then failed:=true; end;
  assert failed;
  perform public.orders_save(order2,'[]',null,revision+1,true);
  assert public.orders_workspace(token2)->'orders'->0->>'state'='cancelado';
  replacement:=public.orders_manage_access(customer1);
  failed:=false;
  begin perform public.orders_workspace(token1); exception when others then failed:=true; end;
  assert failed;
  assert public.orders_workspace(replacement)->'orders'->0->>'id'=order1::text;
  perform public.orders_manage_access(customer1,true);
  failed:=false;
  begin perform public.orders_workspace(replacement); exception when others then failed:=true; end;
  assert failed;
end $$;
