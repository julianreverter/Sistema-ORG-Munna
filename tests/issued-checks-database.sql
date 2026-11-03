begin;
select set_config('request.jwt.claim.sub',(select id::text from public.profiles where role='administracion' and active limit 1),true);
set local role authenticated;
do $$
declare check_id uuid; item record;
begin
 insert into public.issued_checks(number,bank,beneficiary,amount,issued_on,due_on)
 values ('__CODEX_ROLLBACK_TEST__','__TEST__','Prueba transaccional',1234.56,'2026-08-01','2026-09-01') returning id into check_id;
 select * into item from public.issued_checks where id=check_id;
 if item.status <> 'pending' or item.amount <> 1234.56 then raise exception 'Pending/cents failed'; end if;
 update public.issued_checks set status='debited',debited_on='2026-10-01' where id=check_id;
 if not exists(select 1 from public.issued_checks where id=check_id and debited_on='2026-10-01') then raise exception 'Late debit failed'; end if;
 begin
  insert into public.issued_checks(number,bank,beneficiary,amount,issued_on,due_on)
  values ('__CODEX_ROLLBACK_TEST__','__test__','Duplicado',1,'2026-08-01','2026-09-01');
  raise exception 'Duplicate accepted';
 exception when unique_violation then null; end;
 begin
  update public.issued_checks set debited_on=null where id=check_id;
  raise exception 'Missing debit date accepted';
 exception when check_violation then null; end;
 update public.issued_checks set status='cancelled',debited_on=null where id=check_id;
end $$;
reset role;
select set_config('request.jwt.claim.sub',(select id::text from public.profiles where role='jefe_produccion' and active limit 1),true);
set local role authenticated;
do $$ begin
 if exists(select 1 from public.issued_checks) then raise exception 'Non-admin read allowed'; end if;
 begin
  insert into public.issued_checks(number,bank,beneficiary,amount,issued_on,due_on)
  values ('__DENIED__','__TEST__','Prueba',1,'2026-08-01','2026-09-01');
  raise exception 'Non-admin insert allowed';
 exception when insufficient_privilege then null; end;
 if exists(select 1 from public.issued_checks where number='__CODEX_ROLLBACK_TEST__') then raise exception 'Non-admin sees test'; end if;
end $$;
reset role;
do $$ begin
 if has_table_privilege('anon','public.issued_checks','SELECT') or has_table_privilege('authenticated','public.issued_checks','DELETE') then raise exception 'Unexpected grants'; end if;
end $$;
rollback;
