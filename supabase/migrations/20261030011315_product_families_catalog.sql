create table public.product_families (
  id bigint generated always as identity primary key,
  name text not null unique check (btrim(name) <> ''),
  label text not null check (btrim(label) <> ''),
  discount_key text not null unique check (discount_key ~ '^[a-z][a-zA-Z0-9_]*$'),
  requires_package_weight boolean not null default false,
  unit_type public.unit_type not null default 'unidad',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.product_families (name, label, discount_key, requires_package_weight, unit_type)
values
  ('Helado', 'Helados', 'helado', false, 'kg'),
  ('Postre congelado', 'Postres congelados', 'postres', true, 'unidad'),
  ('Pastelería', 'Pastelería', 'pasteleria', true, 'unidad'),
  ('Mini Tortitas', 'Mini Tortitas', 'miniTortitas', false, 'unidad'),
  ('Insumo comprado', 'Insumos comprados', 'insumos', false, 'unidad'),
  ('Indumentaria', 'Indumentaria', 'indumentaria', false, 'unidad')
on conflict (name) do update set
  label = excluded.label,
  discount_key = excluded.discount_key,
  requires_package_weight = excluded.requires_package_weight,
  unit_type = excluded.unit_type,
  active = true;

create trigger product_families_touch_updated_at
before update on public.product_families
for each row execute function public.touch_updated_at();

alter table public.product_families enable row level security;

create policy product_families_authenticated_read
on public.product_families for select to authenticated
using (public.current_role() is not null);

create policy product_families_admin_insert
on public.product_families for insert to authenticated
with check (public.is_admin());

create policy product_families_admin_update
on public.product_families for update to authenticated
using (public.is_admin())
with check (public.is_admin());

revoke all on table public.product_families from public, anon, authenticated;
grant select, insert, update on table public.product_families to authenticated;
revoke all on sequence public.product_families_id_seq from public, anon, authenticated;
grant usage, select on sequence public.product_families_id_seq to authenticated;
