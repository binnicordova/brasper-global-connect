# Activar la protección contra cancelaciones accidentales

El formulario anterior era no controlado: al pasar de `proof_submitted` a `verified`, React reutilizaba el select y podía conservar `cancel` mientras la observación anterior seguía escrita. Un evento `cancel` registra la petición recibida por la base de datos; no acredita que la persona haya elegido deliberadamente cancelar.

La revisión ahora empieza con una selección vacía y se monta de nuevo por operación y estado. Tras guardar se limpian los campos, incluso si falla la actualización del listado. La cancelación está fuera del desplegable: requiere abrir un diálogo, escribir un motivo nuevo y confirmar. Un bloqueo inmediato impide envíos dobles.

## Migración

En el backend de Brasper aplica **una sola** de estas copias equivalentes, usando el mecanismo que ya utiliza ese proyecto:

- Lovable/Drizzle: `drizzle/migrations/0001_safe_transfer_review.sql`, registrada en `meta/_journal.json`.
- Supabase CLI/SQL Editor: `supabase/migrations/202610100006_safe_transfer_review.sql` después de las cinco anteriores.

No ejecutar ambas copias ni volver a ejecutar la migración inicial. No se restauran datos automáticamente al aplicar la migración.

`review_transfer` rechaza `cancel`, por lo que una pantalla antigua no puede cancelar con el botón de revisión. `cancel_transfer` exige permisos del equipo y el estado esperado, bloquea la fila y registra el evento. Si otro operador cambió el estado, se rechaza la cancelación.

`restore_verified_transfer` permite al equipo corregir una cancelación posterior a `verify` solamente cuando los dos últimos eventos son `cancel` y `verify`, hay fecha de verificación y no existe envío, referencia ni factura. Conserva el evento anterior y añade `restore_verified`; no genera pagos ni facturas. El panel ofrece «Restaurar ingreso confirmado» en operaciones canceladas, con confirmación y motivo. La base de datos decide si corresponde restaurar.

## Texto para Lovable

Sincroniza los últimos cambios de `main`. Aplica la nueva migración `0001_safe_transfer_review.sql` por el mecanismo Drizzle configurado (o la copia Supabase 006 si el proyecto usa ese mecanismo), sin repetir las migraciones anteriores. Verifica que existan `cancel_transfer` y `restore_verified_transfer` y que `review_transfer` ya rechace cancelaciones antiguas. Publica la interfaz corregida.

Busca la operación cuyo UUID empieza por `542a4283` y muestra su UUID completo y estado. Confirma que haya una sola coincidencia y que su historial tenga ingreso confirmado seguido de cancelación, sin envío ni factura. Abre esa operación con una sesión del equipo y usa «Restaurar ingreso confirmado», motivo «Corrección de cancelación accidental del formulario; el usuario no solicitó cancelar». Conserva el historial y la evidencia. No crear otra operación, no marcar dinero enviado, no emitir una factura ni restaurar otras operaciones. Si la comprobación falla, informa el motivo y no cambies el estado.

Prueba confirmar ingreso: observación vacía, acción sin seleccionar y Guardar revisión deshabilitado al terminar. Abrir/cerrar el diálogo de cancelación no debe modificar la operación; solo la confirmación explícita con motivo llama a `cancel_transfer`.
