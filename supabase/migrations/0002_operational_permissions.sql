-- Permisos necesarios para altas maestras desde la aplicación.
-- Ejecutar después de 0001_initial_schema.sql.

create policy products_admin_write
on public.products for all to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy clients_admin_write
on public.clients for all to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy dispatches_update
on public.dispatches for update to authenticated
using (public.current_role() in ('administracion','jefe_produccion'))
with check (public.current_role() in ('administracion','jefe_produccion'));

create policy dispatch_items_management
on public.dispatch_items for update to authenticated
using (public.current_role() in ('administracion','jefe_produccion'))
with check (public.current_role() in ('administracion','jefe_produccion'));
