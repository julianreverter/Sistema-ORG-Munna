# Sistema ORG Münna

Sistema integral para producción, stock, etiquetas, despachos, compras, costos, cuentas corrientes y reportes de Münna Gelateria.

## Estado

La rama `migracion-inicial` contiene el prototipo operativo actual. La siguiente etapa reemplaza la persistencia D1/SQLite por PostgreSQL en Supabase, incorpora Supabase Auth y prepara el despliegue en Railway.

## Seguridad

No se versionan contraseñas, tokens ni variables de entorno. La configuración productiva se cargará directamente en Supabase y Railway.
