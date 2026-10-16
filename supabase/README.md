# Supabase — Sistema ORG Münna

## Primera instalación

1. Abrir el proyecto `Sistema ORG Munna` en Supabase.
2. Entrar en **SQL Editor** y crear una consulta nueva.
3. Copiar el contenido de `migrations/0001_initial_schema.sql` y ejecutar **Run** una sola vez.
4. Crear el primer usuario desde **Authentication > Users**.
5. En **Table Editor > profiles**, cambiar el rol de ese usuario a `administracion`.

Los usuarios nuevos nacen como `maestro_heladero`. Administración puede luego asignar:

- `maestro_heladero`: producción, stock y armado de remitos; sin costos.
- `jefe_produccion`: reportes, fórmulas y costos productivos.
- `administracion`: acceso completo.

## Railway

Configurar `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` y `SUPABASE_SERVICE_ROLE_KEY` directamente como variables del servicio. La clave `service_role` nunca debe quedar en GitHub ni llegar al navegador.
