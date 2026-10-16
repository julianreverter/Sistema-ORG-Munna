-- Sistema ORG Munna - esquema inicial para Supabase/PostgreSQL
-- Ejecutar una sola vez desde Supabase > SQL Editor.

create extension if not exists pgcrypto;

create type public.app_role as enum ('administracion', 'jefe_produccion', 'maestro_heladero');
create type public.unit_type as enum ('kg', 'unidad');
create type public.stock_status as enum ('stock', 'despachado', 'baja');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  display_name text not null,
  role public.app_role not null default 'maestro_heladero',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.products (
  id bigint generated always as identity primary key,
  code text not null unique,
  name text not null,
  family text not null,
  presentation text not null,
  container text not null,
  unit_type public.unit_type not null default 'kg',
  tare_kg numeric(12,3) not null default 0 check (tare_kg >= 0),
  base_price numeric(14,2) not null default 0 check (base_price >= 0),
  ingredients text not null default '',
  allergens text not null default 'Contiene leche y derivados.',
  expiry_days integer not null default 365 check (expiry_days > 0),
  rne text,
  rnpa text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.clients (
  id bigint generated always as identity primary key,
  name text not null unique,
  kind text not null,
  discounts jsonb not null default '{}'::jsonb,
  returnable boolean not null default true,
  billing_weight text not null default 'Neto',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.suppliers (
  id bigint generated always as identity primary key,
  name text not null unique,
  tax_mode text not null default 'revisar' check (tax_mode in ('con_iva','sin_iva','revisar')),
  category text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.purchased_products (
  id bigint generated always as identity primary key,
  master_name text not null,
  supplier_id bigint not null references public.suppliers(id),
  supplier_description text not null,
  cost_unit public.unit_type not null default 'kg',
  content_per_package numeric(12,3) not null check (content_per_package > 0),
  vat_rate numeric(5,2) not null default 0 check (vat_rate in (0, 10.5, 21)),
  last_net_package_cost numeric(14,2),
  last_final_cost_per_unit numeric(14,4),
  last_purchase_at date,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (supplier_id, supplier_description)
);

create index purchased_products_search_idx on public.purchased_products (supplier_id, master_name);

create table public.purchases (
  id bigint generated always as identity primary key,
  supplier_id bigint not null references public.suppliers(id),
  invoice_number text not null,
  invoice_date date not null,
  cost_center text not null,
  payment_status text not null check (payment_status in ('pagada','cuenta_corriente')),
  net_total numeric(14,2) not null default 0,
  vat_total numeric(14,2) not null default 0,
  gross_total numeric(14,2) not null default 0,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (supplier_id, invoice_number)
);

create table public.purchase_items (
  id bigint generated always as identity primary key,
  purchase_id bigint not null references public.purchases(id) on delete cascade,
  purchased_product_id bigint not null references public.purchased_products(id),
  quantity numeric(12,3) not null check (quantity > 0),
  net_package_price numeric(14,2) not null check (net_package_price >= 0),
  vat_rate numeric(5,2) not null default 0,
  vat_amount numeric(14,2) not null default 0,
  line_total numeric(14,2) not null default 0,
  final_cost_per_unit numeric(14,4) not null default 0
);

create table public.supplier_payments (
  id bigint generated always as identity primary key,
  supplier_id bigint not null references public.suppliers(id),
  payment_date date not null,
  amount numeric(14,2) not null check (amount > 0),
  method text not null check (method in ('transferencia','efectivo','echeq','cheque_tercero','mercaderia')),
  reference text,
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.recipes (
  id bigint generated always as identity primary key,
  product_id bigint not null unique references public.products(id),
  name text not null,
  yield_kg numeric(12,3) not null check (yield_kg > 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.recipe_items (
  id bigint generated always as identity primary key,
  recipe_id bigint not null references public.recipes(id) on delete cascade,
  purchased_product_id bigint not null references public.purchased_products(id),
  quantity_kg numeric(12,4) not null check (quantity_kg > 0),
  unique (recipe_id, purchased_product_id)
);

create table public.production_units (
  id bigint generated always as identity primary key,
  unique_code text not null unique,
  product_id bigint not null references public.products(id),
  weight_kg numeric(12,3),
  units integer,
  responsible_id uuid not null references public.profiles(id),
  base_price_snapshot numeric(14,2) not null default 0,
  cost_per_kg_snapshot numeric(14,4),
  status public.stock_status not null default 'stock',
  lot text,
  expires_at date,
  dispatched_at timestamptz,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((weight_kg is not null and weight_kg > 0) or (units is not null and units > 0))
);

create index production_history_idx on public.production_units (created_at desc, product_id, responsible_id);

create table public.dispatches (
  id bigint generated always as identity primary key,
  remittance_number text not null unique,
  client_id bigint not null references public.clients(id),
  total_kg numeric(12,3) not null default 0,
  subtotal numeric(14,2) not null default 0,
  discount_total numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  status text not null default 'emitido',
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.dispatch_items (
  id bigint generated always as identity primary key,
  dispatch_id bigint not null references public.dispatches(id) on delete cascade,
  production_unit_id bigint not null unique references public.production_units(id),
  weight_kg numeric(12,3),
  units integer,
  unit_price numeric(14,2) not null default 0,
  discount_pct numeric(5,2) not null default 0,
  line_total numeric(14,2) not null default 0
);

create table public.customer_payments (
  id bigint generated always as identity primary key,
  client_id bigint not null references public.clients(id),
  payment_date date not null,
  amount numeric(14,2) not null check (amount > 0),
  method text not null,
  reference text,
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.customer_account_adjustments (
  id bigint generated always as identity primary key,
  client_id bigint not null references public.clients(id),
  movement_date date not null,
  movement_type text not null check (movement_type in ('venta','ajuste')),
  concept text not null,
  signed_amount numeric(14,2) not null check (signed_amount <> 0),
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.operating_expenses (
  id bigint generated always as identity primary key,
  expense_date date not null,
  area text not null,
  category text not null check (category in ('servicios','alquileres','sueldos','mantenimiento','inversiones','otros')),
  concept text not null,
  amount numeric(14,2) not null check (amount > 0),
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.local_sales (
  id bigint generated always as identity primary key,
  sale_date date not null,
  area text not null,
  concept text not null,
  amount numeric(14,2) not null,
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

do $$
declare t text;
begin
  foreach t in array array['profiles','products','clients','suppliers','purchased_products','purchases','recipes','production_units','dispatches']
  loop
    execute format('create trigger %I_touch_updated_at before update on public.%I for each row execute function public.touch_updated_at()', t, t);
  end loop;
end $$;

create or replace function public.handle_new_user()
returns trigger security definer set search_path = public language plpgsql as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.current_role()
returns public.app_role stable security definer set search_path = public language sql as $$
  select role from public.profiles where id = auth.uid() and active = true
$$;

create or replace function public.is_admin()
returns boolean stable language sql as $$ select public.current_role() = 'administracion'::public.app_role $$;

-- RLS: nadie accede sin login. Administración tiene acceso total.
do $$
declare t text;
begin
  foreach t in array array['profiles','products','clients','suppliers','purchased_products','purchases','purchase_items','supplier_payments','recipes','recipe_items','production_units','dispatches','dispatch_items','customer_payments','customer_account_adjustments','operating_expenses','local_sales']
  loop execute format('alter table public.%I enable row level security', t); end loop;
end $$;

create policy profiles_self_read on public.profiles for select to authenticated using (id = auth.uid() or public.is_admin());
create policy profiles_admin_write on public.profiles for all to authenticated using (public.is_admin()) with check (public.is_admin());

do $$
declare t text;
begin
  foreach t in array array['products','clients','production_units','dispatches','dispatch_items']
  loop
    execute format('create policy %I_authenticated_read on public.%I for select to authenticated using (public.current_role() is not null)', t, t);
  end loop;
end $$;

create policy production_insert on public.production_units for insert to authenticated
with check (public.current_role() in ('administracion','jefe_produccion','maestro_heladero'));
create policy dispatch_insert on public.dispatches for insert to authenticated
with check (public.current_role() in ('administracion','jefe_produccion','maestro_heladero'));
create policy dispatch_items_insert on public.dispatch_items for insert to authenticated
with check (public.current_role() in ('administracion','jefe_produccion','maestro_heladero'));
create policy production_update on public.production_units for update to authenticated
using (public.current_role() in ('administracion','jefe_produccion','maestro_heladero'))
with check (public.current_role() in ('administracion','jefe_produccion','maestro_heladero'));

do $$
declare t text;
begin
  foreach t in array array['suppliers','purchased_products','purchases','purchase_items','supplier_payments','customer_payments','customer_account_adjustments','operating_expenses','local_sales']
  loop
    execute format('create policy %I_admin_all on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t, t);
  end loop;
end $$;

do $$
declare t text;
begin
  foreach t in array array['recipes','recipe_items']
  loop
    execute format('create policy %I_management_read on public.%I for select to authenticated using (public.current_role() in (''administracion'',''jefe_produccion''))', t, t);
    execute format('create policy %I_admin_write on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t, t);
  end loop;
end $$;

create or replace view public.supplier_account_summary as
select s.id as supplier_id, s.name,
       coalesce(sum(p.gross_total) filter (where p.payment_status = 'cuenta_corriente'), 0) as invoiced,
       coalesce((select sum(sp.amount) from public.supplier_payments sp where sp.supplier_id = s.id), 0) as paid,
       coalesce(sum(p.gross_total) filter (where p.payment_status = 'cuenta_corriente'), 0)
       - coalesce((select sum(sp.amount) from public.supplier_payments sp where sp.supplier_id = s.id), 0) as balance
from public.suppliers s left join public.purchases p on p.supplier_id = s.id group by s.id, s.name;

create or replace view public.customer_account_summary as
select c.id as client_id, c.name,
       coalesce((select sum(d.total) from public.dispatches d where d.client_id = c.id and d.status <> 'anulado'), 0)
       + coalesce((select sum(a.signed_amount) from public.customer_account_adjustments a where a.client_id = c.id), 0) as charges,
       coalesce((select sum(cp.amount) from public.customer_payments cp where cp.client_id = c.id), 0) as paid,
       coalesce((select sum(d.total) from public.dispatches d where d.client_id = c.id and d.status <> 'anulado'), 0)
       + coalesce((select sum(a.signed_amount) from public.customer_account_adjustments a where a.client_id = c.id), 0)
       - coalesce((select sum(cp.amount) from public.customer_payments cp where cp.client_id = c.id), 0) as balance
from public.clients c;

revoke all on public.supplier_account_summary, public.customer_account_summary from anon;
grant select on public.supplier_account_summary, public.customer_account_summary to authenticated;

