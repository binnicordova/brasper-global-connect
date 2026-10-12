# Actualización manual de Brasper

## Entrega disponible

La demo web funciona sin llamadas al backend: registro, validación de campos, revisión del ingreso por el equipo, constancia del envío, PDF de factura/boleta demo y registro de entrega de correo demo. El dashboard incluye seis escenarios, tasas de ejemplo, participantes, fondos, documentos y una cronología coherente. Los PDF de los casos precargados también se pueden abrir. «Modo demo» identifica el recorrido; no se envían correos reales ni se realizan movimientos bancarios.

Los escenarios provienen de `src/lib/demo-fixtures.ts`. El paquete incluye el mismo catálogo en `supabase/demo/catalog.json` y `supabase/demo/seed.sql`. Las rutas de evidencia del catálogo son referencias de ejemplo; aplicar SQL no sube documentos a Storage. El comprobante de ejemplo está en `public/demo/comprobante-ejemplo.pdf`.

## Paquete de BD y funciones

- `supabase/release/database-update.sql`: las nueve migraciones operativas en una transacción, preparado inicialmente para una BD sin ninguna de ellas aplicada.
- `supabase/release/manifest.json`: lista de migraciones, fuentes y hashes para revisar el paquete.
- `supabase/demo/seed.sql`: catálogo de referencia separado en `brasper_demo`, idempotente y legible solo por miembros del equipo. No inserta operaciones, tasas ni cuentas de depósito en las tablas operativas, no crea usuarios Auth y no dispara facturación.
- `supabase/functions/process-invoices/index.ts` y `supabase/config.toml`: worker y configuración de autenticación ya existentes; el manifiesto incluye sus hashes.
- `supabase/manual-setup.example.sql`: plantilla para cuentas oficiales, tasas aprobadas y miembros del equipo.

El catálogo de BD prepara los escenarios para su revisión e importación futura. **El frontend `?demo=1` sigue leyendo el almacenamiento local; no está conectado a `brasper_demo`.** Mantener ambas cosas separadas evita convertir una operación demo en un envío o factura real. No exponer el esquema demo a clientes ni copiar sus cuentas a `public.deposit_accounts`.

Antes de aplicar SQL, inspeccionar el historial real del proyecto. Para regenerar el paquete solo con migraciones pendientes:

```sh
npm run prepare:release -- --after 202610100006_safe_transfer_review.sql
```

Usar el nombre exacto de la última migración aplicada. `--after none` prepara las nueve; si ya se aplicaron todas, indicar `202610120009_pen_brl_only.sql`. El comando genera archivos locales y nunca conecta a la BD. No ejecutar el paquete completo sobre un esquema ya migrado. Confirmar que no haya aplicación parcial o cambios manuales antes de usar la selección por fecha.

Aplicar primero las migraciones pendientes, después el catálogo demo opcional. Configurar Auth anónimo, permisos del equipo, URL de retorno y cuentas/tasas oficiales antes de probar el modo operativo. Desplegar el worker conservando secretos en servidor. Verificar el resultado de cada paso; sincronizar Git no despliega BD, secretos ni funciones.

## Lo que falta para producción

| Área           | Pendiente verificable                                                                                                                                                                              |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BD y funciones | Aplicación manual y prueba del esquema conectado, permisos, buckets privados y worker.                                                                                                             |
| Facturación    | Elegir y conectar emisor/pasarela productiva con contrato real; probar factura y boleta, XML/CDR/PDF y conciliación de reintentos. SUNAT beta no acredita una emisión productiva.                  |
| Correo         | Proveedor configurado y entrega real a un destinatario verificado; probar fallos y reintentos. El registro demo no acredita entrega.                                                               |
| WhatsApp       | Destinatario de prueba, token secreto, webhook validado, sesión autorizada y recepción privada del archivo en teléfono. La finalización del Flow público aún no registra una operación en Brasper. |
| Agente IA      | Función de conversación, herramientas autorizadas, cuotas y traspaso humano. La guía actual tiene respuestas predefinidas.                                                                         |
| Operación      | Tasas aprobadas, cuentas oficiales, revisión humana, auditoría, recuperación y prueba de extremo a extremo en el entorno conectado.                                                                |

Las rutas técnicas y permisos se desarrollaron en el repositorio; su despliegue y los contratos externos siguen pendientes. Esta entrega deja la demo y el paquete revisables, sin afirmar que el sistema ya está habilitado para operar con dinero real.

## Prompt para una sola actualización en Lovable

> Sincroniza main de jordyalania/brasper-global-connect y lee docs/BIG_UPDATE.md. Inspecciona el historial de migraciones del backend existente; regenera y aplica únicamente las pendientes con scripts/prepare-release.ts, sin duplicar tablas ni borrar información. Revisa el manifiesto. Aplica opcionalmente supabase/demo/seed.sql como catálogo de referencia separado; no copies sus operaciones, tasas o cuentas a las tablas productivas ni conectes el modo local demo con bancos o proveedores reales. Despliega el worker existente conservando sus secretos y revisa docs/TRANSFER_WORKFLOW.md, docs/SUNAT_BETA.md y docs/EXCHANGE_VALIDATIONS.md. Configura Auth y Storage privados, miembros del equipo, cuentas oficiales y tasas aprobadas. Mantén confirmación de ingreso y registro de envío a cargo del equipo. Prueba el flujo completo con sesiones de cliente y equipo separadas. Reporta qué conexiones y credenciales externas faltan; no inventes contratos de emisión, proveedor de correo o integración WhatsApp/IA. No marques SUNAT beta ni el correo demo como producción.

La migración `202610120009_pen_brl_only.sql` desactiva las rutas y cuentas de ingreso fuera de PEN/BRL y bloquea su reactivación. Conserva las operaciones históricas. La calculadora y el registro nuevo ofrecen únicamente soles ↔ reales.
