begin;
alter table munna_orders.access add column saved_token_id uuid references vault.secrets(id);
create or replace function munna_orders.manage_access(p_client bigint,p_revoke boolean) returns text
language plpgsql security definer set search_path='' as $$
declare token text; secret_id uuid;
begin
 if munna_orders.staff_role() is distinct from 'administracion' then raise exception 'Solo administración puede habilitar accesos'; end if;
 perform pg_advisory_xact_lock(p_client);
 select saved_token_id into secret_id from munna_orders.access where client_id=p_client;
 if p_revoke then delete from munna_orders.access where client_id=p_client; delete from vault.secrets where id=secret_id; return null; end if;
 if not exists(select 1 from public.clients where id=p_client and active) then raise exception 'El cliente no está activo'; end if;
 token:=encode(extensions.gen_random_bytes(32),'hex');
 if secret_id is null then secret_id:=vault.create_secret(token); else perform vault.update_secret(secret_id,token); end if;
 insert into munna_orders.access(client_id,token_hash,saved_token_id) values(p_client,extensions.digest(token,'sha256'),secret_id)
 on conflict(client_id) do update set token_hash=excluded.token_hash,saved_token_id=excluded.saved_token_id,created_at=now();
 return token;
end;
$$;
create function munna_orders.saved_link(p_client bigint,p_token text) returns text
language plpgsql security definer set search_path='' as $$
declare token text;
begin
 if munna_orders.staff_role() is distinct from 'administracion' then raise exception 'Solo administración puede consultar los enlaces'; end if;
 perform pg_advisory_xact_lock(p_client);
 if p_token is not null then
  if p_token !~ '^[0-9a-f]{64}$' then raise exception 'Enlace inválido'; end if;
  if not exists(select 1 from munna_orders.access where client_id=p_client and token_hash=extensions.digest(p_token,'sha256')) then raise exception 'El enlace no corresponde al acceso vigente de este cliente'; end if;
  if (select saved_token_id is null from munna_orders.access where client_id=p_client) then
   update munna_orders.access set saved_token_id=vault.create_secret(p_token) where client_id=p_client;
  end if;
 end if;
 select v.decrypted_secret into token from munna_orders.access a join vault.decrypted_secrets v on v.id=a.saved_token_id where a.client_id=p_client;
 return token;
end;
$$;
create function public.orders_saved_link(p_client bigint,p_token text default null) returns text
language sql security invoker set search_path='' as $$ select munna_orders.saved_link(p_client,p_token); $$;
revoke all on function munna_orders.saved_link(bigint,text),public.orders_saved_link(bigint,text) from public,anon,authenticated;
grant execute on function munna_orders.saved_link(bigint,text),public.orders_saved_link(bigint,text) to authenticated;
commit;
