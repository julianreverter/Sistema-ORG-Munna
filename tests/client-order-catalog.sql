begin;
do $test$
declare actor uuid; cid bigint; pid bigint; token text; doc jsonb; blocked boolean:=false;
begin
 select id into actor from public.profiles where active and role::text='administracion' limit 1;
 perform set_config('request.jwt.claim.sub',actor::text,true);
 select id into cid from public.clients where active limit 1;
 select id into pid from public.products where active and munna_orders.package_count(presentation,10000)>0 limit 1;
 token:=munna_orders.manage_access(cid,false);
 perform public.orders_catalog(cid,'[]'::jsonb);
 doc:=public.orders_workspace(token);
 if jsonb_array_length(doc->'products')<>0 then raise exception 'Empty catalog leaked products'; end if;
 begin
 perform public.orders_save(gen_random_uuid(),jsonb_build_array(jsonb_build_object('id',pid,'quantity',1)),token);
 exception when others then
 if sqlerrm like 'El pedido contiene productos no habilitados%' then blocked:=true; else raise; end if;
 end;
 if not blocked then raise exception 'Disabled product accepted'; end if;
 perform public.orders_catalog(cid,jsonb_build_array(pid));
 doc:=public.orders_workspace(token);
 if jsonb_array_length(doc->'products')<>1 then raise exception 'Catalog filtering failed'; end if;
 perform public.orders_save(gen_random_uuid(),jsonb_build_array(jsonb_build_object('id',pid,'quantity',1)),token);
 perform set_config('request.jwt.claim.sub','',true);
 blocked:=false;
 begin perform public.orders_catalog(cid,'[]'::jsonb);
 exception when others then if sqlerrm like 'Solo administración%' then blocked:=true; else raise; end if; end;
 if not blocked then raise exception 'Unauthorized catalog change'; end if;
 if has_function_privilege('anon','public.orders_catalog(bigint,jsonb)','execute') then raise exception 'Anon catalog grant'; end if;
end;
$test$; rollback;
