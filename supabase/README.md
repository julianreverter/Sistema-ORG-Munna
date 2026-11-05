# Supabase — Sistema ORG Münna

## Códigos de producción e impresión

Aplicar `20261103194944_server_production_codes.sql` y `20261103195624_production_counter_catchup.sql` antes de publicar la pantalla de etiquetas. El código se asigna en la base al insertar, mediante una secuencia inicializada por encima de todos los códigos numéricos históricos. Se conserva la restricción UNIQUE y se omiten códigos ocupados durante la transición. Los códigos históricos no cambian.

El registro exige el protocolo de etiquetas 2 y un UUID por intento. Una pantalla anterior recibe una indicación de recargar antes de guardar. Reintentar el mismo UUID recupera la misma unidad en stock si coinciden el usuario, producto, elaborador, peso y cantidad; no crea otra unidad. No se acepta reutilizarlo para otros datos ni para una unidad que ya salió del stock.

La impresión usa una copia congelada de la etiqueta y el código confirmado en la respuesta del servidor, tanto para el número visible como para el Code 128. Cada impresión abre una ventana independiente. Reimprimir conserva esa misma copia. La vista previa no anuncia ni codifica un número sin registrar.

Validación: `npm test` incluye cambio de peso durante el guardado, reintentos y bloqueo de pantallas antiguas. `node tests/server-production-codes-migration.mjs` verifica la asignación y restricciones en PGlite (puede usarse `PGLITE_MODULE`), incluida la transición a códigos de siete dígitos. No se registra producción real para las pruebas.

## Devoluciones completas de clientes

Aplicar `20261103192925_customer_returns.sql` antes de desplegar la pantalla. Administración abre Remitos, selecciona la entrega original y usa Registrar devolución. Se escanea una unidad o caja completa, se indica el motivo y se confirma su recepción apta para volver a cámara. No hay devolución parcial de unidades dentro de una caja.

La función `register_customer_return` acredita el importe del renglón original con su descuento, genera la referencia NC-D y devuelve la misma unidad al stock con su código original. Las tres escrituras se confirman en una transacción. Un renglón puede devolverse solo una vez. La unidad puede despacharse nuevamente en otro remito; cada entrega y devolución permanece en el historial. El remito original conserva su importe y el crédito se registra en la cuenta corriente. La nota imprimible es un comprobante interno, sin integración fiscal.

Solo Administración puede confirmar devoluciones y consultar el comprobante financiero. La función usa SECURITY INVOKER y las políticas RLS existentes; la nueva tabla tiene políticas de lectura e inserción administrativas y actualización únicamente de su vínculo con el ajuste contable. No se conceden permisos de borrado.

Validación: `npm test` cubre permisos, entradas y el destino del último despacho pendiente. `node tests/customer-returns-migration.mjs` prueba el SQL con PGlite, sin conectarse a la base real; `PGLITE_MODULE` permite indicar la ruta absoluta del módulo instalado. Verifica el crédito con descuento, duplicados, re-despacho del mismo código, RLS y reversión completa ante una falla al reingresar stock.

## Bajas de stock con historial

La migración `20261101233725_stock_removal_audit.sql` agrega la auditoría de bajas sobre la producción existente. Aplicarla antes de desplegar la pantalla de Eliminados. No elimina registros ni modifica el stock existente.

Desde Stock de fábrica se elige una unidad por código y se registra el motivo. Otro exige un comentario; los demás motivos admiten comentarios opcionales (hasta 2000 caracteres). La base registra la fecha y el usuario autenticado, conserva la producción original y bloquea la modificación posterior de la baja. Las unidades despachadas o con un despacho en curso no pueden eliminarse. Los roles operativos conservan los mismos permisos de actualización de stock, sin acceso a costos.

Verificación: `npm test` cubre el formulario de datos y la API. `node tests/stock-removal-migration.mjs` prueba el SQL en PostgreSQL en memoria con `@electric-sql/pglite` instalado; alternativamente, `PGLITE_MODULE` puede indicar la ruta absoluta de su `dist/index.js`. La prueba no se conecta a la base real.

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

## Rendimiento y desperdicio en costeo

Aplicar `20261105143021_recipe_waste_yield.sql` antes de desplegar la interfaz correspondiente. La fórmula continúa representando 1 kg final, pero puede consumir más de 1 kg de materias primas o fórmulas base. La diferencia se informa como desperdicio y todo el insumo consumido integra el costo del kg final. No modifica compras ni registra movimientos de stock. Las fórmulas existentes de 1 kg siguen siendo válidas sin cambios.
