# Big update: BD, funciones y correo

## 1. BD → SQL Editor

- **Sin migraciones anteriores aplicadas:** ejecutar `supabase/release/database-update.sql` (incluye las once).
- **Con migraciones aplicadas:** ejecutar únicamente los archivos pendientes de `supabase/migrations/`, en orden. No repetir el paquete completo.
- **Catálogo demo opcional:** después ejecutar `supabase/demo/seed.sql`. No es necesario para `?demo=1`, que funciona localmente.

La migración `202610120009_pen_brl_only.sql` deja solo PEN ↔ BRL para nuevos cambios y conserva el historial.

## 2. Edge Functions → process-invoices

1. Crear o editar la función **`process-invoices`**.
2. Subir estos tres archivos conservando las rutas: `process-invoices/index.ts`, `process-invoices/deno.json` y `_shared/demo-receipt.ts`, desde `supabase/functions/`. Desplegar `process-invoices`.
3. Desactivar **Verify JWT**, como indica `supabase/config.toml`. La función exige su propio `Authorization: Bearer BILLING_WORKER_SECRET`.
4. Conservar los secretos existentes. Para SUNAT beta configurar:

| Secret de Edge Function | Valor                                 |
| ----------------------- | ------------------------------------- |
| `BILLING_ENVIRONMENT`   | `beta`                                |
| `BILLING_GATEWAY_URL`   | `https://TU_DOMINIO/api/billing-beta` |
| `BILLING_GATEWAY_TOKEN` | Token privado ya autorizado           |
| `BILLING_WORKER_SECRET` | Secreto privado del worker            |

`SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` los proporciona Supabase; no copiarlos al frontend.

**El gateway `/api/billing-beta` requiere servidor Node:** configurar allí `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `BILLING_BETA_ENABLED=true` y el mismo `BILLING_GATEWAY_TOKEN`. Subir solo la Edge Function no activa ese gateway. No activar el scheduler hasta comprobar que el servidor y sus secretos están disponibles. Beta envía facturas al gateway; las boletas peruanas y NFS-e brasileñas generan un PDF demo independiente con los datos de la operación, sin llamar a SUNAT ni enviar correo. La migración `202610120010_demo_receipts.sql` habilita este camino. No modifica boletas antiguas bloqueadas.

## 3. Correo automático → Lovable Emails

**Esta parte requiere implementación en Lovable:** el worker actual solo tiene Resend para producción y no envía correos beta. Configurar Emails sin conectar este circuito no envía los comprobantes.

1. En Lovable: **More → Cloud → Emails**, seleccionar el dominio ya verificado del workspace y activar Emails para este proyecto. Si falta dominio/remitente aprobado, pedir únicamente ese dato y completar la implementación mientras se verifica. No inventar una dirección de envío. [Documentación oficial](https://docs.lovable.dev/features/custom-emails).
2. Usar **Lovable Emails desde el servidor de esta app TanStack Start**. No exigir `RESEND_API_KEY` para esta opción ni cambiar los cuatro secretos de facturación. Crear `src/routes/api.billing-email.ts` como puente privado del worker al correo del servidor; autenticación con un token propio compartido, guardado en Secrets del worker y variables privadas del servidor. El worker necesita la URL pública de ese puente. Nunca usar `VITE_*` ni permitir envío anónimo desde el navegador.
3. Conectar el envío **después de generar y guardar el PDF**, solo con transferencia `paid_out` y documento `accepted`, `beta_accepted` o `demo_generated`. Destino: `billing_email`, con respaldo en `customer_email`. Descargar desde Storage privado y adjuntar el PDF existente; si el servicio no admite adjuntos, implementar acceso privado autenticado para descargarlo. No publicar el bucket ni usar enlaces firmados que caduquen antes de abrir el correo. No llamar a SUNAT ni regenerar el comprobante para enviarlo.
4. Añadir una migración pendiente **012** con estado de entrega independiente del estado fiscal, identificador del proveedor, número de intentos, próximo intento, último error y fecha de envío. Reservar trabajos de forma atómica con lease; guardar el resultado antes de completar. Hasta 5 reintentos con espera creciente para errores confirmados. Ante timeout o respuesta incierta: conciliar con el proveedor antes de reenviar; usar su idempotencia si la soporta. Un doble clic o dos workers no deben producir dos correos.
5. Plantilla Brasper: asunto con número de operación/comprobante; nombre del cliente, monedas, montos, destinatario, referencia y PDF correspondiente. Los documentos beta/vista previa conservan su identificación de pruebas. No adjuntar datos de otra operación ni enviar marketing.
6. Dashboard: mostrar generado/correo pendiente, enviando, enviado, reintento y revisión. **“Correo enviado” solo tras aceptación del proveedor**; no equivale a lectura ni entrega en bandeja. Conservar el estado fiscal original de beta y vista previa. Reenviar solo mediante acción explícita de staff, auditada y sin nueva emisión.
7. Verificar destinatario/adjunto, envío único, fallo con reintento y resultado incierto con mocks. No enviar a los correos sintéticos `example.test`. Dejar preparado el ensayo con un correo de prueba aprobado; no enviar durante el big update sin que el usuario indique ese destinatario. Activar el cron autenticado solo cuando gateway, almacenamiento y correo estén listos. Desplegar también el puente de servidor y cualquier función/migración nueva; actualizar `supabase/release/manifest.json` y la lista de pendientes.

## 4. Configuración y comprobación

- Auth: activar **Anonymous sign-ins** y **Manual identity linking**.
- Equipo y cuentas PEN/BRL: completar `supabase/manual-setup.example.sql`. Tasas fijas de prueba: revisar y ejecutar `supabase/fixed-rates.example.sql` (sin actualización automática; vigencia de 30 días).
- Comprobar: migraciones aplicadas, función desplegada y una llamada sin autorización devuelve **401**. No emitir ni enviar correos durante esta comprobación.

## Prompt corto para Lovable

> Implementa docs/BIG_UPDATE.md en una sola actualización: aplica SQL pendiente, despliega process-invoices con su archivo compartido y activa el gateway del servidor según las variables indicadas. Implementa la sección 3 de correo con Lovable Emails y el dominio/remitente aprobado disponible: puente privado desde el worker al servidor TanStack Start, PDF existente de Storage, destinatario fiscal, estado de entrega separado, reserva atómica, control de errores, reintentos e idempotencia/conciliación. Conecta documentos accepted, beta_accepted y demo_generated sin cambiar su entorno fiscal. Actualiza los indicadores del dashboard y los archivos de release. No uses Resend salvo autorización expresa; conserva los secretos existentes y solicita solo configuración realmente faltante. Comprueba Auth anónimo, rechazos 401 y envío/reintento con mocks. No rediseñes la web ni desarrolles IA/WhatsApp. No emitas ni envíes correos durante esta actualización; prepara la prueba posterior con un destinatario aprobado. Activa cron únicamente cuando gateway y correo estén operativos. Responde con estado de BD, funciones, gateway, correo y bloqueo concreto.

## De dónde salen los secretos

- `BILLING_ENVIRONMENT`: escribir `beta`. No es una contraseña.
- `BILLING_GATEWAY_URL`: URL del servidor publicado: `https://TU_DOMINIO/api/billing-beta`. No sirve una URL localhost.
- `BILLING_GATEWAY_TOKEN`: token propio compartido entre Edge Function y gateway. Ya está definido en el archivo local privado `.env.billing-beta`; copiarlo a Secrets, nunca al chat o Git.
- `BILLING_WORKER_SECRET`: secreto propio para autorizar al scheduler. También está definido en `.env.billing-beta`; copiarlo a Secrets y usarlo en la cabecera del scheduler.

Para probar ambos tipos sin gateway, usar `BILLING_ENVIRONMENT=demo`: genera PDF demo de boleta y factura. Mantener `beta` si se desea probar facturas en SUNAT beta. Los PDF demo quedan privados en Storage con estado `demo_generated`; el correo real requiere implementar la sección 3.

Estos tokens son de nuestra integración, no credenciales entregadas por SUNAT. Mantener los valores actuales para que ambos servicios coincidan. El worker devuelve 401 si falta su secreto o si la llamada no lleva el valor correcto.

## Facturas beta: activar servidor y reintentos

La factura beta usa el receptor fiscal y la comisión de cada operación. Para comisiones BRL, las convierte a PEN con la tasa guardada de la operación. El ensayo desglosa IGV 18% incluido en esa comisión; es una configuración de prueba, pendiente de confirmar para producción. PDF y XML comparten los mismos importes.

En el servidor de la web (además de Secrets de la Edge Function): configurar `BILLING_BETA_ENABLED=true`, `BILLING_GATEWAY_TOKEN` con el mismo valor, `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`. Son variables privadas del servidor, nunca `VITE_*`. Re-publicar con servidor Node disponible.

- Reintento automático solo si BD confirma `beta_sent_at IS NULL`: hasta 5 intentos con espera creciente. Requiere invocar periódicamente el worker autenticado.
- SUNAT ya aceptó pero falló la devolución/Storage: recuperar PDF, XML y CDR guardados, usando el mismo número; no volver a emitir.
- Respuesta incierta sin resultado guardado: conciliación; no reenviar a ciegas. Rechazo SUNAT: conservar diagnóstico y corregirlo antes de una nueva emisión.
- Correo: el circuito beta no envía emails. El big update debe implementar el envío nativo de Lovable descrito en la sección 3, consumiendo el documento ya generado, con estado/reintento independiente y sin emitir nuevamente.

Comprobación del 12/10/2026: factura con datos de operación demo `F903-91841179` aceptada directamente por SUNAT beta, CDR código `0`. Gateway web publicado responde `503 Beta disabled` a una llamada autenticada sin datos de emisión. Activar las variables del servidor antes del scheduler. Esta prueba no certifica el despliegue completo.

## Regla de país y bandejas (migración 011)

Aplicar `202610120011_brazil_billing_worklists.sql`: moneda **recibida por el destinatario** PEN → boleta/factura Perú; BRL → NFS-e Brasil. Conserva comprobantes históricos ya emitidos. Incluye índices para las bandejas. En beta/demo Brasil genera PDF demo en BRL; producción Brasil queda bloqueada hasta configurar el proveedor y emisor. No se envía una NFS-e a SUNAT.

La web incorpora Pagos por revisar, Envíos pendientes, Todas las operaciones y Facturación. Generado y correo enviado son estados distintos. No activar correo ni cron hasta terminar la configuración pendiente.

## Presentación pulida y RUC de beta

La interfaz usa textos operativos y herramientas de presentación plegadas; los estados preparados no se confunden con correos enviados. Catálogo sintético actualizado en `supabase/demo/seed.sql`. Archivos de prueba conservan identificación discreta de su entorno.

El gateway beta usa el RUC autorizado `10042049579` y las credenciales públicas de pruebas MODDATOS; esto no utiliza la clave SOL de producción. La denominación del emisor es de pruebas, pendiente de su identidad fiscal aprobada. Re-publicar la web para actualizar este motor; los secretos del servidor indicados arriba siguen siendo necesarios. No modificar comprobantes ya preparados o enviados bajo el RUC anterior: recuperarlos con su identificación original.

Prueba del 12/10/2026: factura `F903-91844545`, por comisión de 31,05 PEN, aceptada directamente en SUNAT beta con código 0. PDF/XML/CDR guardados localmente. El gateway desplegado, cron y correo siguen pendientes del big update; esta comprobación no activa esos servicios. [Pautas oficiales SUNAT beta](https://orientacion.sunat.gob.pe/12-pautas-servicio-beta).
