# Big update: BD, funciones y correo

## 1. BD → SQL Editor

- **Sin migraciones anteriores aplicadas:** ejecutar `supabase/release/database-update.sql` (incluye las trece).
- **Con migraciones aplicadas:** ejecutar únicamente los archivos pendientes de `supabase/migrations/`, en orden. No repetir el paquete completo.
- **Catálogo demo opcional:** después ejecutar `supabase/demo/seed.sql`. No es necesario para `?demo=1`, que funciona localmente.

La migración `202610120009_pen_brl_only.sql` deja solo PEN ↔ BRL para nuevos cambios y conserva el historial.

La migración `202610120013_saved_recipients.sql` habilita cuentas de destino privadas para usuarios registrados: seleccionar por moneda, guardar opcionalmente al registrar una operación o desde el historial y quitar de guardadas. No requiere otra Edge Function. Los invitados siguen completando sus datos sin guardar cuentas.

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

**El gateway `/api/billing-beta` requiere servidor Node:** configurar allí `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `BILLING_BETA_ENABLED=true` y el mismo `BILLING_GATEWAY_TOKEN`. Subir solo la Edge Function no activa ese gateway. No activar el scheduler hasta comprobar que el servidor y sus secretos están disponibles. Beta envía facturas al gateway; las boletas peruanas y NFS-e brasileñas generan un PDF demo independiente con los datos de la operación, sin llamar a SUNAT; MailerSend puede enviar esos PDF una vez aplicada la migración 012 y configurado un destinatario real. La migración `202610120010_demo_receipts.sql` habilita este camino. No modifica boletas antiguas bloqueadas.

## 3. Correo automático → MailerSend (ya implementado)

1. Aplicar `supabase/migrations/202610120012_mailersend_delivery.sql` y desplegar los mismos tres archivos del paso 2. No desarrollar otro servicio de correo ni un puente de servidor.
2. En **Secrets de `process-invoices`** conservar `MAILERSEND_API_KEY`, ya guardado. Si el secreto está solo en el servidor web de Lovable, habilitarlo también para esta Edge Function sin copiarlo al frontend ni mostrarlo en el chat.
3. Remitente beta por defecto: `noreply@test-vz9dlemdwjp4kj50.mlsender.net`, nombre Brasper. Para cambiarlo, configurar `BILLING_FROM_EMAIL` y opcionalmente `BILLING_FROM_NAME`. Producción exige `BILLING_FROM_EMAIL` explícito de un dominio verificado. No requiere Resend ni Lovable Emails.
4. Dominio de prueba para consulta: `yxj6ljnoyk0gdo2r`, ya configurado como respaldo. Si cambia el dominio, configurar `MAILERSEND_DOMAIN_ID`. El token necesita permiso de envío y **`activity_read`** para confirmar el resultado. [API oficial MailerSend](https://developers.mailersend.com/api/v1/email).
5. Al invocar el worker: envía el PDF existente de una operación `paid_out`, fiscal `accepted`, `beta_accepted` o `demo_generated`, a `billing_email` (respaldo: `customer_email`). No vuelve a emitir; los documentos de pruebas conservan su entorno. Bloquea correos sintéticos `example.test`.
6. `202` con `x-message-id` → **en cola en MailerSend**; otra ejecución consulta su estado → **correo enviado** cuando el proveedor confirma `sent`/`delivered`. Mensajes pausados/suprimidos no se marcan enviados. Sin lectura permitida, queda pendiente de consulta y el worker informa el permiso faltante.
7. Hasta 5 intentos para errores confirmados reintentables (HTTP 429 o fallo previo al envío), con espera creciente. Timeout, HTTP 5xx o fallo al guardar después del POST → conciliación, sin reenviar a ciegas. Las reservas atómicas impiden dos envíos concurrentes. No hay botón de reenvío automático para resultados inciertos; revisar en MailerSend antes de intervenir.
8. Cron: ejecutar `process-invoices` por POST cada minuto con `Authorization: Bearer BILLING_WORKER_SECRET`, almacenado de forma privada. Una ejecución procesa un trabajo; las siguientes generan/envían/confirman. Activarlo cuando gateway y Storage estén listos. Verificar primero con mocks y, solo con destinatario aprobado por el usuario, una operación beta real. No enviar al catálogo sintético ni emitir durante la instalación.

**La API key guardada no despliega el código ni la migración.** Confirmar: migración 012 aplicada, worker actualizado y secreto disponible dentro de esa función.

## 4. Configuración y comprobación

- Auth: activar **Anonymous sign-ins** y **Manual identity linking**.
- Equipo y cuentas PEN/BRL: completar `supabase/manual-setup.example.sql`. Tasas fijas de prueba: revisar y ejecutar `supabase/fixed-rates.example.sql` (sin actualización automática; vigencia de 30 días).
- Comprobar: migraciones aplicadas, función desplegada y una llamada sin autorización devuelve **401**. No emitir ni enviar correos durante esta comprobación.

## Prompt corto para Lovable

> Aplica únicamente docs/BIG_UPDATE.md: ejecuta las migraciones SQL pendientes (incluidas 012 y 013) y despliega process-invoices/index.ts, process-invoices/deno.json y _shared/demo-receipt.ts. Conserva BILLING_ENVIRONMENT=beta y los secretos existentes; asegúrate de que MAILERSEND_API_KEY esté disponible en la Edge Function. Usa el remitente y domain ID de prueba ya configurados, salvo valores explícitos de BILLING_FROM_EMAIL/MAILERSEND_DOMAIN_ID. Comprueba permisos de envío y activity_read de MailerSend sin imprimir la clave. Activa el gateway con las variables privadas indicadas. El correo y los estados/reintentos ya están implementados: no crees otro proveedor, puente, función ni rediseño. Comprueba migraciones, Auth anónimo y rechazo 401. No emitas ni envíes emails durante esta instalación. Configura cron autenticado cada minuto solo cuando gateway y Storage estén listos. Reporta estado de BD, función, gateway, MailerSend y bloqueo concreto; solicita únicamente datos faltantes.

## De dónde salen los secretos

- `BILLING_ENVIRONMENT`: escribir `beta`. No es una contraseña.
- `BILLING_GATEWAY_URL`: URL del servidor publicado: `https://TU_DOMINIO/api/billing-beta`. No sirve una URL localhost.
- `BILLING_GATEWAY_TOKEN`: token propio compartido entre Edge Function y gateway. Ya está definido en el archivo local privado `.env.billing-beta`; copiarlo a Secrets, nunca al chat o Git.
- `BILLING_WORKER_SECRET`: secreto propio para autorizar al scheduler. También está definido en `.env.billing-beta`; copiarlo a Secrets y usarlo en la cabecera del scheduler.

Para probar ambos tipos sin gateway, usar `BILLING_ENVIRONMENT=demo`: genera PDF demo de boleta y factura. Mantener `beta` si se desea probar facturas en SUNAT beta. Los PDF demo quedan privados en Storage con estado `demo_generated`; el correo real requiere aplicar la sección 3.

Estos tokens son de nuestra integración, no credenciales entregadas por SUNAT. Mantener los valores actuales para que ambos servicios coincidan. El worker devuelve 401 si falta su secreto o si la llamada no lleva el valor correcto.

## Facturas beta: activar servidor y reintentos

La factura beta usa el receptor fiscal y la comisión de cada operación. Para comisiones BRL, las convierte a PEN con la tasa guardada de la operación. El ensayo desglosa IGV 18% incluido en esa comisión; es una configuración de prueba, pendiente de confirmar para producción. PDF y XML comparten los mismos importes.

En el servidor de la web (además de Secrets de la Edge Function): configurar `BILLING_BETA_ENABLED=true`, `BILLING_GATEWAY_TOKEN` con el mismo valor, `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`. Son variables privadas del servidor, nunca `VITE_*`. Re-publicar con servidor Node disponible.

- Reintento automático solo si BD confirma `beta_sent_at IS NULL`: hasta 5 intentos con espera creciente. Requiere invocar periódicamente el worker autenticado.
- SUNAT ya aceptó pero falló la devolución/Storage: recuperar PDF, XML y CDR guardados, usando el mismo número; no volver a emitir.
- Respuesta incierta sin resultado guardado: conciliación; no reenviar a ciegas. Rechazo SUNAT: conservar diagnóstico y corregirlo antes de una nueva emisión.
- Correo: con MailerSend, el circuito beta envía el PDF ya generado; la migración 012 separa estado/reintento de correo y estado fiscal. Ver sección 3.

Comprobación del 12/10/2026: factura con datos de operación demo `F903-91841179` aceptada directamente por SUNAT beta, CDR código `0`. Gateway web publicado responde `503 Beta disabled` a una llamada autenticada sin datos de emisión. Activar las variables del servidor antes del scheduler. Esta prueba no certifica el despliegue completo.

## Regla de país y bandejas (migración 011)

Aplicar `202610120011_brazil_billing_worklists.sql`: moneda **recibida por el destinatario** PEN → boleta/factura Perú; BRL → NFS-e Brasil. Conserva comprobantes históricos ya emitidos. Incluye índices para las bandejas. En beta/demo Brasil genera PDF demo en BRL; producción Brasil queda bloqueada hasta configurar el proveedor y emisor. No se envía una NFS-e a SUNAT.

La web incorpora Pagos por revisar, Envíos pendientes, Todas las operaciones y Facturación. Generado y correo enviado son estados distintos. Activar correo y cron después de aplicar 012 y completar la configuración indicada en la sección 3.

## Presentación pulida y RUC de beta

La interfaz usa textos operativos y herramientas de presentación plegadas; los estados preparados no se confunden con correos enviados. Catálogo sintético actualizado en `supabase/demo/seed.sql`. Archivos de prueba conservan identificación discreta de su entorno.

El gateway beta usa el RUC autorizado `10042049579` y las credenciales públicas de pruebas MODDATOS; esto no utiliza la clave SOL de producción. La denominación del emisor es de pruebas, pendiente de su identidad fiscal aprobada. Re-publicar la web para actualizar este motor; los secretos del servidor indicados arriba siguen siendo necesarios. No modificar comprobantes ya preparados o enviados bajo el RUC anterior: recuperarlos con su identificación original.

Prueba del 12/10/2026: factura `F903-91844545`, por comisión de 31,05 PEN, aceptada directamente en SUNAT beta con código 0. PDF/XML/CDR guardados localmente. El gateway desplegado, cron y correo siguen pendientes del big update; esta comprobación no activa esos servicios. [Pautas oficiales SUNAT beta](https://orientacion.sunat.gob.pe/12-pautas-servicio-beta).

## Acceso de clientes y equipo

La página pública incluye **Iniciar sesión** en `/login`, con correo/contraseña, enlace de acceso y Google. El acceso público lleva a `/transferencias`. El dashboard se abre directamente en `/dashboard`; exige una cuenta autorizada en `staff_members`, no aparece enlazado en páginas públicas y tiene `noindex`. Este cambio no requiere migración ni Edge Function adicional. Para enlaces de correo/Google, autorizar en Auth las URLs publicadas `/login` y `/transferencias` del dominio actual (y localhost solo para pruebas locales).

El asistente de cambio muestra los errores junto a la navegación y vuelve al campo correspondiente, incluso si pertenece a un paso anterior. Los invitados pueden completar revisión y registrar su solicitud sin crear una cuenta; las validaciones siguen vigentes.
