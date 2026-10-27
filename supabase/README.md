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

## Fórmulas compuestas

Antes de activar la selección de fórmulas base, ejecutar `migrations/0003_recipe_components.sql` en el SQL Editor del proyecto existente. Es una migración aditiva y transaccional: conserva las fórmulas y materias primas actuales. Puede repetirse sin borrar datos.

La migración agrega `recipe_formula_items` y la función `save_recipe_components`. La función reemplaza los ingredientes en una única transacción, exige 1 kg exacto, valida ingredientes y bloquea referencias circulares. Un bloqueo transaccional serializa los cambios del grafo. Solamente Administración puede guardar; los permisos de lectura respetan los roles existentes.

Los costos se calculan al consultar las fórmulas y al registrar una nueva producción. Los costos históricos de producciones anteriores conservan su valor original.

El código admite desplegar antes de ejecutar la migración: mantiene la carga de materias primas y oculta la selección de fórmulas base hasta detectar la nueva tabla. Para activar la función se recomienda aplicar la migración, desplegar el código y recargar la página. No dar la función por activa sin verificar ambos pasos.

### Validación

- `npm test`: pruebas de cálculos, precios y composición de bases, fórmulas con varios niveles, permisos, validación de entradas y costo registrado en producción.
- `npm run build`: compilación y revisión de tipos.
- Para probar también el SQL con PostgreSQL aislado: instalar temporalmente `@electric-sql/pglite@0.5.12` con `npm install --no-save --package-lock=false @electric-sql/pglite@0.5.12` y ejecutar `node tests/formula-migration.mjs`. La prueba usa una base en memoria, sin conexión a Supabase. Verifica migración repetible, persistencia de vínculos, ciclos, errores intermedios y conservación de la fórmula previa.
- Prueba funcional tras activar: en Granizado cargar fórmula Americana 0,9 kg y chocolate 0,1 kg, guardar y reabrir. Cambiar Americana o el costo de una materia prima de Americana y comprobar el nuevo costo de Granizado. Rechazar Americana → Granizado cuando Granizado ya usa Americana.

## Fórmulas sin producto maestro

La migración `20261027201834_named_recipes.sql` permite dejar `recipes.product_id` vacío y agrega `save_named_recipe`. La edición identifica la fórmula por su ID para conservar sus vínculos. El nombre es obligatorio; la asociación al maestro es opcional. Cada ingrediente permite elegir primero Materia prima o Producto; Producto muestra las fórmulas guardadas, tengan o no maestro. Se mantienen la validación de 1 kg y el bloqueo de ciclos. La migración anterior y su función siguen disponibles para compatibilidad.
