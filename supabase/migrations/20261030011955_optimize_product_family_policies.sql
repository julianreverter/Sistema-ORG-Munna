drop policy if exists product_families_admin_write on public.product_families;

create policy product_families_admin_insert
on public.product_families for insert to authenticated
with check (public.is_admin());

create policy product_families_admin_update
on public.product_families for update to authenticated
using (public.is_admin())
with check (public.is_admin());
