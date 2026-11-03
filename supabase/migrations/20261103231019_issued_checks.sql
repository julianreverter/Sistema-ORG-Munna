create table public.issued_checks (
  id uuid primary key default gen_random_uuid(),
  number text not null check (length(trim(number)) between 1 and 200),
  bank text not null check (length(trim(bank)) between 1 and 200),
  beneficiary text not null check (length(trim(beneficiary)) between 1 and 200),
  amount numeric(14,2) not null check (amount > 0),
  issued_on date not null,
  due_on date not null check (due_on >= issued_on),
  status text not null default 'pending' check (status in ('pending','debited','cancelled')),
  debited_on date,
  notes text not null default '' check (length(notes) <= 2000),
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint issued_checks_debit_date check (
    (status = 'debited' and debited_on is not null and debited_on >= issued_on
      and debited_on <= (now() at time zone 'America/Argentina/Buenos_Aires')::date)
    or (status <> 'debited' and debited_on is null)
  )
);
create unique index issued_checks_bank_number on public.issued_checks (lower(trim(bank)), lower(trim(number)));
create index issued_checks_due_on on public.issued_checks (due_on, id);
create index issued_checks_issued_on on public.issued_checks (issued_on);
create trigger issued_checks_touch_updated_at before update on public.issued_checks
  for each row execute function public.touch_updated_at();
alter table public.issued_checks enable row level security;
revoke all on public.issued_checks from anon, authenticated;
grant select, insert, update on public.issued_checks to authenticated;
create policy issued_checks_admin_select on public.issued_checks for select to authenticated
  using ((select public.is_admin()));
create policy issued_checks_admin_insert on public.issued_checks for insert to authenticated
  with check ((select public.is_admin()) and created_by = (select auth.uid()));
create policy issued_checks_admin_update on public.issued_checks for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
