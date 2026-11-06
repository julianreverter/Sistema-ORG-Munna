create table public.expense_categories (
 key text primary key check (length(btrim(key)) between 1 and 80),
 name text not null check (length(btrim(name)) between 1 and 80),
 created_at timestamptz not null default now()
);
create unique index expense_categories_name_unique on public.expense_categories(lower(name));
alter table public.expense_categories enable row level security;
grant select,insert,update on public.expense_categories to authenticated;
create policy expense_categories_admin_select on public.expense_categories for select to authenticated using (public.is_admin());
create policy expense_categories_admin_insert on public.expense_categories for insert to authenticated with check (public.is_admin());
create policy expense_categories_admin_update on public.expense_categories for update to authenticated using (public.is_admin()) with check (public.is_admin());
insert into public.expense_categories(key,name) values
('Packaging','Packaging'),('Servicios','Servicios'),('Sueldos','Sueldos'),('Mantenimiento','Mantenimiento'),('Logística','Logística'),('Impuestos','Impuestos'),('Alquileres','Alquileres'),('Inversiones','Inversiones'),('Otros','Otros');
alter table public.operating_expenses drop constraint operating_expenses_category_check;
alter table public.operating_expenses add constraint operating_expenses_category_check check (length(btrim(category)) between 1 and 80);
